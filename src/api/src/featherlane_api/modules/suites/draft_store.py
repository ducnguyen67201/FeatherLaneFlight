"""Project-scoped mutable drafts and immutable creation/publication journals."""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    func,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.infrastructure.database import Base
from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.access.persistence import ProjectRecord
from featherlane_api.modules.suites.persistence import SuiteRevisionRecord


class SuiteDraftRecord(Base):
    __tablename__ = "suite_drafts"
    __table_args__ = (
        CheckConstraint(
            "draft_version BETWEEN 1 AND 1000000", name="draft_version_bounds"
        ),
    )
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id"), primary_key=True
    )
    suite_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    draft_version: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict] = mapped_column(JSONB)
    last_published_revision_id: Mapped[str | None] = mapped_column(
        ForeignKey("featherlane.suite_revisions.id")
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SuiteDraftCreationRecord(Base):
    __tablename__ = "suite_draft_creations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "suite_id"],
            [
                "featherlane.suite_drafts.project_id",
                "featherlane.suite_drafts.suite_id",
            ],
        ),
    )
    project_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    actor_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.users.id"), primary_key=True
    )
    request_key: Mapped[str] = mapped_column(String(128), primary_key=True)
    request_digest: Mapped[str] = mapped_column(String(64))
    suite_id: Mapped[str] = mapped_column(String(128))


class SuiteDraftPublicationRecord(Base):
    __tablename__ = "suite_draft_publications"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "suite_id"],
            [
                "featherlane.suite_drafts.project_id",
                "featherlane.suite_drafts.suite_id",
            ],
        ),
    )
    project_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    suite_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    draft_version: Mapped[int] = mapped_column(Integer, primary_key=True)
    suite_revision_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.suite_revisions.id")
    )


class SuiteDraftAuditRecord(Base):
    __tablename__ = "suite_draft_audit_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id"), index=True
    )
    suite_id: Mapped[str] = mapped_column(String(128))
    draft_version: Mapped[int] = mapped_column(Integer)
    actor_id: Mapped[str] = mapped_column(ForeignKey("featherlane.users.id"))
    action: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SuiteDraftStore:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def check_ready(self) -> None:
        for model in (
            SuiteDraftRecord,
            SuiteDraftCreationRecord,
            SuiteDraftPublicationRecord,
            SuiteDraftAuditRecord,
        ):
            await self.session.execute(select(model).limit(0))

    async def lock_project(self, project_id: str) -> None:
        # Same lock order as the operator importer: project before draft/revision.
        project = await self.session.scalar(
            select(ProjectRecord)
            .where(ProjectRecord.id == project_id)
            .with_for_update()
        )
        if project is None:
            raise AccessNotFound()

    async def get(
        self, project_id: str, suite_id: str, *, lock: bool = False
    ) -> SuiteDraftRecord | None:
        query = select(SuiteDraftRecord).where(
            SuiteDraftRecord.project_id == project_id,
            SuiteDraftRecord.suite_id == suite_id,
        )
        if lock:
            query = query.with_for_update().execution_options(populate_existing=True)
        return await self.session.scalar(query)

    async def exact(
        self, project_id: str, suite_id: str, *, lock: bool = False
    ) -> SuiteDraftRecord:
        row = await self.get(project_id, suite_id, lock=lock)
        if row is None:
            raise AccessNotFound()
        return row

    async def list(
        self, project_id: str, limit: int, cursor: str | None
    ) -> list[SuiteDraftRecord]:
        query = select(SuiteDraftRecord).where(
            SuiteDraftRecord.project_id == project_id
        )
        if cursor:
            query = query.where(SuiteDraftRecord.suite_id > cursor)
        return list(
            (
                await self.session.scalars(
                    query.order_by(SuiteDraftRecord.suite_id).limit(limit + 1)
                )
            ).all()
        )

    async def next_revision(self, project_id: str, suite_id: str) -> int | None:
        latest = await self.session.scalar(
            select(func.max(SuiteRevisionRecord.revision)).where(
                SuiteRevisionRecord.project_id == project_id,
                SuiteRevisionRecord.suite_id == suite_id,
            )
        )
        if latest is None:
            return 1
        if latest >= 1_000_000:
            return None
        return latest + 1
