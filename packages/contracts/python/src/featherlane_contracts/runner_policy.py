"""Versioned aggregate reservation limits shared by runner event/evidence storage."""

from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, model_validator

from . import WireModel, _reject_boolean_constant

MIB = 1_048_576


class RunnerStoragePolicy(WireModel):
    schema_version: Annotated[Literal[1], BeforeValidator(_reject_boolean_constant)] = 1
    total_bytes: Annotated[int, Field(ge=MIB, le=500 * MIB)] = 500 * MIB
    event_bytes: Annotated[int, Field(ge=262_144, le=64 * MIB)] = 64 * MIB
    evidence_bytes: Annotated[int, Field(ge=0, le=435 * MIB)] = 435 * MIB
    metadata_bytes: Annotated[int, Field(ge=MIB, le=MIB)] = MIB
    max_reservations: Annotated[int, Field(ge=1, le=32)] = 32

    @model_validator(mode="after")
    def aggregate(self) -> "RunnerStoragePolicy":
        if (
            self.event_bytes + self.evidence_bytes + self.metadata_bytes
            > self.total_bytes
        ):
            raise ValueError("Storage sub-budgets must fit the one aggregate budget")
        return self
