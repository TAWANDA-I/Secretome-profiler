import asyncio
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.job import Job
from app.models.user import User
from app.services.auth import decode_access_token

router = APIRouter()


async def _get_user_from_token(token: Optional[str]) -> Optional[User]:
    """Validate JWT from query param and return the user, or None if invalid."""
    if not token:
        return None
    payload = decode_access_token(token, get_settings().secret_key)
    if not payload:
        return None
    email: str = payload.get("sub", "")
    if not email:
        return None
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
    return user if user and user.is_active else None


@router.websocket("/jobs/{job_id}")
async def job_progress(
    websocket: WebSocket,
    job_id: uuid.UUID,
    token: Optional[str] = Query(default=None),
) -> None:
    user = await _get_user_from_token(token)
    if user is None:
        await websocket.close(code=4003)
        return

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
