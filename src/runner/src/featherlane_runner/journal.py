"""Persist protocol intent before sending; an assignment is never started twice."""

from uuid import uuid4

from featherlane_contracts.cleanup import RunnerRecoveryReceipt
from featherlane_contracts.finalization import (
    FinalizationAcceptance,
    FinalizationRequest,
    FinalizationStatus,
)
from featherlane_contracts.leases import AttemptHeartbeat, ClaimRequest, LeaseGrant
from featherlane_contracts.registration import metadata_digest

from featherlane_runner.process_record import ExecutionStore
from featherlane_runner.storage import (
    AttemptJournalEntry,
    LocalStateError,
    RunnerState,
    StateStore,
)


def same_assignment(left: LeaseGrant, right: LeaseGrant) -> bool:
    return all(
        getattr(left, field) == getattr(right, field)
        for field in (
            "attempt_id",
            "run_id",
            "runner_id",
            "project_id",
            "lease_id",
            "fencing_number",
        )
    )


class ProtocolJournal:
    """Used under StateStore.lock; persisted grants are recovery data, not authority."""

    def __init__(self, store: StateStore, state: RunnerState):
        if state.runner_id is None or state.project_id is None:
            raise LocalStateError()
        self.store = store
        self.state = state

    def claim_request(self) -> ClaimRequest:
        execution = ExecutionStore(self.store.directory).read_record()
        if execution is not None and not execution.cleanup_confirmed:
            raise LocalStateError("Local orphan cleanup must precede a claim")
        attempt = self.state.attempt
        if attempt is not None and (
            attempt.terminal or attempt.finalization_operation_id
        ):
            # P14 owns explicit cleanup/recovery. Never auto-claim after loss.
            raise LocalStateError()
        if self.state.pending_claim_id is None:
            self.state.pending_claim_id = (
                attempt.claim_request_id if attempt is not None else uuid4().hex
            )
            self.store.save(self.state)
        return ClaimRequest(requestId=self.state.pending_claim_id)

    def record_claim(self, lease: LeaseGrant | None) -> None:
        request_id = self.state.pending_claim_id
        if request_id is None:
            raise LocalStateError()
        if lease is None:
            if self.state.attempt is not None:
                raise LocalStateError()
        else:
            self._require_owner(lease)
            attempt = self.state.attempt
            if attempt is None:
                self.state.attempt = AttemptJournalEntry(
                    claim_request_id=request_id, lease=lease
                )
            else:
                if (
                    request_id != attempt.claim_request_id
                    or not same_assignment(attempt.lease, lease)
                    or lease.last_heartbeat_sequence
                    < attempt.lease.last_heartbeat_sequence
                ):
                    raise LocalStateError()
                attempt.lease = lease
        self.state.pending_claim_id = None
        self.store.save(self.state)

    def renewal_request(self) -> AttemptHeartbeat:
        attempt = self._active()
        if attempt.pending_heartbeat is None:
            attempt.pending_heartbeat = AttemptHeartbeat(
                leaseId=attempt.lease.lease_id,
                fencingNumber=attempt.lease.fencing_number,
                sequence=attempt.lease.last_heartbeat_sequence + 1,
            )
            self.store.save(self.state)
        return attempt.pending_heartbeat

    def record_renewal(self, lease: LeaseGrant) -> None:
        attempt = self._active()
        self._require_owner(lease)
        if (
            not same_assignment(attempt.lease, lease)
            or attempt.pending_heartbeat is None
            or lease.last_heartbeat_sequence != attempt.pending_heartbeat.sequence
        ):
            raise LocalStateError()
        attempt.lease = lease
        attempt.pending_heartbeat = None
        self.store.save(self.state)

    def record_manifest(self, digest: str) -> None:
        attempt = self._active()
        if attempt.manifest_digest is not None and attempt.manifest_digest != digest:
            raise LocalStateError()
        attempt.manifest_digest = digest
        self.store.save(self.state)

    def mark_expired(self) -> None:
        attempt = self.state.attempt
        if attempt is not None:
            attempt.terminal = True
            attempt.pending_heartbeat = None
        self.store.save(self.state)

    def record_recovery(self, receipt: RunnerRecoveryReceipt) -> None:
        """Explicit server receipt plus local exit, never an automatic retry."""
        execution = ExecutionStore(self.store.directory).read_record()
        if (
            receipt.runner_id != self.state.runner_id
            or execution is None
            or execution.attempt_id != receipt.attempt_id
            or not execution.cleanup_confirmed
        ):
            raise LocalStateError("Recovery lacks matching local cleanup evidence")
        attempt = self.state.attempt
        if attempt is None:
            # A late receipt replay must not discard a later uncertain claim ID.
            return
        if attempt is not None and attempt.lease.attempt_id != receipt.attempt_id:
            raise LocalStateError("Recovery does not match the current journal")
        self.state.attempt = None
        self.state.pending_claim_id = None
        self.store.save(self.state)

    def _active(self) -> AttemptJournalEntry:
        attempt = self.state.attempt
        if attempt is None or attempt.terminal or attempt.finalization_operation_id:
            raise LocalStateError()
        return attempt

    def prepare_finalization(self, body: FinalizationRequest) -> None:
        """Persist intent before sending identical closed evidence."""
        attempt = self.state.attempt
        execution = ExecutionStore(self.store.directory).read_record()
        if (
            attempt is None
            or execution is None
            or execution.attempt_id != attempt.lease.attempt_id
            or not execution.cleanup_confirmed
            or not execution.process_exited
            or not execution.group_exited
            or execution.exit_code != body.cleanup.exit_code
            or body.lease_id != attempt.lease.lease_id
            or body.fencing_number != attempt.lease.fencing_number
            or body.observed_manifest_digest != attempt.manifest_digest
        ):
            raise LocalStateError(
                "Finalization requires matching closed local execution"
            )
        digest = metadata_digest(body)
        if attempt.finalization_operation_id is not None:
            if (
                attempt.finalization_operation_id,
                attempt.finalization_input_digest,
            ) != (body.operation_id, digest):
                raise LocalStateError("Finalization intent is immutable")
        elif attempt.terminal:
            raise LocalStateError()
        attempt.finalization_operation_id = body.operation_id
        attempt.finalization_input_digest = digest
        attempt.pending_heartbeat = None
        self.store.save(self.state)

    def record_finalization_acceptance(self, receipt: FinalizationAcceptance) -> None:
        attempt = self.state.attempt
        if attempt is None or (
            receipt.attempt_id,
            receipt.operation_id,
            receipt.input_digest,
        ) != (
            attempt.lease.attempt_id,
            attempt.finalization_operation_id,
            attempt.finalization_input_digest,
        ):
            raise LocalStateError(
                "Finalization receipt does not match persisted intent"
            )
        if (
            attempt.finalization_acceptance is not None
            and attempt.finalization_acceptance != receipt
        ):
            raise LocalStateError("Finalization acceptance changed")
        attempt.finalization_acceptance = receipt
        attempt.terminal = True
        self.store.save(self.state)

    def record_finalization_status(self, status: FinalizationStatus) -> None:
        self.record_finalization_acceptance(status.acceptance)
        if (status.state == "FINISHED") != (status.terminal is not None):
            raise LocalStateError("Invalid terminal finalization status")
        if status.terminal is not None:
            self.state.attempt.finalization_finished = True
            self.store.save(self.state)

    def _require_owner(self, lease: LeaseGrant) -> None:
        if (
            lease.runner_id != self.state.runner_id
            or lease.project_id != self.state.project_id
        ):
            raise LocalStateError()
