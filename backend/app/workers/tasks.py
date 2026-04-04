import asyncio
import json
import logging
import uuid
from typing import Any

from sqlalchemy import select, text, update

from app.config import get_settings
from app.database import WorkerSessionLocal as AsyncSessionLocal
from app.models.job import Job
from app.models.result import Result
from app.services import (
    comparison as comparison_svc,
    gprofiler as gprofiler_svc,
    hpa as hpa_svc,
    minio_client,
    sasp as sasp_svc,
    signalp as signalp_svc,
    string_db as string_svc,
    uniprot as uniprot_svc,
    therapeutic as therapeutic_svc,
    receptor_ligand as receptor_ligand_svc,
    safety as safety_svc,
    disease_context as disease_context_svc,
)
from app.services.differential import run_differential_analysis
from app.services.concentration_analysis import analyze_concentrations
from app.services.pk_analysis import analyze_pk_properties
from app.services.reference_library import compare_to_references
from app.services.llm_interpretation import build_analysis_context, generate_interpretation
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)
settings = get_settings()


def _run(coro):
    return asyncio.run(coro)


async def _update_job(job_id: str, **kwargs) -> None:
    async with AsyncSessionLocal() as s:
        await s.execute(update(Job).where(Job.id == uuid.UUID(job_id)).values(**kwargs))
        await s.commit()


async def _set_module_progress(
    job_id: str, module: str, status: str, percent: int, message: str = ""
) -> None:
    """Atomically merge one module key into the progress JSONB — no read-modify-write race."""
    patch = json.dumps({module: {"status": status, "percent": percent, "message": message}})
    async with AsyncSessionLocal() as s:
        await s.execute(
            text(
                "UPDATE jobs "
                "SET progress = COALESCE(progress::jsonb, '{}') || (:patch)::jsonb "
                "WHERE id = :job_id"
            ),
            {"patch": patch, "job_id": str(uuid.UUID(job_id))},
        )
        await s.commit()


async def _save_result(job_id: str, module: str, data: Any, summary: dict) -> None:
    key = f"jobs/{job_id}/{module}.json"
    await minio_client.upload_json(key, data)
    async with AsyncSessionLocal() as s:
        s.add(Result(job_id=uuid.UUID(job_id), module_name=module, minio_key=key, summary=summary))
        await s.commit()


@celery_app.task(bind=True, name="run_analysis_pipeline")
def run_analysis_pipeline(self, job_id: str) -> dict:
    logger.info("Starting pipeline for job %s", job_id)
    try:
        _run(_execute_pipeline(job_id))
        return {"status": "completed", "job_id": job_id}
    except Exception as exc:
        logger.exception("Pipeline failed for job %s", job_id)
        _run(_update_job(job_id, status="failed", error_message=str(exc)))
        raise


async def _execute_pipeline(job_id: str) -> None:
    async with AsyncSessionLocal() as s:
        r = await s.execute(select(Job).where(Job.id == uuid.UUID(job_id)))
        job = r.scalar_one()
        raw_proteins: list[str] = job.proteins
        modules: set[str] = set(job.modules)
        protein_concentrations: dict[str, float] | None = job.protein_concentrations

    await _update_job(job_id, status="running")

    # Normalize protein IDs (resolve aliases → UniProt accessions)
    try:
        proteins = await uniprot_svc.normalize_protein_ids(raw_proteins)
        logger.info("Normalized %d proteins to %d UniProt accessions", len(raw_proteins), len(proteins))
    except Exception as exc:
        logger.warning("Protein normalization failed, using raw IDs: %s", exc)
        proteins = raw_proteins

    uniprot_data: dict = {}
    if "uniprot" in modules:
        await _set_module_progress(job_id, "uniprot", "running", 0)
        try:
            uniprot_data = await uniprot_svc.fetch_annotations(proteins)
            summary = {
                "total": len(proteins),
                "annotated": len(uniprot_data),
                "reviewed": sum(1 for v in uniprot_data.values() if v.get("reviewed")),
            }
            await _save_result(job_id, "uniprot", uniprot_data, summary)
            await _set_module_progress(job_id, "uniprot", "completed", 100)
        except Exception as exc:
            await _set_module_progress(job_id, "uniprot", "failed", 0, str(exc))
            raise

    # Build gene_name lookup for HPA (gene names come from UniProt data)
    gene_names: dict[str, str] = {
        acc: info.get("gene_name", "")
        for acc, info in uniprot_data.items()
        if info.get("gene_name")
    }

    parallel = []
    if "string" in modules:
        parallel.append(_run_string(job_id, proteins))
    if "gprofiler" in modules:
        parallel.append(_run_gprofiler(job_id, proteins))
    if "hpa" in modules:
        parallel.append(_run_hpa(job_id, proteins, gene_names, uniprot_data))
    if "signalp" in modules:
        parallel.append(_run_signalp(job_id, proteins, uniprot_data))
    if "sasp" in modules:
        parallel.append(_run_sasp(job_id, proteins, uniprot_data))

    await asyncio.gather(*parallel, return_exceptions=True)

    if "comparison" in modules:
        await _run_comparison(job_id, proteins)

    # Phase 2a: PK analysis (fast, depends only on UniProt — runs first so therapeutic can use it)
    pk_data: dict | None = None
    if "pk" in modules:
        pk_data = await _run_pk(job_id, proteins, uniprot_data)

    # Phase 2b: Therapeutic Analysis Layer (runs after Phase 1 + PK complete)
    phase2 = []
    if "therapeutic" in modules:
        phase2.append(_run_therapeutic(job_id, proteins, uniprot_data, pk_data, protein_concentrations))
    if "receptor_ligand" in modules:
        phase2.append(_run_receptor_ligand(job_id, proteins, uniprot_data))
    if "safety" in modules:
        phase2.append(_run_safety(job_id, proteins, uniprot_data))
    if "disease_context" in modules:
        phase2.append(_run_disease_context(job_id, proteins, uniprot_data))

    if phase2:
        await asyncio.gather(*phase2, return_exceptions=True)

    # Phase 3: Concentration analysis (requires UniProt data)
    if "concentrations" in modules and protein_concentrations:
        await _run_concentrations(job_id, proteins, protein_concentrations, uniprot_data)

    # Phase 4: Reference library comparison (fast, depends only on gene names)
    reference_library_data: dict | None = None
    if "reference_library" in modules:
        reference_library_data = await _run_reference_library(job_id, proteins, uniprot_data)

    # Phase 5: LLM interpretation (runs last — aggregates all results)
    if "llm_interpretation" in modules:
        # Fetch results from previous modules to build context
        therapeutic_data = await _load_module_data(job_id, "therapeutic")
        concentration_data = await _load_module_data(job_id, "concentrations") if protein_concentrations else None
        await _run_llm_interpretation(
            job_id, proteins, uniprot_data,
            therapeutic_data=therapeutic_data,
            pk_data=pk_data,
            concentration_data=concentration_data,
            reference_library_data=reference_library_data,
        )

    await _update_job(job_id, status="completed")
    logger.info("Pipeline completed for job %s", job_id)


async def _run_string(job_id: str, proteins: list[str]) -> None:
    await _set_module_progress(job_id, "string", "running", 0)
    try:
        data = await string_svc.fetch_interactions(proteins)
        await _save_result(job_id, "string", data,
                           {"edge_count": len(data.get("interactions", [])), "node_count": len(proteins)})
        await _set_module_progress(job_id, "string", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "string", "failed", 0, str(e))


async def _run_gprofiler(job_id: str, proteins: list[str]) -> None:
    await _set_module_progress(job_id, "gprofiler", "running", 0)
    try:
        data = await gprofiler_svc.run_enrichment(proteins)
        await _save_result(job_id, "gprofiler", data, {"term_count": len(data.get("results", []))})
        await _set_module_progress(job_id, "gprofiler", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "gprofiler", "failed", 0, str(e))


async def _run_hpa(job_id: str, proteins: list[str], gene_names: dict[str, str], uniprot_data: dict) -> None:
    await _set_module_progress(job_id, "hpa", "running", 0)
    try:
        data = await hpa_svc.fetch_concentrations(proteins, gene_names, uniprot_data)
        await _save_result(job_id, "hpa", data, {"proteins_with_data": len(data)})
        await _set_module_progress(job_id, "hpa", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "hpa", "failed", 0, str(e))


async def _run_signalp(job_id: str, proteins: list[str], uniprot_data: dict) -> None:
    await _set_module_progress(job_id, "signalp", "running", 0)
    try:
        data = await signalp_svc.classify_signal_peptides(proteins, uniprot_data)
        summary = {
            "classical_sp": sum(1 for v in data.values() if v.get("type") == "Sec/SPI"),
            "gpi_anchored": sum(1 for v in data.values() if v.get("type") == "GPI-anchored"),
            "unconventional": sum(1 for v in data.values() if v.get("type") == "Unconventional"),
            "no_sp": sum(1 for v in data.values() if v.get("type") == "Other"),
        }
        await _save_result(job_id, "signalp", data, summary)
        await _set_module_progress(job_id, "signalp", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "signalp", "failed", 0, str(e))



async def _run_sasp(job_id: str, proteins: list[str], uniprot_data: dict) -> None:
    await _set_module_progress(job_id, "sasp", "running", 0)
    try:
        data = sasp_svc.flag_sasp(proteins, uniprot_data)
        await _save_result(job_id, "sasp", data,
                           {"sasp_count": data["sasp_count"], "total": len(proteins)})
        await _set_module_progress(job_id, "sasp", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "sasp", "failed", 0, str(e))


async def _run_comparison(job_id: str, proteins: list[str]) -> None:
    await _set_module_progress(job_id, "comparison", "running", 0)
    try:
        data = await comparison_svc.run_comparison(job_id)
        await _save_result(job_id, "comparison", data, {"sets": data.get("set_count", 0)})
        await _set_module_progress(job_id, "comparison", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "comparison", "failed", 0, str(e))


async def _run_therapeutic(
    job_id: str,
    proteins: list[str],
    uniprot_data: dict,
    pk_data: dict | None = None,
    protein_concentrations: dict[str, float] | None = None,
) -> None:
    await _set_module_progress(job_id, "therapeutic", "running", 0)
    try:
        data = therapeutic_svc.score_therapeutic_indications(
            proteins, uniprot_data,
            pk_data=pk_data,
            protein_concentrations=protein_concentrations,
        )
        top = data.get("top_indication", "")
        confidence = data.get("overall_confidence", "")
        indications_scored = len(data.get("indications", []))
        await _save_result(job_id, "therapeutic", data, {
            "top_indication": top,
            "confidence": confidence,
            "indications_scored": indications_scored,
        })
        await _set_module_progress(job_id, "therapeutic", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "therapeutic", "failed", 0, str(e))


async def _run_receptor_ligand(job_id: str, proteins: list[str], uniprot_data: dict) -> None:
    await _set_module_progress(job_id, "receptor_ligand", "running", 0)
    try:
        data = receptor_ligand_svc.match_receptor_ligand(proteins, uniprot_data)
        await _save_result(job_id, "receptor_ligand", data, {
            "pairs_matched": data.get("total_pairs_matched", 0),
            "target_cell_types": len(data.get("target_cell_types", [])),
            "coverage_pct": data.get("coverage_percent", 0),
        })
        await _set_module_progress(job_id, "receptor_ligand", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "receptor_ligand", "failed", 0, str(e))


async def _run_safety(job_id: str, proteins: list[str], uniprot_data: dict) -> None:
    await _set_module_progress(job_id, "safety", "running", 0)
    try:
        data = safety_svc.profile_safety(proteins, uniprot_data)
        await _save_result(job_id, "safety", data, {
            "overall_score": data.get("overall_safety_score", 0),
            "risk_level": data.get("risk_level", ""),
            "total_flagged": data.get("total_flagged", 0),
        })
        await _set_module_progress(job_id, "safety", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "safety", "failed", 0, str(e))


async def _run_disease_context(job_id: str, proteins: list[str], uniprot_data: dict) -> None:
    await _set_module_progress(job_id, "disease_context", "running", 0)
    try:
        data = await disease_context_svc.fetch_disease_context(proteins, uniprot_data)
        await _save_result(job_id, "disease_context", data, {
            "top_disease": data.get("top_disease", ""),
            "diseases_found": len(data.get("ranked_diseases", [])),
            "proteins_queried": data.get("proteins_queried", 0),
        })
        await _set_module_progress(job_id, "disease_context", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "disease_context", "failed", 0, str(e))


async def _run_pk(job_id: str, proteins: list[str], uniprot_data: dict) -> dict | None:
    await _set_module_progress(job_id, "pk", "running", 0)
    try:
        uniprot_list = {"proteins": list(uniprot_data.values())} if isinstance(uniprot_data, dict) else uniprot_data
        gene_names = [
            info.get("gene_name", acc)
            for acc, info in (uniprot_data.items() if isinstance(uniprot_data, dict) else {}.items())
        ] or proteins
        data = analyze_pk_properties(gene_names, uniprot_list)
        summary = data.get("pk_summary", {})
        await _save_result(job_id, "pk", data, {
            "total_proteins": summary.get("total_proteins", 0),
            "bbb_crossing": summary.get("bbb_crossing", 0),
            "short_half_life_count": summary.get("short_half_life_count", 0),
        })
        await _set_module_progress(job_id, "pk", "completed", 100)
        return data
    except Exception as e:
        await _set_module_progress(job_id, "pk", "failed", 0, str(e))
        return None


async def _run_concentrations(
    job_id: str,
    proteins: list[str],
    user_concentrations: dict[str, float],
    uniprot_data: dict,
) -> None:
    await _set_module_progress(job_id, "concentrations", "running", 0)
    try:
        # Pass the raw uniprot_data dict (keyed by accession) so the service
        # can resolve any accession or gene-name input to a canonical gene name
        data = analyze_concentrations(proteins, user_concentrations, uniprot_data)
        await _save_result(job_id, "concentrations", data, {
            "proteins_with_data": data["proteins_with_data"],
            "total_quantified": data["total_quantified"],
            "caution_count": len(data["summary"]["caution_proteins"]),
        })
        await _set_module_progress(job_id, "concentrations", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "concentrations", "failed", 0, str(e))


async def _load_module_data(job_id: str, module: str) -> dict | None:
    """Load previously-saved module result from MinIO, return None if not found."""
    try:
        key = f"jobs/{job_id}/{module}.json"
        return await minio_client.download_json(key)
    except Exception:
        return None


async def _run_reference_library(
    job_id: str,
    proteins: list[str],
    uniprot_data: dict,
) -> dict | None:
    await _set_module_progress(job_id, "reference_library", "running", 0)
    try:
        data = compare_to_references(proteins, uniprot_data)
        top = data.get("top_match") or {}
        await _save_result(job_id, "reference_library", data, {
            "query_size": data.get("query_size", 0),
            "top_match_name": top.get("reference_name", ""),
            "top_similarity_pct": top.get("similarity_pct", 0),
        })
        await _set_module_progress(job_id, "reference_library", "completed", 100)
        return data
    except Exception as e:
        await _set_module_progress(job_id, "reference_library", "failed", 0, str(e))
        return None


async def _run_llm_interpretation(
    job_id: str,
    proteins: list[str],
    uniprot_data: dict,
    therapeutic_data: dict | None = None,
    pk_data: dict | None = None,
    concentration_data: dict | None = None,
    reference_library_data: dict | None = None,
) -> None:
    await _set_module_progress(job_id, "llm_interpretation", "running", 0)
    try:
        context = build_analysis_context(
            proteins=proteins,
            uniprot_data=uniprot_data,
            therapeutic_data=therapeutic_data,
            pk_data=pk_data,
            concentration_data=concentration_data,
            reference_library_data=reference_library_data,
        )
        data = generate_interpretation(context, get_settings())
        await _save_result(job_id, "llm_interpretation", data, {
            "enabled": data.get("enabled", False),
            "model": data.get("model", ""),
            "has_error": bool(data.get("error")),
        })
        await _set_module_progress(job_id, "llm_interpretation", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "llm_interpretation", "failed", 0, str(e))


# ── Comparison pipeline ────────────────────────────────────────────────────────

@celery_app.task(bind=True, name="run_comparison_pipeline")
def run_comparison_pipeline(self, job_id: str) -> dict:
    logger.info("Starting comparison pipeline for job %s", job_id)
    try:
        _run(_execute_comparison_pipeline(job_id))
        return {"status": "completed", "job_id": job_id}
    except Exception as exc:
        logger.exception("Comparison pipeline failed for job %s", job_id)
        _run(_update_job(job_id, status="failed", error_message=str(exc)))
        raise


async def _run_set_modules(
    job_id: str, proteins: list[str], suffix: str
) -> dict[str, Any]:
    """Run all per-set modules for one set, return {module: data} dict."""
    # Normalize proteins
    try:
        norm_proteins = await uniprot_svc.normalize_protein_ids(proteins)
    except Exception:
        norm_proteins = proteins

    results: dict[str, Any] = {}

    # UniProt
    mod = f"uniprot_{suffix}"
    await _set_module_progress(job_id, mod, "running", 0)
    try:
        uniprot_data = await uniprot_svc.fetch_annotations(norm_proteins)
        summary = {
            "total": len(norm_proteins),
            "annotated": len(uniprot_data),
            "reviewed": sum(1 for v in uniprot_data.values() if v.get("reviewed")),
        }
        await _save_result(job_id, mod, uniprot_data, summary)
        await _set_module_progress(job_id, mod, "completed", 100)
        results["uniprot"] = uniprot_data
    except Exception as e:
        await _set_module_progress(job_id, mod, "failed", 0, str(e))
        results["uniprot"] = {}
        uniprot_data = {}

    gene_names: dict[str, str] = {
        acc: info.get("gene_name", "")
        for acc, info in uniprot_data.items()
        if info.get("gene_name")
    }

    # Run gprofiler, hpa, signalp, sasp in parallel
    async def _gprof():
        m = f"gprofiler_{suffix}"
        await _set_module_progress(job_id, m, "running", 0)
        try:
            data = await gprofiler_svc.run_enrichment(norm_proteins)
            await _save_result(job_id, m, data, {"term_count": len(data.get("results", []))})
            await _set_module_progress(job_id, m, "completed", 100)
            results["gprofiler"] = data
        except Exception as e:
            await _set_module_progress(job_id, m, "failed", 0, str(e))
            results["gprofiler"] = {}

    async def _hpa():
        m = f"hpa_{suffix}"
        await _set_module_progress(job_id, m, "running", 0)
        try:
            data = await hpa_svc.fetch_concentrations(norm_proteins, gene_names, uniprot_data)
            await _save_result(job_id, m, data, {"proteins_with_data": len(data)})
            await _set_module_progress(job_id, m, "completed", 100)
            results["hpa"] = data
        except Exception as e:
            await _set_module_progress(job_id, m, "failed", 0, str(e))
            results["hpa"] = {}

    async def _signalp():
        m = f"signalp_{suffix}"
        await _set_module_progress(job_id, m, "running", 0)
        try:
            data = await signalp_svc.classify_signal_peptides(norm_proteins, uniprot_data)
            summary = {
                "classical_sp": sum(1 for v in data.values() if v.get("type") == "Sec/SPI"),
                "no_sp": sum(1 for v in data.values() if v.get("type") == "Other"),
            }
            await _save_result(job_id, m, data, summary)
            await _set_module_progress(job_id, m, "completed", 100)
            results["signalp"] = data
        except Exception as e:
            await _set_module_progress(job_id, m, "failed", 0, str(e))
            results["signalp"] = {}

    async def _sasp():
        m = f"sasp_{suffix}"
        await _set_module_progress(job_id, m, "running", 0)
        try:
            data = sasp_svc.flag_sasp(norm_proteins, uniprot_data)
            await _save_result(job_id, m, data, {"sasp_count": data.get("sasp_count", 0)})
            await _set_module_progress(job_id, m, "completed", 100)
            results["sasp"] = data
        except Exception as e:
            await _set_module_progress(job_id, m, "failed", 0, str(e))
            results["sasp"] = {}

    await asyncio.gather(_gprof(), _hpa(), _signalp(), _sasp(), return_exceptions=True)

    # Therapeutic + Safety (phase 2 - after uniprot)
    async def _ther():
        m = f"therapeutic_{suffix}"
        await _set_module_progress(job_id, m, "running", 0)
        try:
            data = therapeutic_svc.score_therapeutic_indications(norm_proteins, uniprot_data)
            await _save_result(job_id, m, data, {
                "top_indication": data.get("top_indication", ""),
                "indications_scored": len(data.get("indications", [])),
            })
            await _set_module_progress(job_id, m, "completed", 100)
            results["therapeutic"] = data
        except Exception as e:
            await _set_module_progress(job_id, m, "failed", 0, str(e))
            results["therapeutic"] = {}

    async def _safe():
        m = f"safety_{suffix}"
        await _set_module_progress(job_id, m, "running", 0)
        try:
            data = safety_svc.profile_safety(norm_proteins, uniprot_data)
            await _save_result(job_id, m, data, {
                "risk_level": data.get("risk_level", ""),
                "total_flagged": data.get("total_flagged", 0),
            })
            await _set_module_progress(job_id, m, "completed", 100)
            results["safety"] = data
        except Exception as e:
            await _set_module_progress(job_id, m, "failed", 0, str(e))
            results["safety"] = {}

    await asyncio.gather(_ther(), _safe(), return_exceptions=True)

    return results


async def _execute_comparison_pipeline(job_id: str) -> None:
    async with AsyncSessionLocal() as s:
        r = await s.execute(select(Job).where(Job.id == uuid.UUID(job_id)))
        job = r.scalar_one()
        proteins_a: list[str] = job.proteins_a or []
        proteins_b: list[str] = job.proteins_b or []
        set_a_label: str = job.set_a_label or "Set A"
        set_b_label: str = job.set_b_label or "Set B"

    await _update_job(job_id, status="running")

    # Run both sets in parallel
    results_ab = await asyncio.gather(
        _run_set_modules(job_id, proteins_a, "A"),
        _run_set_modules(job_id, proteins_b, "B"),
        return_exceptions=True,
    )

    res_a = results_ab[0] if isinstance(results_ab[0], dict) else {}
    res_b = results_ab[1] if isinstance(results_ab[1], dict) else {}

    # Differential analysis
    await _set_module_progress(job_id, "differential", "running", 0)
    try:
        diff_data = run_differential_analysis(
            job_id=job_id,
            set_a_label=set_a_label,
            set_b_label=set_b_label,
            uniprot_a=res_a.get("uniprot", {}),
            uniprot_b=res_b.get("uniprot", {}),
            gprofiler_a=res_a.get("gprofiler", {}),
            gprofiler_b=res_b.get("gprofiler", {}),
            therapeutic_a=res_a.get("therapeutic", {}),
            therapeutic_b=res_b.get("therapeutic", {}),
            safety_a=res_a.get("safety", {}),
            safety_b=res_b.get("safety", {}),
            hpa_a=res_a.get("hpa", {}),
            hpa_b=res_b.get("hpa", {}),
        )
        await _save_result(job_id, "differential", diff_data, {
            "jaccard": diff_data.get("overlap", {}).get("jaccard_similarity", 0),
            "shared_count": diff_data.get("overlap", {}).get("shared_count", 0),
            "sig_pathways_a": diff_data.get("pathway", {}).get("volcano", {}).get("significant_count_a", 0),
            "sig_pathways_b": diff_data.get("pathway", {}).get("volcano", {}).get("significant_count_b", 0),
        })
        await _set_module_progress(job_id, "differential", "completed", 100)
    except Exception as e:
        logger.exception("Differential analysis failed for job %s", job_id)
        await _set_module_progress(job_id, "differential", "failed", 0, str(e))

    await _update_job(job_id, status="completed")
    logger.info("Comparison pipeline completed for job %s", job_id)
