"""Append-only suite revisions, always resolved through an authorized project."""

from datetime import UTC, datetime
from uuid import uuid4

from featherlane_contracts.suites import (
    PublishedSuiteDefinition,
    SuiteRevisionView,
    SyntheticQualificationView,
    suite_digest,
)
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    UniqueConstraint,
    or_,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column, relationship

from featherlane_api.infrastructure.database import Base
from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.access.persistence import ProjectRecord
from featherlane_api.modules.suites.qualification import sha256


class SyntheticQualificationRecord(Base):
    __tablename__ = "synthetic_suite_qualifications"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "suite_digest", name="uq_synthetic_qualification_suite"
        ),
        UniqueConstraint(
            "project_id", "id", name="uq_synthetic_qualification_project_id"
        ),
    )
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("featherlane.projects.id"))
    suite_digest: Mapped[str] = mapped_column(String(64))
    profile_id: Mapped[str] = mapped_column(String(128))
    profile_revision: Mapped[int] = mapped_column(Integer)
    profile_digest: Mapped[str] = mapped_column(String(64))
    report_sha256: Mapped[str] = mapped_column(String(64))
    report: Mapped[dict] = mapped_column(JSONB)
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SuiteAuditRecord(Base):
    __tablename__ = "suite_audit_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id"), index=True
    )
    actor_id: Mapped[str] = mapped_column(ForeignKey("featherlane.users.id"))
    suite_revision_id: Mapped[str] = mapped_column(String(128))
    qualification_id: Mapped[str] = mapped_column(String(128))
    action: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def qualification_view(row: SyntheticQualificationRecord) -> SyntheticQualificationView:
    if sha256(row.report) != row.report_sha256:
        raise RuntimeError("Stored synthetic qualification report digest mismatch.")
    return SyntheticQualificationView(
        id=row.id,
        projectId=row.project_id,
        runtimeFamily="SYNTHETIC",
        supportLevel="VERIFIED",
        integrationProfileId=row.profile_id,
        integrationProfileRevision=row.profile_revision,
        integrationProfileDigest=row.profile_digest,
        suiteDigest=row.suite_digest,
        verifierId="fake.nominal.reference",
        verifierVersion=1,
        reportSha256=row.report_sha256,
        verifiedAt=row.verified_at.isoformat().replace("+00:00", "Z"),
        limitation=(
            "Synthetic reference handler only; "
            "does not qualify runner processes or PX4."
        ),
    )


class SuiteRevisionRecord(Base):
    __tablename__ = "suite_revisions"
    __table_args__ = (
        UniqueConstraint("project_id", "suite_id", "revision"),
        ForeignKeyConstraint(
            ["project_id", "qualification_id"],
            [
                "featherlane.synthetic_suite_qualifications.project_id",
                "featherlane.synthetic_suite_qualifications.id",
            ],
        ),
        CheckConstraint("revision BETWEEN 1 AND 1000000", name="revision_bounds"),
        CheckConstraint("digest ~ '^[a-f0-9]{64}$'", name="digest_format"),
    )
    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.projects.id"), index=True
    )
    suite_id: Mapped[str] = mapped_column(String(128))
    revision: Mapped[int] = mapped_column(Integer)
    digest: Mapped[str] = mapped_column(String(64))
    qualification_id: Mapped[str] = mapped_column(String(128))
    qualification: Mapped[SyntheticQualificationRecord] = relationship(lazy="joined")
    definition: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def revision_view(row: SuiteRevisionRecord) -> SuiteRevisionView:
    definition = PublishedSuiteDefinition.model_validate(row.definition)
    qualification = row.qualification
    if (
        suite_digest(definition) != row.digest
        or definition.suite_id != row.suite_id
        or definition.revision != row.revision
        or qualification.project_id != row.project_id
        or qualification.suite_digest != row.digest
        or qualification.profile_id != definition.integration_profile_id
        or qualification.profile_revision != definition.integration_profile_revision
        or qualification.profile_digest != definition.integration_profile_digest
        or qualification.report.get("suiteDigest") != row.digest
        or qualification.report.get("profileId") != qualification.profile_id
        or qualification.report.get("profileRevision") != qualification.profile_revision
        or qualification.report.get("profileDigest") != qualification.profile_digest
    ):
        raise RuntimeError("Stored published suite binding is inconsistent.")
    return SuiteRevisionView.model_validate(
        {
            **row.definition,
            "id": row.id,
            "projectId": row.project_id,
            "status": "PUBLISHED",
            "digest": row.digest,
            "createdAt": row.created_at.isoformat().replace("+00:00", "Z"),
            "qualification": qualification_view(row.qualification).model_dump(
                mode="json"
            ),
        }
    )


class SuiteRevisionConflict(ValueError):
    """An existing revision cannot be replaced by different content."""


class SuiteStore:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def check_ready(self) -> None:
        for record in (
            SuiteRevisionRecord,
            SyntheticQualificationRecord,
            SuiteAuditRecord,
        ):
            await self.session.execute(select(record).limit(0))

    async def catalog(
        self,
        project_id: str,
        limit: int,
        cursor: str | None,
        search: str | None = None,
        required_check: str | None = None,
        suite_id: str | None = None,
    ) -> list[SuiteRevisionRecord]:
        query = select(SuiteRevisionRecord).where(
            SuiteRevisionRecord.project_id == project_id
        )
        if suite_id is not None:
            query = query.where(SuiteRevisionRecord.suite_id == suite_id)
        if search and search.strip():
            needle = (
                search.strip()
                .lower()
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_")
            )
            pattern = "%" + needle + "%"
            query = query.where(
                or_(
                    SuiteRevisionRecord.definition["title"].astext.ilike(
                        pattern, escape="!"
                    ),
                    SuiteRevisionRecord.suite_id.ilike(pattern, escape="!"),
                    SuiteRevisionRecord.id.ilike(pattern, escape="!"),
                )
            )
        if required_check:
            query = query.where(
                SuiteRevisionRecord.definition["checks"].contains(
                    [{"kind": required_check}]
                )
            )
        if cursor:
            query = query.where(SuiteRevisionRecord.id > cursor)
        return list(
            (
                await self.session.scalars(
                    query.order_by(SuiteRevisionRecord.id).limit(limit + 1)
                )
            ).all()
        )

    async def exact(self, project_id: str, revision_id: str) -> SuiteRevisionRecord:
        row = await self.session.scalar(
            select(SuiteRevisionRecord).where(
                SuiteRevisionRecord.project_id == project_id,
                SuiteRevisionRecord.id == revision_id,
            )
        )
        if row is None:
            raise AccessNotFound()
        return row

    async def append(
        self,
        project_id: str,
        definition: PublishedSuiteDefinition,
        qualification: SyntheticQualificationRecord,
    ) -> SuiteRevisionRecord:
        # Serialize operator imports per project, including concurrent replays.
        project = await self.session.scalar(
            select(ProjectRecord)
            .where(ProjectRecord.id == project_id)
            .with_for_update()
        )
        if project is None:
            raise AccessNotFound()
        existing = await self.session.scalar(
            select(SuiteRevisionRecord).where(
                SuiteRevisionRecord.project_id == project_id,
                SuiteRevisionRecord.suite_id == definition.suite_id,
                SuiteRevisionRecord.revision == definition.revision,
            )
        )
        digest = suite_digest(definition)
        if existing is not None:
            if existing.digest != digest:
                raise SuiteRevisionConflict()
            return existing
        if (
            qualification.project_id != project_id
            or qualification.suite_digest != digest
        ):
            raise SuiteRevisionConflict()
        row = SuiteRevisionRecord(
            id="suite_revision_" + uuid4().hex,
            project_id=project_id,
            suite_id=definition.suite_id,
            revision=definition.revision,
            digest=digest,
            qualification=qualification,
            definition=definition.model_dump(mode="json"),
            created_at=datetime.now(UTC),
        )
        self.session.add(row)
        await self.session.flush()
        return row
