import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.result import Result
from app.schemas.result import ResultDownloadURL, ResultRead
from app.services import minio_client

router = APIRouter()


@router.get("/job/{job_id}", response_model=list[ResultRead])
async def get_job_results(
    job_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[Result]:
    res = await db.execute(select(Result).where(Result.job_id == job_id))
    return list(res.scalars().all())


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
