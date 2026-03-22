"""add protein_concentrations to jobs

Revision ID: 0003
Revises: 0002
Create Date: 2026-03-22
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "protein_concentrations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="Gene-name to concentration (pg/mL) mapping, e.g. {\"IL6\": 45230}",
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "protein_concentrations")
