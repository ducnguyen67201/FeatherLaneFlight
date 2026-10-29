"""Server cursor authenticity and bounded, server-side observation ordering."""

import base64
import hashlib
import hmac
import json
from typing import Literal

from featherlane_contracts import ErrorCode
from featherlane_contracts.events import MAX_EVENT_RECORDS
from featherlane_contracts.run_detail import ExecutionManifest, ExpectedTrial, RunEvent
from pydantic import BaseModel, ConfigDict, Field

from featherlane_api.http.errors import ApiError

MAX_EVENTS_PER_RUN = MAX_EVENT_RECORDS
MAX_POSITION = 9_007_199_254_740_991


def expired_cursor() -> ApiError:
    return ApiError(410, ErrorCode.CURSOR_EXPIRED, "Resume from a fresh run snapshot.")


class EventCursors:
    def __init__(self, key: str):
        self._key = hashlib.sha256(("flf-event-cursor-v1:" + key).encode()).digest()

    def encode(self, run_id: str, position: int) -> str:
        if type(position) is not int or not 0 <= position <= MAX_POSITION:
            raise ValueError("Event position is outside the wire-safe range")
        raw = json.dumps([1, run_id, position], separators=(",", ":")).encode()
        signature = hmac.digest(self._key, raw, "sha256")
        return base64.urlsafe_b64encode(raw + signature).rstrip(b"=").decode()

    def decode(self, run_id: str, cursor: str, *, floor: int, latest: int) -> int:
        if not cursor.isascii() or not 1 <= len(cursor) <= 512:
            raise expired_cursor()
        try:
            encoded = cursor.encode()
            raw = base64.b64decode(
                encoded + b"=" * (-len(encoded) % 4), altchars=b"-_", validate=True
            )
            if len(raw) <= 32:
                raise ValueError()
            body, signature = raw[:-32], raw[-32:]
            if not hmac.compare_digest(
                signature, hmac.digest(self._key, body, "sha256")
            ):
                raise ValueError()
            version, resource, position = json.loads(body)
            if (
                type(version) is not int
                or version != 1
                or resource != run_id
                or type(position) is not int
                or not floor <= position <= latest
                or self.encode(run_id, position) != cursor
            ):
                raise ValueError()
            return position
        except (ValueError, TypeError, UnicodeDecodeError):
            raise expired_cursor() from None


class EventProgress(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    starting: bool = False
    active_trial: str | None = None
    finished_trials: list[str] = Field(default_factory=list, max_length=100)
    ready: bool = False
    mission: bool = False
    cleanup: bool = False
    last_monotonic_ms: float = Field(default=0, ge=0, le=86_400_000)


def conflict() -> ApiError:
    return ApiError(
        409, ErrorCode.IDEMPOTENCY_CONFLICT, "Event identity or contents conflict."
    )


def invalid_transition() -> ApiError:
    return ApiError(
        409, ErrorCode.VALIDATION_FAILED, "Event transition is not allowed."
    )


def advance(
    state: EventProgress,
    event: RunEvent,
    manifest: ExecutionManifest,
    trials: list[ExpectedTrial],
) -> EventProgress:
    """Validate observations only; terminal results and capacity stay with P14/P17."""
    state = state.model_copy(deep=True)
    if event.monotonic_elapsed_ms < state.last_monotonic_ms or state.cleanup:
        raise invalid_transition()
    state.last_monotonic_ms = event.monotonic_elapsed_ms
    if event.type == "ATTEMPT_STARTING":
        if (
            state.starting
            or event.trial_id is not None
            or event.sequence != 1
            or event.payload.profile_id != manifest.local_profile_id
            or not event.payload.owned_process
        ):
            raise invalid_transition()
        state.starting = True
        return state
    if not state.starting:
        raise invalid_transition()
    if event.type == "CLEANUP_FINISHED":
        if event.trial_id is not None or state.active_trial is not None:
            raise invalid_transition()
        state.cleanup = True
        # This recorded observation never frees capacity or confirms a result.
        return state
    trial = next((trial for trial in trials if trial.id == event.trial_id), None)
    if trial is None:
        raise invalid_transition()
    if event.type == "TRIAL_STARTED":
        if (
            state.active_trial is not None
            or trial.id in state.finished_trials
            or event.payload.scenario_id != trial.scenario_id
            or event.payload.repetition_index != trial.repetition_index
        ):
            raise invalid_transition()
        state.active_trial = trial.id
        state.ready = False
        state.mission = False
        return state
    if state.active_trial != trial.id:
        raise invalid_transition()
    if event.type == "READINESS_OBSERVED":
        if state.mission:
            raise invalid_transition()
        state.ready = event.payload.ready
    elif event.type == "MISSION_STARTED":
        if not state.ready or state.mission:
            raise invalid_transition()
        state.mission = True
    elif event.type == "OBSERVATION_RECORDED":
        if not state.ready:
            raise invalid_transition()
    elif event.type == "TRIGGER_OBSERVED":
        if not state.ready or event.payload.trigger_id != "READINESS_CONFIRMED":
            raise invalid_transition()
    elif event.type in ("DISTURBANCE_REQUESTED", "DISTURBANCE_CONFIRMED"):
        # The current published fake.nominal suite has no disturbance handler.
        # Exporting a typed catalog variant never enables an execution capability.
        raise ApiError(
            422,
            ErrorCode.CAPABILITY_UNSUPPORTED,
            "This suite has no disturbance handler.",
        )
    elif event.type == "TRIAL_FINISHED":
        allowed: tuple[Literal["COMPLETED", "CANCELED", "ERROR"], ...] = (
            "COMPLETED",
            "CANCELED",
            "ERROR",
        )
        if event.payload.execution_state not in allowed or (
            event.payload.execution_state == "COMPLETED" and not state.ready
        ):
            raise invalid_transition()
        state.finished_trials.append(trial.id)
        state.active_trial = None
    else:
        raise invalid_transition()
    return state
