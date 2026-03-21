import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.job import Job
from app.schemas.job import JobCreate, JobRead, JobSummary
from app.services import minio_client
from app.workers.tasks import run_analysis_pipeline

router = APIRouter()


@router.post("/", response_model=JobRead, status_code=status.HTTP_201_CREATED)
async def create_job(payload: JobCreate, db: AsyncSession = Depends(get_db)) -> Job:
    job = Job(
        proteins=payload.proteins,
        modules=payload.modules,
        label=payload.label,
        progress={m: {"status": "pending", "percent": 0, "message": ""} for m in payload.modules},
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    # Dispatch async pipeline
    run_analysis_pipeline.delay(str(job.id))
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
    # Clean up MinIO objects before deleting the job record
    await minio_client.delete_objects_by_prefix(f"jobs/{job_id}/")
    await db.delete(job)
    await db.commit()
