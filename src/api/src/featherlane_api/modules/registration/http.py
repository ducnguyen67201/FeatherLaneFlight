"""Same-origin authenticated registration writes and project-scoped reads."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from featherlane_contracts import ContractVersion, Cursor, Identifier
from featherlane_contracts.registration import (
    BuildEnvelope,
    BuildListEnvelope,
    IntegrationProfileEnvelope,
    IntegrationProfileListEnvelope,
    LocalProfileEnvelope,
    LocalProfileListEnvelope,
    RegisterBuildRequest,
    RegisterIntegrationProfileRequest,
    RegisterLocalProfileRequest,
    RegistrationCompatibilityEnvelope,
)
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.dependencies import get_session
from featherlane_api.http.errors import ERROR_RESPONSES
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.dependencies import (
    get_identity_service,
    get_principal,
    require_csrf,
    session_handle,
)
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.registration.application import RegistrationService

router = APIRouter(responses=ERROR_RESPONSES)


def get_registration_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    identity: Annotated[IdentityService, Depends(get_identity_service)],
) -> RegistrationService:
    return RegistrationService(session, identity)


ProjectId = Annotated[Identifier, Path(alias="projectId")]
ContractHeader = Annotated[ContractVersion, Header(alias="x-flf-contract-version")]
User = Annotated[Principal, Depends(get_principal)]
Service = Annotated[RegistrationService, Depends(get_registration_service)]
Limit = Annotated[int, Query(ge=1, le=100)]
PageCursor = Annotated[Cursor | None, Query()]
MutationUser = Annotated[Principal, Depends(require_csrf)]
Csrf = Annotated[str, Header(alias="x-csrf-token", min_length=64, max_length=64)]
RequestKey = Annotated[Identifier, Header(alias="idempotency-key")]


@router.post(
    "/api/v1/projects/{projectId}/builds",
    operation_id="registerBuild",
    response_model=BuildEnvelope,
    status_code=201,
)
async def register_build(
    request: Request,
    response: Response,
    project_id: ProjectId,
    body: RegisterBuildRequest,
    principal: MutationUser,
    service: Service,
    contract_version: ContractHeader,
    csrf: Csrf,
    key: RequestKey,
):
    result = await service.register(
        principal, session_handle(request), csrf, project_id, key, body
    )
    response.headers["Location"] = (
        f"/api/v1/projects/{project_id}/builds/{result.data.id}"
    )
    return result


@router.post(
    "/api/v1/projects/{projectId}/integration-profiles",
    operation_id="registerIntegrationProfile",
    response_model=IntegrationProfileEnvelope,
    status_code=201,
)
async def register_integration(
    request: Request,
    response: Response,
    project_id: ProjectId,
    body: RegisterIntegrationProfileRequest,
    principal: MutationUser,
    service: Service,
    contract_version: ContractHeader,
    csrf: Csrf,
    key: RequestKey,
):
    result = await service.register(
        principal, session_handle(request), csrf, project_id, key, body
    )
    response.headers["Location"] = (
        f"/api/v1/projects/{project_id}/integration-profiles/{result.data.id}"
    )
    return result


@router.post(
    "/api/v1/projects/{projectId}/local-profiles",
    operation_id="registerLocalProfile",
    response_model=LocalProfileEnvelope,
    status_code=201,
)
async def register_local_profile(
    request: Request,
    response: Response,
    project_id: ProjectId,
    body: RegisterLocalProfileRequest,
    principal: MutationUser,
    service: Service,
    contract_version: ContractHeader,
    csrf: Csrf,
    key: RequestKey,
):
    result = await service.register(
        principal, session_handle(request), csrf, project_id, key, body
    )
    response.headers["Location"] = (
        f"/api/v1/projects/{project_id}/local-profiles/{result.data.id}"
    )
    return result


@router.get(
    "/api/v1/projects/{projectId}/builds",
    operation_id="listBuilds",
    response_model=BuildListEnvelope,
)
async def list_builds(
    request: Request,
    project_id: ProjectId,
    principal: User,
    service: Service,
    contract_version: ContractHeader,
    limit: Limit = 50,
    cursor: PageCursor = None,
):
    return await service.list(
        principal, session_handle(request), project_id, "BUILD", limit, cursor
    )


@router.get(
    "/api/v1/projects/{projectId}/builds/{buildId}",
    operation_id="getBuild",
    response_model=BuildEnvelope,
)
async def get_build(
    request: Request,
    project_id: ProjectId,
    build_id: Annotated[Identifier, Path(alias="buildId")],
    principal: User,
    service: Service,
    contract_version: ContractHeader,
):
    return await service.detail(
        principal, session_handle(request), project_id, "BUILD", build_id
    )


@router.get(
    "/api/v1/projects/{projectId}/integration-profiles",
    operation_id="listIntegrationProfiles",
    response_model=IntegrationProfileListEnvelope,
)
async def list_integrations(
    request: Request,
    project_id: ProjectId,
    principal: User,
    service: Service,
    contract_version: ContractHeader,
    limit: Limit = 50,
    cursor: PageCursor = None,
):
    return await service.list(
        principal, session_handle(request), project_id, "INTEGRATION", limit, cursor
    )


@router.get(
    "/api/v1/projects/{projectId}/integration-profiles/{profileId}",
    operation_id="getIntegrationProfile",
    response_model=IntegrationProfileEnvelope,
)
async def get_integration(
    request: Request,
    project_id: ProjectId,
    profile_id: Annotated[Identifier, Path(alias="profileId")],
    principal: User,
    service: Service,
    contract_version: ContractHeader,
):
    return await service.detail(
        principal, session_handle(request), project_id, "INTEGRATION", profile_id
    )


@router.get(
    "/api/v1/projects/{projectId}/local-profiles",
    operation_id="listLocalProfiles",
    response_model=LocalProfileListEnvelope,
)
async def list_local_profiles(
    request: Request,
    project_id: ProjectId,
    principal: User,
    service: Service,
    contract_version: ContractHeader,
    limit: Limit = 50,
    cursor: PageCursor = None,
):
    return await service.list(
        principal, session_handle(request), project_id, "LOCAL_PROFILE", limit, cursor
    )


@router.get(
    "/api/v1/projects/{projectId}/local-profiles/{profileId}",
    operation_id="getLocalProfile",
    response_model=LocalProfileEnvelope,
)
async def get_local_profile(
    request: Request,
    project_id: ProjectId,
    profile_id: Annotated[Identifier, Path(alias="profileId")],
    principal: User,
    service: Service,
    contract_version: ContractHeader,
):
    return await service.detail(
        principal, session_handle(request), project_id, "LOCAL_PROFILE", profile_id
    )


@router.get(
    "/api/v1/projects/{projectId}/registration-compatibility",
    operation_id="getRegistrationCompatibility",
    response_model=RegistrationCompatibilityEnvelope,
)
async def get_compatibility(
    request: Request,
    project_id: ProjectId,
    build_id: Annotated[Identifier, Query(alias="buildId")],
    local_profile_id: Annotated[Identifier, Query(alias="localProfileId")],
    principal: User,
    service: Service,
    contract_version: ContractHeader,
):
    return await service.compatible(
        principal, session_handle(request), project_id, build_id, local_profile_id
    )
