"""Lease rules shared by claim recovery, attempt writes and the expiry worker."""

import math
from datetime import datetime, timedelta

from featherlane_contracts.run_detail import ExecutionManifest

LEASE_LIFETIME_SECONDS = 60
MAX_ATTEMPT_DURATION_SECONDS = 300
HEARTBEAT_INTERVAL_SECONDS = 10
STOPPING_MARGIN_SECONDS = 10


class LeaseExpired(Exception):
    pass


class StaleAttempt(Exception):
    pass


class ManifestMismatch(Exception):
    pass


def effective_lease_expiry(
    created_at: datetime, lease_expires_at: datetime
) -> datetime:
    return min(
        lease_expires_at, created_at + timedelta(seconds=MAX_ATTEMPT_DURATION_SECONDS)
    )


def remaining_ttl_ms(expires_at: datetime, now: datetime) -> int:
    # Truncate downward: a serialized duration must never overstate authority.
    remaining = math.floor((expires_at - now).total_seconds() * 1000)
    if remaining <= 0:
        raise LeaseExpired()
    return min(remaining, LEASE_LIFETIME_SECONDS * 1000)


def require_fence(
    *,
    current_lease_id: str,
    current_fencing_number: int,
    lease_id: str,
    fencing_number: int,
    active: bool,
    expires_at: datetime,
    now: datetime,
) -> None:
    if (
        current_lease_id != lease_id
        or current_fencing_number != fencing_number
        or not active
    ):
        raise StaleAttempt()
    remaining_ttl_ms(expires_at, now)


def verify_manifest(
    requested: ExecutionManifest,
    observed: ExecutionManifest,
    frozen: ExecutionManifest | None = None,
) -> None:
    # The bounded synthetic runtime has no permitted environmental drift.
    # Compare canonical values; never rewrite the admitted request to match them.
    if requested != observed or (frozen is not None and frozen != observed):
        raise ManifestMismatch()
