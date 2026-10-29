"""Operator-only changes, called inside a transaction after verified-user lookup.

The identity owner locks the existing active user first; membership locks always
follow it. Browser owner administration uses the separate PeopleService.
"""

from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.modules.access.domain import AccessNotFound, MembershipConflict
from featherlane_api.modules.access.people_store import PeopleStore
from featherlane_api.modules.access.persistence import (
    AccessStore,
    OrganizationMembershipRecord,
    OrganizationRecord,
    ProjectMembershipRecord,
    ProjectRecord,
)
from featherlane_api.modules.identity.domain import User


class AccessAdministration:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.store = AccessStore(session)

    def require_transaction(self) -> None:
        if not self.session.in_transaction():
            raise RuntimeError("Operator changes require an explicit transaction")

    async def bootstrap(self, user: User, name: str) -> str:
        self.require_transaction()
        organization_id = uuid4().hex
        self.session.add(
            OrganizationRecord(id=organization_id, name=name, owner_user_id=user.id)
        )
        await self.session.flush()
        self.session.add(
            OrganizationMembershipRecord(
                organization_id=organization_id, user_id=user.id, source="OWNER"
            )
        )
        await self.store.audit(
            "organization_bootstrapped", organization_id, "operator", user.id
        )
        return organization_id

    async def assign_owner(self, user: User, organization_id: str) -> None:
        """Explicit one-time backfill; never infer ownership or transfer it."""
        self.require_transaction()
        organization = await PeopleStore(self.session).lock_organization(
            organization_id
        )
        await self.store.require_organization(user.id, organization_id)
        if organization.owner_user_id not in (None, user.id):
            raise MembershipConflict()
        if organization.owner_user_id is None:
            organization.owner_user_id = user.id
            await self.store.audit(
                "organization_owner_assigned", organization_id, "operator", user.id
            )

    async def organization_membership(
        self, user: User, organization_id: str, grant: bool
    ) -> None:
        self.require_transaction()
        organization = await PeopleStore(self.session).lock_organization(
            organization_id
        )
        if not grant and organization.owner_user_id == user.id:
            raise MembershipConflict()
        member = await self.session.scalar(
            select(OrganizationMembershipRecord)
            .where(
                OrganizationMembershipRecord.organization_id == organization_id,
                OrganizationMembershipRecord.user_id == user.id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if grant and member is None:
            self.session.add(
                OrganizationMembershipRecord(
                    organization_id=organization_id, user_id=user.id
                )
            )
            await self.store.audit(
                "organization_member_granted", organization_id, "operator", user.id
            )
        elif not grant and member is not None:
            await PeopleStore(self.session).remove_person(
                organization_id, user.id, user.email.strip().lower()
            )
            await self.store.audit(
                "organization_member_revoked", organization_id, "operator", user.id
            )

    async def project_membership(
        self, user: User, project_id: str, grant: bool
    ) -> None:
        self.require_transaction()
        project = await self.session.get(ProjectRecord, project_id)
        if project is None:
            raise AccessNotFound()
        await PeopleStore(self.session).lock_organization(project.organization_id)
        await self.store.require_organization(user.id, project.organization_id)
        member = await self.session.get(ProjectMembershipRecord, (project_id, user.id))
        if grant and member is None:
            self.session.add(
                ProjectMembershipRecord(
                    project_id=project_id,
                    user_id=user.id,
                    organization_id=project.organization_id,
                )
            )
            await self.store.audit(
                "project_member_granted",
                project.organization_id,
                "operator",
                user.id,
                project_id,
            )
        elif not grant and member is not None:
            await self.session.execute(
                delete(ProjectMembershipRecord).where(
                    ProjectMembershipRecord.project_id == project_id,
                    ProjectMembershipRecord.user_id == user.id,
                )
            )
            await self.store.audit(
                "project_member_revoked",
                project.organization_id,
                "operator",
                user.id,
                project_id,
            )
