"""Owner/admission queries. Organization locks serialize grants with login/removal."""

from uuid import uuid4

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.modules.access.domain import (
    AccessNotFound,
    MembershipConflict,
    OwnerRequired,
)
from featherlane_api.modules.access.persistence import (
    AccessStore,
    OrganizationDomainRuleRecord,
    OrganizationEmailGrantRecord,
    OrganizationJoinExclusionRecord,
    OrganizationMembershipRecord,
    OrganizationRecord,
    ProjectMembershipRecord,
    ProjectRecord,
)


class PeopleStore:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.access = AccessStore(session)

    async def lock_organization(self, organization_id: str) -> OrganizationRecord:
        organization = await self.session.scalar(
            select(OrganizationRecord)
            .where(OrganizationRecord.id == organization_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if organization is None:
            raise AccessNotFound()
        return organization

    async def require_owner(
        self, user_id: str, organization_id: str
    ) -> OrganizationRecord:
        organization = await self.lock_organization(organization_id)
        await self.access.require_organization(user_id, organization_id)
        if organization.owner_user_id != user_id:
            raise OwnerRequired()
        return organization

    async def counts(self, organization_id: str) -> tuple[int, int]:
        members = await self.session.scalar(
            select(func.count())
            .select_from(OrganizationMembershipRecord)
            .where(OrganizationMembershipRecord.organization_id == organization_id)
        )
        saved = await self.session.scalar(
            select(func.count())
            .select_from(OrganizationEmailGrantRecord)
            .where(
                OrganizationEmailGrantRecord.organization_id == organization_id,
                OrganizationEmailGrantRecord.claimed.is_(False),
            )
        )
        return members or 0, saved or 0

    async def people(
        self, organization_id: str, limit: int, cursor: str | None
    ) -> list[tuple[OrganizationMembershipRecord, int]]:
        counts = (
            select(ProjectMembershipRecord.user_id, func.count().label("count"))
            .where(ProjectMembershipRecord.organization_id == organization_id)
            .group_by(ProjectMembershipRecord.user_id)
            .subquery()
        )
        query = (
            select(OrganizationMembershipRecord, func.coalesce(counts.c.count, 0))
            .outerjoin(counts, counts.c.user_id == OrganizationMembershipRecord.user_id)
            .where(OrganizationMembershipRecord.organization_id == organization_id)
        )
        if cursor:
            query = query.where(OrganizationMembershipRecord.user_id > cursor)
        return list(
            (
                await self.session.execute(
                    query.order_by(OrganizationMembershipRecord.user_id).limit(
                        limit + 1
                    )
                )
            )
            .tuples()
            .all()
        )

    async def member(
        self, organization_id: str, user_id: str
    ) -> OrganizationMembershipRecord:
        member = await self.session.get(
            OrganizationMembershipRecord,
            (organization_id, user_id),
            populate_existing=True,
        )
        if member is None:
            raise AccessNotFound()
        return member

    async def email_grants(
        self, organization_id: str, limit: int, cursor: str | None
    ) -> list[OrganizationEmailGrantRecord]:
        query = select(OrganizationEmailGrantRecord).where(
            OrganizationEmailGrantRecord.organization_id == organization_id
        )
        if cursor:
            query = query.where(OrganizationEmailGrantRecord.id > cursor)
        return list(
            (
                await self.session.scalars(
                    query.order_by(OrganizationEmailGrantRecord.id).limit(limit + 1)
                )
            ).all()
        )

    async def domains(
        self, organization_id: str, limit: int, cursor: str | None
    ) -> list[OrganizationDomainRuleRecord]:
        query = select(OrganizationDomainRuleRecord).where(
            OrganizationDomainRuleRecord.organization_id == organization_id
        )
        if cursor:
            query = query.where(OrganizationDomainRuleRecord.id > cursor)
        return list(
            (
                await self.session.scalars(
                    query.order_by(OrganizationDomainRuleRecord.id).limit(limit + 1)
                )
            ).all()
        )

    async def exclusions(
        self, organization_id: str, limit: int, cursor: str | None
    ) -> list[OrganizationJoinExclusionRecord]:
        query = select(OrganizationJoinExclusionRecord).where(
            OrganizationJoinExclusionRecord.organization_id == organization_id,
            OrganizationJoinExclusionRecord.kind == "email",
        )
        if cursor:
            query = query.where(OrganizationJoinExclusionRecord.id > cursor)
        return list(
            (
                await self.session.scalars(
                    query.order_by(OrganizationJoinExclusionRecord.id).limit(limit + 1)
                )
            ).all()
        )

    async def blocked(
        self, organization_id: str, user_id: str | None, email: str
    ) -> bool:
        return (
            await self.session.scalar(
                select(OrganizationJoinExclusionRecord.id)
                .where(
                    OrganizationJoinExclusionRecord.organization_id == organization_id,
                    or_(
                        (OrganizationJoinExclusionRecord.kind == "email")
                        & (OrganizationJoinExclusionRecord.value == email),
                        (OrganizationJoinExclusionRecord.kind == "user")
                        & (OrganizationJoinExclusionRecord.value == user_id),
                    ),
                )
                .limit(1)
            )
            is not None
        )

    async def block(
        self, organization_id: str, email: str, user_id: str | None = None
    ) -> None:
        # Email suppression also covers future accounts. User suppression survives
        # a verified address change without ever linking two identities by email.
        targets = [("email", email)]
        if user_id:
            targets.append(("user", user_id))
        for kind, value in targets:
            existing = await self.session.scalar(
                select(OrganizationJoinExclusionRecord).where(
                    OrganizationJoinExclusionRecord.organization_id == organization_id,
                    OrganizationJoinExclusionRecord.kind == kind,
                    OrganizationJoinExclusionRecord.value == value,
                )
            )
            if existing is None:
                self.session.add(
                    OrganizationJoinExclusionRecord(
                        id=uuid4().hex,
                        organization_id=organization_id,
                        kind=kind,
                        value=value,
                        email=email,
                    )
                )
            elif kind == "user":
                existing.email = email
        await self.session.flush()

    async def save_email(
        self, organization_id: str, email: str
    ) -> tuple[OrganizationEmailGrantRecord, bool]:
        if await self.blocked(organization_id, None, email):
            raise MembershipConflict()
        record = await self.session.scalar(
            select(OrganizationEmailGrantRecord).where(
                OrganizationEmailGrantRecord.organization_id == organization_id,
                OrganizationEmailGrantRecord.email == email,
            )
        )
        if record is not None:
            return record, False
        record = OrganizationEmailGrantRecord(
            id=uuid4().hex, organization_id=organization_id, email=email, claimed=False
        )
        self.session.add(record)
        await self.session.flush()
        return record, True

    async def save_domain(
        self, organization_id: str, domain: str
    ) -> tuple[OrganizationDomainRuleRecord, bool]:
        record = await self.session.scalar(
            select(OrganizationDomainRuleRecord).where(
                OrganizationDomainRuleRecord.organization_id == organization_id,
                OrganizationDomainRuleRecord.domain == domain,
            )
        )
        if record is not None:
            return record, False
        record = OrganizationDomainRuleRecord(
            id=uuid4().hex, organization_id=organization_id, domain=domain
        )
        self.session.add(record)
        await self.session.flush()
        return record, True

    async def managed_projects(
        self, organization_id: str, limit: int, cursor: str | None
    ) -> list[ProjectRecord]:
        query = select(ProjectRecord).where(
            ProjectRecord.organization_id == organization_id
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

    async def project(self, organization_id: str, project_id: str) -> ProjectRecord:
        project = await self.session.scalar(
            select(ProjectRecord).where(
                ProjectRecord.organization_id == organization_id,
                ProjectRecord.id == project_id,
            )
        )
        if project is None:
            raise AccessNotFound()
        return project

    async def project_people(
        self, organization_id: str, project_id: str, limit: int, cursor: str | None
    ) -> list[tuple[str, bool]]:
        query = (
            select(
                OrganizationMembershipRecord.user_id,
                ProjectMembershipRecord.user_id.is_not(None),
            )
            .outerjoin(
                ProjectMembershipRecord,
                (
                    ProjectMembershipRecord.organization_id
                    == OrganizationMembershipRecord.organization_id
                )
                & (
                    ProjectMembershipRecord.user_id
                    == OrganizationMembershipRecord.user_id
                )
                & (ProjectMembershipRecord.project_id == project_id),
            )
            .where(OrganizationMembershipRecord.organization_id == organization_id)
        )
        if cursor:
            query = query.where(OrganizationMembershipRecord.user_id > cursor)
        return list(
            (
                await self.session.execute(
                    query.order_by(OrganizationMembershipRecord.user_id).limit(
                        limit + 1
                    )
                )
            )
            .tuples()
            .all()
        )

    async def change_project_person(
        self, organization_id: str, project_id: str, user_id: str, grant: bool
    ) -> bool:
        # Explicit owner changes affect this person only, never unseen page rows.
        await self.member(organization_id, user_id)
        existing = await self.session.get(
            ProjectMembershipRecord, (project_id, user_id)
        )
        if grant and existing is None:
            self.session.add(
                ProjectMembershipRecord(
                    project_id=project_id,
                    organization_id=organization_id,
                    user_id=user_id,
                )
            )
            return True
        if not grant and existing is not None:
            await self.session.delete(existing)
            return True
        return False

    async def remove_email(self, organization_id: str, rule_id: str) -> None:
        record = await self.session.scalar(
            select(OrganizationEmailGrantRecord).where(
                OrganizationEmailGrantRecord.organization_id == organization_id,
                OrganizationEmailGrantRecord.id == rule_id,
            )
        )
        if record is None:
            raise AccessNotFound()
        await self.block(organization_id, record.email)
        await self.session.delete(record)

    async def remove_domain(self, organization_id: str, rule_id: str) -> None:
        record = await self.session.scalar(
            select(OrganizationDomainRuleRecord).where(
                OrganizationDomainRuleRecord.organization_id == organization_id,
                OrganizationDomainRuleRecord.id == rule_id,
            )
        )
        if record is None:
            raise AccessNotFound()
        await self.session.delete(record)

    async def restore_joining(self, organization_id: str, exclusion_id: str) -> None:
        record = await self.session.scalar(
            select(OrganizationJoinExclusionRecord).where(
                OrganizationJoinExclusionRecord.organization_id == organization_id,
                OrganizationJoinExclusionRecord.id == exclusion_id,
                OrganizationJoinExclusionRecord.kind == "email",
            )
        )
        if record is None:
            raise AccessNotFound()
        await self.session.execute(
            delete(OrganizationJoinExclusionRecord).where(
                OrganizationJoinExclusionRecord.organization_id == organization_id,
                OrganizationJoinExclusionRecord.email == record.email,
            )
        )

    async def remove_person(
        self, organization_id: str, user_id: str, email: str
    ) -> None:
        member = await self.session.get(
            OrganizationMembershipRecord, (organization_id, user_id)
        )
        if member is None:
            raise AccessNotFound()
        emails = {email}
        if member.admission_email:
            emails.add(member.admission_email)
        for address in emails:
            await self.block(
                organization_id, address, user_id if address == email else None
            )
        await self.session.execute(
            delete(OrganizationEmailGrantRecord).where(
                OrganizationEmailGrantRecord.organization_id == organization_id,
                OrganizationEmailGrantRecord.email.in_(emails),
            )
        )
        await self.access.revoke_organization(user_id, organization_id)
