"""Owner use cases: current authentication, membership and writes share a commit."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from featherlane_contracts import CursorMeta, SessionUser
from featherlane_contracts.people import (
    AccessChangeEnvelope,
    AccessChangeResult,
    AdmissionSource,
    ChangeProjectPeopleRequest,
    DomainRuleEnvelope,
    DomainRuleListEnvelope,
    DomainRuleView,
    EmailGrantEnvelope,
    EmailGrantListEnvelope,
    EmailGrantView,
    JoinExclusionListEnvelope,
    JoinExclusionView,
    OrganizationAccessEnvelope,
    OrganizationAccessView,
    OrganizationPeopleEnvelope,
    OrganizationPersonView,
    ProjectPeopleEnvelope,
    ProjectPersonView,
)
from featherlane_contracts.projects import OrganizationView, ProjectListEnvelope
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.modules.access.application import project_view
from featherlane_api.modules.access.domain import MembershipConflict
from featherlane_api.modules.access.people_store import PeopleStore
from featherlane_api.modules.access.persistence import OrganizationRecord
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.domain import Principal, User


def user_view(user: User) -> SessionUser:
    return SessionUser(id=user.id, displayName=user.display_name, email=user.email)


def applied() -> AccessChangeEnvelope:
    return AccessChangeEnvelope(data=AccessChangeResult(applied=True))


class PeopleService:
    def __init__(self, session: AsyncSession, identity: IdentityService):
        self.session = session
        self.identity = identity
        self.store = PeopleStore(session)

    @asynccontextmanager
    async def authorized(
        self,
        principal: Principal,
        handle: str | None,
        organization_id: str,
        csrf: str | None = None,
    ) -> AsyncIterator[OrganizationRecord]:
        async with self.session.begin():
            await self.identity.require_live(principal, handle, csrf)
            yield await self.store.require_owner(principal.user_id, organization_id)

    async def overview(
        self, principal: Principal, handle: str | None, organization_id: str
    ) -> OrganizationAccessEnvelope:
        async with self.session.begin():
            await self.identity.require_live(principal, handle)
            organization = await self.store.lock_organization(organization_id)
            await self.store.access.require_organization(
                principal.user_id, organization_id
            )
            owner_id = organization.owner_user_id
            owner = (
                (await self.identity.users([owner_id])).get(owner_id)
                if owner_id
                else None
            )
            member_count, saved_count = await self.store.counts(organization_id)
            return OrganizationAccessEnvelope(
                data=OrganizationAccessView(
                    organization=OrganizationView(
                        id=organization.id, name=organization.name
                    ),
                    owner=user_view(owner) if owner else None,
                    memberCount=member_count,
                    savedEmailCount=saved_count,
                )
            )

    async def people(
        self,
        principal: Principal,
        handle: str | None,
        organization_id: str,
        limit: int,
        cursor: str | None,
    ) -> OrganizationPeopleEnvelope:
        async with self.authorized(principal, handle, organization_id):
            rows = await self.store.people(organization_id, limit, cursor)
            users = await self.identity.users(
                [member.user_id for member, _ in rows[:limit]]
            )
            return OrganizationPeopleEnvelope(
                data=[
                    OrganizationPersonView(
                        user=user_view(users[member.user_id]),
                        source=AdmissionSource(member.source),
                        matchedDomain=member.admission_email.rsplit("@", 1)[1]
                        if member.source == "DOMAIN" and member.admission_email
                        else None,
                        projectCount=count,
                    )
                    for member, count in rows[:limit]
                ],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1][0].user_id if len(rows) > limit else None
                ),
            )

    async def email_grants(
        self,
        principal: Principal,
        handle: str | None,
        organization_id: str,
        limit: int,
        cursor: str | None,
    ) -> EmailGrantListEnvelope:
        async with self.authorized(principal, handle, organization_id):
            rows = await self.store.email_grants(organization_id, limit, cursor)
            return EmailGrantListEnvelope(
                data=[
                    EmailGrantView(
                        id=row.id, email=row.email, waitingForSignIn=not row.claimed
                    )
                    for row in rows[:limit]
                ],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1].id if len(rows) > limit else None
                ),
            )

    async def domains(
        self,
        principal: Principal,
        handle: str | None,
        organization_id: str,
        limit: int,
        cursor: str | None,
    ) -> DomainRuleListEnvelope:
        async with self.authorized(principal, handle, organization_id):
            rows = await self.store.domains(organization_id, limit, cursor)
            return DomainRuleListEnvelope(
                data=[
                    DomainRuleView(id=row.id, domain=row.domain) for row in rows[:limit]
                ],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1].id if len(rows) > limit else None
                ),
            )

    async def exclusions(
        self,
        principal: Principal,
        handle: str | None,
        organization_id: str,
        limit: int,
        cursor: str | None,
    ) -> JoinExclusionListEnvelope:
        async with self.authorized(principal, handle, organization_id):
            rows = await self.store.exclusions(organization_id, limit, cursor)
            return JoinExclusionListEnvelope(
                data=[
                    JoinExclusionView(id=row.id, email=row.email)
                    for row in rows[:limit]
                ],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1].id if len(rows) > limit else None
                ),
            )

    async def save_email(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        organization_id: str,
        email: str,
    ) -> EmailGrantEnvelope:
        async with self.authorized(principal, handle, organization_id, csrf):
            row, created = await self.store.save_email(organization_id, email)
            if created:
                await self.store.access.audit(
                    "email_grant_saved",
                    organization_id,
                    principal.user_id,
                    principal.user_id,
                    rule_id=row.id,
                )
            return EmailGrantEnvelope(
                data=EmailGrantView(
                    id=row.id, email=row.email, waitingForSignIn=not row.claimed
                )
            )

    async def save_domain(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        organization_id: str,
        domain: str,
    ) -> DomainRuleEnvelope:
        async with self.authorized(principal, handle, organization_id, csrf):
            row, created = await self.store.save_domain(organization_id, domain)
            if created:
                await self.store.access.audit(
                    "domain_rule_saved",
                    organization_id,
                    principal.user_id,
                    principal.user_id,
                    rule_id=row.id,
                )
            return DomainRuleEnvelope(data=DomainRuleView(id=row.id, domain=row.domain))

    async def remove_email(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        organization_id: str,
        rule_id: str,
    ) -> AccessChangeEnvelope:
        async with self.authorized(principal, handle, organization_id, csrf):
            await self.store.remove_email(organization_id, rule_id)
            await self.store.access.audit(
                "email_grant_removed",
                organization_id,
                principal.user_id,
                principal.user_id,
                rule_id=rule_id,
            )
        return applied()

    async def remove_domain(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        organization_id: str,
        rule_id: str,
    ) -> AccessChangeEnvelope:
        async with self.authorized(principal, handle, organization_id, csrf):
            await self.store.remove_domain(organization_id, rule_id)
            await self.store.access.audit(
                "domain_rule_removed",
                organization_id,
                principal.user_id,
                principal.user_id,
                rule_id=rule_id,
            )
        return applied()

    async def restore_joining(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        organization_id: str,
        exclusion_id: str,
    ) -> AccessChangeEnvelope:
        async with self.authorized(principal, handle, organization_id, csrf):
            await self.store.restore_joining(organization_id, exclusion_id)
            await self.store.access.audit(
                "automatic_joining_allowed",
                organization_id,
                principal.user_id,
                principal.user_id,
                rule_id=exclusion_id,
            )
        return applied()

    async def remove_person(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        organization_id: str,
        user_id: str,
    ) -> AccessChangeEnvelope:
        async with self.authorized(
            principal, handle, organization_id, csrf
        ) as organization:
            if user_id == organization.owner_user_id:
                raise MembershipConflict()
            await self.store.member(organization_id, user_id)
            users = await self.identity.users([user_id])
            user = users[user_id]
            await self.store.remove_person(
                organization_id, user_id, user.email.strip().lower()
            )
            await self.store.access.audit(
                "organization_member_revoked",
                organization_id,
                principal.user_id,
                user_id,
            )
        return applied()

    async def projects(
        self,
        principal: Principal,
        handle: str | None,
        organization_id: str,
        limit: int,
        cursor: str | None,
    ) -> ProjectListEnvelope:
        async with self.authorized(principal, handle, organization_id):
            rows = await self.store.managed_projects(organization_id, limit, cursor)
            return ProjectListEnvelope(
                data=[project_view(row) for row in rows[:limit]],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1].id if len(rows) > limit else None
                ),
            )

    async def project_people(
        self,
        principal: Principal,
        handle: str | None,
        organization_id: str,
        project_id: str,
        limit: int,
        cursor: str | None,
    ) -> ProjectPeopleEnvelope:
        async with self.authorized(principal, handle, organization_id):
            await self.store.project(organization_id, project_id)
            rows = await self.store.project_people(
                organization_id, project_id, limit, cursor
            )
            users = await self.identity.users([user_id for user_id, _ in rows[:limit]])
            return ProjectPeopleEnvelope(
                data=[
                    ProjectPersonView(
                        user=user_view(users[user_id]), hasAccess=has_access
                    )
                    for user_id, has_access in rows[:limit]
                ],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1][0] if len(rows) > limit else None
                ),
            )

    async def change_project_people(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        organization_id: str,
        project_id: str,
        body: ChangeProjectPeopleRequest,
    ) -> AccessChangeEnvelope:
        async with self.authorized(principal, handle, organization_id, csrf):
            await self.store.project(organization_id, project_id)
            if len({change.user_id for change in body.changes}) != len(body.changes):
                raise MembershipConflict()
            for change in body.changes:
                if await self.store.change_project_person(
                    organization_id, project_id, change.user_id, change.has_access
                ):
                    await self.store.access.audit(
                        "project_member_granted"
                        if change.has_access
                        else "project_member_revoked",
                        organization_id,
                        principal.user_id,
                        change.user_id,
                        project_id,
                    )
        return applied()
