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

# Modules run on each set in a comparison job (no STRING — expensive, not used in diff)
COMPARISON_SET_MODULES: list[str] = [
    "uniprot", "gprofiler", "hpa", "signalp", "sasp", "therapeutic", "safety",
]


class JobCreate(BaseModel):
    # 'single' (default) or 'comparison'
    job_type: Literal["single", "comparison"] = "single"

    # ── Single mode ───────────────────────────────────────────────────────────
    proteins: list[str] = Field(
        default_factory=list, max_length=1000, description="UniProt accession IDs"
    )
    modules: list[str] = Field(
        default_factory=lambda: list(ALL_MODULES),
        description="Which analysis modules to run",
    )
    label: str | None = Field(None, max_length=255)

    # ── Quantitative concentrations (optional) ────────────────────────────────
    # {gene_name: concentration_pg_ml} — if provided, enables Concentrations tab
    protein_concentrations: dict[str, float] | None = Field(
        None,
        description="Optional: gene name to concentration mapping in pg/mL",
    )

    # ── Comparison mode ───────────────────────────────────────────────────────
    set_a_proteins: list[str] = Field(default_factory=list, max_length=1000)
    set_a_label: str | None = Field(None, max_length=100)
    set_b_proteins: list[str] = Field(default_factory=list, max_length=1000)
    set_b_label: str | None = Field(None, max_length=100)


class ModuleProgress(BaseModel):
    status: Literal["pending", "running", "completed", "failed"] = "pending"
    percent: int = 0
    message: str = ""


class JobRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    status: str
    job_type: str = "single"
    proteins: list[str]
    modules: list[str]
    progress: dict[str, ModuleProgress] = {}
    error_message: str | None = None
    label: str | None = None
    proteins_a: list[str] | None = None
    proteins_b: list[str] | None = None
    set_a_label: str | None = None
    set_b_label: str | None = None
    protein_concentrations: dict[str, float] | None = None
    created_at: datetime
    updated_at: datetime


class JobSummary(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    status: str
    job_type: str = "single"
    label: str | None
    set_a_label: str | None = None
    set_b_label: str | None = None
    created_at: datetime
    updated_at: datetime
