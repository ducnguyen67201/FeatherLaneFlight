"""Bounded durable typed event delivery; it does not run or stop processes.

The active supervisor MUST catch EvidenceBufferFull and use its real stop/exit
and cleanup path. Raising this exception alone does not establish a stopped run.
"""

import hashlib
import json
import os
import sqlite3
import stat
from contextlib import contextmanager

from featherlane_contracts.events import (
    MAX_BATCH_BYTES,
    MAX_EVENT_RECORDS,
    EventBatchReceipt,
    RunnerEventBatch,
)
from featherlane_contracts.run_detail import RunEvent
from pydantic import TypeAdapter

from featherlane_runner.disk_budget import BudgetFull, DiskBudget
from featherlane_runner.storage import LocalStateError, StateStore

_event = TypeAdapter(RunEvent)


class EvidenceBufferFull(Exception):
    """Required evidence could not be stored; the supervisor must stop safely."""


class SpoolConflict(Exception):
    pass


class EventSpool:
    def __init__(self, budget: DiskBudget, attempt_id: str):
        self.budget = budget
        self.attempt_id = attempt_id
        self.reservation_id = (
            "events_" + hashlib.sha256(attempt_id.encode()).hexdigest()
        )
        reserved_bytes = budget.policy.event_bytes
        try:
            self.directory = budget.reserve(
                self.reservation_id, attempt_id, "EVENTS", reserved_bytes
            )
        except BudgetFull:
            raise EvidenceBufferFull() from None
        self.directory.mkdir(mode=0o700, exist_ok=True)
        StateStore(self.directory).prepare()
        self.path = self.directory / "events.sqlite3"
        for entry in self.directory.iterdir():
            if entry.name not in {"events.sqlite3", "events.sqlite3-journal"}:
                raise LocalStateError("Unexpected event spool entry")
            info = entry.lstat()
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o600
                or info.st_nlink != 1
                or info.st_size > reserved_bytes // 2
            ):
                raise LocalStateError("Unsafe event spool file")
        try:
            descriptor = os.open(
                self.path, os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW, 0o600
            )
        except FileExistsError:
            pass
        else:
            os.fsync(descriptor)
            os.close(descriptor)
            directory_fd = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        self._db = sqlite3.connect(self.path, timeout=0, isolation_level=None)
        try:
            self._db.execute("PRAGMA page_size=4096")
            self._db.execute("PRAGMA journal_mode=DELETE")
            self._db.execute("PRAGMA synchronous=FULL")
            self._db.execute("PRAGMA temp_store=MEMORY")
            self._db.execute("PRAGMA cache_size=-1024")
            # Reserve the entire main database, worst-case rollback journal and
            # file overhead. Never use WAL, VACUUM or a second uncharged copy.
            page_limit = max(8, (reserved_bytes - 65_536) // (3 * 4096))
            actual_limit = self._db.execute(
                f"PRAGMA max_page_count={page_limit}"
            ).fetchone()[0]
            if actual_limit > page_limit:
                raise LocalStateError(
                    "Existing spool exceeds its bounded database size"
                )
            with self._transaction():
                self._db.execute(
                    "CREATE TABLE IF NOT EXISTS delivery ("
                    "singleton INTEGER PRIMARY KEY CHECK(singleton=1), "
                    "attempt TEXT NOT NULL, next_sequence INTEGER NOT NULL, "
                    "acknowledged INTEGER NOT NULL, sent_through INTEGER NOT NULL)"
                )
                self._db.execute(
                    "CREATE TABLE IF NOT EXISTS events ("
                    "sequence INTEGER PRIMARY KEY, event_id TEXT UNIQUE NOT NULL, "
                    "payload BLOB NOT NULL)"
                )
                self._db.execute(
                    "INSERT OR IGNORE INTO delivery VALUES (1, ?, 1, 0, 0)",
                    (attempt_id,),
                )
                if self._db.execute("SELECT attempt FROM delivery").fetchone() != (
                    attempt_id,
                ):
                    raise SpoolConflict()
        except BaseException:
            self._db.close()
            raise

    @contextmanager
    def _transaction(self):
        self._db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self._db.execute("COMMIT")
        except BaseException as error:
            if self._db.in_transaction:
                self._db.execute("ROLLBACK")
            if isinstance(
                error, sqlite3.OperationalError
            ) and error.sqlite_errorcode & 0xFF in (
                sqlite3.SQLITE_FULL,
                sqlite3.SQLITE_IOERR,
            ):
                raise EvidenceBufferFull() from None
            raise

    @property
    def next_sequence(self) -> int:
        return self._db.execute("SELECT next_sequence FROM delivery").fetchone()[0]

    def append(self, event: RunEvent) -> None:
        event = _event.validate_json(_event.dump_json(event))
        if event.attempt_id != self.attempt_id:
            raise SpoolConflict()
        encoded = _event.dump_json(event)
        if len(encoded) > MAX_BATCH_BYTES - 1024:
            raise EvidenceBufferFull()
        try:
            with self._transaction():
                previous = self._db.execute(
                    "SELECT payload FROM events WHERE sequence=?", (event.sequence,)
                ).fetchone()
                if previous is not None:
                    if previous[0] != encoded:
                        raise SpoolConflict()
                    return
                if event.sequence != self.next_sequence:
                    raise SpoolConflict()
                if (
                    self._db.execute("SELECT count(*) FROM events").fetchone()[0]
                    >= MAX_EVENT_RECORDS
                ):
                    raise EvidenceBufferFull()
                self._db.execute(
                    "INSERT INTO events VALUES (?, ?, ?)",
                    (event.sequence, event.event_id, encoded),
                )
                self._db.execute(
                    "UPDATE delivery SET next_sequence=?", (event.sequence + 1,)
                )
        except sqlite3.IntegrityError:
            raise SpoolConflict() from None

    def batch(self, lease_id: str, fencing_number: int) -> RunnerEventBatch | None:
        """Replay retained events with CURRENT lease authority, never saved grants."""
        with self._transaction():
            rows = self._db.execute(
                "SELECT payload FROM events ORDER BY sequence LIMIT 100"
            ).fetchall()
            events = []
            batch = None
            for (raw,) in rows:
                candidate = [*events, _event.validate_json(raw)]
                data = {
                    "schemaVersion": 1,
                    "leaseId": lease_id,
                    "fencingNumber": fencing_number,
                    "events": [
                        _event.dump_python(value, mode="json") for value in candidate
                    ],
                }
                # Use the canonical validator; do not return an oversized batch.
                if (
                    len(json.dumps(data, separators=(",", ":")).encode())
                    > MAX_BATCH_BYTES
                ):
                    break
                batch = RunnerEventBatch.model_validate_json(json.dumps(data))
                events = candidate
            if batch is not None:
                self._db.execute(
                    "UPDATE delivery SET sent_through=max(sent_through, ?)",
                    (batch.events[-1].sequence,),
                )
            return batch

    def acknowledge(self, receipt: EventBatchReceipt) -> None:
        receipt = EventBatchReceipt.model_validate_json(receipt.model_dump_json())
        with self._transaction():
            acknowledged, sent = self._db.execute(
                "SELECT acknowledged, sent_through FROM delivery"
            ).fetchone()
            if (
                receipt.attempt_id != self.attempt_id
                or receipt.acknowledged_sequence > sent
            ):
                raise SpoolConflict()
            if receipt.acknowledged_sequence < acknowledged:
                return
            self._db.execute(
                "DELETE FROM events WHERE sequence<=?", (receipt.acknowledged_sequence,)
            )
            self._db.execute(
                "UPDATE delivery SET acknowledged=?", (receipt.acknowledged_sequence,)
            )

    def close(self) -> None:
        """Close only; required spool files and their reservation remain durable."""
        self._db.close()
