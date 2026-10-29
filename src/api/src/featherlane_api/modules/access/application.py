"""Authenticated access operations commit before HTTP response construction."""

from featherlane_contracts import CursorMeta
from featherlane_contracts.projects import (
    OrganizationListEnvelope,
    OrganizationView,
    ProjectEnvelope,
    ProjectListEnvelope,
    ProjectView,
)
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.modules.access.domain import CreationConflict
from featherlane_api.modules.access.persistence import AccessStore, ProjectRecord
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.domain import Principal


def project_view(project: ProjectRecord) -> ProjectView:
    return ProjectView(
        id=project.id, organizationId=project.organization_id, name=project.name
    )


class AccessService:
    def __init__(self, session: AsyncSession, identity: IdentityService):
        self.session = session
        self.identity = identity
        self.store = AccessStore(session)

    async def organizations(
        self, principal: Principal, handle: str | None, limit: int, cursor: str | None
    ) -> OrganizationListEnvelope:
        async with self.session.begin():
            await self.identity.require_live(principal, handle)
            rows = await self.store.organizations(principal.user_id, limit, cursor)
            return OrganizationListEnvelope(
                data=[
                    OrganizationView(id=row.id, name=row.name) for row in rows[:limit]
                ],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1].id if len(rows) > limit else None
                ),
            )

    async def projects(
        self,
        principal: Principal,
        handle: str | None,
        organization_id: str,
        limit: int,
        cursor: str | None,
    ) -> ProjectListEnvelope:
        async with self.session.begin():
            await self.identity.require_live(principal, handle)
            rows = await self.store.projects(
                principal.user_id, organization_id, limit, cursor
            )
            return ProjectListEnvelope(
                data=[project_view(row) for row in rows[:limit]],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1].id if len(rows) > limit else None
                ),
            )

    async def project(
        self, principal: Principal, handle: str | None, project_id: str
    ) -> ProjectEnvelope:
        async with self.session.begin():
            await self.identity.require_live(principal, handle)
            return ProjectEnvelope(
                data=project_view(
                    await self.store.require_project(principal.user_id, project_id)
                )
            )

    async def create_project(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        organization_id: str,
        name: str,
        key: str,
    ) -> ProjectEnvelope:
        async with self.session.begin():
            await self.identity.require_live(principal, handle, csrf)
            await self.store.require_organization(principal.user_id, organization_id)
            project = await self.store.creation(principal.user_id, organization_id, key)
            if project is not None:
                project = await self.store.require_project(
                    principal.user_id, project.id
                )
                if project.name != name.strip():
                    raise CreationConflict()
            else:
                project = await self.store.add_project(
                    principal.user_id, organization_id, name.strip(), key
                )
            return ProjectEnvelope(data=project_view(project))
