"""One local stand-in slot. Server lease/fence and recovery binding is separate."""

import fcntl
import hashlib
import json
import os
import secrets
import socket
import stat
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from featherlane_contracts.usage import AttemptUsageObservation
from pydantic import TypeAdapter

from featherlane_runner.disk_budget import DiskBudget
from featherlane_runner.guardian import valid_deadline
from featherlane_runner.process_record import (
    ClosedFileRecord,
    ExecutionRecord,
    ExecutionStore,
    StopReason,
    group_absent,
    process_identity,
)
from featherlane_runner.storage import LocalStateError, StateStore
from featherlane_runner.usage import UsageStore


@dataclass(frozen=True)
class StopResult:
    attempt_id: str
    generation: str
    reason: StopReason | None
    process_exited: bool
    group_exited: bool
    cleanup_confirmed: bool
    exit_code: int | None


@dataclass(frozen=True)
class ClosedOutput:
    attempt_id: str
    generation: str
    directory: Path
    stop: StopResult
    files: tuple[ClosedFileRecord, ...]


class Supervisor:
    """Owns the same runner.lock as identity/protocol clients for this context.

    The guardian inherits this lock; network I/O never runs in the guardian.
    A caller must not nest this context inside StateStore.lock(). No command,
    executable, output path or endpoint is accepted from the server.
    """

    def __init__(self, store: StateStore, budget: DiskBudget):
        self.store = ExecutionStore(store.directory)
        self.budget = budget
        self._lock_fd: int | None = None
        self._guardian: subprocess.Popen | None = None
        self._channel: socket.socket | None = None

    def __enter__(self) -> "Supervisor":
        if self._lock_fd is not None:
            raise LocalStateError("Supervisor already entered")
        self.store.prepare()
        # Fail unsupported hosts before acquiring or starting any process.
        process_identity(os.getpid())
        fd = self.store._open(
            self.store.directory / "runner.lock", os.O_CREAT | os.O_RDWR
        )
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            os.close(fd)
            raise LocalStateError("Runner is already locked") from None
        self._lock_fd = fd
        return self

    def __exit__(self, *_: object) -> None:
        try:
            if self._guardian is not None and self._guardian.poll() is None:
                self.stop("SHUTDOWN")
        finally:
            if self._channel is not None:
                self._channel.close()
            if self._lock_fd is not None:
                os.close(self._lock_fd)
                self._lock_fd = None

    def _require_lock(self) -> None:
        if self._lock_fd is None:
            raise LocalStateError("Supervisor context is required")

    def snapshot(self) -> StopResult | None:
        self._require_lock()
        record = self.store.read_record()
        return self._result(record) if record else None

    @staticmethod
    def _result(record: ExecutionRecord) -> StopResult:
        return StopResult(
            record.attempt_id,
            record.generation,
            record.reason,
            record.process_exited,
            record.group_exited,
            record.cleanup_confirmed,
            record.exit_code,
        )

    def start_standin(self, attempt_id: str, *, stop_at_monotonic: float) -> Path:
        """Start the fixed diagnostic child with an already conservative deadline.

        This is a local stand-in seam, not normal admitted execution/qualification.
        LeaseWindow's stopping margin must already be applied by the real adapter.
        """
        self._require_lock()
        previous = self.store.read_record()
        if previous is not None and (
            not previous.cleanup_confirmed
            or (previous.removal_started and not previous.output_removed)
        ):
            raise LocalStateError("Explicit cleanup recovery is required")
        if self._guardian is not None:
            if self._guardian.poll() is None:
                raise LocalStateError("Previous guardian has not exited")
            if self._channel is not None:
                self._channel.close()
        if not valid_deadline(stop_at_monotonic, time.monotonic()):
            raise LocalStateError("A live bounded local deadline is required")
        record = ExecutionRecord(
            attempt_id=attempt_id,
            generation=uuid4().hex,
            recovery_token=secrets.token_hex(32),
            budget_directory=str(self.budget.directory),
            phase="PREPARED",
        )
        endpoint = self.store.recovery_socket(record)
        if len(os.fsencode(endpoint)) >= 104:
            raise LocalStateError("State directory exceeds Unix socket path limit")
        if endpoint.exists() or endpoint.is_symlink():
            info = endpoint.lstat()
            if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
                raise LocalStateError("Unexpected local recovery endpoint")
            endpoint.unlink()
        marker = self.store.directory / (
            "used-" + hashlib.sha256(attempt_id.encode()).hexdigest()
        )
        # A repeated attempt never gets a fresh process, including after restart.
        try:
            os.close(self.store._open(marker, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
        except FileExistsError:
            raise LocalStateError("Attempt has already used local execution") from None
        # Shared logical reservation remains charged until actual file removal.
        # It includes the original raw file; copies require separate reservations.
        reservation = self.budget.reserve(
            "p14-" + record.generation, attempt_id, "EVIDENCE", 128
        )
        reservation.mkdir(mode=0o700)
        output = reservation / "output"
        output.mkdir(mode=0o700)
        self.store.save_record(record)
        parent, child = socket.socketpair()
        try:
            self._guardian = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "featherlane_runner.guardian",
                    str(self.store.directory),
                    str(child.fileno()),
                    str(self._lock_fd),
                    str(stop_at_monotonic),
                ],
                pass_fds=(child.fileno(), self._lock_fd),
                start_new_session=True,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except OSError:
            parent.close()
            raise
        finally:
            child.close()
        parent.settimeout(0.5)
        self._channel = parent
        return output

    def _send(self, message: dict) -> None:
        self._require_lock()
        if self._channel is None or self._guardian is None:
            raise LocalStateError("No guardian is attached")
        try:
            self._channel.sendall(json.dumps(message).encode() + b"\n")
        except OSError:
            # EOF also asks an otherwise running guardian to stop independently.
            self._channel.close()
            raise LocalStateError("Guardian control is unavailable") from None

    def update_deadline(self, *, stop_at_monotonic: float) -> None:
        if not valid_deadline(stop_at_monotonic, time.monotonic()):
            raise LocalStateError("Invalid conservative deadline")
        self._send({"operation": "deadline", "stop_at": stop_at_monotonic})

    def stop(self, reason: StopReason) -> StopResult:
        reason = TypeAdapter(StopReason).validate_python(reason)
        self._require_lock()
        if self._guardian is not None and self._guardian.poll() is None:
            try:
                self._send({"operation": "stop", "reason": reason})
            except LocalStateError:
                # Closing the pipe is a stop signal; still require actual exit.
                pass
            try:
                self._guardian.wait(timeout=6)
            except subprocess.TimeoutExpired:
                raise LocalStateError("Guardian cleanup is unconfirmed") from None
        record = self.store.read_record()
        if record is None:
            raise LocalStateError("No execution record")
        return self._result(record)

    def recover(self) -> StopResult:
        """Authenticated self-stop for an orphan; never signal a recorded PID.

        PID/birth mismatch proves that process has gone, but any remaining group
        or inaccessible process still blocks cleanup. No server state is changed.
        """
        self._require_lock()
        if self._guardian is not None and self._guardian.poll() is None:
            raise LocalStateError("Stop the attached guardian first")
        record = self.store.read_record()
        if record is None or record.child is None:
            raise LocalStateError("No precise child identity to recover")
        if record.cleanup_confirmed:
            return self._result(record)
        record.phase, record.reason = "NEEDS_CLEANUP", "RECOVERY"
        self.store.save_record(record)
        current = process_identity(record.child.pid)
        if current == record.child:
            endpoint = self.store.recovery_socket(record)
            try:
                info = endpoint.lstat()
                if (
                    not stat.S_ISSOCK(info.st_mode)
                    or info.st_uid != os.getuid()
                    or stat.S_IMODE(info.st_mode) != 0o600
                ):
                    raise LocalStateError("Untrusted recovery endpoint")
                with socket.socket(socket.AF_UNIX) as connection:
                    connection.settimeout(0.2)
                    connection.connect(str(endpoint))
                    connection.sendall(record.recovery_token.encode("ascii"))
            except OSError:
                # A dead socket never permits a less precise process-name kill.
                return self._result(record)
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            record.process_exited = process_identity(record.child.pid) != record.child
            record.group_exited = group_absent(record.child.pgid)
            if record.process_exited and record.group_exited:
                try:
                    self.store.seal_output(record)
                    record.cleanup_confirmed, record.phase = True, "EXITED"
                except (LocalStateError, OSError):
                    record.cleanup_confirmed = False
                break
            time.sleep(0.05)
        self.store.save_record(record)
        UsageStore(self.store.directory).recovered(record)
        return self._result(record)

    def usage_snapshot(self) -> AttemptUsageObservation:
        """Observed P14 process interval and owned raw-output bytes, not spend."""
        self._require_lock()
        record = self.store.read_record()
        if record is None:
            raise LocalStateError("No execution record for usage")
        return UsageStore(self.store.directory).snapshot(
            self.store, record, self.budget
        )

    def closed_output(self) -> ClosedOutput:
        self._require_lock()
        record = self.store.read_record()
        return self._closed_output(record)

    def _closed_output(self, record: ExecutionRecord | None) -> ClosedOutput:
        if (
            record is None
            or not record.cleanup_confirmed
            or record.phase != "EXITED"
            or record.output_removed
            or record.removal_started
        ):
            raise LocalStateError("Output is not confirmed closed")
        info = self.store.output_directory(record).stat()
        if (info.st_dev, info.st_ino) != (
            record.output_device,
            record.output_inode,
        ) or self.store.inspect_output(record) != record.closed_files:
            raise LocalStateError("Closed output identity or bytes changed")
        return ClosedOutput(
            record.attempt_id,
            record.generation,
            self.store.output_directory(record),
            self._result(record),
            tuple(record.closed_files),
        )

    def remove_closed_output(self, closed: ClosedOutput | None = None) -> None:
        """Owner-only explicit removal; neither expiry nor an upload calls this.

        Only an exact closed directory can be removed. A crash after
        deletion retains its ledger charge; repeating this method releases it
        only after the entire reservation directory is actually absent.
        """
        self._require_lock()
        record = (
            self.store.read_closed_record(closed.generation)
            if closed
            else self.store.read_record()
        )
        if record is None or not record.cleanup_confirmed:
            raise LocalStateError("Confirmed cleanup is required before removal")
        if Path(record.budget_directory) != self.budget.directory:
            raise LocalStateError("Execution storage policy differs")
        reservation_id = "p14-" + record.generation
        reservation = self.budget.path_for(reservation_id)
        output = reservation / "output"
        if closed is not None and (
            closed.attempt_id != record.attempt_id or closed.directory != output
        ):
            raise LocalStateError("Closed-output handle differs from owner record")
        if output.exists() or output.is_symlink():
            if not record.removal_started:
                self._closed_output(record)
                record.removal_started = True
                self.store.save_closed_record(record)
            fd = os.open(output, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                info = os.fstat(fd)
                if (info.st_dev, info.st_ino) != (
                    record.output_device,
                    record.output_inode,
                ):
                    raise LocalStateError("Closed directory identity changed")
                os.fchmod(fd, 0o700)
                expected = {item.name: item for item in record.closed_files}
                if not set(os.listdir(fd)) <= expected.keys():
                    raise LocalStateError("Unknown files prevent original removal")
                for name in os.listdir(fd):
                    item = expected[name]
                    info = os.stat(item.name, dir_fd=fd, follow_symlinks=False)
                    if (info.st_dev, info.st_ino, info.st_size) != (
                        item.device,
                        item.inode,
                        item.size_bytes,
                    ):
                        raise LocalStateError("Closed file identity changed")
                    content_fd = os.open(
                        item.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=fd
                    )
                    with os.fdopen(content_fd, "rb") as stream:
                        if hashlib.sha256(stream.read(129)).hexdigest() != item.sha256:
                            raise LocalStateError("Closed file bytes changed")
                    os.unlink(item.name, dir_fd=fd)
                os.fsync(fd)
            finally:
                os.close(fd)
            output.rmdir()
        if reservation.exists() or reservation.is_symlink():
            # rmdir refuses unknown leftover files, symlinks and other owners.
            reservation.rmdir()
        self.budget.release(reservation_id, record.attempt_id)
        record.output_removed = True
        self.store.save_closed_record(record)
        current = self.store.read_record()
        if current is not None and current.generation == record.generation:
            self.store.save_record(record)
