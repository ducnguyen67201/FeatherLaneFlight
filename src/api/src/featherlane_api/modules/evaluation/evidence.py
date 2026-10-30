"""Full bounded reads through P16's private descriptor, outside SQL locks."""

import hashlib
from dataclasses import dataclass
from datetime import datetime

from featherlane_contracts.evidence import ProcessDiagnostic
from featherlane_contracts.run_detail import Observation
from pydantic import ValidationError

from featherlane_api.modules.evidence.content import OBSERVATIONS
from featherlane_api.modules.evidence.domain import SERVER_POLICY
from featherlane_api.modules.evidence.persistence import ArtifactRecord
from featherlane_api.modules.evidence.ports import StoredArtifact
from featherlane_api.modules.evidence.storage import (
    ArtifactInvalid,
    LocalPrivateArtifactStorage,
)


@dataclass(frozen=True)
class ValidatedArtifact:
    id: str
    kind: str
    trial_id: str | None
    sha256: str
    observations: tuple[Observation, ...]


def validate_artifact(
    row: ArtifactRecord, storage: LocalPrivateArtifactStorage, now: datetime
) -> ValidatedArtifact | None:
    if (
        row.state != "VERIFIED"
        or row.disposition != "UPLOAD"
        or row.verified_at is None
        or row.expires_at <= now
        or row.byte_length is None
        or row.sha256 is None
        or row.byte_length > SERVER_POLICY.byte_limit(row.kind)
        # There is no qualified PX4 topic/semantic parser in this phase.
        or row.kind == "PX4_ULOG"
    ):
        return None
    digest = hashlib.sha256()
    content = bytearray()
    try:
        with storage.open_verified(
            StoredArtifact(key=row.id, size_bytes=row.byte_length, sha256=row.sha256)
        ) as stream:
            while chunk := stream.read(65_536):
                if len(content) + len(chunk) > row.byte_length:
                    return None
                digest.update(chunk)
                content.extend(chunk)
        if len(content) != row.byte_length or digest.hexdigest() != row.sha256:
            return None
        observations: tuple[Observation, ...] = ()
        if row.kind == "OBSERVATIONS":
            observations = tuple(OBSERVATIONS.validate_json(bytes(content)))
            ids = [o.id for o in observations]
            if len(ids) != len(set(ids)):
                return None
        elif row.kind == "REDACTED_PROCESS_LOG":
            lines = content.splitlines()
            if not lines or len(lines) > 1000:
                return None
            diagnostics = [
                ProcessDiagnostic.model_validate_json(line) for line in lines
            ]
            exits = [d for d in diagnostics if d.event == "PROCESS_EXITED"]
            if (
                len(exits) != 1
                or exits[0].exit_code != 0
                or any(d.event == "CLEANUP_UNCONFIRMED" for d in diagnostics)
            ):
                return None
        else:
            return None
        return ValidatedArtifact(
            row.id, row.kind, row.trial_id, row.sha256, observations
        )
    except (ArtifactInvalid, FileNotFoundError, ValidationError, ValueError):
        # Invalid/missing evidence is a domain outcome, never a passing fallback.
        return None


def contains_observation(artifact: ValidatedArtifact, observation: Observation) -> bool:
    # Publication assigns the artifact ID after hashing its content. Embedded
    # observations therefore cannot refer to their own enclosing server ID.
    # Bind every semantic field exactly; add only authorized provenance links.
    return any(
        item.model_dump(exclude={"artifact_ids"})
        == observation.model_dump(exclude={"artifact_ids"})
        and set(item.artifact_ids).issubset(observation.artifact_ids)
        for item in artifact.observations
    )
