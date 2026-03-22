import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.job import Job
from app.models.result import Result
from app.schemas.result import ResultDownloadURL, ResultRead
from app.services import minio_client
from app.services.methods_report import generate_report

router = APIRouter()


@router.get("/job/{job_id}", response_model=list[ResultRead])
async def get_job_results(
    job_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[Result]:
    res = await db.execute(select(Result).where(Result.job_id == job_id))
    return list(res.scalars().all())


@router.get("/job/{job_id}/{module_name}/data")
async def get_result_data(
    job_id: uuid.UUID, module_name: str, db: AsyncSession = Depends(get_db)
) -> JSONResponse:
    """Return the full MinIO JSON payload for a specific module result."""
    res = await db.execute(
        select(Result).where(
            Result.job_id == job_id, Result.module_name == module_name
        )
    )
    result = res.scalar_one_or_none()
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found")
    if not result.minio_key:
        return JSONResponse(content={})
    try:
        data = await minio_client.download_json(result.minio_key)
        return JSONResponse(content=data)
    except FileNotFoundError:
        return JSONResponse(content={})


@router.get("/job/{job_id}/methods_report")
async def get_methods_report(
    job_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> JSONResponse:
    """Generate a publication-ready methods section from all module results."""
    # Load the job to get the protein list
    job_res = await db.execute(select(Job).where(Job.id == job_id))
    job = job_res.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    # Load all results for the job
    res = await db.execute(select(Result).where(Result.job_id == job_id))
    results = list(res.scalars().all())

    # Download MinIO payloads for each module
    module_data: dict = {}
    for result in results:
        if result.minio_key:
            try:
                data = await minio_client.download_json(result.minio_key)
                module_data[result.module_name] = data
            except Exception:
                module_data[result.module_name] = {}
        else:
            module_data[result.module_name] = {}

    report = generate_report(
        job_id=str(job_id),
        proteins=job.proteins or [],
        module_data=module_data,
    )
    return JSONResponse(content=report)


@router.get("/{result_id}", response_model=ResultRead)
async def get_result(result_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Result:
    res = await db.execute(select(Result).where(Result.id == result_id))
    result = res.scalar_one_or_none()
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found")
    return result


@router.get("/{result_id}/download", response_model=ResultDownloadURL)
async def get_download_url(
    result_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> ResultDownloadURL:
    res = await db.execute(select(Result).where(Result.id == result_id))
    result = res.scalar_one_or_none()
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found")
    if not result.minio_key:
        raise HTTPException(status_code=404, detail="No file stored for this result")
    url = await minio_client.presigned_url(result.minio_key)
    return ResultDownloadURL(url=url)
