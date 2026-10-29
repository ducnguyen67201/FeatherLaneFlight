"""Runner records and bounded locking queries on the shared PostgreSQL store."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.infrastructure.database import Base


class RunnerRecord(Base):
    __tablename__ = "runners"
    __table_args__ = (
        UniqueConstraint("id", "project_id", name="uq_runners_id_project"),
        CheckConstraint(
            "capacity_state IN ('AVAILABLE','BUSY','NEEDS_CLEANUP','DISABLED')",
            name="capacity_state",
        ),
        CheckConstraint("heartbeat_sequence >= 0", name="heartbeat_sequence"),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id", ondelete="CASCADE"), index=True
    )
    display_name: Mapped[str] = mapped_column(String(128))
    host_platform: Mapped[str] = mapped_column(String(128))
    credential_digest: Mapped[str] = mapped_column(String(64), unique=True)
    key_id: Mapped[str] = mapped_column(String(32))
    credential_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    contract_version: Mapped[str] = mapped_column(String(32))
    protocol_version: Mapped[str] = mapped_column(String(32))
    capacity_state: Mapped[str] = mapped_column(String(32))
    heartbeat_sequence: Mapped[int] = mapped_column(BigInteger)
    heartbeat_digest: Mapped[str | None] = mapped_column(String(64))
    available_builds: Mapped[list[dict]] = mapped_column(JSONB)
    local_profiles: Mapped[list[dict]] = mapped_column(JSONB)
    diagnostics: Mapped[list[dict]] = mapped_column(JSONB)
    synthetic_readiness: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class EnrollmentRecord(Base):
    __tablename__ = "runner_enrollment_grants"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "created_by", "request_id", name="uq_runner_grant_request"
        ),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id", ondelete="CASCADE"), index=True
    )
    created_by: Mapped[str] = mapped_column(ForeignKey("featherlane.users.id"))
    request_id: Mapped[str] = mapped_column(String(128))
    display_name: Mapped[str] = mapped_column(String(128))
    token_digest: Mapped[str] = mapped_column(String(64), unique=True)
    key_id: Mapped[str] = mapped_column(String(32))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_by: Mapped[str | None] = mapped_column(
        ForeignKey("featherlane.runners.id"), unique=True
    )
    enrollment_request_id: Mapped[str | None] = mapped_column(String(128))
    enrollment_digest: Mapped[str | None] = mapped_column(String(64))


class RunnerStore:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def check_ready(self) -> None:
        for model in (RunnerRecord, EnrollmentRecord):
            await self.session.execute(select(model).limit(0))

    async def grant_request(
        self, project_id: str, user_id: str, request_id: str
    ) -> EnrollmentRecord | None:
        return await self.session.scalar(
            select(EnrollmentRecord).where(
                EnrollmentRecord.project_id == project_id,
                EnrollmentRecord.created_by == user_id,
                EnrollmentRecord.request_id == request_id,
            )
        )

    async def grant_by_token(self, digest: str) -> EnrollmentRecord | None:
        return await self.session.scalar(
            select(EnrollmentRecord)
            .where(
                EnrollmentRecord.token_digest == digest,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    async def by_credential(self, digest: str) -> RunnerRecord | None:
        return await self.session.scalar(
            select(RunnerRecord)
            .where(
                RunnerRecord.credential_digest == digest,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    async def by_id(self, runner_id: str, *, lock: bool = False) -> RunnerRecord | None:
        query = select(RunnerRecord).where(RunnerRecord.id == runner_id)
        if lock:
            query = query.with_for_update()
        return await self.session.scalar(
            query.execution_options(populate_existing=True)
        )

    async def list(
        self, project_id: str, limit: int, cursor: str | None
    ) -> list[RunnerRecord]:
        query = select(RunnerRecord).where(RunnerRecord.project_id == project_id)
        if cursor:
            query = query.where(RunnerRecord.id > cursor)
        return list(
            (
                await self.session.scalars(
                    query.order_by(RunnerRecord.id).limit(limit + 1)
                )
            ).all()
        )
