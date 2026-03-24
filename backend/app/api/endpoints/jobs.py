import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.endpoints.auth import get_current_user
from app.database import get_db
from app.models.job import Job
from app.models.user import User
from app.schemas.job import COMPARISON_SET_MODULES, JobCreate, JobRead, JobSummary
from app.services import minio_client
from app.services.auth import decrypt_api_key
from app.workers.tasks import run_analysis_pipeline, run_comparison_pipeline

router = APIRouter()


def _store_job_api_key(job_id: str, api_key: str) -> None:
    """Store the user's API key in Redis with a 2-hour TTL for the Celery worker."""
    try:
        import redis as redis_lib
        from app.config import get_settings
        r = redis_lib.from_url(get_settings().redis_url)
        r.setex(f"job_api_key:{job_id}", 7200, api_key)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("Could not store job API key: %s", exc)


@router.post("/", response_model=JobRead, status_code=status.HTTP_201_CREATED)
async def create_job(
    payload: JobCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Job:
    # Require user to have provided their API key
    if not current_user.anthropic_api_key_encrypted:
        raise HTTPException(
            status_code=400,
            detail=(
                "No Anthropic API key found. Please add your API key in Settings "
                "before running an analysis."
            ),
        )
    user_api_key = decrypt_api_key(current_user.anthropic_api_key_encrypted)

    if payload.job_type == "comparison":
        job = await _create_comparison_job(payload, db)
    else:
        job = await _create_single_job(payload, db)

    # Persist user's API key in Redis so the Celery worker can use it
    _store_job_api_key(str(job.id), user_api_key)
    return job


async def _create_single_job(payload: JobCreate, db: AsyncSession) -> Job:
    modules = list(payload.modules)
    if payload.protein_concentrations:
        if "concentrations" not in modules:
            modules.append("concentrations")
    if "pk" not in modules:
        modules.append("pk")

    job = Job(
        job_type="single",
        proteins=payload.proteins,
        modules=modules,
        label=payload.label,
        protein_concentrations=payload.protein_concentrations or None,
        progress={m: {"status": "pending", "percent": 0, "message": ""} for m in modules},
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    run_analysis_pipeline.delay(str(job.id))
    return job


async def _create_comparison_job(payload: JobCreate, db: AsyncSession) -> Job:
    if not payload.set_a_proteins or not payload.set_b_proteins:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comparison jobs require set_a_proteins and set_b_proteins",
        )
    if not payload.set_a_label or not payload.set_b_label:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comparison jobs require set_a_label and set_b_label",
        )

    modules = (
        [f"{m}_A" for m in COMPARISON_SET_MODULES]
        + [f"{m}_B" for m in COMPARISON_SET_MODULES]
        + ["differential"]
    )

    job = Job(
        job_type="comparison",
        proteins=[],
        proteins_a=payload.set_a_proteins,
        proteins_b=payload.set_b_proteins,
        set_a_label=payload.set_a_label,
        set_b_label=payload.set_b_label,
        modules=modules,
        label=payload.label or f"{payload.set_a_label} vs {payload.set_b_label}",
        progress={m: {"status": "pending", "percent": 0, "message": ""} for m in modules},
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    run_comparison_pipeline.delay(str(job.id))
    return job


@router.get("/", response_model=list[JobSummary])
async def list_jobs(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Job]:
    result = await db.execute(
        select(Job).order_by(Job.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


@router.get("/{job_id}", response_model=JobRead)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Job:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    await minio_client.delete_objects_by_prefix(f"jobs/{job_id}/")
    await db.delete(job)
    await db.commit()
