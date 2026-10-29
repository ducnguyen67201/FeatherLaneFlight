"""Apply explicit organization admission rules after a verified provider login."""

from featherlane_contracts.people import AdmissionEmail
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select, union
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.modules.access.people_store import PeopleStore
from featherlane_api.modules.access.persistence import (
    OrganizationDomainRuleRecord,
    OrganizationEmailGrantRecord,
    OrganizationMembershipRecord,
)
from featherlane_api.modules.identity.domain import User


class AccessEnrollment:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.store = PeopleStore(session)

    async def apply(self, user: User) -> None:
        if not self.session.in_transaction():
            raise RuntimeError("Admission belongs to the verified login transaction")
        try:
            email = TypeAdapter(AdmissionEmail).validate_python(user.email)
        except ValidationError:
            # Unsupported addresses retain normal identity behavior; no admission.
            return
        domain = email.rsplit("@", 1)[1]
        candidates = union(
            select(OrganizationEmailGrantRecord.organization_id).where(
                OrganizationEmailGrantRecord.email == email
            ),
            select(OrganizationDomainRuleRecord.organization_id).where(
                OrganizationDomainRuleRecord.domain == domain
            ),
        ).subquery()
        organization_ids = list(
            (
                await self.session.scalars(
                    select(candidates.c.organization_id).order_by(
                        candidates.c.organization_id
                    )
                )
            ).all()
        )
        for organization_id in organization_ids:
            # Identity's user lock precedes organization locks. Owner operations
            # never acquire another user's identity lock after this point.
            organization = await self.store.lock_organization(organization_id)
            if organization.owner_user_id is None or await self.store.blocked(
                organization_id, user.id, email
            ):
                continue
            # Re-read rules AFTER the organization lock: removal that committed
            # while login waited must win over the earlier candidate snapshot.
            grant = await self.session.scalar(
                select(OrganizationEmailGrantRecord).where(
                    OrganizationEmailGrantRecord.organization_id == organization_id,
                    OrganizationEmailGrantRecord.email == email,
                )
            )
            domain_rule = await self.session.scalar(
                select(OrganizationDomainRuleRecord.id).where(
                    OrganizationDomainRuleRecord.organization_id == organization_id,
                    OrganizationDomainRuleRecord.domain == domain,
                )
            )
            if grant is None and domain_rule is None:
                continue
            member = await self.session.get(
                OrganizationMembershipRecord,
                (organization_id, user.id),
                populate_existing=True,
            )
            if member is None:
                self.session.add(
                    OrganizationMembershipRecord(
                        organization_id=organization_id,
                        user_id=user.id,
                        source="EMAIL" if grant else "DOMAIN",
                        admission_email=email,
                    )
                )
                await self.store.access.audit(
                    "organization_auto_joined",
                    organization_id,
                    user.id,
                    user.id,
                    rule_id=grant.id if grant else domain_rule,
                )
            if grant is not None:
                grant.claimed = True
        await self.session.flush()
