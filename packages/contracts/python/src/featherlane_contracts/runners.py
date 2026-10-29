"""Runner enrollment and idle health; no execution or credential disclosure."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from featherlane_contracts import (
    ContractVersion,
    CursorMeta,
    Digest,
    DisplayName,
    Identifier,
    ProtocolVersion,
    RunnerCapacityState,
    RunnerConnectionState,
    SuccessEnvelope,
    UtcTimestamp,
    WireModel,
)
from featherlane_contracts.registration import (
    ExecutionTarget,
    LocalProfileDeclaration,
    RegisteredBuildDeclaration,
    Version,
)

RUNNER_ENROLLMENTS_PATH = "/api/v1/runner/enrollments"
RUNNER_IDENTITY_PATH = "/api/v1/runner/me"
RUNNER_HEARTBEAT_PATH = "/api/v1/runner/heartbeat"

SecretToken = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
VersionLabel = Annotated[
    str, Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
]


class CreateEnrollmentRequest(WireModel):
    display_name: DisplayName


class EnrollmentGrant(WireModel):
    id: Identifier
    project_id: Identifier
    display_name: DisplayName
    token: SecretToken = Field(repr=False)
    expires_at: UtcTimestamp


class EnrollmentGrantEnvelope(SuccessEnvelope[EnrollmentGrant]):
    pass


class EnrollRunnerRequest(WireModel):
    enrollment_token: SecretToken = Field(repr=False)
    request_id: Identifier
    credential: SecretToken = Field(repr=False)
    host_platform: DisplayName
    contract_version: VersionLabel
    protocol_version: VersionLabel


class RunnerDiagnostic(WireModel):
    code: Literal[
        "NOT_CONFIGURED",
        "INPUTS_DECLARED",
        "LOCAL_CLEANUP_REQUIRED",
        "LOCALLY_DISABLED",
    ]


class SyntheticReadiness(WireModel):
    """Measured local input readiness, without client-supplied qualification."""

    runtime_family: Literal["SYNTHETIC"]
    runtime_id: Literal["flf-synthetic-protocol-v1"]
    execution_mode: Literal["NON_EXECUTING"]
    supported_operations: Annotated[
        list[Literal["CLAIM", "MANIFEST", "HEARTBEAT"]],
        Field(min_length=3, max_length=3),
    ]
    runner_version: Literal["0.1.0"]
    python_version: Version
    execution_target: ExecutionTarget
    protocol_source_digest: Digest
    configuration_digest: Digest
    input_artifact_sha256: Digest
    build_ids: Annotated[list[Identifier], Field(min_length=1, max_length=100)]
    local_profile_ids: Annotated[list[Identifier], Field(min_length=1, max_length=100)]
    allowed_evidence_kinds: Annotated[
        list[Literal["OBSERVATIONS", "REDACTED_PROCESS_LOG"]],
        Field(min_length=1, max_length=2),
    ]
    maximum_artifact_bytes: Annotated[int, Field(ge=1, le=1_048_576)]

    @model_validator(mode="after")
    def unique_inventory(self) -> "SyntheticReadiness":
        for values in (
            self.build_ids,
            self.local_profile_ids,
            self.allowed_evidence_kinds,
        ):
            if len(set(values)) != len(values):
                raise ValueError("Readiness inventory entries must be unique")
        return self


class RunnerHeartbeat(WireModel):
    sequence: Annotated[int, Field(ge=1, le=9_007_199_254_740_991)]
    contract_version: VersionLabel
    protocol_version: VersionLabel
    capacity_state: Literal["AVAILABLE", "NEEDS_CLEANUP", "DISABLED"]
    available_builds: Annotated[list[RegisteredBuildDeclaration], Field(max_length=100)]
    local_profiles: Annotated[list[LocalProfileDeclaration], Field(max_length=100)]
    diagnostics: Annotated[list[RunnerDiagnostic], Field(max_length=10)]
    synthetic_readiness: SyntheticReadiness | None = None

    @model_validator(mode="after")
    def unique_declarations(self) -> "RunnerHeartbeat":
        for declarations in (self.available_builds, self.local_profiles):
            ids = [entry.id for entry in declarations]
            if len(ids) != len(set(ids)):
                raise ValueError("Declaration IDs must be unique")
        codes = [item.code for item in self.diagnostics]
        if len(codes) != len(set(codes)):
            raise ValueError("Diagnostic codes must be unique")
        return self


class RunnerSummary(WireModel):
    id: Identifier
    project_id: Identifier
    display_name: DisplayName
    connection_state: RunnerConnectionState
    capacity_state: RunnerCapacityState
    last_seen_at: UtcTimestamp | None
    contract_version: ContractVersion
    protocol_version: ProtocolVersion
    host_platform: DisplayName
    credential_expires_at: UtcTimestamp
    revoked_at: UtcTimestamp | None
    available_builds: Annotated[list[RegisteredBuildDeclaration], Field(max_length=100)]
    local_profiles: Annotated[list[LocalProfileDeclaration], Field(max_length=100)]
    diagnostics: Annotated[list[RunnerDiagnostic], Field(max_length=10)]
    capability_support: Literal["DECLARED"]
    synthetic_readiness: SyntheticReadiness | None = None


class RunnerIdentity(WireModel):
    runner: RunnerSummary
    heartbeat_interval_seconds: Literal[10]
    stale_after_seconds: Literal[30]
    offline_after_seconds: Literal[90]
    last_heartbeat_sequence: Annotated[int, Field(ge=0, le=9_007_199_254_740_991)]


class RunnerIdentityEnvelope(SuccessEnvelope[RunnerIdentity]):
    pass


class RunnerEnvelope(SuccessEnvelope[RunnerSummary]):
    pass


class RunnerListEnvelope(WireModel):
    data: Annotated[list[RunnerSummary], Field(max_length=100)]
    meta: CursorMeta
