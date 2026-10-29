"""Explicit stand-in harness binding to P13 authority, never a qualified job runner."""

import time

from featherlane_contracts.leases import AttemptHeartbeatReceipt, LeaseGrant

from featherlane_runner.journal import same_assignment
from featherlane_runner.lease import LeaseWindow, LocalLeaseExpired
from featherlane_runner.storage import LocalStateError
from featherlane_runner.supervisor import StopResult, Supervisor


class SupervisedLease:
    """Only an explicit local stand-in exercise calls this; NON_EXECUTING does not.

    Server TTL already includes the assignment cap, credentials and cancellation.
    Saved grants and local wall time never reset those clocks here.
    """

    def __init__(
        self, supervisor: Supervisor, lease: LeaseGrant, *, dispatched_at: float
    ):
        window = LeaseWindow.from_response(
            dispatched_at=dispatched_at,
            received_at=time.monotonic(),
            remaining_ttl_ms=lease.remaining_ttl_ms,
            stopping_margin_seconds=lease.stopping_margin_seconds,
        )
        supervisor.start_standin(lease.attempt_id, stop_at_monotonic=window.deadline)
        self.supervisor, self.lease, self.window = supervisor, lease, window
        initial = supervisor.snapshot()
        if initial is None:
            raise LocalStateError("Started execution record is unavailable")
        self.generation = initial.generation

    def accept_heartbeat(
        self, receipt: AttemptHeartbeatReceipt, *, dispatched_at: float
    ) -> StopResult | None:
        lease = receipt.lease
        current = self.supervisor.snapshot()
        if (
            current is None
            or current.attempt_id != self.lease.attempt_id
            or current.generation != self.generation
        ):
            raise LocalStateError("The lease adapter no longer owns this execution")
        if (
            not same_assignment(self.lease, lease)
            or lease.last_heartbeat_sequence < self.lease.last_heartbeat_sequence
            or lease.last_heartbeat_sequence > self.lease.last_heartbeat_sequence + 1
        ):
            self.supervisor.stop("SUPERVISOR_FAILED")
            raise LocalStateError("Heartbeat authority differs from owned attempt")
        if receipt.cancellation_requested:
            return self.supervisor.stop("CANCELLATION_REQUESTED")
        try:
            received = time.monotonic()
            self.window.require_live(received)
            candidate = LeaseWindow.from_response(
                dispatched_at=dispatched_at,
                received_at=received,
                remaining_ttl_ms=lease.remaining_ttl_ms,
                stopping_margin_seconds=lease.stopping_margin_seconds,
            )
            if lease.last_heartbeat_sequence == self.lease.last_heartbeat_sequence:
                candidate = LeaseWindow(min(candidate.deadline, self.window.deadline))
            self.supervisor.update_deadline(stop_at_monotonic=candidate.deadline)
            self.window, self.lease = candidate, lease
        except LocalLeaseExpired:
            self.supervisor.stop("LEASE_EXPIRED")
            raise
        return None
