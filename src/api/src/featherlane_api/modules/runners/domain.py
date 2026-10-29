"""Runner identity rules independent of HTTP, persistence and simulator SDKs."""

import hashlib
import hmac
from datetime import datetime

from featherlane_contracts import (
    CONTRACT_VERSION,
    PROTOCOL_VERSION,
    RunnerConnectionState,
)


class InvalidRunnerCredential(Exception):
    pass


class InvalidEnrollment(Exception):
    pass


class RunnerConflict(Exception):
    pass


class RunnerUnavailable(Exception):
    pass


class UnsupportedRunnerVersion(Exception):
    def __init__(self, *, protocol: bool):
        self.protocol = protocol


def require_versions(contract: str, protocol: str) -> None:
    if contract != CONTRACT_VERSION:
        raise UnsupportedRunnerVersion(protocol=False)
    if protocol != PROTOCOL_VERSION:
        raise UnsupportedRunnerVersion(protocol=True)


def connection_state(
    last_seen: datetime | None, now: datetime
) -> RunnerConnectionState:
    if last_seen is None or (now - last_seen).total_seconds() >= 90:
        return RunnerConnectionState.OFFLINE
    if (now - last_seen).total_seconds() >= 30:
        return RunnerConnectionState.STALE
    return RunnerConnectionState.CONNECTED


class RunnerSecrets:
    """Purpose-separated keyed digests; only the configured key ID is accepted."""

    def __init__(self, key: str, key_id: str = "identity-v1"):
        self._key = key.encode()
        self.key_id = key_id

    def digest(self, value: str, purpose: str) -> str:
        return hmac.new(
            self._key, f"runner:{purpose}:{value}".encode(), hashlib.sha256
        ).hexdigest()

    def grant_token(self, grant_id: str) -> str:
        # Deterministic response recovery without storing the grant's plaintext.
        return self.digest(grant_id, "grant-response")
