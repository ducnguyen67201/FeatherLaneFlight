"""Authorized immutable registration and catalog operations."""

from featherlane_contracts import CursorMeta, ErrorCode
from featherlane_contracts.registration import (
    BuildEnvelope,
    BuildListEnvelope,
    BuildView,
    IntegrationProfileEnvelope,
    IntegrationProfileListEnvelope,
    IntegrationProfileView,
    LocalProfileEnvelope,
    LocalProfileListEnvelope,
    LocalProfileView,
    RegisterBuildRequest,
    RegisteredIntegrationProfileView,
    RegisterIntegrationProfileRequest,
    RegisterLocalProfileRequest,
    RegistrationCompatibilityEnvelope,
    SyntheticIntegrationProfileView,
    integration_digest,
    integration_identity,
    metadata_digest,
)
from pydantic import TypeAdapter
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.access.persistence import AccessStore
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.registration.domain import (
    compatibility,
    validate_build,
    validate_integration,
    validate_local_profile,
)
from featherlane_api.modules.registration.persistence import (
    RegistrationKind,
    RegistrationStore,
)
from featherlane_api.modules.runners.application import require_runner_declarations

CatalogView = BuildView | RegisteredIntegrationProfileView | LocalProfileView
VIEW_TYPES = {
    "BUILD": TypeAdapter(BuildView),
    "INTEGRATION": TypeAdapter(RegisteredIntegrationProfileView),
    "LOCAL_PROFILE": TypeAdapter(LocalProfileView),
}


async def require_integration_profile(
    session: AsyncSession,
    *,
    project_id: str,
    profile_id: str,
    expected_revision: int,
    expected_digest: str,
) -> RegisteredIntegrationProfileView:
    """Resolve an exact registration within the caller's authorized transaction.

    The caller must authorize project access before calling. This helper neither
    begins/commits a transaction nor establishes capability qualification.
    """
    if not session.in_transaction():
        raise RuntimeError("Profile lookup requires a caller-owned transaction.")
    row = await RegistrationStore(session).get(project_id, "INTEGRATION", profile_id)
    if row is None:
        raise ApiError(404, ErrorCode.NOT_FOUND, "The resource was not found.")
    profile = VIEW_TYPES["INTEGRATION"].validate_python(
        {
            **row.payload,
            "id": row.id,
            "projectId": row.project_id,
            "createdAt": row.created_at.isoformat().replace("+00:00", "Z"),
        }
    )
    validate_integration(profile)
    if profile.revision != expected_revision or profile.digest != expected_digest:
        raise ApiError(
            409,
            ErrorCode.PROFILE_MISMATCH,
            "The integration profile revision or digest does not match.",
        )
    return profile


class RegistrationService:
    def __init__(self, session: AsyncSession, identity: IdentityService):
        self.session = session
        self.identity = identity
        self.store = RegistrationStore(session)

    async def authorize(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        csrf: str | None = None,
    ) -> None:
        await self.identity.require_live(principal, handle, csrf)
        await AccessStore(self.session).require_project(principal.user_id, project_id)

    async def register(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        project_id: str,
        key: str,
        body: RegisterBuildRequest
        | RegisterLocalProfileRequest
        | RegisterIntegrationProfileRequest,
    ) -> BuildEnvelope | LocalProfileEnvelope | IntegrationProfileEnvelope:
        if isinstance(body, RegisterIntegrationProfileRequest):
            kind: RegistrationKind = "INTEGRATION"
            identity = integration_identity(body.profile)
            payload = {
                **body.profile.model_dump(mode="json"),
                "digest": integration_digest(body.profile),
                "supportLevel": "DECLARED",
            }
        elif isinstance(body, RegisterBuildRequest):
            kind = "BUILD"
            validate_build(body.declaration)
            identity = body.declaration.id
            payload = body.declaration.model_dump(mode="json", exclude={"id"})
        else:
            kind = "LOCAL_PROFILE"
            validate_local_profile(body.declaration)
            identity = body.declaration.id
            payload = body.declaration.model_dump(mode="json", exclude={"id"})

        async with self.session.begin():
            await self.authorize(principal, handle, project_id, csrf)
            receipt, created = await self.store.reserve(
                project_id,
                principal.user_id,
                key,
                metadata_digest(body),
                kind,
                identity,
            )
            if (
                receipt.request_digest != metadata_digest(body)
                or receipt.kind != kind
                or receipt.registration_id != identity
            ):
                raise ApiError(
                    409,
                    ErrorCode.IDEMPOTENCY_CONFLICT,
                    "This registration key was used with different inputs.",
                )
            if created:
                if not isinstance(body, RegisterIntegrationProfileRequest):
                    runner = await require_runner_declarations(
                        self.session, project_id=project_id, runner_id=body.runner_id
                    )
                    codes = {item.code for item in runner.diagnostics}
                    # A measured but non-executing runner may publish metadata.
                    # Run admission separately rejects DISABLED capacity.
                    if (
                        runner.connection_state != "CONNECTED"
                        or runner.capacity_state == "NEEDS_CLEANUP"
                        or codes
                        & {
                            "NOT_CONFIGURED",
                            "LOCALLY_DISABLED",
                            "LOCAL_CLEANUP_REQUIRED",
                        }
                        or (
                            runner.capacity_state == "DISABLED"
                            and "INPUTS_DECLARED" not in codes
                        )
                    ):
                        raise ApiError(
                            409,
                            ErrorCode.RUNNER_UNAVAILABLE,
                            "The runner has no current usable declarations.",
                        )
                    declarations = (
                        runner.available_builds
                        if kind == "BUILD"
                        else runner.local_profiles
                    )
                    if not any(item == body.declaration for item in declarations):
                        code = (
                            ErrorCode.BUILD_UNAVAILABLE
                            if kind == "BUILD"
                            else ErrorCode.PROFILE_MISMATCH
                        )
                        raise ApiError(
                            409,
                            code,
                            "The exact declaration is unavailable on this runner.",
                        )
                    if isinstance(body, RegisterLocalProfileRequest):
                        local = body.declaration
                        profile = await self.read(
                            project_id, "INTEGRATION", local.integration_profile_id
                        )
                        if not isinstance(
                            profile,
                            (IntegrationProfileView, SyntheticIntegrationProfileView),
                        ):
                            raise RuntimeError(
                                "Unexpected integration profile variant."
                            )
                        validate_integration(profile)
                        if (
                            profile.digest != local.integration_profile_digest
                            or profile.configuration_digest
                            != local.configuration_digest
                            or profile.execution_target != local.execution_target
                        ):
                            raise ApiError(
                                409,
                                ErrorCode.PROFILE_MISMATCH,
                                "The local declaration does not match "
                                "its registered integration.",
                            )
                await self.store.add(
                    project_id, kind, identity, payload, principal.user_id
                )
            # Exact retries recover the committed immutable result, even if the
            # runner subsequently goes offline. Current user access is rechecked.
            view = await self.read(project_id, kind, identity)
            envelope = {
                "BUILD": BuildEnvelope,
                "LOCAL_PROFILE": LocalProfileEnvelope,
                "INTEGRATION": IntegrationProfileEnvelope,
            }[kind]
            return envelope.model_validate({"data": view.model_dump()})

    async def list(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        kind: RegistrationKind,
        limit: int,
        cursor: str | None,
    ) -> BuildListEnvelope | IntegrationProfileListEnvelope | LocalProfileListEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id)
            rows = await self.store.list(project_id, kind, limit, cursor)
            data = [
                self.project(
                    kind,
                    row.id,
                    project_id,
                    row.created_at.isoformat().replace("+00:00", "Z"),
                    row.payload,
                )
                for row in rows[:limit]
            ]
            meta = CursorMeta(
                nextCursor=rows[limit - 1].id if len(rows) > limit else None
            )
            # Validate the final envelope, including the exact variant's fields.
            envelope = {
                "BUILD": BuildListEnvelope,
                "INTEGRATION": IntegrationProfileListEnvelope,
                "LOCAL_PROFILE": LocalProfileListEnvelope,
            }[kind]
            return envelope.model_validate(
                {
                    "data": [item.model_dump() for item in data],
                    "meta": meta.model_dump(),
                }
            )

    @staticmethod
    def project(
        kind: RegistrationKind,
        identity: str,
        project_id: str,
        created_at: str,
        payload: dict,
    ) -> CatalogView:
        return VIEW_TYPES[kind].validate_python(
            {
                **payload,
                "id": identity,
                "projectId": project_id,
                "createdAt": created_at,
            }
        )

    async def read(
        self, project_id: str, kind: RegistrationKind, identity: str
    ) -> CatalogView:
        row = await self.store.get(project_id, kind, identity)
        if row is None:
            raise ApiError(404, ErrorCode.NOT_FOUND, "The resource was not found.")
        return self.project(
            kind,
            row.id,
            project_id,
            row.created_at.isoformat().replace("+00:00", "Z"),
            row.payload,
        )

    async def detail(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        kind: RegistrationKind,
        identity: str,
    ) -> BuildEnvelope | IntegrationProfileEnvelope | LocalProfileEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id)
            view = await self.read(project_id, kind, identity)
            envelope = {
                "BUILD": BuildEnvelope,
                "INTEGRATION": IntegrationProfileEnvelope,
                "LOCAL_PROFILE": LocalProfileEnvelope,
            }[kind]
            return envelope.model_validate({"data": view.model_dump()})

    async def compatible(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        build_id: str,
        local_profile_id: str,
    ) -> RegistrationCompatibilityEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id)
            build = await self.read(project_id, "BUILD", build_id)
            local = await self.read(project_id, "LOCAL_PROFILE", local_profile_id)
            if not isinstance(build, BuildView) or not isinstance(
                local, LocalProfileView
            ):
                raise RuntimeError("Unexpected registration variant.")
            integration = await self.read(
                project_id, "INTEGRATION", local.integration_profile_id
            )
            if not isinstance(
                integration, (IntegrationProfileView, SyntheticIntegrationProfileView)
            ):
                raise RuntimeError("Unexpected integration profile variant.")
            return RegistrationCompatibilityEnvelope(
                data=compatibility(build, local, integration)
            )
