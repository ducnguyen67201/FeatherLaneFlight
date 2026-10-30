"""One immutable accepted input and terminal result per attempt."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.infrastructure.database import Base


class FinalizationRecord(Base):
    __tablename__ = "attempt_finalizations"
    __table_args__ = (
        UniqueConstraint("runner_id", "operation_id"),
        CheckConstraint("deadline_at > accepted_at", name="deadline"),
    )
    attempt_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.run_attempts.id"), primary_key=True
    )
    runner_id: Mapped[str] = mapped_column(ForeignKey("featherlane.runners.id"))
    operation_id: Mapped[str] = mapped_column(String(128))
    input_digest: Mapped[str] = mapped_column(String(64))
    inputs: Mapped[dict] = mapped_column(JSONB)
    acceptance: Mapped[dict] = mapped_column(JSONB)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    terminal: Mapped[dict | None] = mapped_column(JSONB(none_as_null=True))
