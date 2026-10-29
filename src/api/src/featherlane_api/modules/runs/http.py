"""Authenticated admission, run inspection and cancellation routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from featherlane_contracts import (
    ContractVersion,
    CreateRunRequest,
    Cursor,
    EvaluationOutcome,
    ExecutionState,
    Identifier,
    RunEnvelope,
    RunListEnvelope,
    RunOptionsEnvelope,
)
from featherlane_contracts.run_detail import CancelRunRequest, RunDetailEnvelope
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.dependencies import get_session
from featherlane_api.http.errors import ERROR_RESPONSES
from featherlane_api.modules.events.domain import EventCursors
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.dependencies import (
    get_identity_service,
    get_principal,
    require_csrf,
    session_handle,
)
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.runs.application import RunService

router = APIRouter(responses=ERROR_RESPONSES)


def get_service(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    identity: Annotated[IdentityService, Depends(get_identity_service)],
) -> RunService:
    return RunService(
        session,
        identity,
        request.app.state.settings.project_queued_run_limit,
        EventCursors(request.app.state.settings.session_hash_key.get_secret_value()),
    )


ProjectId = Annotated[Identifier, Path(alias="projectId")]
RunId = Annotated[Identifier, Path(alias="runId")]
ContractHeader = Annotated[ContractVersion, Header(alias="x-flf-contract-version")]
Service = Annotated[RunService, Depends(get_service)]
User = Annotated[Principal, Depends(get_principal)]
MutationUser = Annotated[Principal, Depends(require_csrf)]
Csrf = Annotated[str, Header(alias="x-csrf-token", min_length=64, max_length=64)]
RequestKey = Annotated[Identifier, Header(alias="idempotency-key")]


@router.get(
    "/api/v1/projects/{projectId}/runs",
    operation_id="listRuns",
    response_model=RunListEnvelope,
)
async def list_runs(
    request: Request,
    project_id: ProjectId,
    principal: User,
    service: Service,
    contract_version: ContractHeader,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[Cursor | None, Query()] = None,
    search: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
    execution_state: Annotated[
        ExecutionState | None, Query(alias="executionState")
    ] = None,
    evaluation_outcome: Annotated[
        EvaluationOutcome | None, Query(alias="evaluationOutcome")
    ] = None,
):
    return await service.list(
        principal,
        session_handle(request),
        project_id,
        limit,
        cursor,
        search,
        execution_state,
        evaluation_outcome,
    )


@router.get(
    "/api/v1/projects/{projectId}/run-options",
    operation_id="getRunOptions",
    response_model=RunOptionsEnvelope,
)
async def get_run_options(
    request: Request,
    project_id: ProjectId,
    principal: User,
    service: Service,
    contract_version: ContractHeader,
    runner_id: Annotated[Identifier | None, Query(alias="runnerId")] = None,
    build_id: Annotated[Identifier | None, Query(alias="buildId")] = None,
    local_profile_id: Annotated[
        Identifier | None, Query(alias="localProfileId")
    ] = None,
):
    return await service.options(
        principal,
        session_handle(request),
        project_id,
        runner_id,
        build_id,
        local_profile_id,
    )


@router.post(
    "/api/v1/projects/{projectId}/runs",
    operation_id="createRun",
    response_model=RunEnvelope,
    status_code=201,
)
async def create_run(
    request: Request,
    response: Response,
    project_id: ProjectId,
    principal: MutationUser,
    service: Service,
    contract_version: ContractHeader,
    csrf: Csrf,
    key: RequestKey,
    body: CreateRunRequest,
):
    result = await service.create(
        principal, session_handle(request), csrf, project_id, key, body
    )
    response.headers["Location"] = f"/api/v1/runs/{result.data.id}"
    return result


@router.get(
    "/api/v1/runs/{runId}",
    operation_id="getRunDetail",
    response_model=RunDetailEnvelope,
)
async def get_run_detail(
    request: Request,
    run_id: RunId,
    principal: User,
    service: Service,
    contract_version: ContractHeader,
):
    return await service.detail(principal, session_handle(request), run_id)


@router.post(
    "/api/v1/runs/{runId}/cancel",
    operation_id="cancelRun",
    response_model=RunEnvelope,
    status_code=200,
    responses={
        202: {
            "model": RunEnvelope,
            "description": "Cancellation intent recorded; stop confirmation pending.",
        }
    },
)
async def cancel_run(
    request: Request,
    response: Response,
    run_id: RunId,
    principal: MutationUser,
    service: Service,
    contract_version: ContractHeader,
    csrf: Csrf,
    key: RequestKey,
    body: CancelRunRequest,
):
    result = await service.cancel(principal, session_handle(request), csrf, run_id)
    response.status_code = (
        200
        if result.data.execution_state
        in {ExecutionState.COMPLETED, ExecutionState.CANCELED, ExecutionState.ERROR}
        else 202
    )
    return result
