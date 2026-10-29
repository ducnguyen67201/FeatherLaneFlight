"""Observed supervisor intervals and storage snapshots, never monetary metering."""

from typing import Annotated, Literal

from pydantic import Field, model_validator

from featherlane_contracts import Identifier, UtcTimestamp, WireModel

ElapsedMs = Annotated[int, Field(ge=0, le=9_007_199_254_740_991)]
OwnedOutputBytes = Annotated[int, Field(ge=0, le=128)]


class AttemptUsageObservation(WireModel):
    source: Literal["LOCAL_SUPERVISOR"] = "LOCAL_SUPERVISOR"
    generation: Identifier
    clock_session_id: Identifier | None
    interval_status: Literal["UNAVAILABLE", "OBSERVED_LOWER_BOUND", "CONFIRMED"]
    observed_started_at: UtcTimestamp | None
    observed_exit_at: UtcTimestamp | None
    interval_observed_at: UtcTimestamp | None
    observed_elapsed_ms: ElapsedMs | None
    observed_at: UtcTimestamp
    storage_scope: Literal["P14_OWNED_OUTPUT"] = "P14_OWNED_OUTPUT"
    reserved_disk_bytes: OwnedOutputBytes | None
    retained_output_bytes: OwnedOutputBytes | None

    @model_validator(mode="after")
    def measured_interval(self) -> "AttemptUsageObservation":
        if self.interval_status == "UNAVAILABLE":
            if self.observed_elapsed_ms is not None:
                raise ValueError("Unavailable duration must remain unknown")
        elif any(
            value is None
            for value in (
                self.clock_session_id,
                self.observed_started_at,
                self.interval_observed_at,
                self.observed_elapsed_ms,
            )
        ):
            raise ValueError(
                "Measured intervals require clock and observation provenance"
            )
        if self.interval_status == "CONFIRMED" and self.observed_exit_at is None:
            raise ValueError("A confirmed interval requires observed process exit")
        return self


class AttemptUsageSummary(WireModel):
    attempt_id: Identifier
    operation_id: Identifier
    server_received_at: UtcTimestamp
    observation: AttemptUsageObservation
    max_observed_elapsed_ms: ElapsedMs | None
    max_elapsed_operation_id: Identifier | None
    cost_status: Literal["UNAVAILABLE"] = "UNAVAILABLE"
    cost_amount: None = None
    currency: None = None
