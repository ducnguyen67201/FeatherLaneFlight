"""Crash-conservative logical byte reservations for private runner staging.

P15 and P16 share ONE root and policy. Consumers reserve their complete worst-case
file size (including temporary copies) before writing, enforce that bound while
streaming, fsync required data, then remove all reserved files before release.
This ledger does not inspect artifact contents or grant upload/execution rights.
"""

import fcntl
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Literal

from featherlane_contracts import Identifier
from featherlane_contracts.runner_policy import RunnerStoragePolicy
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

from featherlane_runner.storage import LocalStateError, StateStore

StorageKind = Literal["EVENTS", "EVIDENCE"]
_identifier = TypeAdapter(Identifier)
MAX_LEDGER_BYTES = 65_536


class BudgetFull(Exception):
    """The aggregate, category or allocation-count limit would be exceeded."""


class BudgetBusy(Exception):
    """Another short ledger transaction is active; retry without writing bytes."""


class Reservation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    attempt_id: Identifier
    kind: StorageKind
    byte_limit: int = Field(ge=0, le=500 * 1_048_576)


class _Ledger(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    policy: RunnerStoragePolicy
    reservations: dict[Identifier, Reservation] = Field(max_length=32)


class DiskBudget:
    def __init__(self, directory: Path, policy: RunnerStoragePolicy):
        self.directory = directory.expanduser().absolute()
        self.policy = policy
        self._state = StateStore(self.directory)
        self._ledger_path = self.directory / "disk-budget.json"
        self._data = self.directory / "reserved"

    def path_for(self, reservation_id: str) -> Path:
        """A private directory for this reservation, never a caller-selected path.

        Contents are bounded by the consumer to at most four filesystem entries
        (including subdirectories). The consumer owns safe file creation, size
        enforcement and deletion. Metadata allowance is separate from data bytes.
        """
        return self._data / _identifier.validate_python(reservation_id)

    @contextmanager
    def _locked(self):
        self._state.prepare()
        descriptor = self._state._open(
            self.directory / "disk-budget.lock", os.O_CREAT | os.O_RDWR
        )
        try:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise BudgetBusy() from None
            # An interrupted ledger replacement never supersedes the last fsynced
            # ledger. Reclaim only our private temporary metadata under its lock.
            for temporary in self.directory.glob(".disk-budget-*"):
                checked = self._state._open(temporary, os.O_RDONLY)
                os.close(checked)
                temporary.unlink()
            self._data.mkdir(mode=0o700, exist_ok=True)
            StateStore(self._data).prepare()
            yield
        finally:
            os.close(descriptor)

    def _read(self) -> _Ledger:
        try:
            descriptor = self._state._open(self._ledger_path, os.O_RDONLY)
        except FileNotFoundError:
            ledger = _Ledger(policy=self.policy, reservations={})
        else:
            with os.fdopen(descriptor, "rb") as stream:
                raw = stream.read(MAX_LEDGER_BYTES + 1)
            if len(raw) > MAX_LEDGER_BYTES:
                raise LocalStateError()
            ledger = _Ledger.model_validate_json(raw)
        if ledger.policy != self.policy:
            raise LocalStateError("Storage policy changed; reconcile offline first")
        for path in self._data.iterdir():
            if path.is_symlink() or path.name not in ledger.reservations:
                raise LocalStateError("Unaccounted private staging requires cleanup")
            StateStore(path).prepare()
        self._check(ledger)
        return ledger

    def _check(self, ledger: _Ledger) -> None:
        if len(ledger.reservations) > self.policy.max_reservations:
            raise BudgetFull()
        amounts = {kind: 0 for kind in ("EVENTS", "EVIDENCE")}
        for item in ledger.reservations.values():
            amounts[item.kind] += item.byte_limit
        if (
            amounts["EVENTS"] > self.policy.event_bytes
            or amounts["EVIDENCE"] > self.policy.evidence_bytes
            or sum(amounts.values()) + self.policy.metadata_bytes
            > self.policy.total_bytes
        ):
            raise BudgetFull()

    def _save(self, ledger: _Ledger) -> None:
        raw = ledger.model_dump_json().encode()
        if len(raw) > MAX_LEDGER_BYTES:
            raise BudgetFull()
        descriptor, temporary = tempfile.mkstemp(
            prefix=".disk-budget-", dir=self.directory
        )
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self._ledger_path)
            root_fd = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(root_fd)
            finally:
                os.close(root_fd)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def reserve(
        self, reservation_id: str, attempt_id: str, kind: StorageKind, byte_limit: int
    ) -> Path:
        """Idempotently reserve bytes, durably, BEFORE creating/writing its directory.

        Reusing an ID with a different attempt, category or size is a conflict.
        Fixed reservations have no resize operation: reserve a separate copy
        before writing it. Zero-byte files still consume a bounded ledger slot.
        No automatic reservation expiry: process exit does not imply file removal.
        The ledger lock is internal, short-lived, non-reentrant; do not hold it
        while calling this API. A supervisor may hold its distinct runner lock.
        """
        path = self.path_for(reservation_id)
        item = Reservation(attempt_id=attempt_id, kind=kind, byte_limit=byte_limit)
        with self._locked():
            ledger = self._read()
            existing = ledger.reservations.get(reservation_id)
            if existing is not None and existing != item:
                raise LocalStateError("Reservation identity conflicts")
            ledger.reservations[reservation_id] = item
            self._check(ledger)
            self._save(ledger)
        return path

    def release(self, reservation_id: str, attempt_id: str) -> None:
        """Release only after the consumer removed its entire private directory."""
        path = self.path_for(reservation_id)
        with self._locked():
            ledger = self._read()
            existing = ledger.reservations.get(reservation_id)
            if existing is not None and existing.attempt_id != attempt_id:
                raise LocalStateError("Reservation owner conflicts")
            if path.exists() or path.is_symlink():
                raise LocalStateError("Reserved files must be removed before release")
            ledger.reservations.pop(reservation_id, None)
            self._save(ledger)

    def reservations(self) -> dict[str, Reservation]:
        """Read durable accounting; missing directories still retain their charge."""
        with self._locked():
            return self._read().reservations
