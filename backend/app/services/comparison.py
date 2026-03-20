"""
Two-set comparison: volcano plots, PCA, Venn diagram data.
Operates on stored MinIO results for a given job.
"""
import logging
import uuid
from typing import Any

import numpy as np
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.result import Result
from app.services import minio_client

logger = logging.getLogger(__name__)


async def run_comparison(job_id: str) -> dict[str, Any]:
    """
    Placeholder — real implementation will:
    1. Load uniprot + module results from MinIO for this job
    2. Compute Venn overlap, volcano (if two protein sets), PCA
    Currently returns a stub so the pipeline task completes.
    """
    async with AsyncSessionLocal() as session:
        res = await session.execute(
            select(Result).where(Result.job_id == uuid.UUID(job_id))
        )
        results = res.scalars().all()

    modules_done = [r.module_name for r in results]
    return {
        "job_id": job_id,
        "set_count": 1,
        "modules_included": modules_done,
        "venn": {},
        "volcano": {},
        "pca": {},
        "note": "Full comparison requires two protein sets submitted together.",
    }
