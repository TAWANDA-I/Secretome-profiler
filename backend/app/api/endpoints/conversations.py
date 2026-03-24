"""
Conversation API endpoints — Q&A about specific analysis job results.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.endpoints.auth import get_optional_user
from app.database import get_db
from app.models.job import Job
from app.models.result import Result
from app.models.user import User
from app.services import minio_client
from app.services.auth import decrypt_api_key
from app.services.conversation import chat_with_results, generate_suggestions

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Pydantic models ───────────────────────────────────────────────────────────

class MessageItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[MessageItem] = []


class ChatResponse(BaseModel):
    response: str
    tokens_used: int = 0
    model: str | None = None
    error: bool = False
    error_type: str | None = None


class SuggestionsResponse(BaseModel):
    suggestions: list[str]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _load_all_results(job_id: uuid.UUID, db: AsyncSession) -> dict[str, Any]:
    """Load all completed module results for a job from MinIO."""
    res = await db.execute(
        select(Result).where(Result.job_id == job_id)
    )
    results = list(res.scalars().all())

    all_data: dict[str, Any] = {}
    for result in results:
        if result.minio_key:
            try:
                data = await minio_client.download_json(result.minio_key)
                all_data[result.module_name] = data
            except Exception as exc:
                logger.warning("Could not load %s: %s", result.module_name, exc)
                # Fall back to summary dict stored in DB
                if result.summary:
                    all_data[result.module_name] = result.summary
    return all_data


async def _get_job_or_404(job_id: str, db: AsyncSession) -> Job:
    try:
        uid = uuid.UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid job ID format")
    res = await db.execute(select(Job).where(Job.id == uid))
    job = res.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/{job_id}", response_model=ChatResponse)
async def chat_about_job(
    job_id: str,
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> ChatResponse:
    """Send a message about a specific analysis job; returns Claude's response."""
    job = await _get_job_or_404(job_id, db)
    all_results = await _load_all_results(job.id, db)

    if not all_results:
        return ChatResponse(
            response=(
                "No analysis results found for this job. "
                "The analysis may still be running or may have failed."
            ),
            error=True,
            error_type="no_results",
        )

    # Use the authenticated user's API key if available
    api_key = ""
    if current_user and current_user.anthropic_api_key_encrypted:
        api_key = decrypt_api_key(current_user.anthropic_api_key_encrypted)

    history = [{"role": m.role, "content": m.content} for m in request.history]
    result = await chat_with_results(
        all_results=all_results,
        history=history,
        user_message=request.message,
        api_key=api_key,
    )
    return ChatResponse(**result)


@router.get("/{job_id}/suggestions", response_model=SuggestionsResponse)
async def get_suggestions(
    job_id: str,
    db: AsyncSession = Depends(get_db),
) -> SuggestionsResponse:
    """Return context-specific suggested questions for this analysis job."""
    job = await _get_job_or_404(job_id, db)
    all_results = await _load_all_results(job.id, db)

    if not all_results:
        return SuggestionsResponse(
            suggestions=[
                "What proteins are in this secretome?",
                "What is the top therapeutic indication?",
                "What are the safety findings?",
                "Which proteins can cross the BBB?",
                "What experiments should I do next?",
            ]
        )

    suggestions = generate_suggestions(all_results)
    return SuggestionsResponse(suggestions=suggestions)
