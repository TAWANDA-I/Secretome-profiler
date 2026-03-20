import asyncio
import json
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.job import Job

router = APIRouter()


@router.websocket("/jobs/{job_id}")
async def job_progress(websocket: WebSocket, job_id: uuid.UUID) -> None:
    await websocket.accept()
    try:
        while True:
            async with AsyncSessionLocal() as session:
                result = await session.execute(select(Job).where(Job.id == job_id))
                job = result.scalar_one_or_none()
            if job is None:
                await websocket.send_json({"error": "Job not found"})
                break
            payload = {
                "job_id": str(job.id),
                "status": job.status,
                "progress": job.progress,
            }
            await websocket.send_text(json.dumps(payload))
            if job.status in ("completed", "failed"):
                break
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        pass
