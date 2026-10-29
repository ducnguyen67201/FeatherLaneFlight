"""Protected browser discovery and project creation; no membership-edit routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Header, Path, Query, Request, Response
from featherlane_contracts import ContractVersion, Cursor, ErrorCode, Identifier
from featherlane_contracts.projects import (
    CreateProjectRequest,
    OrganizationListEnvelope,
    ProjectEnvelope,
    ProjectListEnvelope,
)
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.dependencies import get_session
from featherlane_api.http.errors import ERROR_RESPONSES, ApiError, error_response
from featherlane_api.modules.access.application import AccessService
from featherlane_api.modules.access.domain import AccessNotFound, CreationConflict
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.dependencies import (
    get_identity_service,
    get_principal,
    require_csrf,
    session_handle,
)
from featherlane_api.modules.identity.domain import Principal

router = APIRouter(responses=ERROR_RESPONSES)


def get_access_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    identity: Annotated[IdentityService, Depends(get_identity_service)],
) -> AccessService:
    return AccessService(session, identity)


@router.get(
    "/api/v1/orgs",
    operation_id="listOrganizations",
    response_model=OrganizationListEnvelope,
)
async def list_organizations(
    request: Request,
    principal: Annotated[Principal, Depends(get_principal)],
    service: Annotated[AccessService, Depends(get_access_service)],
    contract_version: Annotated[
        ContractVersion, Header(alias="x-flf-contract-version")
    ],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[Cursor | None, Query()] = None,
) -> OrganizationListEnvelope:
    return await service.organizations(
        principal, session_handle(request), limit, cursor
    )


@router.get(
    "/api/v1/orgs/{orgId}/projects",
    operation_id="listProjects",
    response_model=ProjectListEnvelope,
)
async def list_projects(
    request: Request,
    organization_id: Annotated[Identifier, Path(alias="orgId")],
    principal: Annotated[Principal, Depends(get_principal)],
    service: Annotated[AccessService, Depends(get_access_service)],
    contract_version: Annotated[
        ContractVersion, Header(alias="x-flf-contract-version")
    ],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[Cursor | None, Query()] = None,
) -> ProjectListEnvelope:
    return await service.projects(
        principal, session_handle(request), organization_id, limit, cursor
    )


@router.get(
    "/api/v1/projects/{projectId}",
    operation_id="getProject",
    response_model=ProjectEnvelope,
)
async def get_project(
    request: Request,
    project_id: Annotated[Identifier, Path(alias="projectId")],
    principal: Annotated[Principal, Depends(get_principal)],
    service: Annotated[AccessService, Depends(get_access_service)],
    contract_version: Annotated[
        ContractVersion, Header(alias="x-flf-contract-version")
    ],
) -> ProjectEnvelope:
    return await service.project(principal, session_handle(request), project_id)


@router.post(
    "/api/v1/orgs/{orgId}/projects",
    operation_id="createProject",
    response_model=ProjectEnvelope,
    status_code=201,
    responses={
        201: {
            "headers": {
                "Location": {
                    "description": "Project resource for creation and replay.",
                    "schema": {"type": "string"},
                }
            }
        }
    },
)
async def create_project(
    request: Request,
    response: Response,
    organization_id: Annotated[Identifier, Path(alias="orgId")],
    body: CreateProjectRequest,
    principal: Annotated[Principal, Depends(require_csrf)],
    service: Annotated[AccessService, Depends(get_access_service)],
    contract_version: Annotated[
        ContractVersion, Header(alias="x-flf-contract-version")
    ],
    csrf: Annotated[str, Header(alias="x-csrf-token", min_length=64, max_length=64)],
    key: Annotated[Identifier, Header(alias="idempotency-key")],
) -> ProjectEnvelope:
    result = await service.create_project(
        principal, session_handle(request), csrf, organization_id, body.name, key
    )
    response.headers["Location"] = f"/api/v1/projects/{result.data.id}"
    return result


def install_access_errors(app: FastAPI) -> None:
    @app.exception_handler(AccessNotFound)
    async def not_found(request: Request, exc: AccessNotFound):
        return error_response(
            request, ApiError(404, ErrorCode.NOT_FOUND, "The resource was not found.")
        )

    @app.exception_handler(CreationConflict)
    async def conflict(request: Request, exc: CreationConflict):
        return error_response(
            request,
            ApiError(
                409,
                ErrorCode.IDEMPOTENCY_CONFLICT,
                "This creation key was used with different inputs.",
            ),
        )
