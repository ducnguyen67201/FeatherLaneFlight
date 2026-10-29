"""Local private storage. Application metadata, never a path, gates visibility."""

import asyncio
import fcntl
import hashlib
import os
import re
import stat
import tempfile
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from featherlane_api.modules.evidence.ports import StoredArtifact

CHUNK_BYTES = 65_536


class ArtifactInvalid(ValueError):
    """Safe failure without file names, content or storage paths."""


class StagingFull(ValueError):
    pass


@dataclass(frozen=True)
class StagedArtifact:
    artifact: StoredArtifact
    path: Path


class LocalPrivateArtifactStorage:
    def __init__(
        self,
        root: Path,
        *,
        staging_limit_bytes: int = 524_288_000,
        staging_limit_files: int = 32,
    ):
        if not root.is_absolute() or not 1 <= staging_limit_bytes <= 524_288_000:
            raise ArtifactInvalid("Invalid private storage configuration.")
        if not 1 <= staging_limit_files <= 100:
            raise ArtifactInvalid("Invalid private staging file limit.")
        self.root = root
        self.staging = root / "staging"
        self.objects = root / "objects"
        self.staging_limit_bytes = staging_limit_bytes
        self.staging_limit_files = staging_limit_files

    def prepare(self) -> None:
        for directory in (self.root, self.staging, self.objects):
            if any(parent.is_symlink() for parent in (directory, *directory.parents)):
                raise ArtifactInvalid("Private storage cannot use symlinks.")
            directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            info = directory.stat()
            if (
                not stat.S_ISDIR(info.st_mode)
                or info.st_uid != os.getuid()
                or stat.S_IMODE(info.st_mode) != 0o700
            ):
                raise ArtifactInvalid("Private storage must be owner-only.")

    @staticmethod
    def _key(key: str) -> str:
        if re.fullmatch(r"[a-f0-9]{32}", key) is None:
            raise ArtifactInvalid("Expected a server-issued artifact key.")
        return key

    @staticmethod
    def _open(path: Path, flags: int) -> int:
        descriptor = os.open(path, flags | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
        info = os.fstat(descriptor)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != 0o600
            or info.st_nlink != 1
        ):
            os.close(descriptor)
            raise ArtifactInvalid("Expected a private regular artifact.")
        return descriptor

    @contextmanager
    def _lock(self) -> Iterator[None]:
        descriptor = self._open(self.root / "staging.lock", os.O_CREAT | os.O_RDWR)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX)
            yield
        finally:
            os.close(descriptor)

    def _usage(self) -> tuple[int, int]:
        entries = list(self.staging.iterdir())
        size = 0
        for path in entries:
            descriptor = self._open(path, os.O_RDONLY)
            try:
                size += os.fstat(descriptor).st_size
            finally:
                os.close(descriptor)
        return size, len(entries)

    def _new(self) -> tuple[int, str]:
        with self._lock():
            size, count = self._usage()
            if size >= self.staging_limit_bytes or count >= self.staging_limit_files:
                raise StagingFull("Private staging is full.")
            return tempfile.mkstemp(prefix="upload-", dir=self.staging)

    def _append(self, descriptor: int, chunk: bytes) -> None:
        with self._lock():
            size, _ = self._usage()
            if size + len(chunk) > self.staging_limit_bytes:
                raise StagingFull("Private staging byte limit exceeded.")
            remaining = memoryview(chunk)
            while remaining:
                written = os.write(descriptor, remaining)
                if written <= 0:
                    raise OSError("Private staging write failed.")
                remaining = remaining[written:]

    @asynccontextmanager
    async def stage(
        self, artifact: StoredArtifact, chunks: AsyncIterator[bytes]
    ) -> AsyncIterator[StagedArtifact]:
        """Yield only a fully verified private file, removing it on every exit.

        The caller rechecks authoritative lease/fence in its publication
        transaction before calling publish_staged. Streaming holds no DB locks.
        """
        self._key(artifact.key)
        self.prepare()
        descriptor, temporary = self._new()
        digest = hashlib.sha256()
        size = 0
        try:
            async for chunk in chunks:
                if not isinstance(chunk, bytes):
                    raise ArtifactInvalid("Expected a binary artifact stream.")
                size += len(chunk)
                if size > artifact.size_bytes:
                    raise ArtifactInvalid("Artifact exceeds its declared size.")
                for offset in range(0, len(chunk), CHUNK_BYTES):
                    part = chunk[offset : offset + CHUNK_BYTES]
                    # Each append accounts against all concurrent staged files.
                    # Keep append/cancellation atomic: no worker thread may write
                    # after its descriptor is closed by cancellation cleanup.
                    self._append(descriptor, part)
                    digest.update(part)
                    await asyncio.sleep(0)
            if size != artifact.size_bytes or digest.hexdigest() != artifact.sha256:
                raise ArtifactInvalid("Artifact size or SHA-256 does not match.")
            os.fsync(descriptor)
            yield StagedArtifact(artifact, Path(temporary))
        finally:
            os.close(descriptor)
            with self._lock():
                Path(temporary).unlink(missing_ok=True)

    @staticmethod
    def _sync_directory(path: Path) -> None:
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    def publish_staged(self, staged: StagedArtifact) -> None:
        """Publish without replacement; identical existing bytes are recoverable.

        Call only inside the application's current-authority publication gate.
        A private orphan after DB failure is not readable through the API.
        """
        artifact = staged.artifact
        destination = self.objects / self._key(artifact.key)
        if staged.path.parent != self.staging:
            raise ArtifactInvalid("Artifact is outside private staging.")
        descriptor = self._open(staged.path, os.O_RDONLY)
        try:
            if os.fstat(descriptor).st_size != artifact.size_bytes:
                raise ArtifactInvalid("Staged artifact changed before publication.")
        finally:
            os.close(descriptor)
        with self._lock():
            try:
                os.link(staged.path, destination, follow_symlinks=False)
            except FileExistsError:
                descriptor = self._open(destination, os.O_RDONLY)
                with os.fdopen(descriptor, "rb") as stream:
                    info = os.fstat(stream.fileno())
                    digest = hashlib.file_digest(stream, "sha256").hexdigest()
                if info.st_size != artifact.size_bytes or digest != artifact.sha256:
                    raise ArtifactInvalid("Immutable artifact conflicts.") from None
            else:
                # Hide the brief two-link publication window from staging quota
                # scans, then commit a single-link immutable object.
                staged.path.unlink()
            self._sync_directory(self.objects)
            self._sync_directory(self.staging)

    async def publish(
        self, artifact: StoredArtifact, chunks: AsyncIterator[bytes]
    ) -> None:
        async with self.stage(artifact, chunks) as staged:
            self.publish_staged(staged)

    async def read(self, key: str) -> AsyncIterator[bytes]:
        descriptor = self._open(self.objects / self._key(key), os.O_RDONLY)
        with os.fdopen(descriptor, "rb") as stream:
            while chunk := stream.read(CHUNK_BYTES):
                yield chunk
                await asyncio.sleep(0)

    def has_object(self, artifact: StoredArtifact) -> bool:
        try:
            stream = self.open_verified(artifact)
        except (OSError, ArtifactInvalid):
            return False
        stream.close()
        return True

    def open_verified(self, artifact: StoredArtifact) -> BinaryIO:
        descriptor = self._open(self.objects / self._key(artifact.key), os.O_RDONLY)
        if os.fstat(descriptor).st_size != artifact.size_bytes:
            os.close(descriptor)
            raise ArtifactInvalid("Verified content is unavailable.")
        return os.fdopen(descriptor, "rb")

    async def delete(self, key: str) -> None:
        (self.objects / self._key(key)).unlink(missing_ok=True)
        self._sync_directory(self.objects)
