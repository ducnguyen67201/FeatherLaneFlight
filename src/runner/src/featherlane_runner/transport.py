"""Versioned requests to one pinned origin; redirects and environment proxies off."""

from ipaddress import ip_address
from urllib.parse import urlsplit

import httpx2
from featherlane_contracts import (
    CONTRACT_VERSION,
    PROTOCOL_VERSION,
    ErrorEnvelope,
    Identifier,
)
from featherlane_contracts.cleanup import (
    RUNNER_ATTEMPT_CLEANUP_PATH,
    RUNNER_RECOVERY_PATH,
    AttemptCleanupEnvelope,
    AttemptCleanupRequest,
    RunnerRecoveryEnvelope,
    RunnerRecoveryRequest,
)
from featherlane_contracts.events import (
    RUNNER_ATTEMPT_EVENTS_PATH,
    EventBatchEnvelope,
    RunnerEventBatch,
)
from featherlane_contracts.leases import (
    RUNNER_ATTEMPT_HEARTBEAT_PATH,
    RUNNER_ATTEMPT_MANIFEST_PATH,
    RUNNER_CLAIMS_PATH,
    AttemptHeartbeat,
    AttemptHeartbeatEnvelope,
    AttemptManifestEnvelope,
    AttemptManifestRequest,
    ClaimEnvelope,
    ClaimRequest,
)
from featherlane_contracts.runners import (
    RUNNER_ENROLLMENTS_PATH,
    RUNNER_HEARTBEAT_PATH,
    RUNNER_IDENTITY_PATH,
    EnrollRunnerRequest,
    RunnerHeartbeat,
    RunnerIdentityEnvelope,
)
from pydantic import AnyHttpUrl, TypeAdapter, ValidationError


class RunnerTransportError(Exception):
    def __init__(self, status: int | None = None, code: str | None = None):
        self.status = status
        self.code = code


def validate_origin(value: str) -> str:
    parsed = urlsplit(value)
    try:
        loopback = ip_address(parsed.hostname or "").is_loopback
    except ValueError:
        loopback = parsed.hostname == "localhost"
    if (
        any(ord(char) <= 32 or ord(char) == 127 for char in value)
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
        or (parsed.scheme != "https" and not (parsed.scheme == "http" and loopback))
    ):
        raise ValueError("Expected one HTTPS origin or loopback HTTP origin")
    return str(AnyHttpUrl(value)).removesuffix("/")


def read_json_response(
    response: httpx2.Response, *, allow_empty: bool = False, max_bytes: int = 1_048_576
) -> bytes | None:
    """One bounded decoder shared by JSON protocol and binary-upload receipts."""
    raw = bytearray()
    for chunk in response.iter_bytes():
        if len(raw) + len(chunk) > max_bytes:
            raise RunnerTransportError()
        raw.extend(chunk)
    if allow_empty and response.status_code == 204:
        if raw:
            raise RunnerTransportError(response.status_code)
        return None
    if response.headers.get("content-type", "").split(";", 1)[0] != "application/json":
        raise RunnerTransportError(response.status_code)
    if response.status_code not in (200, 201):
        try:
            error = ErrorEnvelope.model_validate_json(bytes(raw))
        except ValidationError:
            raise RunnerTransportError(response.status_code) from None
        raise RunnerTransportError(response.status_code, error.error.code)
    return bytes(raw)


class RunnerTransport:
    def __init__(self, origin: str):
        self.origin = validate_origin(origin)
        self.client = httpx2.Client(
            base_url=self.origin,
            timeout=15,
            follow_redirects=False,
            trust_env=False,
            headers={
                "Accept": "application/json",
                "x-flf-contract-version": CONTRACT_VERSION,
                "x-flf-protocol-version": PROTOCOL_VERSION,
            },
        )

    def close(self) -> None:
        self.client.close()

    def _send(
        self,
        method: str,
        path: str,
        credential: str | None = None,
        body: dict | None = None,
        *,
        allow_empty: bool = False,
    ) -> bytes | None:
        try:
            with self.client.stream(
                method,
                path,
                headers={"Authorization": f"Bearer {credential}"} if credential else {},
                json=body,
            ) as response:
                return read_json_response(response, allow_empty=allow_empty)
        except httpx2.HTTPError:
            raise RunnerTransportError() from None

    def _request(
        self,
        method: str,
        path: str,
        credential: str | None = None,
        body: dict | None = None,
    ) -> RunnerIdentityEnvelope:
        raw = self._send(method, path, credential, body)
        if raw is None:
            raise RunnerTransportError()
        return RunnerIdentityEnvelope.model_validate_json(raw)

    def claim(self, credential: str, body: ClaimRequest) -> ClaimEnvelope | None:
        raw = self._send(
            "POST",
            RUNNER_CLAIMS_PATH,
            credential,
            body.model_dump(mode="json"),
            allow_empty=True,
        )
        return ClaimEnvelope.model_validate_json(raw) if raw is not None else None

    def attempt_heartbeat(
        self, credential: str, attempt_id: str, body: AttemptHeartbeat
    ) -> AttemptHeartbeatEnvelope:
        attempt_id = TypeAdapter(Identifier).validate_python(attempt_id)
        raw = self._send(
            "POST",
            RUNNER_ATTEMPT_HEARTBEAT_PATH.format(attemptId=attempt_id),
            credential,
            body.model_dump(mode="json"),
        )
        if raw is None:
            raise RunnerTransportError()
        return AttemptHeartbeatEnvelope.model_validate_json(raw)

    def attempt_manifest(
        self, credential: str, attempt_id: str, body: AttemptManifestRequest
    ) -> AttemptManifestEnvelope:
        attempt_id = TypeAdapter(Identifier).validate_python(attempt_id)
        raw = self._send(
            "POST",
            RUNNER_ATTEMPT_MANIFEST_PATH.format(attemptId=attempt_id),
            credential,
            body.model_dump(mode="json"),
        )
        if raw is None:
            raise RunnerTransportError()
        return AttemptManifestEnvelope.model_validate_json(raw)

    def attempt_cleanup(
        self, credential: str, attempt_id: str, body: AttemptCleanupRequest
    ) -> AttemptCleanupEnvelope:
        attempt_id = TypeAdapter(Identifier).validate_python(attempt_id)
        raw = self._send(
            "POST",
            RUNNER_ATTEMPT_CLEANUP_PATH.format(attemptId=attempt_id),
            credential,
            body.model_dump(mode="json"),
        )
        if raw is None:
            raise RunnerTransportError()
        return AttemptCleanupEnvelope.model_validate_json(raw)

    def recover_execution(
        self, credential: str, body: RunnerRecoveryRequest
    ) -> RunnerRecoveryEnvelope:
        raw = self._send(
            "POST", RUNNER_RECOVERY_PATH, credential, body.model_dump(mode="json")
        )
        if raw is None:
            raise RunnerTransportError()
        return RunnerRecoveryEnvelope.model_validate_json(raw)

    def attempt_events(
        self, credential: str, attempt_id: str, body: RunnerEventBatch
    ) -> EventBatchEnvelope:
        attempt_id = TypeAdapter(Identifier).validate_python(attempt_id)
        raw = self._send(
            "POST",
            RUNNER_ATTEMPT_EVENTS_PATH.format(attemptId=attempt_id),
            credential,
            body.model_dump(mode="json"),
        )
        if raw is None:
            raise RunnerTransportError()
        return EventBatchEnvelope.model_validate_json(raw)

    def enroll(self, body: EnrollRunnerRequest) -> RunnerIdentityEnvelope:
        return self._request(
            "POST", RUNNER_ENROLLMENTS_PATH, body=body.model_dump(mode="json")
        )

    def me(self, credential: str) -> RunnerIdentityEnvelope:
        return self._request("GET", RUNNER_IDENTITY_PATH, credential)

    def heartbeat(
        self, credential: str, body: RunnerHeartbeat
    ) -> RunnerIdentityEnvelope:
        return self._request(
            "POST", RUNNER_HEARTBEAT_PATH, credential, body.model_dump(mode="json")
        )
