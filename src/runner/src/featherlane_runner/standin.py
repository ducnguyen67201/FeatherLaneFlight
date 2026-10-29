"""Fixed non-flight stand-in. No arbitrary command, imports, or descendants."""

import os
import selectors
import signal
import socket
import sys
from pathlib import Path

from featherlane_runner.process_record import ExecutionStore


def main() -> None:
    directory, gate_fd = sys.argv[1], int(sys.argv[2])
    store = ExecutionStore(Path(directory))
    record = store.read_record()
    if record is None:
        raise RuntimeError("Missing execution intent")
    gate = os.fdopen(gate_fd, "rb", buffering=0)
    stopping = False

    def request_stop(_signal: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, request_stop)
    with (
        socket.socket(socket.AF_UNIX) as listener,
        selectors.DefaultSelector() as selector,
    ):
        listener.bind(str(store.recovery_socket(record)))
        os.chmod(store.recovery_socket(record), 0o600)
        listener.listen(1)
        listener.setblocking(False)
        selector.register(listener, selectors.EVENT_READ)
        selector.register(gate, selectors.EVENT_READ)
        # Child cannot perform work before its precise identity is durable.
        if gate.read(1) != b"G":
            return
        diagnostic = store.output_directory(record) / "standin.txt"
        fd = store._open(diagnostic, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
        with os.fdopen(fd, "wb") as output:
            output.write(b"Fixed P14 stand-in started. No flight commands.\n")
            output.flush()
            while not stopping:
                for key, _ in selector.select(timeout=0.1):
                    if key.fileobj is gate:
                        # Guardian exit closes the pipe, including on SIGKILL.
                        return
                    connection, _ = listener.accept()
                    with connection:
                        connection.settimeout(0.2)
                        supplied = connection.recv(65)
                        if supplied == record.recovery_token.encode("ascii"):
                            output.write(b"Explicit orphan recovery requested.\n")
                            output.flush()
                            return
            output.write(b"Graceful stand-in shutdown.\n")
            output.flush()


if __name__ == "__main__":
    main()
