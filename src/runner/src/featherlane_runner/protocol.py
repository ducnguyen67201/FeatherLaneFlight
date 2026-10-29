"""Non-executing claim/manifest/renewal client under the existing runner lock."""

import time

from featherlane_contracts.leases import (
    AttemptManifestRequest,
    ClaimAssignment,
    LeaseGrant,
)
from featherlane_contracts.registration import metadata_digest
from featherlane_contracts.run_detail import ExecutionManifest

from featherlane_runner.journal import ProtocolJournal, same_assignment
from featherlane_runner.lease import LeaseWindow, LocalLeaseExpired
from featherlane_runner.storage import LocalStateError
from featherlane_runner.transport import RunnerTransport, RunnerTransportError


class ProtocolClient:
    def __init__(self, journal: ProtocolJournal, transport: RunnerTransport):
        self.journal = journal
        self.transport = transport
        self.window: LeaseWindow | None = None
        self.assignment: ClaimAssignment | None = None

    def claim(self) -> ClaimAssignment | None:
        body = self.journal.claim_request()
        dispatched = time.monotonic()
        try:
            response = self.transport.claim(self.journal.state.credential, body)
        except RunnerTransportError as exc:
            self._record_rejection(exc)
            raise
        assignment = response.data if response is not None else None
        self.journal.record_claim(assignment.lease if assignment else None)
        self.assignment = assignment
        if assignment is not None:
            if assignment.requested_manifest.runtime_family != "SYNTHETIC":
                raise LocalStateError()
            self._accept_window(dispatched, assignment.lease, renew=False)
        return assignment

    def freeze_manifest(self, observed: ExecutionManifest) -> None:
        assignment = self._current()
        if observed != assignment.requested_manifest:
            raise LocalStateError()
        body = AttemptManifestRequest(
            leaseId=assignment.lease.lease_id,
            fencingNumber=assignment.lease.fencing_number,
            observedManifest=observed,
        )
        dispatched = time.monotonic()
        self.window.require_live(dispatched)
        try:
            response = self.transport.attempt_manifest(
                self.journal.state.credential, assignment.lease.attempt_id, body
            ).data
        except RunnerTransportError as exc:
            self._record_rejection(exc)
            raise
        if response.observed_manifest != observed:
            raise LocalStateError()
        # Manifest replay is idempotent and never renews. Validate the current
        # returned lease with the same ownership/identity checks as a claim replay.
        if not same_assignment(assignment.lease, response.lease):
            raise LocalStateError()
        self.journal.record_manifest(metadata_digest(observed))
        self._accept_window(dispatched, response.lease, renew=False)
        assignment.observed_manifest = observed

    def renew(self) -> bool:
        assignment = self._current()
        self.window.require_live(time.monotonic())
        body = self.journal.renewal_request()
        dispatched = time.monotonic()
        try:
            response = self.transport.attempt_heartbeat(
                self.journal.state.credential, assignment.lease.attempt_id, body
            ).data
        except RunnerTransportError as exc:
            self._record_rejection(exc)
            raise
        self.journal.record_renewal(response.lease)
        assignment.lease = response.lease
        if response.cancellation_requested:
            # This client has no processes to stop. P14 owns cleanup reporting;
            # do not turn cancellation intent into an invented stop receipt.
            self.window = None
            return False
        self._accept_window(dispatched, response.lease)
        return True

    def _current(self) -> ClaimAssignment:
        if self.assignment is None or self.window is None:
            raise LocalStateError()
        self.window.require_live(time.monotonic())
        return self.assignment

    def _accept_window(
        self, dispatched: float, lease: LeaseGrant, *, renew: bool = True
    ) -> None:
        try:
            received = time.monotonic()
            previous = self.window
            if previous is not None:
                previous.require_live(received)
            candidate = LeaseWindow.from_response(
                dispatched_at=dispatched,
                received_at=received,
                remaining_ttl_ms=lease.remaining_ttl_ms,
                stopping_margin_seconds=lease.stopping_margin_seconds,
            )
            self.window = (
                LeaseWindow(min(previous.deadline, candidate.deadline))
                if previous is not None and not renew
                else candidate
            )
        except LocalLeaseExpired:
            self.window = None
            self.journal.mark_expired()
            raise

    def _record_rejection(self, error: RunnerTransportError) -> None:
        if error.code in ("LEASE_EXPIRED", "STALE_ATTEMPT") or error.status in (
            401,
            403,
        ):
            self.window = None
            self.journal.mark_expired()
