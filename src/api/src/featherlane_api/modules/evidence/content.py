"""Bounded shape checks; byte verification is not semantic result evaluation."""

from typing import Annotated

from featherlane_contracts.evidence import ProcessDiagnostic
from featherlane_contracts.run_detail import ArtifactKind, Observation
from pydantic import Field, TypeAdapter, ValidationError

from featherlane_api.modules.evidence.domain import invalid
from featherlane_api.modules.evidence.storage import StagedArtifact

OBSERVATIONS = TypeAdapter(Annotated[list[Observation], Field(max_length=10_000)])


def require_content(kind: ArtifactKind, staged: StagedArtifact) -> None:
    try:
        with staged.path.open("rb") as stream:
            if kind == "OBSERVATIONS":
                OBSERVATIONS.validate_json(stream.read(10_485_761))
            elif kind == "REDACTED_PROCESS_LOG":
                for index, line in enumerate(stream):
                    if index >= 1000:
                        raise invalid()
                    ProcessDiagnostic.model_validate_json(line)
            else:
                header = stream.read(16)
                # PX4 ULog format: 7 magic bytes, version 1, 8-byte timestamp.
                # This only rejects mislabelled inputs; P17 checks required topics
                # and semantics. It does not qualify a real PX4 integration.
                if len(header) != 16 or header[:8] != b"ULog\x01\x12\x35\x01":
                    raise invalid("A supported ULog header is required.")
    except ValidationError:
        raise invalid(
            "Artifact content does not match its declared evidence kind."
        ) from None
