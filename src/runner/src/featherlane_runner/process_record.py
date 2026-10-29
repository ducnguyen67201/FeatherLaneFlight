"""Private local execution evidence, separate from server lifecycle authority."""

from __future__ import annotations

import ctypes
import errno
import hashlib
import json
import os
import stat
import sys
import tempfile
from pathlib import Path
from typing import Literal

from featherlane_contracts import Identifier
from featherlane_contracts.cleanup import StopReason
from pydantic import BaseModel, ConfigDict, Field

from featherlane_runner.storage import LocalStateError, StateStore


class ProcessIdentity(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    pid: int = Field(gt=1)
    pgid: int = Field(gt=1)
    uid: int = Field(ge=0)
    birth_seconds: int = Field(gt=0)
    birth_microseconds: int = Field(ge=0, lt=1_000_000)


class _BsdInfo(ctypes.Structure):
    # Darwin public sys/proc_info.h: PROC_PIDTBSDINFO / struct proc_bsdinfo.
    _fields_ = (
        [
            (name, ctypes.c_uint32)
            for name in (
                "flags",
                "status",
                "xstatus",
                "pid",
                "ppid",
                "uid",
                "gid",
                "ruid",
                "rgid",
                "svuid",
                "svgid",
                "reserved",
            )
        ]
        + [("comm", ctypes.c_char * 16), ("name", ctypes.c_char * 32)]
        + [
            (name, ctypes.c_uint32)
            for name in (
                "nfiles",
                "pgid",
                "pjobc",
                "tdev",
                "tpgid",
            )
        ]
        + [
            ("nice", ctypes.c_int32),
            ("seconds", ctypes.c_uint64),
            ("microseconds", ctypes.c_uint64),
        ]
    )


def process_identity(pid: int) -> ProcessIdentity | None:
    """Use kernel birth time, never a process name or rounded ps timestamp.

    This initial stand-in implementation supports the selected macOS host only.
    An inaccessible process is uncertainty, not proof of exit.
    """
    if sys.platform != "darwin" or pid <= 1:
        raise LocalStateError("Process inspection is unsupported")
    library = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
    query = library.proc_pidinfo
    query.argtypes = [
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_uint64,
        ctypes.c_void_p,
        ctypes.c_int,
    ]
    query.restype = ctypes.c_int
    info = _BsdInfo()
    ctypes.set_errno(0)
    size = query(pid, 3, 0, ctypes.byref(info), ctypes.sizeof(info))
    if size != ctypes.sizeof(info):
        if size == 0 and ctypes.get_errno() == errno.ESRCH:
            return None
        raise LocalStateError("Process identity is unconfirmed")
    return ProcessIdentity(
        pid=info.pid,
        pgid=info.pgid,
        uid=info.uid,
        birth_seconds=info.seconds,
        birth_microseconds=info.microseconds,
    )


def group_absent(pgid: int) -> bool:
    if pgid <= 1 or pgid == os.getpgrp():
        return False
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return True
    except PermissionError:
        return False
    return False


class ExecutionRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: Literal[1] = 1
    attempt_id: Identifier
    generation: str = Field(pattern=r"^[a-f0-9]{32}$")
    recovery_token: str = Field(pattern=r"^[a-f0-9]{64}$", repr=False)
    budget_directory: str = Field(min_length=1, max_length=1024, repr=False)
    phase: Literal["PREPARED", "RUNNING", "STOPPING", "EXITED", "NEEDS_CLEANUP"]
    child: ProcessIdentity | None = None
    exit_code: int | None = None
    process_exited: bool = False
    group_exited: bool = False
    cleanup_confirmed: bool = False
    reason: StopReason | None = None
    closed_files: list[ClosedFileRecord] = Field(default_factory=list)
    output_device: int | None = None
    output_inode: int | None = None
    output_removed: bool = False
    removal_started: bool = False


RAW_OUTPUT_LIMIT_BYTES = 128


class ClosedFileRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, frozen=True)
    name: Literal["standin.txt"]
    device: int
    inode: int
    size_bytes: int = Field(ge=0, le=RAW_OUTPUT_LIMIT_BYTES)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


# Resolve the local on-disk model, not a second wire contract.
ExecutionRecord.model_rebuild()


class ExecutionStore(StateStore):
    def __init__(self, directory: Path):
        super().__init__(directory)
        self.record_path = self.directory / "execution.json"

    def read_record(self) -> ExecutionRecord | None:
        try:
            fd = self._open(self.record_path, os.O_RDONLY)
        except FileNotFoundError:
            return None
        with os.fdopen(fd, "rb") as stream:
            raw = stream.read(8193)
        if len(raw) > 8192:
            raise LocalStateError("Execution record exceeds its bound")
        return ExecutionRecord.model_validate_json(raw)

    def save_record(self, record: ExecutionRecord) -> None:
        if record.cleanup_confirmed:
            self.save_closed_record(record)
        self._save_at(self.record_path, record)

    def save_closed_record(self, record: ExecutionRecord) -> None:
        self._save_at(
            self.directory / ("closed-" + record.generation + ".json"), record
        )

    def read_closed_record(self, generation: str) -> ExecutionRecord:
        if len(generation) != 32 or any(
            c not in "0123456789abcdef" for c in generation
        ):
            raise LocalStateError("Invalid closed-output identity")
        fd = self._open(
            self.directory / ("closed-" + generation + ".json"), os.O_RDONLY
        )
        with os.fdopen(fd, "rb") as stream:
            raw = stream.read(8193)
        if len(raw) > 8192:
            raise LocalStateError("Closed record exceeds bound")
        return ExecutionRecord.model_validate_json(raw)

    def _save_at(self, destination: Path, record: ExecutionRecord) -> None:
        if destination.exists() or destination.is_symlink():
            os.close(self._open(destination, os.O_RDONLY))
        fd, temporary = tempfile.mkstemp(prefix=".execution-", dir=self.directory)
        try:
            with os.fdopen(fd, "w") as stream:
                json.dump(record.model_dump(mode="json"), stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, destination)
            fd = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def output_directory(self, record: ExecutionRecord) -> Path:
        reservation = (
            Path(record.budget_directory) / "reserved" / ("p14-" + record.generation)
        )
        StateStore(reservation).prepare()
        path = reservation / "output"
        if path.is_symlink() or not path.is_dir():
            raise LocalStateError("Attempt output directory is unavailable")
        info = path.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) not in (
            0o700,
            0o500,
        ):
            raise LocalStateError("Attempt output directory is not private")
        return path

    def recovery_socket(self, record: ExecutionRecord) -> Path:
        # One execution slot; keep within Darwin's short Unix socket path limit.
        return self.directory / "recovery.sock"

    def inspect_output(
        self, record: ExecutionRecord, *, seal: bool = False
    ) -> list[ClosedFileRecord]:
        """Seal only fixed owned stand-in output after confirmed process exit.

        A future adapter needs a real bounded writer/budget; accepting arbitrary
        child output through this narrow stand-in implementation is forbidden.
        """
        directory = self.output_directory(record)
        files = list(directory.iterdir())
        if len(files) > 1 or any(path.name != "standin.txt" for path in files):
            raise LocalStateError("Unexpected stand-in output")
        closed = []
        for path in files:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(fd, "rb") as stream:
                info = os.fstat(stream.fileno())
                if (
                    not stat.S_ISREG(info.st_mode)
                    or info.st_uid != os.getuid()
                    or info.st_nlink != 1
                    or info.st_size > RAW_OUTPUT_LIMIT_BYTES
                ):
                    raise LocalStateError("Untrusted or oversized stand-in output")
                raw = stream.read(RAW_OUTPUT_LIMIT_BYTES + 1)
                if len(raw) != info.st_size:
                    raise LocalStateError("Stand-in output changed")
                if seal:
                    os.fchmod(stream.fileno(), 0o400)
                    os.fsync(stream.fileno())
                elif stat.S_IMODE(info.st_mode) != 0o400:
                    raise LocalStateError("Output is not sealed")
                closed.append(
                    ClosedFileRecord(
                        name=path.name,
                        device=info.st_dev,
                        inode=info.st_ino,
                        size_bytes=info.st_size,
                        sha256=hashlib.sha256(raw).hexdigest(),
                    )
                )
        if seal:
            os.chmod(directory, 0o500)
        elif stat.S_IMODE(directory.stat().st_mode) != 0o500:
            raise LocalStateError("Output directory is not sealed")
        return closed

    def seal_output(self, record: ExecutionRecord) -> None:
        record.closed_files = self.inspect_output(record, seal=True)
        info = self.output_directory(record).stat()
        record.output_device, record.output_inode = info.st_dev, info.st_ino
