"""One durable queue and immutable admission snapshots. Callers own transactions."""

from datetime import datetime
from uuid import uuid4

from featherlane_contracts import ErrorCode
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    or_,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.http.errors import ApiError
from featherlane_api.infrastructure.database import Base
from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.access.persistence import ProjectRecord


class RunRecord(Base):
    __tablename__ = "runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["runner_id", "project_id"],
            ["featherlane.runners.id", "featherlane.runners.project_id"],
        ),
        CheckConstraint(
            "execution_state IN ('QUEUED','CLAIMED','STARTING','RUNNING','FINALIZING',"
            "'COMPLETED','CANCELED','ERROR')",
            name="execution_state",
        ),
        CheckConstraint(
            "evaluation_outcome IN ('NOT_EVALUATED','PASS','FAIL','INCONCLUSIVE')",
            name="evaluation_outcome",
        ),
        CheckConstraint("repetitions BETWEEN 1 AND 10", name="repetitions"),
        Index("ix_runs_project_queue", "project_id", "execution_state", "id"),
        Index("ix_runs_runner_queue", "runner_id", "execution_state", "id"),
    )
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("featherlane.projects.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("featherlane.users.id"))
    runner_id: Mapped[str] = mapped_column(String(32))
    build_id: Mapped[str] = mapped_column(String(128))
    suite_revision_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.suite_revisions.id")
    )
    build_label: Mapped[str] = mapped_column(String(128))
    suite_title: Mapped[str] = mapped_column(String(128))
    suite_revision: Mapped[int] = mapped_column(Integer)
    runner_display_name: Mapped[str] = mapped_column(String(128))
    repetitions: Mapped[int] = mapped_column(Integer)
    requested_manifest: Mapped[dict] = mapped_column(JSONB)
    suite_snapshot: Mapped[dict] = mapped_column(JSONB)
    expected_trials: Mapped[list[dict]] = mapped_column(JSONB)
    execution_state: Mapped[str] = mapped_column(String(16))
    evaluation_outcome: Mapped[str] = mapped_column(String(16))
    terminal_reason: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    cancellation_deadline_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )


class RunReceipt(Base):
    __tablename__ = "run_submission_receipts"
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id"), primary_key=True
    )
    actor_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.users.id"), primary_key=True
    )
    request_key: Mapped[str] = mapped_column(String(128), primary_key=True)
    request_digest: Mapped[str] = mapped_column(String(64))
    run_id: Mapped[str] = mapped_column(ForeignKey("featherlane.runs.id"))


class RunAuditRecord(Base):
    __tablename__ = "run_audit_events"
    __table_args__ = (UniqueConstraint("run_id", "action"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("featherlane.projects.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("featherlane.users.id"))
    run_id: Mapped[str] = mapped_column(ForeignKey("featherlane.runs.id"))
    action: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RunStore:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def check_ready(self) -> None:
        for model in (RunRecord, RunReceipt, RunAuditRecord):
            await self.session.execute(select(model).limit(0))

    async def lock_project(self, project_id: str) -> None:
        project = await self.session.scalar(
            select(ProjectRecord)
            .where(ProjectRecord.id == project_id)
            .with_for_update()
        )
        if project is None:
            raise AccessNotFound()

    async def queued_count(self, project_id: str) -> int:
        return int(
            await self.session.scalar(
                select(func.count())
                .select_from(RunRecord)
                .where(
                    RunRecord.project_id == project_id,
                    RunRecord.execution_state == "QUEUED",
                )
            )
            or 0
        )

    async def exact(self, run_id: str, *, lock: bool = False) -> RunRecord:
        query = select(RunRecord).where(RunRecord.id == run_id)
        if lock:
            query = query.with_for_update().execution_options(populate_existing=True)
        row = await self.session.scalar(query)
        if row is None:
            raise AccessNotFound()
        return row

    async def receipt(
        self, project_id: str, actor_id: str, key: str
    ) -> RunReceipt | None:
        return await self.session.get(RunReceipt, (project_id, actor_id, key))

    async def list(
        self,
        project_id: str,
        limit: int,
        cursor: str | None,
        search: str | None,
        execution_state: str | None,
        evaluation_outcome: str | None,
    ) -> list[RunRecord]:
        query = select(RunRecord).where(RunRecord.project_id == project_id)
        if cursor:
            query = query.where(RunRecord.id > cursor)
        if execution_state:
            query = query.where(RunRecord.execution_state == execution_state)
        if evaluation_outcome:
            query = query.where(RunRecord.evaluation_outcome == evaluation_outcome)
        if search and search.strip():
            escaped = (
                search.strip().replace("!", "!!").replace("%", "!%").replace("_", "!_")
            )
            query = query.where(
                or_(
                    *(
                        column.ilike("%" + escaped + "%", escape="!")
                        for column in (
                            RunRecord.id,
                            RunRecord.build_label,
                            RunRecord.suite_title,
                            RunRecord.runner_display_name,
                        )
                    )
                )
            )
        return list(
            (
                await self.session.scalars(
                    query.order_by(RunRecord.id).limit(limit + 1)
                )
            ).all()
        )

    def audit(self, row: RunRecord, actor_id: str, action: str, now: datetime) -> None:
        self.session.add(
            RunAuditRecord(
                id=uuid4().hex,
                project_id=row.project_id,
                actor_id=actor_id,
                run_id=row.id,
                action=action,
                created_at=now,
            )
        )


async def require_queued_run(
    session: AsyncSession, *, project_id: str, runner_id: str, run_id: str
) -> RunRecord:
    """P13 seam: authorized caller MUST lock runner identity first, then call here.

    Caller owns the transaction through conditional reservation/attempt creation.
    Returning a row grants no lease; it is locked until caller commit/rollback.
    """
    if not session.in_transaction():
        raise RuntimeError("Queued lookup requires a caller-owned transaction.")
    row = await RunStore(session).exact(run_id, lock=True)
    if row.project_id != project_id or row.runner_id != runner_id:
        raise AccessNotFound()
    if row.execution_state != "QUEUED" or row.cancellation_requested_at is not None:
        raise ApiError(
            409, ErrorCode.RUNNER_UNAVAILABLE, "The run is no longer queued."
        )
    from featherlane_api.modules.runs.snapshots import admission_snapshot

    admission_snapshot(row)
    return row
