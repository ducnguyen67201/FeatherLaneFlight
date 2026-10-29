"""Browser enrollment controls and a separate machine-only transport namespace."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Header, Path, Query, Request
from featherlane_contracts import (
    CONTRACT_VERSION,
    ContractVersion,
    Cursor,
    ErrorCode,
    Identifier,
)
from featherlane_contracts.runners import (
    RUNNER_ENROLLMENTS_PATH,
    RUNNER_HEARTBEAT_PATH,
    RUNNER_IDENTITY_PATH,
    CreateEnrollmentRequest,
    EnrollmentGrantEnvelope,
    EnrollRunnerRequest,
    RunnerEnvelope,
    RunnerHeartbeat,
    RunnerIdentityEnvelope,
    RunnerListEnvelope,
)
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.dependencies import get_session
from featherlane_api.http.errors import ERROR_RESPONSES, ApiError, error_response
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.dependencies import (
    get_identity_service,
    get_principal,
    require_csrf,
    session_handle,
)
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.runners.application import RunnerService
from featherlane_api.modules.runners.domain import (
    InvalidEnrollment,
    InvalidRunnerCredential,
    RunnerConflict,
    RunnerSecrets,
    RunnerUnavailable,
    UnsupportedRunnerVersion,
    require_versions,
)

router = APIRouter(responses=ERROR_RESPONSES)


def get_runner_service(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    identity: Annotated[IdentityService, Depends(get_identity_service)],
) -> RunnerService:
    # Separate HMAC purposes retain the existing secret-injection boundary.
    return RunnerService(
        session,
        RunnerSecrets(
            request.app.state.settings.session_hash_key.get_secret_value(),
            request.app.state.settings.runner_key_id,
        ),
        identity,
    )


def machine_credential(
    request: Request,
    protocol: Annotated[
        str, Header(alias="x-flf-protocol-version", min_length=1, max_length=32)
    ],
) -> str:
    require_versions(CONTRACT_VERSION, protocol)
    headers = request.headers.getlist("authorization")
    if len(headers) != 1 or re.fullmatch(r"Bearer [a-f0-9]{64}", headers[0]) is None:
        raise InvalidRunnerCredential()
    return headers[0][7:]


@router.get(
    "/api/v1/projects/{projectId}/runners",
    operation_id="listRunners",
    response_model=RunnerListEnvelope,
)
async def list_runners(
    request: Request,
    project_id: Annotated[Identifier, Path(alias="projectId")],
    principal: Annotated[Principal, Depends(get_principal)],
    service: Annotated[RunnerService, Depends(get_runner_service)],
    contract: Annotated[ContractVersion, Header(alias="x-flf-contract-version")],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[Cursor | None, Query()] = None,
) -> RunnerListEnvelope:
    return await service.list(
        principal, session_handle(request), project_id, limit, cursor
    )


@router.post(
    "/api/v1/projects/{projectId}/runner-enrollments",
    operation_id="createRunnerEnrollment",
    response_model=EnrollmentGrantEnvelope,
    status_code=201,
)
async def create_enrollment(
    request: Request,
    project_id: Annotated[Identifier, Path(alias="projectId")],
    body: CreateEnrollmentRequest,
    principal: Annotated[Principal, Depends(require_csrf)],
    service: Annotated[RunnerService, Depends(get_runner_service)],
    contract: Annotated[ContractVersion, Header(alias="x-flf-contract-version")],
    csrf: Annotated[str, Header(alias="x-csrf-token", min_length=64, max_length=64)],
    key: Annotated[Identifier, Header(alias="idempotency-key")],
) -> EnrollmentGrantEnvelope:
    return await service.create_grant(
        principal, session_handle(request), csrf, project_id, key, body
    )


@router.post(
    "/api/v1/runners/{runnerId}/revoke",
    operation_id="revokeRunner",
    response_model=RunnerEnvelope,
)
async def revoke_runner(
    request: Request,
    runner_id: Annotated[Identifier, Path(alias="runnerId")],
    principal: Annotated[Principal, Depends(require_csrf)],
    service: Annotated[RunnerService, Depends(get_runner_service)],
    contract: Annotated[ContractVersion, Header(alias="x-flf-contract-version")],
    csrf: Annotated[str, Header(alias="x-csrf-token", min_length=64, max_length=64)],
) -> RunnerEnvelope:
    return await service.revoke(principal, session_handle(request), csrf, runner_id)


@router.post(
    RUNNER_ENROLLMENTS_PATH,
    operation_id="enrollRunner",
    response_model=RunnerIdentityEnvelope,
    status_code=201,
)
async def enroll_runner(
    body: EnrollRunnerRequest,
    service: Annotated[RunnerService, Depends(get_runner_service)],
    contract: Annotated[ContractVersion, Header(alias="x-flf-contract-version")],
    protocol: Annotated[
        str, Header(alias="x-flf-protocol-version", min_length=1, max_length=32)
    ],
) -> RunnerIdentityEnvelope:
    require_versions(CONTRACT_VERSION, protocol)
    return await service.enroll(body)


@router.get(
    RUNNER_IDENTITY_PATH,
    operation_id="getRunnerIdentity",
    response_model=RunnerIdentityEnvelope,
)
async def get_runner_identity(
    credential: Annotated[str, Depends(machine_credential)],
    service: Annotated[RunnerService, Depends(get_runner_service)],
    contract: Annotated[ContractVersion, Header(alias="x-flf-contract-version")],
) -> RunnerIdentityEnvelope:
    return await service.me(credential)


@router.post(
    RUNNER_HEARTBEAT_PATH,
    operation_id="sendRunnerHeartbeat",
    response_model=RunnerIdentityEnvelope,
)
async def runner_heartbeat(
    body: RunnerHeartbeat,
    credential: Annotated[str, Depends(machine_credential)],
    service: Annotated[RunnerService, Depends(get_runner_service)],
    contract: Annotated[ContractVersion, Header(alias="x-flf-contract-version")],
) -> RunnerIdentityEnvelope:
    return await service.heartbeat(credential, body)


def install_runner_errors(app: FastAPI) -> None:
    @app.exception_handler(InvalidRunnerCredential)
    async def credential_error(request: Request, exc: InvalidRunnerCredential):
        return error_response(
            request,
            ApiError(
                401,
                ErrorCode.UNAUTHENTICATED,
                "A current runner credential is required.",
            ),
        )

    @app.exception_handler(InvalidEnrollment)
    async def enrollment_error(request: Request, exc: InvalidEnrollment):
        return error_response(
            request,
            ApiError(
                401,
                ErrorCode.UNAUTHENTICATED,
                "The enrollment grant is unavailable or expired.",
            ),
        )

    @app.exception_handler(RunnerConflict)
    async def conflict_error(request: Request, exc: RunnerConflict):
        return error_response(
            request,
            ApiError(
                409,
                ErrorCode.IDEMPOTENCY_CONFLICT,
                "The request conflicts with the current runner or prior request. "
                "Retry the unchanged request or refresh the runner state.",
            ),
        )

    @app.exception_handler(RunnerUnavailable)
    async def unavailable_error(request: Request, exc: RunnerUnavailable):
        return error_response(
            request,
            ApiError(
                409,
                ErrorCode.RUNNER_UNAVAILABLE,
                "The runner is unavailable for this operation. "
                "Refresh its current state.",
            ),
        )

    @app.exception_handler(UnsupportedRunnerVersion)
    async def version_error(request: Request, exc: UnsupportedRunnerVersion):
        return error_response(
            request,
            ApiError(
                400,
                ErrorCode.PROTOCOL_VERSION_UNSUPPORTED
                if exc.protocol
                else ErrorCode.CONTRACT_VERSION_UNSUPPORTED,
                "Upgrade the runner to the supported contract and protocol versions.",
            ),
        )
