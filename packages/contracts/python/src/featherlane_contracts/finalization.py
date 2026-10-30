"""Sealed runner observations and recoverable server evaluation receipts."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from featherlane_contracts import (
    Digest,
    Identifier,
    SuccessEnvelope,
    UtcTimestamp,
    WireModel,
)
from featherlane_contracts.leases import AttemptWrite
from featherlane_contracts.run_detail import Observation, TerminalReason, TrialView

RUNNER_FINALIZATION_PATH = "/api/v1/runner/attempts/{attemptId}/finalization"


class FinalizationCleanup(WireModel):
    process_exited: bool
    group_exited: bool
    cleanup_confirmed: bool
    exit_code: Annotated[int, Field(ge=-255, le=255)]

    @model_validator(mode="after")
    def confirmed(self) -> "FinalizationCleanup":
        if not (self.process_exited and self.group_exited and self.cleanup_confirmed):
            raise ValueError(
                "Finalization requires confirmed process and group cleanup"
            )
        return self


class FinalizedTrial(WireModel):
    id: Identifier
    scenario_id: Identifier
    repetition_index: Annotated[int, Field(ge=1, le=10)]
    execution_state: Literal["COMPLETED", "CANCELED", "ERROR", "SKIPPED"]
    observations: Annotated[list[Observation], Field(max_length=100)]
    artifact_ids: Annotated[list[Identifier], Field(max_length=20)]
    terminal_reason: TerminalReason | None

    @model_validator(mode="after")
    def unique_inputs(self) -> "FinalizedTrial":
        if len(set(self.artifact_ids)) != len(self.artifact_ids):
            raise ValueError("Artifact references must be unique")
        ids = [item.id for item in self.observations]
        if len(set(ids)) != len(ids):
            raise ValueError("Observation identities must be unique")
        if self.execution_state == "SKIPPED" and (
            self.observations or self.terminal_reason is None
        ):
            raise ValueError("Skipped work requires a reason and no observations")
        return self


class FinalizationRequest(AttemptWrite):
    operation_id: Identifier
    requested_manifest_digest: Digest
    observed_manifest_digest: Digest
    evaluator_version: Literal["1"]
    final_sequence: Annotated[int, Field(ge=1, le=2147483647)]
    cleanup: FinalizationCleanup
    trials: Annotated[list[FinalizedTrial], Field(min_length=1, max_length=100)]


class FinalizationAcceptance(WireModel):
    operation_id: Identifier
    attempt_id: Identifier
    input_digest: Digest
    evaluator_version: Literal["1"]
    accepted_at: UtcTimestamp
    deadline_at: UtcTimestamp


class FinalizationTerminal(WireModel):
    execution_state: Literal["COMPLETED", "CANCELED", "ERROR"]
    evaluation_outcome: Literal["PASS", "FAIL", "INCONCLUSIVE", "NOT_EVALUATED"]
    finished_at: UtcTimestamp
    terminal_reason: TerminalReason | None
    trials: Annotated[list[TrialView], Field(min_length=1, max_length=100)]


class FinalizationStatus(WireModel):
    acceptance: FinalizationAcceptance
    state: Literal["ACCEPTED", "FINISHED"]
    terminal: FinalizationTerminal | None

    @model_validator(mode="after")
    def consistent_state(self) -> "FinalizationStatus":
        if (self.state == "FINISHED") != (self.terminal is not None):
            raise ValueError("Finished state requires a terminal receipt")
        return self


class FinalizationAcceptanceEnvelope(SuccessEnvelope[FinalizationAcceptance]):
    pass


class FinalizationStatusEnvelope(SuccessEnvelope[FinalizationStatus]):
    pass
