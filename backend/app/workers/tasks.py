import asyncio
import logging
import uuid
from typing import Any

from sqlalchemy import select, update

from app.config import get_settings
from app.database import AsyncSessionLocal
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
    async with AsyncSessionLocal() as s:
        r = await s.execute(select(Job).where(Job.id == uuid.UUID(job_id)))
        job = r.scalar_one()
        progress = dict(job.progress or {})
        progress[module] = {"status": status, "percent": percent, "message": message}
        await s.execute(
            update(Job).where(Job.id == uuid.UUID(job_id)).values(progress=progress)
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
        parallel.append(_run_hpa(job_id, proteins, gene_names))
    if "signalp" in modules:
        parallel.append(_run_signalp(job_id, proteins, uniprot_data))
    if "sasp" in modules:
        parallel.append(_run_sasp(job_id, proteins))

    await asyncio.gather(*parallel, return_exceptions=True)

    if "comparison" in modules:
        await _run_comparison(job_id, proteins)

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


async def _run_hpa(job_id: str, proteins: list[str], gene_names: dict[str, str]) -> None:
    await _set_module_progress(job_id, "hpa", "running", 0)
    try:
        data = await hpa_svc.fetch_concentrations(proteins, gene_names)
        await _save_result(job_id, "hpa", data, {"proteins_with_data": len(data)})
        await _set_module_progress(job_id, "hpa", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "hpa", "failed", 0, str(e))


async def _run_signalp(job_id: str, proteins: list[str], uniprot_data: dict) -> None:
    await _set_module_progress(job_id, "signalp", "running", 0)
    try:
        data = await signalp_svc.classify_signal_peptides(proteins, uniprot_data)
        summary = {
            "classical_sp": sum(1 for v in data.values() if v.get("has_sp")),
            "no_sp": sum(1 for v in data.values() if not v.get("has_sp")),
        }
        await _save_result(job_id, "signalp", data, summary)
        await _set_module_progress(job_id, "signalp", "completed", 100)
    except Exception as e:
        await _set_module_progress(job_id, "signalp", "failed", 0, str(e))



async def _run_sasp(job_id: str, proteins: list[str]) -> None:
    await _set_module_progress(job_id, "sasp", "running", 0)
    try:
        data = sasp_svc.flag_sasp(proteins)
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
