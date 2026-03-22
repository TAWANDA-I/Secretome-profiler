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

    # Phase 2: Therapeutic Analysis Layer (runs after Phase 1 completes)
    phase2 = []
    if "therapeutic" in modules:
        phase2.append(_run_therapeutic(job_id, proteins, uniprot_data))
    if "receptor_ligand" in modules:
        phase2.append(_run_receptor_ligand(job_id, proteins, uniprot_data))
    if "safety" in modules:
        phase2.append(_run_safety(job_id, proteins, uniprot_data))
    if "disease_context" in modules:
        phase2.append(_run_disease_context(job_id, proteins, uniprot_data))

    if phase2:
        await asyncio.gather(*phase2, return_exceptions=True)

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


async def _run_therapeutic(job_id: str, proteins: list[str], uniprot_data: dict) -> None:
    await _set_module_progress(job_id, "therapeutic", "running", 0)
    try:
        data = therapeutic_svc.score_therapeutic_indications(proteins, uniprot_data)
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
