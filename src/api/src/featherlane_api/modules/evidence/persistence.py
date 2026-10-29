"""Immutable declarations/receipts; application owns authorization/transactions."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
    select,
)
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.infrastructure.database import Base


class EvidenceQuota(Base):
    __tablename__ = "evidence_project_quotas"
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id"), primary_key=True
    )


class ArtifactRecord(Base):
    __tablename__ = "artifacts"
    __table_args__ = (
        UniqueConstraint("attempt_id", "request_id"),
        CheckConstraint(
            "kind IN ('OBSERVATIONS','REDACTED_PROCESS_LOG','PX4_ULOG')", name="kind"
        ),
        CheckConstraint("disposition IN ('UPLOAD','LOCAL_ONLY')", name="disposition"),
        CheckConstraint(
            "state IN ('PENDING','FAILED','VERIFIED','NOT_VERIFIED')", name="state"
        ),
        CheckConstraint(
            "(disposition = 'UPLOAD' AND byte_length IS NOT NULL "
            "AND sha256 IS NOT NULL "
            "AND byte_length BETWEEN 0 AND 104857600 "
            "AND sha256 ~ '^[a-f0-9]{64}$' AND state <> 'NOT_VERIFIED') OR "
            "(disposition = 'LOCAL_ONLY' AND byte_length IS NULL AND sha256 IS NULL "
            "AND state = 'NOT_VERIFIED')",
            name="content",
        ),
        CheckConstraint(
            "(state = 'VERIFIED') = (verified_at IS NOT NULL)", name="verification"
        ),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id"), index=True
    )
    run_id: Mapped[str] = mapped_column(ForeignKey("featherlane.runs.id"), index=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("featherlane.run_attempts.id"))
    runner_id: Mapped[str] = mapped_column(ForeignKey("featherlane.runners.id"))
    request_id: Mapped[str] = mapped_column(String(128))
    request_digest: Mapped[str] = mapped_column(String(64))
    trial_id: Mapped[str | None] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(24))
    disposition: Mapped[str] = mapped_column(String(16))
    byte_length: Mapped[int | None] = mapped_column(BigInteger)
    sha256: Mapped[str | None] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class EvidenceStore:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def check_ready(self) -> None:
        for model in (ArtifactRecord, EvidenceQuota):
            await self.session.execute(select(model).limit(0))

    async def for_run(self, run_id: str) -> list[ArtifactRecord]:
        return list(
            (
                await self.session.scalars(
                    select(ArtifactRecord)
                    .where(ArtifactRecord.run_id == run_id)
                    .order_by(ArtifactRecord.created_at, ArtifactRecord.id)
                    .limit(100)
                )
            ).all()
        )

    async def lock_quota(self, project_id: str) -> None:
        # Dedicated evidence lock avoids reversing admission's project -> runner
        # order. All evidence writes first lock runner -> run -> attempt.
        await self.session.execute(
            insert(EvidenceQuota).values(project_id=project_id).on_conflict_do_nothing()
        )
        await self.session.scalar(
            select(EvidenceQuota)
            .where(EvidenceQuota.project_id == project_id)
            .with_for_update()
        )

    async def usage(
        self, *, run_id: str | None = None, project_id: str
    ) -> tuple[int, int]:
        query = select(
            func.count(), func.coalesce(func.sum(ArtifactRecord.byte_length), 0)
        )
        query = query.where(ArtifactRecord.project_id == project_id)
        if run_id is not None:
            query = query.where(ArtifactRecord.run_id == run_id)
        count, size = (await self.session.execute(query)).one()
        return int(count), int(size)

    async def by_request(
        self, attempt_id: str, request_id: str
    ) -> ArtifactRecord | None:
        return await self.session.scalar(
            select(ArtifactRecord).where(
                ArtifactRecord.attempt_id == attempt_id,
                ArtifactRecord.request_id == request_id,
            )
        )

    async def exact(
        self, artifact_id: str, *, lock: bool = False
    ) -> ArtifactRecord | None:
        query = select(ArtifactRecord).where(ArtifactRecord.id == artifact_id)
        if lock:
            query = query.with_for_update().execution_options(populate_existing=True)
        return await self.session.scalar(query)
