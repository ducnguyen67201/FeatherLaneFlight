"""Machine-only async finalization and read-only receipt recovery."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from featherlane_contracts.finalization import (
    RUNNER_FINALIZATION_PATH,
    FinalizationAcceptanceEnvelope,
    FinalizationRequest,
    FinalizationStatusEnvelope,
)

from featherlane_api.http.errors import ERROR_RESPONSES
from featherlane_api.modules.finalization.application import FinalizationService
from featherlane_api.modules.leases.http import AttemptId, Contract, Credential, Service

router = APIRouter(responses=ERROR_RESPONSES)


def service(request: Request, leases: Service) -> FinalizationService:
    return FinalizationService(leases, request.app.state.workflow_client)


Finalizer = Annotated[FinalizationService, Depends(service)]


@router.post(
    RUNNER_FINALIZATION_PATH,
    operation_id="finalizeRunnerAttempt",
    status_code=202,
    response_model=FinalizationAcceptanceEnvelope,
)
async def accept(
    attempt_id: AttemptId,
    body: FinalizationRequest,
    credential: Credential,
    finalizer: Finalizer,
    contract: Contract,
) -> FinalizationAcceptanceEnvelope:
    return FinalizationAcceptanceEnvelope(
        data=await finalizer.accept(credential, attempt_id, body)
    )


@router.get(
    RUNNER_FINALIZATION_PATH,
    operation_id="getRunnerFinalization",
    response_model=FinalizationStatusEnvelope,
)
async def status(
    attempt_id: AttemptId,
    credential: Credential,
    finalizer: Finalizer,
    contract: Contract,
) -> FinalizationStatusEnvelope:
    return FinalizationStatusEnvelope(
        data=await finalizer.status(credential, attempt_id)
    )
