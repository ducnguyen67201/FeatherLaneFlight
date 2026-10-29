"""Machine-only routes reuse the established credential and version boundary."""

from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Header, Path, Request, Response
from featherlane_contracts import ContractVersion, ErrorCode, Identifier
from featherlane_contracts.leases import (
    RUNNER_ATTEMPT_HEARTBEAT_PATH,
    RUNNER_ATTEMPT_MANIFEST_PATH,
    RUNNER_CLAIMS_PATH,
    AttemptHeartbeat,
    AttemptHeartbeatEnvelope,
    AttemptHeartbeatReceipt,
    AttemptManifestEnvelope,
    AttemptManifestReceipt,
    AttemptManifestRequest,
    ClaimEnvelope,
    ClaimRequest,
)
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.dependencies import get_session
from featherlane_api.http.errors import ERROR_RESPONSES, ApiError, error_response
from featherlane_api.modules.leases.application import LeaseService
from featherlane_api.modules.leases.domain import (
    LeaseExpired,
    ManifestMismatch,
    StaleAttempt,
)
from featherlane_api.modules.runners.domain import RunnerSecrets
from featherlane_api.modules.runners.http import machine_credential

router = APIRouter(responses=ERROR_RESPONSES)


def get_service(
    request: Request, session: Annotated[AsyncSession, Depends(get_session)]
) -> LeaseService:
    settings = request.app.state.settings
    return LeaseService(
        session,
        RunnerSecrets(
            settings.session_hash_key.get_secret_value(), settings.runner_key_id
        ),
    )


Credential = Annotated[str, Depends(machine_credential)]
Service = Annotated[LeaseService, Depends(get_service)]
Contract = Annotated[ContractVersion, Header(alias="x-flf-contract-version")]
AttemptId = Annotated[Identifier, Path(alias="attemptId")]


@router.post(
    RUNNER_CLAIMS_PATH,
    operation_id="claimRunnerRun",
    response_model=ClaimEnvelope,
    responses={204: {"description": "No compatible queued run"}},
)
async def claim(
    body: ClaimRequest, credential: Credential, service: Service, contract: Contract
):
    result = await service.claim(credential, body)
    return (
        ClaimEnvelope(data=result) if result is not None else Response(status_code=204)
    )


@router.post(
    RUNNER_ATTEMPT_MANIFEST_PATH,
    operation_id="acceptRunnerManifest",
    response_model=AttemptManifestEnvelope,
)
async def manifest(
    attempt_id: AttemptId,
    body: AttemptManifestRequest,
    credential: Credential,
    service: Service,
    contract: Contract,
) -> AttemptManifestEnvelope:
    result = await service.write(credential, attempt_id, body)
    if not isinstance(result, AttemptManifestReceipt):
        raise RuntimeError("Unexpected attempt receipt")
    return AttemptManifestEnvelope(data=result)


@router.post(
    RUNNER_ATTEMPT_HEARTBEAT_PATH,
    operation_id="renewRunnerLease",
    response_model=AttemptHeartbeatEnvelope,
)
async def heartbeat(
    attempt_id: AttemptId,
    body: AttemptHeartbeat,
    credential: Credential,
    service: Service,
    contract: Contract,
) -> AttemptHeartbeatEnvelope:
    result = await service.write(credential, attempt_id, body)
    if not isinstance(result, AttemptHeartbeatReceipt):
        raise RuntimeError("Unexpected attempt receipt")
    return AttemptHeartbeatEnvelope(data=result)


def install_lease_errors(app: FastAPI) -> None:
    @app.exception_handler(LeaseExpired)
    async def expired(request: Request, exc: LeaseExpired):
        return error_response(
            request,
            ApiError(
                409,
                ErrorCode.LEASE_EXPIRED,
                "The lease has expired. It cannot be renewed or replayed as authority.",
            ),
        )

    @app.exception_handler(StaleAttempt)
    async def stale(request: Request, exc: StaleAttempt):
        return error_response(
            request,
            ApiError(
                409,
                ErrorCode.STALE_ATTEMPT,
                "The attempt or fencing identity is no longer current.",
            ),
        )

    @app.exception_handler(ManifestMismatch)
    async def mismatch(request: Request, exc: ManifestMismatch):
        return error_response(
            request,
            ApiError(
                422,
                ErrorCode.PROFILE_MISMATCH,
                "Observed inputs differ from the frozen admitted manifest.",
            ),
        )
