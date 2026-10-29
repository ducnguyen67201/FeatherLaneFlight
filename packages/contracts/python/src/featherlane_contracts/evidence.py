"""Evidence-specific local upload policy; no host paths enter wire contracts."""

from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, model_validator

from . import (
    Digest,
    Identifier,
    SuccessEnvelope,
    WireModel,
    _reject_boolean_constant,
)
from .leases import AttemptWrite
from .run_detail import ArtifactKind, ArtifactView

RUNNER_ARTIFACTS_PATH = "/api/v1/runner/attempts/{attemptId}/artifacts"
RUNNER_ARTIFACT_CONTENT_PATH = "/api/v1/runner/artifacts/{artifactId}/content"
ARTIFACT_CONTENT_PATH = "/api/v1/artifacts/{artifactId}/content"
RUN_ARTIFACTS_PATH = "/api/v1/runs/{runId}/artifacts"


class EvidenceUploadPolicy(WireModel):
    schema_version: Annotated[Literal[1], BeforeValidator(_reject_boolean_constant)] = 1
    upload_kinds: Annotated[list[ArtifactKind], Field(max_length=3)] = Field(
        default_factory=list
    )
    max_artifact_bytes: Annotated[int, Field(ge=1, le=104_857_600)] = 104_857_600
    max_observation_bytes: Annotated[int, Field(ge=1, le=10_485_760)] = 10_485_760
    max_process_log_bytes: Annotated[int, Field(ge=1, le=1_048_576)] = 1_048_576
    max_run_bytes: Annotated[int, Field(ge=1, le=524_288_000)] = 524_288_000
    max_run_artifacts: Annotated[int, Field(ge=1, le=100)] = 100

    @model_validator(mode="after")
    def unique_kinds(self) -> "EvidenceUploadPolicy":
        if len(set(self.upload_kinds)) != len(self.upload_kinds):
            raise ValueError("Evidence policy kinds must be unique.")
        return self

    def byte_limit(self, kind: ArtifactKind) -> int:
        specific = {
            "OBSERVATIONS": self.max_observation_bytes,
            "REDACTED_PROCESS_LOG": self.max_process_log_bytes,
            "PX4_ULOG": self.max_artifact_bytes,
        }
        return min(self.max_artifact_bytes, specific[kind], self.max_run_bytes)


class ArtifactDeclaration(AttemptWrite):
    request_id: Identifier
    trial_id: Identifier | None
    kind: ArtifactKind
    disposition: Literal["UPLOAD", "LOCAL_ONLY"]
    byte_length: Annotated[int, Field(ge=0, le=104_857_600)] | None
    sha256: Digest | None

    @model_validator(mode="after")
    def content_declaration(self) -> "ArtifactDeclaration":
        if self.disposition == "UPLOAD":
            if self.byte_length is None or self.sha256 is None:
                raise ValueError("An upload needs an exact size and SHA-256.")
        elif self.byte_length is not None or self.sha256 is not None:
            raise ValueError("Local-only declarations contain no content metadata.")
        return self


class ArtifactEnvelope(SuccessEnvelope[ArtifactView]):
    pass


class ProcessDiagnostic(WireModel):
    """Allowlisted process metadata, never arbitrary stdout/stderr or config."""

    event: Literal[
        "PROCESS_STARTED", "STOP_REQUESTED", "PROCESS_EXITED", "CLEANUP_UNCONFIRMED"
    ]
    monotonic_elapsed_ms: Annotated[int, Field(ge=0, le=86_400_000)]
    exit_code: Annotated[int, Field(ge=-255, le=255)] | None
