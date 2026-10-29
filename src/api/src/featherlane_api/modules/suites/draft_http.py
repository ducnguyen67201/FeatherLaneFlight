"""Project-scoped browser authoring with live session and CSRF enforcement."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from featherlane_contracts import ContractVersion, Cursor, Identifier
from featherlane_contracts.suite_drafts import (
    CreateSuiteDraftRequest,
    EditSuiteDraftRequest,
    PublishSuiteDraftRequest,
    SuiteDraftEnvelope,
    SuiteDraftListEnvelope,
    SuiteDraftValidationEnvelope,
    SuiteDraftVersionRequest,
)
from featherlane_contracts.suites import SuiteRevisionEnvelope
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
from featherlane_api.modules.suites.drafts import SuiteDraftService

router = APIRouter(responses=ERROR_RESPONSES)


def get_drafts(
    session: Annotated[AsyncSession, Depends(get_session)],
    identity: Annotated[IdentityService, Depends(get_identity_service)],
) -> SuiteDraftService:
    return SuiteDraftService(session, identity)


ProjectId = Annotated[Identifier, Path(alias="projectId")]
SuiteId = Annotated[Identifier, Path(alias="suiteId")]
Version = Annotated[ContractVersion, Header(alias="x-flf-contract-version")]
User = Annotated[Principal, Depends(get_principal)]
MutationUser = Annotated[Principal, Depends(require_csrf)]
Csrf = Annotated[str, Header(alias="x-csrf-token", min_length=64, max_length=64)]
Service = Annotated[SuiteDraftService, Depends(get_drafts)]


@router.get(
    "/api/v1/projects/{projectId}/test-suites",
    operation_id="listSuiteDrafts",
    response_model=SuiteDraftListEnvelope,
)
async def list_suite_drafts(
    request: Request,
    project_id: ProjectId,
    principal: User,
    service: Service,
    contract_version: Version,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[Cursor | None, Query()] = None,
) -> SuiteDraftListEnvelope:
    return await service.list(
        principal, session_handle(request), project_id, limit, cursor
    )


@router.post(
    "/api/v1/projects/{projectId}/test-suites",
    operation_id="createSuiteDraft",
    response_model=SuiteDraftEnvelope,
    status_code=201,
)
async def create_suite_draft(
    request: Request,
    response: Response,
    project_id: ProjectId,
    body: CreateSuiteDraftRequest,
    principal: MutationUser,
    service: Service,
    contract_version: Version,
    csrf: Csrf,
    key: Annotated[Identifier, Header(alias="idempotency-key")],
) -> SuiteDraftEnvelope:
    result = await service.create(
        principal, session_handle(request), csrf, project_id, key, body
    )
    response.headers["Location"] = (
        f"/api/v1/projects/{project_id}/test-suites/{result.data.suite_id}/draft"
    )
    return result


@router.get(
    "/api/v1/projects/{projectId}/test-suites/{suiteId}/draft",
    operation_id="getSuiteDraft",
    response_model=SuiteDraftEnvelope,
)
async def get_suite_draft(
    request: Request,
    project_id: ProjectId,
    suite_id: SuiteId,
    principal: User,
    service: Service,
    contract_version: Version,
) -> SuiteDraftEnvelope:
    return await service.detail(
        principal, session_handle(request), project_id, suite_id
    )


@router.patch(
    "/api/v1/projects/{projectId}/test-suites/{suiteId}/draft",
    operation_id="editSuiteDraft",
    response_model=SuiteDraftEnvelope,
)
async def edit_suite_draft(
    request: Request,
    project_id: ProjectId,
    suite_id: SuiteId,
    body: EditSuiteDraftRequest,
    principal: MutationUser,
    service: Service,
    contract_version: Version,
    csrf: Csrf,
) -> SuiteDraftEnvelope:
    return await service.edit(
        principal, session_handle(request), csrf, project_id, suite_id, body
    )


@router.post(
    "/api/v1/projects/{projectId}/test-suites/{suiteId}/draft/validate",
    operation_id="validateSuiteDraft",
    response_model=SuiteDraftValidationEnvelope,
)
async def validate_suite_draft(
    request: Request,
    project_id: ProjectId,
    suite_id: SuiteId,
    body: SuiteDraftVersionRequest,
    principal: MutationUser,
    service: Service,
    contract_version: Version,
    csrf: Csrf,
) -> SuiteDraftValidationEnvelope:
    return await service.validate(
        principal,
        session_handle(request),
        csrf,
        project_id,
        suite_id,
        body.expected_draft_version,
    )


@router.post(
    "/api/v1/projects/{projectId}/test-suites/{suiteId}/revisions",
    operation_id="publishSuiteDraft",
    response_model=SuiteRevisionEnvelope,
)
async def publish_suite_draft(
    request: Request,
    project_id: ProjectId,
    suite_id: SuiteId,
    body: PublishSuiteDraftRequest,
    principal: MutationUser,
    service: Service,
    contract_version: Version,
    csrf: Csrf,
) -> SuiteRevisionEnvelope:
    return await service.publish(
        principal,
        session_handle(request),
        csrf,
        project_id,
        suite_id,
        body.expected_draft_version,
        body.expected_definition_digest,
    )
