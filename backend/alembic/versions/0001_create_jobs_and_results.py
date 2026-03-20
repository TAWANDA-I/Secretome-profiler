"""create jobs and results tables

Revision ID: 0001
Revises:
Create Date: 2026-03-20 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── job_status enum ───────────────────────────────────────────────────────
    job_status = postgresql.ENUM(
        "pending", "running", "completed", "failed",
        name="job_status",
        create_type=True,
    )
    job_status.create(op.get_bind(), checkfirst=True)

    # ── jobs ──────────────────────────────────────────────────────────────────
    op.create_table(
        "jobs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "status",
            sa.Enum("pending", "running", "completed", "failed", name="job_status"),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("proteins", postgresql.JSONB, nullable=False),
        sa.Column("modules", postgresql.JSONB, nullable=False),
        sa.Column(
            "progress",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_jobs_status", "jobs", ["status"])
    op.create_index("ix_jobs_created_at", "jobs", ["created_at"])

    # Trigger to auto-update updated_at
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_jobs_updated_at
        BEFORE UPDATE ON jobs
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """
    )

    # ── results ───────────────────────────────────────────────────────────────
    op.create_table(
        "results",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "job_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("module_name", sa.String(64), nullable=False),
        sa.Column("minio_key", sa.String(512), nullable=True),
        sa.Column(
            "summary",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_results_job_id", "results", ["job_id"])
    op.create_index("ix_results_module_name", "results", ["module_name"])
    # Composite index for common query: all results for a job+module
    op.create_index(
        "ix_results_job_module", "results", ["job_id", "module_name"]
    )


def downgrade() -> None:
    op.drop_index("ix_results_job_module", "results")
    op.drop_index("ix_results_module_name", "results")
    op.drop_index("ix_results_job_id", "results")
    op.drop_table("results")

    op.execute("DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at()")

    op.drop_index("ix_jobs_created_at", "jobs")
    op.drop_index("ix_jobs_status", "jobs")
    op.drop_table("jobs")

    postgresql.ENUM(name="job_status").drop(op.get_bind(), checkfirst=True)
