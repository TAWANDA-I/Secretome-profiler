import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.job import Job
from app.schemas.job import COMPARISON_SET_MODULES, JobCreate, JobRead, JobSummary
from app.services import minio_client
from app.workers.tasks import run_analysis_pipeline, run_comparison_pipeline

router = APIRouter()


@router.post("/", response_model=JobRead, status_code=status.HTTP_201_CREATED)
async def create_job(payload: JobCreate, db: AsyncSession = Depends(get_db)) -> Job:
    if payload.job_type == "comparison":
        return await _create_comparison_job(payload, db)
    return await _create_single_job(payload, db)


async def _create_single_job(payload: JobCreate, db: AsyncSession) -> Job:
    job = Job(
        job_type="single",
        proteins=payload.proteins,
        modules=payload.modules,
        label=payload.label,
        progress={m: {"status": "pending", "percent": 0, "message": ""} for m in payload.modules},
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

    # Build module list: each base module twice (A and B suffix) plus differential
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
    skip: int = 0, limit: int = 50, db: AsyncSession = Depends(get_db)
) -> list[Job]:
    result = await db.execute(
        select(Job).order_by(Job.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


@router.get("/{job_id}", response_model=JobRead)
async def get_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Job:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(job_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    await minio_client.delete_objects_by_prefix(f"jobs/{job_id}/")
    await db.delete(job)
    await db.commit()
