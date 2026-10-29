"""Read only fixed, policy-approved evidence in an owned closed-output directory.

P14 supplies that ownership/closure boundary. This module cannot establish child
exit, reserve aggregate disk, launch work, declare readiness or finalize results.
"""

import hashlib
import os
import stat
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, BinaryIO

from featherlane_contracts.evidence import EvidenceUploadPolicy, ProcessDiagnostic
from featherlane_contracts.run_detail import ArtifactKind, Observation
from pydantic import Field, TypeAdapter, ValidationError

from featherlane_runner.supervisor import Supervisor

FILENAMES: dict[ArtifactKind, str] = {
    "OBSERVATIONS": "observations.json",
    "REDACTED_PROCESS_LOG": "process.redacted.jsonl",
    "PX4_ULOG": "flight.ulg",
}
OBSERVATIONS = TypeAdapter(Annotated[list[Observation], Field(max_length=10_000)])


class LocalEvidenceError(ValueError):
    """Safe local failure: no private paths or file contents in diagnostics."""


def redacted_diagnostics(records: Sequence[ProcessDiagnostic]) -> bytes:
    if len(records) > 1000:
        raise LocalEvidenceError("Too many process diagnostics.")
    return b"".join(record.model_dump_json().encode() + b"\n" for record in records)


def require_upload_policy(
    policy: EvidenceUploadPolicy, required_kinds: Sequence[ArtifactKind]
) -> None:
    if set(required_kinds) - set(policy.upload_kinds):
        raise LocalEvidenceError("Required evidence is blocked by local policy.")


@dataclass(frozen=True)
class MeasuredEvidence:
    kind: ArtifactKind
    byte_length: int
    sha256: str


def _regular(descriptor: int) -> os.stat_result:
    info = os.fstat(descriptor)
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_uid != os.getuid()
        or stat.S_IMODE(info.st_mode) not in (0o400, 0o600)
        or info.st_nlink != 1
    ):
        raise LocalEvidenceError("Evidence must be an owner-only regular file.")
    return info


def _identity(info: os.stat_result) -> tuple[int, int, int, int, int]:
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


@contextmanager
def open_closed_evidence(
    supervisor: Supervisor, kind: ArtifactKind, policy: EvidenceUploadPolicy
) -> Iterator[tuple[MeasuredEvidence, BinaryIO]]:
    """Consume the real P14 proof; a readonly path alone never establishes exit.

    The current stand-in produces only standin.txt and is deliberately rejected
    as canonical domain evidence. P14 retains original removal/reservation rights.
    """
    closed = supervisor.closed_output()
    stop = closed.stop
    if not (stop.process_exited and stop.group_exited and stop.cleanup_confirmed):
        raise LocalEvidenceError("Closed output ownership is not confirmed.")
    expected = next(
        (item for item in closed.files if item.name == FILENAMES[kind]), None
    )
    if expected is None:
        raise LocalEvidenceError("No owned canonical artifact of this kind exists.")
    with open_evidence(closed.directory, kind, policy) as (measured, stream):
        info = os.fstat(stream.fileno())
        if (
            info.st_dev != expected.device
            or info.st_ino != expected.inode
            or measured.byte_length != expected.size_bytes
            or measured.sha256 != expected.sha256
        ):
            raise LocalEvidenceError("Artifact does not match the closed-output proof.")
        yield measured, stream


@contextmanager
def open_evidence(
    output_directory: Path, kind: ArtifactKind, policy: EvidenceUploadPolicy
) -> Iterator[tuple[MeasuredEvidence, BinaryIO]]:
    """Keep the measured descriptor open for streaming; no API path is accepted.

    The caller must use the real P14 closed-output interface and the shared aggregate
    reservation before producing bytes. No second staging copy is created here.
    """
    require_upload_policy(policy, [kind])
    if (
        not output_directory.is_absolute()
        or any(p.is_symlink() for p in (output_directory, *output_directory.parents))
        or any((p / ".git").exists() for p in output_directory.parents)
    ):
        raise LocalEvidenceError("Expected the private owned output directory.")
    directory_fd = os.open(
        output_directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    )
    try:
        info = os.fstat(directory_fd)
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) not in (
            0o500,
            0o700,
        ):
            raise LocalEvidenceError("Attempt output must be owner-only.")
        try:
            descriptor = os.open(
                FILENAMES[kind],
                os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                dir_fd=directory_fd,
            )
        except OSError:
            raise LocalEvidenceError("Allowed evidence is unavailable.") from None
        with os.fdopen(descriptor, "rb") as stream:
            before = _regular(descriptor)
            limit = policy.byte_limit(kind)
            if before.st_size > limit:
                raise LocalEvidenceError("Evidence exceeds its local policy limit.")
            digest = hashlib.sha256()
            count = 0
            while chunk := stream.read(65_536):
                count += len(chunk)
                if count > limit:
                    raise LocalEvidenceError("Evidence grew beyond its policy limit.")
                digest.update(chunk)
            if _identity(before) != _identity(_regular(descriptor)):
                raise LocalEvidenceError("Evidence changed while being measured.")
            stream.seek(0)
            if kind == "REDACTED_PROCESS_LOG":
                try:
                    # Arbitrary process output, configuration/environment dumps
                    # and unknown fields cannot pass as redacted diagnostics.
                    for line in stream:
                        ProcessDiagnostic.model_validate_json(line)
                except ValueError:
                    raise LocalEvidenceError(
                        "Process diagnostics contain disallowed content."
                    ) from None
                stream.seek(0)
            elif kind == "OBSERVATIONS":
                # Reuse the canonical observation shape. P17 still owns
                # authoritative evaluation and trial/check/evidence binding.
                try:
                    OBSERVATIONS.validate_json(stream.read(limit + 1))
                except ValidationError:
                    raise LocalEvidenceError(
                        "Observation evidence has an invalid shape."
                    ) from None
                stream.seek(0)
            yield MeasuredEvidence(kind, count, digest.hexdigest()), stream
            if _identity(before) != _identity(_regular(descriptor)):
                raise LocalEvidenceError("Evidence changed during upload.")
    finally:
        os.close(directory_fd)
