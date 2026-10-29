"""Canonical attempt fencing and lease messages; no execution commands."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from featherlane_contracts import (
    ExecutionState,
    Identifier,
    SuccessEnvelope,
    UtcTimestamp,
    WireModel,
)
from featherlane_contracts.run_detail import ExecutionManifest, ExpectedTrial

RUNNER_CLAIMS_PATH = "/api/v1/runner/claims"
RUNNER_ATTEMPT_MANIFEST_PATH = "/api/v1/runner/attempts/{attemptId}/manifest"
RUNNER_ATTEMPT_HEARTBEAT_PATH = "/api/v1/runner/attempts/{attemptId}/heartbeat"

SafeSequence = Annotated[int, Field(ge=1, le=9_007_199_254_740_991)]


class ClaimRequest(WireModel):
    request_id: Identifier


class AttemptWrite(WireModel):
    lease_id: Identifier
    fencing_number: SafeSequence


class LeaseGrant(AttemptWrite):
    attempt_id: Identifier
    run_id: Identifier
    runner_id: Identifier
    project_id: Identifier
    expires_at: UtcTimestamp
    remaining_ttl_ms: Annotated[int, Field(ge=1, le=60_000)]
    policy_version: Literal["2"]
    heartbeat_interval_seconds: Literal[10]
    stopping_margin_seconds: Literal[10]
    last_heartbeat_sequence: Annotated[int, Field(ge=0, le=9_007_199_254_740_991)]


class AttemptHeartbeat(AttemptWrite):
    sequence: SafeSequence


class AttemptHeartbeatReceipt(WireModel):
    lease: LeaseGrant
    cancellation_requested: bool


class AttemptHeartbeatEnvelope(SuccessEnvelope[AttemptHeartbeatReceipt]):
    pass


class AttemptManifestRequest(AttemptWrite):
    observed_manifest: ExecutionManifest


class AttemptManifestReceipt(WireModel):
    lease: LeaseGrant
    observed_manifest: ExecutionManifest


class AttemptManifestEnvelope(SuccessEnvelope[AttemptManifestReceipt]):
    pass


class ClaimAssignment(WireModel):
    lease: LeaseGrant
    execution_state: ExecutionState
    requested_manifest: ExecutionManifest
    expected_trials: Annotated[list[ExpectedTrial], Field(min_length=1, max_length=100)]
    observed_manifest: ExecutionManifest | None

    @model_validator(mode="after")
    def current_assignment(self) -> "ClaimAssignment":
        if self.execution_state not in (
            ExecutionState.CLAIMED,
            ExecutionState.STARTING,
            ExecutionState.RUNNING,
            ExecutionState.FINALIZING,
        ):
            raise ValueError("A claim response must describe an active attempt")
        ids = [trial.id for trial in self.expected_trials]
        pairs = [
            (trial.scenario_id, trial.repetition_index)
            for trial in self.expected_trials
        ]
        if len(ids) != len(set(ids)) or len(pairs) != len(set(pairs)):
            raise ValueError("Expected trial identities must be unique")
        if any(
            trial.repetition_index > self.requested_manifest.repetitions
            for trial in self.expected_trials
        ):
            raise ValueError("Expected trials exceed admitted repetitions")
        return self


class ClaimEnvelope(SuccessEnvelope[ClaimAssignment]):
    pass
