"""Bounded evidence requests reuse the runner's one pinned-origin HTTP client."""

import hashlib
from collections.abc import Iterator
from typing import BinaryIO

import httpx2
from featherlane_contracts import Identifier
from featherlane_contracts.evidence import (
    RUNNER_ARTIFACT_CONTENT_PATH,
    RUNNER_ARTIFACTS_PATH,
    ArtifactDeclaration,
    ArtifactEnvelope,
)
from pydantic import TypeAdapter, ValidationError

from featherlane_runner.evidence import LocalEvidenceError
from featherlane_runner.transport import (
    RunnerTransport,
    RunnerTransportError,
    read_json_response,
)

IDENTIFIER = TypeAdapter(Identifier)


def _receipt(response: httpx2.Response, expected_status: int) -> ArtifactEnvelope:
    raw = read_json_response(response, max_bytes=262_144)
    if raw is None or response.status_code != expected_status:
        raise RunnerTransportError(response.status_code)
    try:
        return ArtifactEnvelope.model_validate_json(raw)
    except ValidationError:
        raise RunnerTransportError(response.status_code) from None


class EvidenceTransport:
    def __init__(self, transport: RunnerTransport):
        self.transport = transport

    def declare(
        self, credential: str, attempt_id: str, body: ArtifactDeclaration
    ) -> ArtifactEnvelope:
        path = RUNNER_ARTIFACTS_PATH.format(
            attemptId=IDENTIFIER.validate_python(attempt_id)
        )
        try:
            with self.transport.client.stream(
                "POST",
                path,
                headers={"Authorization": f"Bearer {credential}"},
                json=body.model_dump(mode="json"),
            ) as response:
                result = _receipt(response, 201)
        except httpx2.HTTPError:
            raise RunnerTransportError() from None
        if (
            result.data.attempt_id != attempt_id
            or result.data.trial_id != body.trial_id
            or result.data.kind != body.kind
            or result.data.byte_length != body.byte_length
            or result.data.sha256 != body.sha256
            or (
                body.disposition == "LOCAL_ONLY"
                and result.data.availability != "LOCAL_ONLY"
            )
        ):
            raise RunnerTransportError()
        return result

    def upload(
        self,
        credential: str,
        artifact_id: str,
        body: ArtifactDeclaration,
        stream: BinaryIO,
    ) -> ArtifactEnvelope:
        """Caller retains its P14-owned closed descriptor and durable declaration.

        Retry the same declaration and artifact ID after an uncertain response.
        No new path, remote URL, storage destination, copy or process is accepted.
        """
        if (
            body.disposition != "UPLOAD"
            or body.byte_length is None
            or body.sha256 is None
        ):
            raise LocalEvidenceError("Local-only evidence cannot be uploaded.")
        path = RUNNER_ARTIFACT_CONTENT_PATH.format(
            artifactId=IDENTIFIER.validate_python(artifact_id)
        )
        stream.seek(0)

        def chunks() -> Iterator[bytes]:
            digest = hashlib.sha256()
            size = 0
            while chunk := stream.read(65_536):
                size += len(chunk)
                if size > body.byte_length:
                    raise LocalEvidenceError("Evidence grew beyond its declaration.")
                digest.update(chunk)
                yield chunk
            if size != body.byte_length or digest.hexdigest() != body.sha256:
                raise LocalEvidenceError("Evidence differs from its declaration.")

        try:
            with self.transport.client.stream(
                "PUT",
                path,
                headers={
                    "Authorization": f"Bearer {credential}",
                    "Content-Type": "application/octet-stream",
                    "Content-Length": str(body.byte_length),
                    "X-FLF-Lease-ID": body.lease_id,
                    "X-FLF-Fencing-Number": str(body.fencing_number),
                },
                content=chunks(),
            ) as response:
                result = _receipt(response, 200)
        except httpx2.HTTPError:
            raise RunnerTransportError() from None
        if (
            result.data.id != artifact_id
            or result.data.kind != body.kind
            or result.data.trial_id != body.trial_id
            or result.data.byte_length != body.byte_length
            or result.data.sha256 != body.sha256
            or result.data.verification_state != "VERIFIED"
        ):
            raise RunnerTransportError()
        return result
