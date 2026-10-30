"""Attempt and claim receipts extend the real run queue; callers own transactions."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    select,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.infrastructure.database import Base


class AttemptRecord(Base):
    __tablename__ = "run_attempts"
    __table_args__ = (
        UniqueConstraint("runner_id", "fencing_number"),
        CheckConstraint(
            "fencing_number BETWEEN 1 AND 9007199254740991", name="fencing_number"
        ),
        CheckConstraint(
            "heartbeat_sequence BETWEEN 0 AND 9007199254740991",
            name="heartbeat_sequence",
        ),
        Index(
            "uq_attempt_active_run",
            "run_id",
            unique=True,
            postgresql_where=text("finished_at IS NULL"),
        ),
        Index(
            "uq_attempt_active_runner",
            "runner_id",
            unique=True,
            postgresql_where=text("finished_at IS NULL"),
        ),
        Index(
            "ix_attempt_expiry",
            "lease_expires_at",
            postgresql_where=text("finished_at IS NULL"),
        ),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("featherlane.runs.id"))
    runner_id: Mapped[str] = mapped_column(ForeignKey("featherlane.runners.id"))
    project_id: Mapped[str] = mapped_column(ForeignKey("featherlane.projects.id"))
    lease_id: Mapped[str] = mapped_column(String(32), unique=True)
    fencing_number: Mapped[int] = mapped_column(BigInteger)
    lease_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    heartbeat_sequence: Mapped[int] = mapped_column(BigInteger)
    heartbeat_digest: Mapped[str | None] = mapped_column(String(64))
    observed_manifest: Mapped[dict | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    manifest_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    finalization_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terminal_reason: Mapped[dict | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )


class ClaimReceipt(Base):
    __tablename__ = "runner_claim_receipts"
    runner_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.runners.id"), primary_key=True
    )
    request_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    attempt_id: Mapped[str | None] = mapped_column(
        ForeignKey("featherlane.run_attempts.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CleanupReceiptRecord(Base):
    __tablename__ = "runner_cleanup_receipts"
    __table_args__ = (CheckConstraint("kind IN ('CLEANUP','RECOVERY')", name="kind"),)
    runner_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.runners.id"), primary_key=True
    )
    operation_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("featherlane.run_attempts.id"))
    kind: Mapped[str] = mapped_column(String(16))
    request_digest: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class UsageReportRecord(Base):
    __tablename__ = "attempt_usage_reports"
    __table_args__ = (
        ForeignKeyConstraint(
            ["runner_id", "operation_id"],
            [
                "featherlane.runner_cleanup_receipts.runner_id",
                "featherlane.runner_cleanup_receipts.operation_id",
            ],
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint(
            "observed_elapsed_ms BETWEEN 0 AND 9007199254740991", name="elapsed_range"
        ),
        Index("ix_usage_attempt_received", "attempt_id", "received_at"),
        Index("ix_usage_attempt_elapsed", "attempt_id", "observed_elapsed_ms"),
    )
    runner_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    operation_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("featherlane.run_attempts.id"))
    project_id: Mapped[str] = mapped_column(ForeignKey("featherlane.projects.id"))
    lease_id: Mapped[str] = mapped_column(String(32))
    fencing_number: Mapped[int] = mapped_column(BigInteger)
    generation: Mapped[str] = mapped_column(String(128))
    clock_session_id: Mapped[str | None] = mapped_column(String(128))
    observed_elapsed_ms: Mapped[int | None] = mapped_column(BigInteger)
    payload: Mapped[dict] = mapped_column(JSONB)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LeaseStore:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def check_ready(self) -> None:
        for model in (
            AttemptRecord,
            ClaimReceipt,
            CleanupReceiptRecord,
            UsageReportRecord,
        ):
            await self.session.execute(select(model).limit(0))

    async def active_for_runner(self, runner_id: str) -> AttemptRecord | None:
        return await self.session.scalar(
            select(AttemptRecord).where(
                AttemptRecord.runner_id == runner_id,
                AttemptRecord.finished_at.is_(None),
            )
        )

    async def for_run(self, run_id: str) -> list[AttemptRecord]:
        return list(
            (
                await self.session.scalars(
                    select(AttemptRecord)
                    .where(AttemptRecord.run_id == run_id)
                    .order_by(AttemptRecord.created_at, AttemptRecord.id)
                    .limit(10)
                )
            ).all()
        )
