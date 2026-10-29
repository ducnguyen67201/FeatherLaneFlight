"""Independent watchdog process; no HTTP, credentials or server lifecycle writes."""

import json
import math
import os
import selectors
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

from featherlane_runner.process_record import (
    ExecutionRecord,
    ExecutionStore,
    StopReason,
    group_absent,
    process_identity,
)
from featherlane_runner.storage import LocalStateError
from featherlane_runner.usage import UsageClock, UsageStore

GRACE_SECONDS = 2.0
KILL_WAIT_SECONDS = 2.0
POLL_SECONDS = 0.05


def valid_deadline(value: object, now: float) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and now < value <= now + 60
    )


def stop_child(
    store: ExecutionStore,
    record: ExecutionRecord,
    child: subprocess.Popen,
    reason: StopReason,
    clock: UsageClock | None = None,
) -> None:
    record.phase, record.reason = "STOPPING", reason
    # Persistence failure must not prevent the independent process stop.
    try:
        store.save_record(record)
    finally:
        # Popen has not reaped this direct child, so its PID cannot be reused
        # before the first signal. Only this fixed child owns its new group.
        if child.returncode is None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        try:
            child.wait(timeout=GRACE_SECONDS)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                child.wait(timeout=KILL_WAIT_SECONDS)
            except subprocess.TimeoutExpired:
                if clock is not None:
                    UsageStore.sample(clock, False)
                record.phase = "NEEDS_CLEANUP"
                store.save_record(record)
                return
    record.exit_code = child.returncode
    record.process_exited = child.returncode is not None
    if clock is not None and not clock.confirmed:
        UsageStore.sample(clock, record.process_exited)
    record.group_exited = group_absent(child.pid)
    if record.process_exited and record.group_exited:
        try:
            store.seal_output(record)
            record.cleanup_confirmed = True
        except (LocalStateError, OSError):
            record.cleanup_confirmed = False
    record.phase = "EXITED" if record.cleanup_confirmed else "NEEDS_CLEANUP"
    store.save_record(record)


def supervise(store: ExecutionStore, channel: socket.socket, stop_at: float) -> None:
    record = store.read_record()
    if record is None or record.phase != "PREPARED":
        raise RuntimeError("Missing prepared execution")
    read_fd, write_fd = os.pipe()
    child = None
    usage = UsageStore(store.directory)
    clock = None
    reason: StopReason = "SUPERVISOR_FAILED"
    try:
        child = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "featherlane_runner.standin",
                str(store.directory),
                str(read_fd),
            ],
            pass_fds=(read_fd,),
            start_new_session=True,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        clock = usage.begin(record)
        os.close(read_fd)
        read_fd = -1
        record.child = process_identity(child.pid)
        if record.child is None or record.child.pgid != child.pid:
            raise RuntimeError("Owned process identity unavailable")
        record.phase = "RUNNING"
        store.save_record(record)
        usage.save_clock(record, clock)
        if not valid_deadline(stop_at, time.monotonic()):
            reason = "LEASE_EXPIRED"
            return
        os.write(write_fd, b"G")
        channel.setblocking(False)
        pending = bytearray()
        with selectors.DefaultSelector() as selector:
            selector.register(channel, selectors.EVENT_READ)
            while True:
                now = time.monotonic()
                if now >= stop_at:
                    reason = "LEASE_EXPIRED"
                    return
                # A reaped child is never signaled again by stop_child.
                if child.poll() is not None:
                    UsageStore.sample(clock, True)
                    return
                for _, _ in selector.select(timeout=min(POLL_SECONDS, stop_at - now)):
                    chunk = channel.recv(4096)
                    if not chunk:
                        reason = "PARENT_LOST"
                        return
                    pending.extend(chunk)
                    if len(pending) > 4096:
                        return
                    while b"\n" in pending:
                        line, _, rest = pending.partition(b"\n")
                        pending = bytearray(rest)
                        message = json.loads(line)
                        if message.get("operation") == "stop":
                            reason = message["reason"]
                            return
                        now = time.monotonic()
                        if (
                            message.get("operation") != "deadline"
                            or now >= stop_at
                            or not valid_deadline(message.get("stop_at"), now)
                        ):
                            reason = "LEASE_EXPIRED"
                            return
                        stop_at = message["stop_at"]
    finally:
        if read_fd >= 0:
            os.close(read_fd)
        try:
            if child is not None:
                try:
                    stop_child(store, record, child, reason, clock)
                finally:
                    if clock is not None:
                        # Metering failure cannot prevent the physical stop.
                        usage.save_clock(record, clock)
        finally:
            os.close(write_fd)


def main() -> None:
    # lock_fd is inherited for the guardian lifetime; never passed to the child.
    directory, channel_fd, lock_fd, deadline = sys.argv[1:]
    with socket.socket(fileno=int(channel_fd)) as channel:
        try:
            supervise(ExecutionStore(Path(directory)), channel, float(deadline))
        finally:
            os.close(int(lock_fd))


if __name__ == "__main__":
    main()
