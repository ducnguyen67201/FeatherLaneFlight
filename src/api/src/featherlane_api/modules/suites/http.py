"""Session-protected exact revision and bounded published catalog reads."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Path, Query, Request
from featherlane_contracts import ContractVersion, Cursor, Identifier
from featherlane_contracts.suites import SuiteCatalogEnvelope, SuiteRevisionEnvelope
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.dependencies import get_session
from featherlane_api.http.errors import ERROR_RESPONSES
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.dependencies import (
    get_identity_service,
    get_principal,
    session_handle,
)
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.suites.application import SuiteCatalog

router = APIRouter(responses=ERROR_RESPONSES)


def get_catalog(
    session: Annotated[AsyncSession, Depends(get_session)],
    identity: Annotated[IdentityService, Depends(get_identity_service)],
) -> SuiteCatalog:
    return SuiteCatalog(session, identity)


@router.get(
    "/api/v1/projects/{projectId}/suites",
    operation_id="listSuiteRevisions",
    response_model=SuiteCatalogEnvelope,
)
async def list_suite_revisions(
    request: Request,
    project_id: Annotated[Identifier, Path(alias="projectId")],
    principal: Annotated[Principal, Depends(get_principal)],
    service: Annotated[SuiteCatalog, Depends(get_catalog)],
    contract_version: Annotated[
        ContractVersion, Header(alias="x-flf-contract-version")
    ],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[Cursor | None, Query()] = None,
    search: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    required_check: Annotated[
        Literal["MISSION_COMPLETION", "LANDING_DISARM", "METRIC_THRESHOLD"] | None,
        Query(alias="requiredCheck"),
    ] = None,
    suite_id: Annotated[Identifier | None, Query(alias="suiteId")] = None,
) -> SuiteCatalogEnvelope:
    return await service.catalog(
        principal,
        session_handle(request),
        project_id,
        limit,
        cursor,
        search,
        required_check,
        suite_id,
    )


@router.get(
    "/api/v1/projects/{projectId}/suite-revisions/{suiteRevisionId}",
    operation_id="getSuiteRevision",
    response_model=SuiteRevisionEnvelope,
)
async def get_suite_revision(
    request: Request,
    project_id: Annotated[Identifier, Path(alias="projectId")],
    revision_id: Annotated[Identifier, Path(alias="suiteRevisionId")],
    principal: Annotated[Principal, Depends(get_principal)],
    service: Annotated[SuiteCatalog, Depends(get_catalog)],
    contract_version: Annotated[
        ContractVersion, Header(alias="x-flf-contract-version")
    ],
) -> SuiteRevisionEnvelope:
    return await service.exact(
        principal, session_handle(request), project_id, revision_id
    )
