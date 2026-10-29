"""Distinct runner batches and browser stream control; shared event variants."""

from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, model_validator

from . import Identifier, SuccessEnvelope, WireModel, _reject_boolean_constant
from .leases import AttemptWrite
from .run_detail import RunEvent, RunEventRecord

RUNNER_ATTEMPT_EVENTS_PATH = "/api/v1/runner/attempts/{attemptId}/events"
MAX_BATCH_BYTES = 262_144
MAX_BATCH_EVENTS = 100
MAX_EVENT_RECORDS = 10_000


class RunnerEventBatch(AttemptWrite):
    schema_version: Annotated[Literal[1], BeforeValidator(_reject_boolean_constant)]
    events: Annotated[list[RunEvent], Field(min_length=1, max_length=MAX_BATCH_EVENTS)]

    @model_validator(mode="after")
    def contiguous(self) -> "RunnerEventBatch":
        first = self.events[0]
        if any(
            event.attempt_id != first.attempt_id
            or event.sequence != first.sequence + offset
            for offset, event in enumerate(self.events)
        ):
            raise ValueError("A batch must contain contiguous events for one attempt")
        if len({event.event_id for event in self.events}) != len(self.events):
            raise ValueError("A batch cannot reuse event identities")
        if len(self.model_dump_json().encode()) > MAX_BATCH_BYTES:
            raise ValueError("Event batch exceeds the encoded byte limit")
        return self


class EventBatchReceipt(WireModel):
    attempt_id: Identifier
    acknowledged_sequence: Annotated[int, Field(ge=1, le=2147483647)]
    next_sequence: Annotated[int, Field(ge=2, le=2147483648)]

    @model_validator(mode="after")
    def next_contiguous(self) -> "EventBatchReceipt":
        if self.next_sequence != self.acknowledged_sequence + 1:
            raise ValueError(
                "Acknowledgment must identify the next contiguous sequence"
            )
        return self


class EventBatchEnvelope(SuccessEnvelope[EventBatchReceipt]):
    pass


class RunEventMessage(WireModel):
    schema_version: Annotated[Literal[1], BeforeValidator(_reject_boolean_constant)]
    type: Literal["RUN_EVENT"]
    record: RunEventRecord


class StreamResetMessage(WireModel):
    schema_version: Annotated[Literal[1], BeforeValidator(_reject_boolean_constant)]
    type: Literal["STREAM_RESET"]
    reason: Literal["CURSOR_EXPIRED"]


type BrowserStreamMessage = Annotated[
    RunEventMessage | StreamResetMessage, Field(discriminator="type")
]
