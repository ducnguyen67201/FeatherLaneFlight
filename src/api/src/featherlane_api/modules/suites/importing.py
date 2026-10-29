"""Operator import retains its own identity and transaction boundary."""

from featherlane_contracts.suites import PublishedSuiteDefinition, SuiteRevisionView
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.suites.publication import publish_definition


class SuiteImporter:
    def __init__(self, session: AsyncSession, identity: IdentityService):
        self.session = session
        self.identity = identity

    async def import_definition(
        self,
        *,
        issuer: str,
        subject: str,
        project_id: str,
        definition: PublishedSuiteDefinition,
    ) -> SuiteRevisionView:
        async with self.session.begin():
            user = await self.identity.lookup_user(issuer, subject, lock=True)
            if user is None:
                raise AccessNotFound()
            return await publish_definition(
                self.session,
                actor_id=user.id,
                project_id=project_id,
                definition=definition,
                action="SUITE_IMPORTED",
            )
