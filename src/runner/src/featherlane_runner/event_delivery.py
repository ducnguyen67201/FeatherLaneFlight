"""Required-event spooling uses the actual supervisor stop/confirmed-exit seam."""

import time

from featherlane_contracts.leases import LeaseGrant
from featherlane_contracts.run_detail import RunEvent

from featherlane_runner.event_spool import EventSpool, EvidenceBufferFull
from featherlane_runner.lease import LeaseWindow, LocalLeaseExpired
from featherlane_runner.storage import LocalStateError
from featherlane_runner.supervisor import StopResult, Supervisor
from featherlane_runner.transport import RunnerTransport, RunnerTransportError


class EventDeliveryStopped(Exception):
    def __init__(self, stop: StopResult):
        self.stop = stop


class RequiredEventDelivery:
    """Caller owns the active Supervisor context and live P13 response window.

    Prepare/reserve EventSpool before starting any process. A constructor failure
    must prevent launch. Never reconstruct LeaseWindow from a saved grant.
    """

    def __init__(self, spool: EventSpool, supervisor: Supervisor):
        self.spool = spool
        self.supervisor = supervisor

    def _require_owned(self) -> StopResult:
        current = self.supervisor.snapshot()
        if current is None or current.attempt_id != self.spool.attempt_id:
            raise LocalStateError(
                "The event spool does not own this supervised attempt"
            )
        return current

    def append(self, event: RunEvent) -> None:
        current = self._require_owned()
        if event.type == "CLEANUP_FINISHED" and not (
            current.process_exited
            and current.group_exited
            and current.cleanup_confirmed
            and event.payload.process_exited
        ):
            raise LocalStateError("Cleanup events require actual confirmed owned exit")
        try:
            self.spool.append(event)
        except EvidenceBufferFull:
            raise EventDeliveryStopped(
                self.supervisor.stop("EVIDENCE_BUFFER_FULL")
            ) from None

    def flush(
        self,
        transport: RunnerTransport,
        credential: str,
        lease: LeaseGrant,
        window: LeaseWindow,
    ) -> bool:
        """Retry required bytes using current authority in one bounded delivery."""
        self._require_owned()
        if lease.attempt_id != self.spool.attempt_id:
            raise LocalStateError("Lease and event spool identities differ")
        try:
            window.require_live(time.monotonic())
            batch = self.spool.batch(lease.lease_id, lease.fencing_number)
            if batch is None:
                return False
            receipt = transport.attempt_events(credential, lease.attempt_id, batch)
            self.spool.acknowledge(receipt.data)
            window.require_live(time.monotonic())
        except EvidenceBufferFull:
            raise EventDeliveryStopped(
                self.supervisor.stop("EVIDENCE_BUFFER_FULL")
            ) from None
        except LocalLeaseExpired:
            raise EventDeliveryStopped(self.supervisor.stop("LEASE_EXPIRED")) from None
        except RunnerTransportError as error:
            if error.code == "EVIDENCE_BUFFER_FULL":
                raise EventDeliveryStopped(
                    self.supervisor.stop("EVIDENCE_BUFFER_FULL")
                ) from None
            if error.code in {"LEASE_EXPIRED", "STALE_ATTEMPT"} or error.status == 401:
                raise EventDeliveryStopped(
                    self.supervisor.stop("LEASE_EXPIRED")
                ) from None
            # Network/transient errors preserve unacknowledged spool bytes. The
            # independent guardian still enforces the existing conservative deadline.
            raise
        return True
