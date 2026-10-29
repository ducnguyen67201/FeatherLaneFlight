"""Membership constraints and scoped ORM queries on the shared database."""

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    String,
    UniqueConstraint,
    delete,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.infrastructure.database import Base
from featherlane_api.modules.access.domain import AccessNotFound


class OrganizationRecord(Base):
    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint("char_length(name) BETWEEN 1 AND 128", name="name_length"),
        ForeignKeyConstraint(
            ["id", "owner_user_id"],
            [
                "featherlane.organization_memberships.organization_id",
                "featherlane.organization_memberships.user_id",
            ],
            name="fk_organizations_owner_membership",
            deferrable=True,
            initially="DEFERRED",
            use_alter=True,
        ),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    owner_user_id: Mapped[str | None] = mapped_column(String(32))


class OrganizationMembershipRecord(Base):
    __tablename__ = "organization_memberships"
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.organizations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.users.id"), primary_key=True
    )
    source: Mapped[str] = mapped_column(String(16), server_default="OPERATOR")
    admission_email: Mapped[str | None] = mapped_column(String(320))


class OrganizationEmailGrantRecord(Base):
    __tablename__ = "organization_email_grants"
    __table_args__ = (UniqueConstraint("organization_id", "email"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.organizations.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(320))
    claimed: Mapped[bool] = mapped_column(Boolean, server_default="false")


class OrganizationDomainRuleRecord(Base):
    __tablename__ = "organization_domain_rules"
    __table_args__ = (UniqueConstraint("organization_id", "domain"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.organizations.id", ondelete="CASCADE"), index=True
    )
    domain: Mapped[str] = mapped_column(String(253))


class OrganizationJoinExclusionRecord(Base):
    __tablename__ = "organization_join_exclusions"
    __table_args__ = (
        UniqueConstraint("organization_id", "kind", "value"),
        CheckConstraint("kind IN ('email', 'user')", name="kind"),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.organizations.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(8))
    value: Mapped[str] = mapped_column(String(320))
    email: Mapped[str] = mapped_column(String(320))


class ProjectRecord(Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("id", "organization_id", name="uq_projects_id_organization"),
        UniqueConstraint(
            "organization_id", "created_by", "creation_key", name="uq_projects_creation"
        ),
        CheckConstraint("char_length(name) BETWEEN 1 AND 100", name="name_length"),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    created_by: Mapped[str] = mapped_column(ForeignKey("featherlane.users.id"))
    creation_key: Mapped[str] = mapped_column(String(128))


class ProjectMembershipRecord(Base):
    __tablename__ = "project_memberships"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "organization_id"],
            ["featherlane.projects.id", "featherlane.projects.organization_id"],
            ondelete="CASCADE",
            name="fk_project_memberships_project",
        ),
        ForeignKeyConstraint(
            ["organization_id", "user_id"],
            [
                "featherlane.organization_memberships.organization_id",
                "featherlane.organization_memberships.user_id",
            ],
            ondelete="CASCADE",
            name="fk_project_memberships_organization_member",
        ),
    )
    project_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    organization_id: Mapped[str] = mapped_column(String(32), index=True)


class AccessAuditRecord(Base):
    __tablename__ = "access_audit_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    action: Mapped[str] = mapped_column(String(64))
    organization_id: Mapped[str] = mapped_column(String(32), index=True)
    project_id: Mapped[str | None] = mapped_column(String(32))
    rule_id: Mapped[str | None] = mapped_column(String(32))
    actor: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AccessStore:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def check_ready(self) -> None:
        for record in (
            OrganizationRecord,
            OrganizationMembershipRecord,
            ProjectRecord,
            ProjectMembershipRecord,
            AccessAuditRecord,
            OrganizationEmailGrantRecord,
            OrganizationDomainRuleRecord,
            OrganizationJoinExclusionRecord,
        ):
            await self.session.execute(select(record).limit(0))

    async def require_organization(
        self, user_id: str, organization_id: str
    ) -> OrganizationRecord:
        member = await self.session.scalar(
            select(OrganizationMembershipRecord)
            .where(
                OrganizationMembershipRecord.user_id == user_id,
                OrganizationMembershipRecord.organization_id == organization_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if member is None:
            raise AccessNotFound()
        organization = await self.session.get(OrganizationRecord, organization_id)
        if organization is None:
            raise AccessNotFound()
        return organization

    async def require_project(self, user_id: str, project_id: str) -> ProjectRecord:
        # Lock the organization membership first, then read project membership in
        # a fresh statement. A snapshot taken before a concurrent revocation must
        # not survive waiting for its organization-member lock.
        organization_id = await self.session.scalar(
            select(ProjectRecord.organization_id)
            .join(
                OrganizationMembershipRecord,
                OrganizationMembershipRecord.organization_id
                == ProjectRecord.organization_id,
            )
            .where(
                ProjectRecord.id == project_id,
                OrganizationMembershipRecord.user_id == user_id,
            )
        )
        if organization_id is None:
            raise AccessNotFound()
        await self.require_organization(user_id, organization_id)
        project = await self.session.scalar(
            select(ProjectRecord)
            .join(
                ProjectMembershipRecord,
                (ProjectMembershipRecord.project_id == ProjectRecord.id)
                & (
                    ProjectMembershipRecord.organization_id
                    == ProjectRecord.organization_id
                ),
            )
            .where(
                ProjectRecord.id == project_id,
                ProjectMembershipRecord.user_id == user_id,
            )
            .execution_options(populate_existing=True)
        )
        if project is None:
            raise AccessNotFound()
        return project

    async def organizations(
        self, user_id: str, limit: int, cursor: str | None
    ) -> list[OrganizationRecord]:
        query = (
            select(OrganizationRecord)
            .join(
                OrganizationMembershipRecord,
                OrganizationMembershipRecord.organization_id == OrganizationRecord.id,
            )
            .where(OrganizationMembershipRecord.user_id == user_id)
        )
        if cursor:
            query = query.where(OrganizationRecord.id > cursor)
        return list(
            (
                await self.session.scalars(
                    query.order_by(OrganizationRecord.id).limit(limit + 1)
                )
            ).all()
        )

    async def projects(
        self, user_id: str, organization_id: str, limit: int, cursor: str | None
    ) -> list[ProjectRecord]:
        await self.require_organization(user_id, organization_id)
        query = (
            select(ProjectRecord)
            .join(
                ProjectMembershipRecord,
                (ProjectMembershipRecord.project_id == ProjectRecord.id)
                & (
                    ProjectMembershipRecord.organization_id
                    == ProjectRecord.organization_id
                ),
            )
            .where(
                ProjectRecord.organization_id == organization_id,
                ProjectMembershipRecord.user_id == user_id,
            )
        )
        if cursor:
            query = query.where(ProjectRecord.id > cursor)
        return list(
            (
                await self.session.scalars(
                    query.order_by(ProjectRecord.id).limit(limit + 1)
                )
            ).all()
        )

    async def creation(
        self, user_id: str, organization_id: str, key: str
    ) -> ProjectRecord | None:
        return await self.session.scalar(
            select(ProjectRecord).where(
                ProjectRecord.organization_id == organization_id,
                ProjectRecord.created_by == user_id,
                ProjectRecord.creation_key == key,
            )
        )

    async def add_project(
        self, user_id: str, organization_id: str, name: str, key: str
    ) -> ProjectRecord:
        project = ProjectRecord(
            id=uuid4().hex,
            organization_id=organization_id,
            name=name,
            created_by=user_id,
            creation_key=key,
        )
        self.session.add(project)
        await self.session.flush()
        self.session.add(
            ProjectMembershipRecord(
                project_id=project.id, organization_id=organization_id, user_id=user_id
            )
        )
        await self.audit(
            "project_created", organization_id, user_id, user_id, project.id
        )
        return project

    async def audit(
        self,
        action: str,
        organization_id: str,
        actor: str,
        user_id: str,
        project_id: str | None = None,
        *,
        rule_id: str | None = None,
    ) -> None:
        self.session.add(
            AccessAuditRecord(
                id=uuid4().hex,
                action=action,
                organization_id=organization_id,
                actor=actor,
                user_id=user_id,
                project_id=project_id,
                rule_id=rule_id,
                created_at=datetime.now(UTC),
            )
        )
        await self.session.flush()

    async def revoke_organization(self, user_id: str, organization_id: str) -> None:
        # Composite ON DELETE CASCADE permanently removes all project grants.
        await self.session.execute(
            delete(OrganizationMembershipRecord).where(
                OrganizationMembershipRecord.user_id == user_id,
                OrganizationMembershipRecord.organization_id == organization_id,
            )
        )
