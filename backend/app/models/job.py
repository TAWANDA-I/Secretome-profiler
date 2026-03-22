import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Enum, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    status: Mapped[str] = mapped_column(
        Enum("pending", "running", "completed", "failed", name="job_status"),
        default="pending",
        index=True,
    )
    # 'single' or 'comparison'
    job_type: Mapped[str] = mapped_column(String(20), nullable=False, default="single")
    proteins: Mapped[list] = mapped_column(JSON, nullable=False)
    modules: Mapped[list] = mapped_column(JSON, nullable=False)
    # {module_name: {status, percent, message}}
    progress: Mapped[dict] = mapped_column(JSON, default=dict)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Comparison-specific fields
    proteins_a: Mapped[list | None] = mapped_column(JSON, nullable=True)
    proteins_b: Mapped[list | None] = mapped_column(JSON, nullable=True)
    set_a_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    set_b_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Quantitative concentration input: {gene_name: concentration_pg_ml}
    protein_concentrations: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<Job id={self.id} status={self.status} type={self.job_type}>"
