"""Explicit submission/recovery only; no executor, new claim or lease renewal."""

from featherlane_contracts.finalization import FinalizationRequest, FinalizationStatus

from featherlane_runner.journal import ProtocolJournal
from featherlane_runner.storage import LocalStateError
from featherlane_runner.transport import RunnerTransport


def submit_finalization(
    journal: ProtocolJournal, transport: RunnerTransport, body: FinalizationRequest
) -> FinalizationStatus:
    """Caller holds StateStore.lock and supplies actual closed canonical evidence."""
    journal.prepare_finalization(body)
    attempt = journal.state.attempt
    receipt = transport.finalize_attempt(
        journal.state.credential, attempt.lease.attempt_id, body
    ).data
    journal.record_finalization_acceptance(receipt)
    return recover_finalization(journal, transport)


def recover_finalization(
    journal: ProtocolJournal, transport: RunnerTransport
) -> FinalizationStatus:
    attempt = journal.state.attempt
    if attempt is None or attempt.finalization_operation_id is None:
        raise LocalStateError("No persisted finalization intent to recover")
    status = transport.finalization_status(
        journal.state.credential, attempt.lease.attempt_id
    ).data
    journal.record_finalization_status(status)
    return status
