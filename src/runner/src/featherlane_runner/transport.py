"""Versioned requests to one pinned origin; redirects and environment proxies off."""

from ipaddress import ip_address
from urllib.parse import urlsplit

import httpx2
from featherlane_contracts import CONTRACT_VERSION, PROTOCOL_VERSION, ErrorEnvelope
from featherlane_contracts.runners import (
    RUNNER_ENROLLMENTS_PATH,
    RUNNER_HEARTBEAT_PATH,
    RUNNER_IDENTITY_PATH,
    EnrollRunnerRequest,
    RunnerHeartbeat,
    RunnerIdentityEnvelope,
)
from pydantic import AnyHttpUrl


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

    def _request(
        self,
        method: str,
        path: str,
        credential: str | None = None,
        body: dict | None = None,
    ) -> RunnerIdentityEnvelope:
        try:
            with self.client.stream(
                method,
                path,
                headers={"Authorization": f"Bearer {credential}"} if credential else {},
                json=body,
            ) as response:
                raw = bytearray()
                for chunk in response.iter_bytes():
                    if len(raw) + len(chunk) > 262144:
                        raise RunnerTransportError()
                    raw.extend(chunk)
                if (
                    response.headers.get("content-type", "").split(";", 1)[0]
                    != "application/json"
                ):
                    raise RunnerTransportError(response.status_code)
                if response.status_code not in (200, 201):
                    error = ErrorEnvelope.model_validate_json(bytes(raw))
                    raise RunnerTransportError(response.status_code, error.error.code)
                return RunnerIdentityEnvelope.model_validate_json(bytes(raw))
        except httpx2.HTTPError:
            raise RunnerTransportError() from None

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
