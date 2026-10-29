"""Shared stop-deadline decisions under caller-owned runner/run/attempt locks."""

from datetime import datetime

from featherlane_api.modules.leases.domain import effective_lease_expiry
from featherlane_api.modules.leases.persistence import AttemptRecord
from featherlane_api.modules.runners.persistence import RunnerRecord
from featherlane_api.modules.runs.persistence import RunRecord

ACTIVE_STATES = {"CLAIMED", "STARTING", "RUNNING", "FINALIZING"}


def expire_attempt(
    runner: RunnerRecord,
    run: RunRecord,
    attempt: AttemptRecord,
    now: datetime,
) -> bool:
    if attempt.finished_at is not None:
        return False
    expiry = effective_lease_expiry(attempt.created_at, attempt.lease_expires_at)
    cancellation_wins = (
        run.cancellation_deadline_at is not None
        and run.cancellation_deadline_at <= expiry
    )
    if cancellation_wins:
        expiry = run.cancellation_deadline_at
    if expiry > now:
        return False
    reason = {
        "code": "CANCELLATION_UNCONFIRMED" if cancellation_wins else "LEASE_EXPIRED",
        "message": "Cancellation deadline passed without confirmed cleanup."
        if cancellation_wins
        else "Lease expired; execution and cleanup are unconfirmed.",
    }
    attempt.finished_at, attempt.terminal_reason = now, reason
    if run.execution_state in ACTIVE_STATES:
        run.execution_state, run.evaluation_outcome = "ERROR", "NOT_EVALUATED"
        run.finished_at, run.terminal_reason = now, reason
    runner.capacity_state = "NEEDS_CLEANUP"
    return True
