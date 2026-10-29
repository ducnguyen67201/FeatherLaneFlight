"""Project-scoped suggestion reads and generation use existing browser auth seams."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from featherlane_contracts import ErrorEnvelope
from featherlane_contracts.suite_criteria import (
    SuggestSuiteCriteriaRequest,
    SuiteCriteriaSuggestionsEnvelope,
    SuiteCriteriaSuggestionStatusEnvelope,
)

from featherlane_api.http.errors import ERROR_RESPONSES
from featherlane_api.modules.identity.dependencies import session_handle
from featherlane_api.modules.suites.criteria import SuiteCriteriaService
from featherlane_api.modules.suites.draft_http import (
    Csrf,
    MutationUser,
    ProjectId,
    Service,
    SuiteId,
    User,
    Version,
)

router = APIRouter(
    responses={
        **ERROR_RESPONSES,
        429: {"model": ErrorEnvelope, "description": "Generation is busy"},
        503: {
            "model": ErrorEnvelope,
            "description": "Suggestions are unavailable or failed",
        },
    }
)


def get_criteria(request: Request, drafts: Service) -> SuiteCriteriaService:
    return SuiteCriteriaService(drafts, request.app.state.criteria_provider)


CriteriaService = Annotated[SuiteCriteriaService, Depends(get_criteria)]


@router.get(
    "/api/v1/projects/{projectId}/test-suites/{suiteId}/draft/criteria-suggestions",
    operation_id="getSuiteCriteriaSuggestionStatus",
    response_model=SuiteCriteriaSuggestionStatusEnvelope,
)
async def get_status(
    request: Request,
    project_id: ProjectId,
    suite_id: SuiteId,
    principal: User,
    service: CriteriaService,
    contract_version: Version,
) -> SuiteCriteriaSuggestionStatusEnvelope:
    return await service.status(
        principal, session_handle(request), project_id, suite_id
    )


@router.post(
    "/api/v1/projects/{projectId}/test-suites/{suiteId}/draft/criteria-suggestions",
    operation_id="suggestSuiteCriteria",
    response_model=SuiteCriteriaSuggestionsEnvelope,
)
async def suggest(
    request: Request,
    project_id: ProjectId,
    suite_id: SuiteId,
    body: SuggestSuiteCriteriaRequest,
    principal: MutationUser,
    service: CriteriaService,
    contract_version: Version,
    csrf: Csrf,
) -> SuiteCriteriaSuggestionsEnvelope:
    return await service.suggest(
        principal, session_handle(request), csrf, project_id, suite_id, body
    )
