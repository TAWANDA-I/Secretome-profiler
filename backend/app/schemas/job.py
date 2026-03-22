from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ModuleName = Literal[
    "uniprot", "string", "gprofiler", "hpa", "signalp", "pharos", "sasp", "comparison",
    "therapeutic", "receptor_ligand", "safety", "disease_context",
]

ALL_MODULES: list[str] = [
    "uniprot", "string", "gprofiler", "hpa", "signalp", "sasp",
    "therapeutic", "receptor_ligand", "safety", "disease_context",
]


class JobCreate(BaseModel):
    proteins: list[str] = Field(
        ..., min_length=1, max_length=1000, description="UniProt accession IDs"
    )
    modules: list[str] = Field(
        default_factory=lambda: list(ALL_MODULES),
        description="Which analysis modules to run",
    )
    label: str | None = Field(None, max_length=255)


class ModuleProgress(BaseModel):
    status: Literal["pending", "running", "completed", "failed"] = "pending"
    percent: int = 0
    message: str = ""


class JobRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    status: str
    proteins: list[str]
    modules: list[str]
    progress: dict[str, ModuleProgress] = {}
    error_message: str | None = None
    label: str | None = None
    created_at: datetime
    updated_at: datetime


class JobSummary(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    status: str
    label: str | None
    created_at: datetime
    updated_at: datetime
