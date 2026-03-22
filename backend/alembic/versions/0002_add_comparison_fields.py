"""add comparison fields to jobs table

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-22 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column(
        "job_type", sa.String(20), nullable=False, server_default="single"
    ))
    op.add_column("jobs", sa.Column(
        "proteins_a", postgresql.JSONB(astext_type=sa.Text()), nullable=True
    ))
    op.add_column("jobs", sa.Column(
        "proteins_b", postgresql.JSONB(astext_type=sa.Text()), nullable=True
    ))
    op.add_column("jobs", sa.Column(
        "set_a_label", sa.String(100), nullable=True
    ))
    op.add_column("jobs", sa.Column(
        "set_b_label", sa.String(100), nullable=True
    ))


def downgrade() -> None:
    op.drop_column("jobs", "set_b_label")
    op.drop_column("jobs", "set_a_label")
    op.drop_column("jobs", "proteins_b")
    op.drop_column("jobs", "proteins_a")
    op.drop_column("jobs", "job_type")
