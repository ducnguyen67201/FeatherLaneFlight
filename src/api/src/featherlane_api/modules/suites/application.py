"""Read-only browser catalog; operator publication uses a separate boundary."""

from featherlane_contracts import CursorMeta, ErrorCode
from featherlane_contracts.registration import SyntheticIntegrationProfileView
from featherlane_contracts.suites import (
    SuiteCatalogEnvelope,
    SuiteRevisionEnvelope,
    SuiteRevisionView,
)
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.access.persistence import AccessStore
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.registration.application import require_integration_profile
from featherlane_api.modules.suites.persistence import SuiteStore, revision_view


class SuiteCatalog:
    def __init__(self, session: AsyncSession, identity: IdentityService):
        self.session = session
        self.identity = identity
        self.store = SuiteStore(session)

    async def catalog(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        limit: int,
        cursor: str | None,
        search: str | None = None,
        required_check: str | None = None,
    ) -> SuiteCatalogEnvelope:
        async with self.session.begin():
            await self.identity.require_live(principal, handle)
            await AccessStore(self.session).require_project(
                principal.user_id, project_id
            )
            rows = await self.store.catalog(
                project_id, limit, cursor, search, required_check
            )
            return SuiteCatalogEnvelope(
                data=[revision_view(row) for row in rows[:limit]],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1].id if len(rows) > limit else None
                ),
            )

    async def exact(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        revision_id: str,
    ) -> SuiteRevisionEnvelope:
        async with self.session.begin():
            await self.identity.require_live(principal, handle)
            await AccessStore(self.session).require_project(
                principal.user_id, project_id
            )
            return SuiteRevisionEnvelope(
                data=revision_view(await self.store.exact(project_id, revision_id))
            )


async def require_qualified_suite(
    session: AsyncSession, *, project_id: str, revision_id: str
) -> SuiteRevisionView:
    """Admission seam: caller authorizes project and owns the active transaction.

    Returns exact published input with synthetic-only provenance, not runner
    availability or build compatibility. Admission must still enforce those.
    """
    if not session.in_transaction():
        raise RuntimeError("Suite lookup requires a caller-owned transaction.")
    view = revision_view(await SuiteStore(session).exact(project_id, revision_id))
    profile = await require_integration_profile(
        session,
        project_id=project_id,
        profile_id=view.integration_profile_id,
        expected_revision=view.integration_profile_revision,
        expected_digest=view.integration_profile_digest,
    )
    if not isinstance(profile, SyntheticIntegrationProfileView):
        raise ApiError(
            422,
            ErrorCode.CAPABILITY_UNSUPPORTED,
            "Synthetic suite requires a synthetic profile.",
        )
    return view
