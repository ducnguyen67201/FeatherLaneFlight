"""Owner-only, atomic local state with a process lock on supported POSIX hosts."""

import fcntl
import json
import os
import stat
import tempfile
from contextlib import contextmanager
from pathlib import Path

from featherlane_contracts import Digest, Identifier
from featherlane_contracts.leases import AttemptHeartbeat, LeaseGrant
from featherlane_contracts.runners import RunnerHeartbeat, SecretToken
from pydantic import BaseModel, ConfigDict, Field


class LocalStateError(Exception):
    pass


class AttemptJournalEntry(BaseModel):
    """One durable assignment; recovery never grants a fresh local deadline."""

    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True, strict=True)
    claim_request_id: Identifier
    lease: LeaseGrant
    manifest_digest: Digest | None = None
    pending_heartbeat: AttemptHeartbeat | None = None
    terminal: bool = False


class RunnerState(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True, strict=True)
    origin: str
    credential: SecretToken = Field(repr=False)
    request_id: Identifier
    host_platform: str
    enrollment_token: SecretToken | None = Field(default=None, repr=False)
    runner_id: Identifier | None = None
    project_id: Identifier | None = None
    sequence: int = Field(default=0, ge=0, le=9_007_199_254_740_991)
    pending_heartbeat: RunnerHeartbeat | None = None
    pending_claim_id: Identifier | None = None
    attempt: AttemptJournalEntry | None = None


class StateStore:
    def __init__(self, directory: Path):
        self.directory = directory.expanduser().absolute()
        self.path = self.directory / "identity.json"

    def prepare(self) -> None:
        # Refuse a checkout location, symlinked ancestors and another user's files.
        for parent in (self.directory, *self.directory.parents):
            if parent.is_symlink() or (parent / ".git").exists():
                raise LocalStateError()
            if parent.exists():
                info = parent.stat()
                if (
                    info.st_uid not in (0, os.getuid())
                    or stat.S_IMODE(info.st_mode) & 0o022
                ):
                    raise LocalStateError()
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.directory.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise LocalStateError()

    def _open(self, path: Path, flags: int) -> int:
        descriptor = os.open(path, flags | os.O_NOFOLLOW, 0o600)
        info = os.fstat(descriptor)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != 0o600
            or info.st_nlink != 1
        ):
            os.close(descriptor)
            raise LocalStateError()
        return descriptor

    @contextmanager
    def lock(self):
        self.prepare()
        descriptor = self._open(self.directory / "runner.lock", os.O_CREAT | os.O_RDWR)
        try:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise LocalStateError() from None
            yield
        finally:
            os.close(descriptor)

    def read(self) -> RunnerState | None:
        try:
            descriptor = self._open(self.path, os.O_RDONLY)
        except FileNotFoundError:
            return None
        with os.fdopen(descriptor) as stream:
            raw = stream.read(262145)
        if len(raw) > 262144:
            raise LocalStateError()
        return RunnerState.model_validate_json(raw)

    def save(self, state: RunnerState) -> None:
        if self.path.exists() or self.path.is_symlink():
            descriptor = self._open(self.path, os.O_RDONLY)
            os.close(descriptor)
        descriptor, temporary = tempfile.mkstemp(
            prefix=".identity-", dir=self.directory
        )
        try:
            with os.fdopen(descriptor, "w") as stream:
                json.dump(state.model_dump(mode="json"), stream, separators=(",", ":"))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
            directory_fd = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
