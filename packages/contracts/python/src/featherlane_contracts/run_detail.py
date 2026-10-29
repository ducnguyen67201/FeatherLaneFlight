"""Bounded inspection contracts; evaluation and lifecycle remain server-owned."""

from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, model_validator

from . import (
    CheckOutcome,
    ContractVersion,
    Cursor,
    CursorMeta,
    Digest,
    DisplayName,
    EvaluationOutcome,
    Identifier,
    ProtocolVersion,
    RunListEntry,
    SuccessEnvelope,
    TrialExecutionState,
    UtcTimestamp,
    WireModel,
    _reject_boolean_constant,
)
from .usage import AttemptUsageSummary

Description = Annotated[str, Field(min_length=1, max_length=512)]
Count = Annotated[int, Field(ge=0, le=10000)]
ArtifactKind = Literal["PX4_ULOG", "OBSERVATIONS", "REDACTED_PROCESS_LOG"]


class CheckBase(WireModel):
    id: Identifier
    version: Annotated[int, Field(ge=1, le=1000000)]
    title: DisplayName
    expected: Description
    required_evidence_kinds: Annotated[
        list[ArtifactKind], Field(min_length=1, max_length=3)
    ]
    inconclusive_when: Description


class MissionCompletionCheck(CheckBase):
    kind: Literal["MISSION_COMPLETION"]
    unit: Literal["boolean"]
    threshold: None


class LandingDisarmCheck(CheckBase):
    kind: Literal["LANDING_DISARM"]
    unit: Literal["boolean"]
    threshold: None


class MetricThresholdCheck(CheckBase):
    kind: Literal["METRIC_THRESHOLD"]
    unit: Literal["s"]
    threshold: Annotated[float, Field(ge=0, le=86400)]


type CheckDefinition = Annotated[
    MissionCompletionCheck | LandingDisarmCheck | MetricThresholdCheck,
    Field(discriminator="kind"),
]


class ExecutionManifest(WireModel):
    runtime_family: Literal["PX4", "SYNTHETIC"] = "PX4"
    contract_version: ContractVersion
    protocol_version: ProtocolVersion
    build_id: Identifier
    build_digest: Digest
    configuration_digest: Digest
    suite_revision_id: Identifier
    suite_revision: Annotated[int, Field(ge=1, le=1000000)]
    suite_digest: Digest
    integration_profile_id: Identifier
    integration_profile_digest: Digest
    local_profile_id: Identifier
    local_profile_digest: Digest
    runner_version: DisplayName
    python_version: DisplayName
    mavsdk_version: DisplayName | None
    px4_version: DisplayName | None
    simulator: DisplayName
    vehicle_configuration: DisplayName | None
    operating_system: DisplayName
    architecture: DisplayName
    clock_policy: Literal["MONOTONIC_AND_SIMULATION"]
    speed_factor: Annotated[float, Field(gt=0, le=100)]
    randomization_policy: Literal["FIXED_SEED", "NONE"]
    random_seed: Annotated[int, Field(ge=0, le=2147483647)] | None
    repetitions: Annotated[int, Field(ge=1, le=10)]
    checks: Annotated[list[CheckDefinition], Field(min_length=1, max_length=100)]
    evidence_policy: Annotated[list[ArtifactKind], Field(min_length=1, max_length=3)]
    evaluator_version: DisplayName

    @model_validator(mode="after")
    def runtime_fields(self) -> "ExecutionManifest":
        real = (self.mavsdk_version, self.px4_version, self.vehicle_configuration)
        if self.runtime_family == "SYNTHETIC":
            if self.simulator != "FAKE" or any(value is not None for value in real):
                raise ValueError("Synthetic manifests cannot describe a PX4 runtime")
        elif self.simulator != "SIH" or any(value is None for value in real):
            raise ValueError("PX4 manifests require the complete SIH toolchain")
        return self


class ExpectedTrial(WireModel):
    id: Identifier
    scenario_id: Identifier
    repetition_index: Annotated[int, Field(ge=1, le=10)]
    random_seed: Annotated[int, Field(ge=0, le=2147483647)]


class TerminalReason(WireModel):
    code: Identifier
    message: Description


class RunAttempt(WireModel):
    id: Identifier
    observed_manifest: ExecutionManifest | None
    started_at: UtcTimestamp | None
    finished_at: UtcTimestamp | None
    terminal_reason: TerminalReason | None
    usage: AttemptUsageSummary | None = None


class ObservationBase(WireModel):
    id: Identifier
    check_id: Identifier
    check_version: Annotated[int, Field(ge=1, le=1000000)]
    key: Identifier
    aggregation: Literal["SINGLE_SAMPLE"]
    sample_count: Annotated[int, Field(ge=1, le=1000000)]
    source_clock: Literal["SIMULATION", "MONOTONIC"]
    monotonic_elapsed_ms: Annotated[float, Field(ge=0, le=86400000)]
    simulation_time_us: Annotated[str, Field(pattern=r"^(0|[1-9][0-9]{0,19})$")] | None
    artifact_ids: Annotated[list[Identifier], Field(max_length=20)]


class MetricObservation(ObservationBase):
    unit: Literal["s"]
    value: Annotated[float, Field(ge=-1000000000, le=1000000000)]
    comparison_direction: Literal["LOWER_IS_BETTER"]


class FlagObservation(ObservationBase):
    unit: Literal["boolean"]
    value: bool
    comparison_direction: Literal["EXPECTED_TRUE"]


type Observation = Annotated[
    MetricObservation | FlagObservation, Field(discriminator="unit")
]


class CheckResult(WireModel):
    check_id: Identifier
    outcome: CheckOutcome | None
    observation_id: Identifier | None
    artifact_ids: Annotated[list[Identifier], Field(max_length=20)]
    summary: Description


class TrialView(WireModel):
    id: Identifier
    attempt_id: Identifier | None
    scenario_id: Identifier
    scenario_title: DisplayName
    repetition_index: Annotated[int, Field(ge=1, le=10)]
    execution_state: TrialExecutionState
    evaluation_outcome: EvaluationOutcome
    started_at: UtcTimestamp | None
    finished_at: UtcTimestamp | None
    disturbance_verification: Literal[
        "NOT_REQUESTED", "PENDING", "VERIFIED", "UNVERIFIED"
    ]
    observation_summary: Annotated[list[Observation], Field(max_length=100)]
    check_results: Annotated[list[CheckResult], Field(max_length=100)]
    terminal_reason: TerminalReason | None


class ArtifactView(WireModel):
    id: Identifier
    attempt_id: Identifier
    trial_id: Identifier | None
    kind: ArtifactKind
    display_name: DisplayName
    media_type: Literal["application/octet-stream", "application/json", "text/plain"]
    byte_length: Annotated[int, Field(ge=0, le=1073741824)] | None
    sha256: Digest | None
    verification_state: Literal["PENDING", "VERIFIED", "FAILED", "NOT_VERIFIED"]
    created_at: UtcTimestamp | None
    expires_at: UtcTimestamp | None
    availability: Literal["AVAILABLE", "MISSING", "EXPIRED", "NOT_COLLECTED"]


class ArtifactSummary(WireModel):
    total_count: Count
    available_verified_count: Count
    missing_count: Count
    expired_count: Count


class TrialCounts(WireModel):
    scheduled: Count
    completed: Count
    failed_check: Count
    inconclusive: Count
    canceled: Count
    infrastructure_error: Count
    skipped: Count


class RunDetail(RunListEntry):
    requested_manifest: ExecutionManifest
    attempts: Annotated[list[RunAttempt], Field(max_length=10)]
    trials: Annotated[list[TrialView], Field(max_length=100)]
    checks: Annotated[list[CheckDefinition], Field(min_length=1, max_length=100)]
    artifact_summary: ArtifactSummary
    trial_counts: TrialCounts
    terminal_reason: TerminalReason | None
    server_event_cursor: Cursor
    snapshot_at: UtcTimestamp


class RunDetailEnvelope(SuccessEnvelope[RunDetail]):
    pass


class ArtifactListEnvelope(
    SuccessEnvelope[Annotated[list[ArtifactView], Field(max_length=100)]]
):
    pass


class EventBase(WireModel):
    schema_version: Annotated[Literal[1], BeforeValidator(_reject_boolean_constant)]
    event_id: Identifier
    attempt_id: Identifier
    trial_id: Identifier | None
    sequence: Annotated[int, Field(ge=1, le=2147483647)]
    wall_time_utc: UtcTimestamp
    monotonic_elapsed_ms: Annotated[float, Field(ge=0, le=86400000)]
    simulation_time_us: Annotated[str, Field(pattern=r"^(0|[1-9][0-9]{0,19})$")] | None


class StartingPayload(WireModel):
    profile_id: Identifier
    owned_process: bool


class TrialStartedPayload(WireModel):
    scenario_id: Identifier
    repetition_index: Annotated[int, Field(ge=1, le=10)]


class ReadinessPayload(WireModel):
    ready: bool


class MissionPayload(WireModel):
    mission_id: Identifier


class ObservationPayload(WireModel):
    observation_id: Identifier


class TrialFinishedPayload(WireModel):
    execution_state: TrialExecutionState


class CleanupPayload(WireModel):
    process_exited: bool


class AttemptStartingEvent(EventBase):
    type: Literal["ATTEMPT_STARTING"]
    payload: StartingPayload


class TrialStartedEvent(EventBase):
    type: Literal["TRIAL_STARTED"]
    payload: TrialStartedPayload


class ReadinessEvent(EventBase):
    type: Literal["READINESS_OBSERVED"]
    payload: ReadinessPayload


class MissionStartedEvent(EventBase):
    type: Literal["MISSION_STARTED"]
    payload: MissionPayload


class ObservationEvent(EventBase):
    type: Literal["OBSERVATION_RECORDED"]
    payload: ObservationPayload


class TrialFinishedEvent(EventBase):
    type: Literal["TRIAL_FINISHED"]
    payload: TrialFinishedPayload


class CleanupEvent(EventBase):
    type: Literal["CLEANUP_FINISHED"]
    payload: CleanupPayload


RunEvent = Annotated[
    AttemptStartingEvent
    | TrialStartedEvent
    | ReadinessEvent
    | MissionStartedEvent
    | ObservationEvent
    | TrialFinishedEvent
    | CleanupEvent,
    Field(discriminator="type"),
]


class RunEventRecord(WireModel):
    cursor: Cursor
    received_at: UtcTimestamp
    event: RunEvent


class RunEventPage(WireModel):
    data: Annotated[list[RunEventRecord], Field(max_length=100)]
    meta: CursorMeta


class CancelRunRequest(WireModel):
    schema_version: Annotated[Literal[1], BeforeValidator(_reject_boolean_constant)]
