"""Machine-only uploads and browser-only private attachment downloads."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Request, Response
from featherlane_contracts import ContractVersion, ErrorCode, Identifier
from featherlane_contracts.evidence import (
    ARTIFACT_CONTENT_PATH,
    RUN_ARTIFACTS_PATH,
    RUNNER_ARTIFACT_CONTENT_PATH,
    RUNNER_ARTIFACTS_PATH,
    ArtifactDeclaration,
    ArtifactEnvelope,
)
from featherlane_contracts.leases import AttemptWrite, SafeSequence
from featherlane_contracts.run_detail import ArtifactListEnvelope
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask
from starlette.responses import StreamingResponse

from featherlane_api.http.dependencies import get_session
from featherlane_api.http.errors import ERROR_RESPONSES, ApiError
from featherlane_api.modules.evidence.application import EvidenceService
from featherlane_api.modules.evidence.downloads import EvidenceDownloads
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.dependencies import (
    get_identity_service,
    get_principal,
    session_handle,
)
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.leases.application import LeaseService
from featherlane_api.modules.runners.domain import RunnerSecrets
from featherlane_api.modules.runners.http import machine_credential

router = APIRouter(responses=ERROR_RESPONSES)


def get_evidence(
    request: Request, session: Annotated[AsyncSession, Depends(get_session)]
) -> EvidenceService:
    settings = request.app.state.settings
    return EvidenceService(
        session,
        LeaseService(
            session,
            RunnerSecrets(
                settings.session_hash_key.get_secret_value(), settings.runner_key_id
            ),
        ),
        request.app.state.artifact_storage,
        settings.project_evidence_bytes_limit,
    )


def get_downloads(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    identity: Annotated[IdentityService, Depends(get_identity_service)],
) -> EvidenceDownloads:
    return EvidenceDownloads(session, identity, request.app.state.artifact_storage)


Contract = Annotated[ContractVersion, Header(alias="x-flf-contract-version")]
ArtifactId = Annotated[Identifier, Path(alias="artifactId")]
Service = Annotated[EvidenceService, Depends(get_evidence)]
Downloads = Annotated[EvidenceDownloads, Depends(get_downloads)]
Credential = Annotated[str, Depends(machine_credential)]
User = Annotated[Principal, Depends(get_principal)]


@router.post(
    RUNNER_ARTIFACTS_PATH,
    operation_id="declareRunnerArtifact",
    response_model=ArtifactEnvelope,
    status_code=201,
)
async def declare_artifact(
    response: Response,
    attempt_id: Annotated[Identifier, Path(alias="attemptId")],
    body: ArtifactDeclaration,
    credential: Credential,
    service: Service,
    contract: Contract,
) -> ArtifactEnvelope:
    artifact = await service.declare(credential, attempt_id, body)
    response.headers["Location"] = RUNNER_ARTIFACT_CONTENT_PATH.format(
        artifactId=artifact.id
    )
    return ArtifactEnvelope(data=artifact)


@router.put(
    RUNNER_ARTIFACT_CONTENT_PATH,
    operation_id="uploadRunnerArtifact",
    response_model=ArtifactEnvelope,
    openapi_extra={
        "x-flf-transport": "binary-upload",
        "requestBody": {
            "required": True,
            "content": {
                "application/octet-stream": {
                    "schema": {"type": "string", "format": "binary"}
                }
            },
        },
    },
)
async def upload_artifact(
    request: Request,
    artifact_id: ArtifactId,
    credential: Credential,
    service: Service,
    contract: Contract,
    lease_id: Annotated[Identifier, Header(alias="x-flf-lease-id")],
    fencing_number: Annotated[SafeSequence, Header(alias="x-flf-fencing-number")],
) -> ArtifactEnvelope:
    if request.headers.get("content-type", "").lower() != "application/octet-stream":
        raise ApiError(
            415,
            ErrorCode.UNSUPPORTED_MEDIA_TYPE,
            "A binary artifact stream is required.",
        )
    return ArtifactEnvelope(
        data=await service.upload(
            credential,
            artifact_id,
            AttemptWrite(leaseId=lease_id, fencingNumber=fencing_number),
            request.stream(),
        )
    )


@router.get(
    RUN_ARTIFACTS_PATH,
    operation_id="getRunArtifacts",
    response_model=ArtifactListEnvelope,
)
async def list_artifacts(
    request: Request,
    run_id: Annotated[Identifier, Path(alias="runId")],
    principal: User,
    service: Downloads,
    contract: Contract,
) -> ArtifactListEnvelope:
    return await service.artifacts(principal, session_handle(request), run_id)


@router.get(
    ARTIFACT_CONTENT_PATH,
    operation_id="downloadArtifact",
    response_class=StreamingResponse,
    responses={
        200: {
            "description": "Private attachment",
            "content": {
                "application/octet-stream": {
                    "schema": {"type": "string", "format": "binary"}
                }
            },
        }
    },
    openapi_extra={"x-flf-transport": "binary-download"},
)
async def download_artifact(
    request: Request,
    artifact_id: ArtifactId,
    principal: User,
    service: Downloads,
    contract: Contract,
) -> StreamingResponse:
    handle = session_handle(request)
    stream, size, media_type, filename = await service.open(
        principal, handle, artifact_id
    )
    return StreamingResponse(
        service.stream(principal, handle, artifact_id, stream, size),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Length": str(size),
            "Cache-Control": "no-store",
        },
        background=BackgroundTask(stream.close),
    )
