"""Insert-only registration records. Callers own the authorized transaction."""

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, select
from sqlalchemy.dialects.postgresql import JSONB, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.infrastructure.database import Base

RegistrationKind = Literal["BUILD", "INTEGRATION", "LOCAL_PROFILE"]


class RegistrationRecord(Base):
    __tablename__ = "registrations"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('BUILD', 'INTEGRATION', 'LOCAL_PROFILE')", name="kind"
        ),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(String(16), primary_key=True)
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RegistrationAuditRecord(Base):
    __tablename__ = "registration_audit_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id"), index=True
    )
    actor_id: Mapped[str] = mapped_column(ForeignKey("featherlane.users.id"))
    registration_id: Mapped[str] = mapped_column(String(128))
    kind: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RegistrationReceipt(Base):
    __tablename__ = "registration_receipts"
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id"), primary_key=True
    )
    actor_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.users.id"), primary_key=True
    )
    request_key: Mapped[str] = mapped_column(String(128), primary_key=True)
    request_digest: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(16))
    registration_id: Mapped[str] = mapped_column(String(128))


class RegistrationStore:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def check_ready(self) -> None:
        await self.session.execute(select(RegistrationRecord).limit(0))
        await self.session.execute(select(RegistrationAuditRecord).limit(0))
        await self.session.execute(select(RegistrationReceipt).limit(0))

    async def reserve(
        self,
        project_id: str,
        actor_id: str,
        key: str,
        digest: str,
        kind: RegistrationKind,
        identity: str,
    ) -> tuple[RegistrationReceipt, bool]:
        # A competing insert waits for commit/rollback, so a committed receipt
        # always names a completed registration from the same transaction.
        result = await self.session.execute(
            insert(RegistrationReceipt)
            .values(
                project_id=project_id,
                actor_id=actor_id,
                request_key=key,
                request_digest=digest,
                kind=kind,
                registration_id=identity,
            )
            .on_conflict_do_nothing()
            .returning(RegistrationReceipt.request_key)
        )
        created = result.scalar_one_or_none() is not None
        receipt = await self.session.get(
            RegistrationReceipt, (project_id, actor_id, key)
        )
        if receipt is None:
            raise RuntimeError("Registration receipt was not persisted.")
        return receipt, created

    async def list(
        self, project_id: str, kind: RegistrationKind, limit: int, cursor: str | None
    ) -> list[RegistrationRecord]:
        query = select(RegistrationRecord).where(
            RegistrationRecord.project_id == project_id, RegistrationRecord.kind == kind
        )
        if cursor:
            query = query.where(RegistrationRecord.id > cursor)
        return list(
            (
                await self.session.scalars(
                    query.order_by(RegistrationRecord.id).limit(limit + 1)
                )
            ).all()
        )

    async def get(
        self, project_id: str, kind: RegistrationKind, identity: str
    ) -> RegistrationRecord | None:
        return await self.session.get(RegistrationRecord, (project_id, kind, identity))

    async def add(
        self,
        project_id: str,
        kind: RegistrationKind,
        identity: str,
        payload: dict,
        actor_id: str,
    ) -> RegistrationRecord:
        created_at = datetime.now(UTC)
        result = await self.session.execute(
            insert(RegistrationRecord)
            .values(
                project_id=project_id,
                kind=kind,
                id=identity,
                payload=payload,
                created_at=created_at,
            )
            .on_conflict_do_nothing()
            .returning(RegistrationRecord.id)
        )
        if result.scalar_one_or_none() is not None:
            self.session.add(
                RegistrationAuditRecord(
                    id=uuid4().hex,
                    project_id=project_id,
                    actor_id=actor_id,
                    registration_id=identity,
                    kind=kind,
                    created_at=created_at,
                )
            )
            await self.session.flush()
        record = await self.get(project_id, kind, identity)
        if record is None or record.payload != payload:
            raise RuntimeError("Immutable registration identity conflict.")
        return record
