"""Private guardian-clock sidecars; missing intervals stay unknown across recovery."""

import json
import os
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from featherlane_contracts import Identifier, UtcTimestamp
from featherlane_contracts.usage import AttemptUsageObservation, ElapsedMs
from pydantic import BaseModel, ConfigDict, Field

from featherlane_runner.disk_budget import BudgetBusy, DiskBudget
from featherlane_runner.process_record import ExecutionRecord, ExecutionStore
from featherlane_runner.storage import LocalStateError, StateStore


def utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class UsageClock(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    generation: Identifier
    clock_session_id: Identifier
    observed_started_at: UtcTimestamp
    start_monotonic_ns: int = Field(ge=0)
    observed_elapsed_ms: ElapsedMs
    interval_observed_at: UtcTimestamp
    observed_exit_at: UtcTimestamp | None = None
    confirmed: bool = False


class UsageStore(StateStore):
    def _path(self, record: ExecutionRecord) -> Path:
        return self.directory / ("usage-" + record.generation + ".json")

    @staticmethod
    def begin(record: ExecutionRecord) -> UsageClock:
        now = utc_now()
        return UsageClock(
            generation=record.generation,
            clock_session_id=uuid4().hex,
            observed_started_at=now,
            start_monotonic_ns=time.monotonic_ns(),
            observed_elapsed_ms=0,
            interval_observed_at=now,
        )

    def read_clock(self, record: ExecutionRecord) -> UsageClock | None:
        try:
            fd = self._open(self._path(record), os.O_RDONLY)
        except FileNotFoundError:
            return None
        with os.fdopen(fd, "rb") as stream:
            raw = stream.read(4097)
        if len(raw) > 4096:
            raise LocalStateError("Usage sidecar exceeds its bound")
        clock = UsageClock.model_validate_json(raw)
        if clock.generation != record.generation:
            raise LocalStateError("Usage sidecar belongs to another execution")
        return clock

    def save_clock(self, record: ExecutionRecord, clock: UsageClock) -> None:
        path = self._path(record)
        if path.exists() or path.is_symlink():
            os.close(self._open(path, os.O_RDONLY))
        fd, temporary = tempfile.mkstemp(prefix=".usage-", dir=self.directory)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(clock.model_dump(mode="json"), stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
            fd = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    @staticmethod
    def sample(clock: UsageClock, process_exited: bool) -> None:
        # Called only by the original guardian; never by a restarted controller.
        elapsed = time.monotonic_ns() - clock.start_monotonic_ns
        if elapsed < 0:
            raise LocalStateError("Guardian clock domain changed")
        clock.observed_elapsed_ms = elapsed // 1_000_000
        clock.interval_observed_at = utc_now()
        clock.confirmed = process_exited
        clock.observed_exit_at = clock.interval_observed_at if clock.confirmed else None

    def recovered(self, record: ExecutionRecord) -> None:
        clock = self.read_clock(record)
        if clock is None or clock.confirmed:
            return
        # Preserve the old measured lower bound. A new process cannot close the
        # original guardian's continuous interval by subtracting wall timestamps.
        if record.process_exited:
            clock.observed_exit_at = utc_now()
        self.save_clock(record, clock)

    def snapshot(
        self, store: ExecutionStore, record: ExecutionRecord, budget: DiskBudget
    ) -> AttemptUsageObservation:
        clock = self.read_clock(record)
        status = "UNAVAILABLE"
        if clock is not None:
            status = (
                "CONFIRMED"
                if clock.confirmed and record.process_exited
                else "OBSERVED_LOWER_BOUND"
            )
        reserved = None
        try:
            reservation = budget.reservations().get("p14-" + record.generation)
            if reservation is not None and reservation.attempt_id == record.attempt_id:
                reserved = reservation.byte_limit
            elif reservation is None and record.output_removed:
                reserved = 0
        except (BudgetBusy, LocalStateError, OSError):
            # A missing storage observation is visible as null, never zero/free.
            pass
        retained = None
        if record.output_removed:
            retained = 0
        elif record.cleanup_confirmed:
            try:
                info = store.output_directory(record).stat()
                if (info.st_dev, info.st_ino) == (
                    record.output_device,
                    record.output_inode,
                ) and store.inspect_output(record) == record.closed_files:
                    retained = sum(item.size_bytes for item in record.closed_files)
            except (LocalStateError, OSError):
                pass
        return AttemptUsageObservation(
            generation=record.generation,
            clockSessionId=clock.clock_session_id if clock else None,
            intervalStatus=status,
            observedStartedAt=clock.observed_started_at if clock else None,
            observedExitAt=clock.observed_exit_at
            if clock and record.process_exited
            else None,
            intervalObservedAt=clock.interval_observed_at if clock else None,
            observedElapsedMs=clock.observed_elapsed_ms if clock else None,
            observedAt=utc_now(),
            reservedDiskBytes=reserved,
            retainedOutputBytes=retained,
        )
