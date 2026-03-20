from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ResultRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    job_id: uuid.UUID
    module_name: str
    minio_key: str | None
    summary: dict
    created_at: datetime


class ResultDownloadURL(BaseModel):
    url: str
    expires_in: int = 3600
