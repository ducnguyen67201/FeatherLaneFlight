"""Fenced cleanup diagnostics and explicit recovery; never execution authority."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from featherlane_contracts import (
    ExecutionState,
    Identifier,
    RunnerCapacityState,
    SuccessEnvelope,
    WireModel,
)
from featherlane_contracts.leases import AttemptWrite
from featherlane_contracts.usage import AttemptUsageObservation, AttemptUsageSummary

RUNNER_ATTEMPT_CLEANUP_PATH = "/api/v1/runner/attempts/{attemptId}/cleanup"
RUNNER_RECOVERY_PATH = "/api/v1/runner/recovery"

StopReason = Literal[
    "CANCELLATION_REQUESTED",
    "LEASE_EXPIRED",
    "PARENT_LOST",
    "EVIDENCE_BUFFER_FULL",
    "SHUTDOWN",
    "RECOVERY",
    "SUPERVISOR_FAILED",
]


class AttemptCleanupRequest(AttemptWrite):
    operation_id: Identifier
    reason: StopReason
    process_exited: bool
    group_exited: bool
    cleanup_confirmed: bool
    exit_code: Annotated[int, Field(ge=-255, le=255)] | None
    usage: AttemptUsageObservation | None = None

    @model_validator(mode="after")
    def confirmed_exit(self) -> "AttemptCleanupRequest":
        if self.cleanup_confirmed and not (self.process_exited and self.group_exited):
            raise ValueError("Cleanup requires child and process-group exit")
        if self.exit_code is not None and not self.process_exited:
            raise ValueError("Exit status requires confirmed child exit")
        if self.usage is not None:
            if self.usage.observed_exit_at is not None and not self.process_exited:
                raise ValueError("Usage exit observation requires process exit")
            if (
                self.usage.retained_output_bytes is not None
                and not self.cleanup_confirmed
            ):
                raise ValueError("Retained output measurement requires closed output")
        return self


class AttemptCleanupReceipt(WireModel):
    operation_id: Identifier
    attempt_id: Identifier
    execution_state: ExecutionState
    capacity_state: RunnerCapacityState
    cleanup_confirmed: bool
    diagnostic_only: bool
    usage: AttemptUsageSummary | None = None


class AttemptCleanupEnvelope(SuccessEnvelope[AttemptCleanupReceipt]):
    pass


class RunnerRecoveryRequest(AttemptWrite):
    operation_id: Identifier
    attempt_id: Identifier
    cleanup_operation_id: Identifier


class RunnerRecoveryReceipt(WireModel):
    operation_id: Identifier
    attempt_id: Identifier
    runner_id: Identifier
    capacity_state: Literal["DISABLED"]


class RunnerRecoveryEnvelope(SuccessEnvelope[RunnerRecoveryReceipt]):
    pass
