"""Canonical, framework-free JSON wire contracts for FeatherLaneFlight."""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, BeforeValidator, ConfigDict, Field
from pydantic.alias_generators import to_camel

CONTRACT_VERSION = "0.1.0"
PROTOCOL_VERSION = "1"
MAX_PAGE_SIZE = 100
MAX_REPETITIONS = 10


def _reject_boolean_constant(value: object) -> object:
    # Pydantic's numeric Literal matching otherwise treats True as 1.
    if isinstance(value, bool):
        raise ValueError("Boolean values are not numeric constants")
    return value


def _require_true_constant(value: object) -> object:
    # Literal[True] otherwise also accepts Python/JSON numeric 1.
    if value is not True:
        raise ValueError("Expected the boolean constant true")
    return value


Identifier = Annotated[
    str, Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
]
Cursor = Annotated[
    str, Field(min_length=1, max_length=512, pattern=r"^[A-Za-z0-9_-]+$")
]
Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
ContractVersion = Literal["0.1.0"]
ProtocolVersion = Literal["1"]


def _valid_utc(value: str) -> str:
    datetime.fromisoformat(value)
    return value


# String wire values avoid implicit datetime/Date conversions in either client.
UtcTimestamp = Annotated[
    str,
    Field(
        max_length=27,
        # Year 0000 is outside Python's datetime range; export that constraint too.
        pattern=(
            r"^(?:[1-9][0-9]{3}|0[1-9][0-9]{2}|00[1-9][0-9]|000[1-9])"
            r"-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$"
        ),
        json_schema_extra={"format": "date-time"},
    ),
    AfterValidator(_valid_utc),
]


class WireModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_alias=True,
        validate_by_name=False,
        serialize_by_alias=True,
        extra="forbid",
        strict=True,
        allow_inf_nan=False,
    )


class ExecutionState(StrEnum):
    QUEUED = "QUEUED"
    CLAIMED = "CLAIMED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    FINALIZING = "FINALIZING"
    COMPLETED = "COMPLETED"
    CANCELED = "CANCELED"
    ERROR = "ERROR"


class TrialExecutionState(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    CANCELED = "CANCELED"
    ERROR = "ERROR"
    SKIPPED = "SKIPPED"


class EvaluationOutcome(StrEnum):
    PASS = "PASS"
    FAIL = "FAIL"
    INCONCLUSIVE = "INCONCLUSIVE"
    NOT_EVALUATED = "NOT_EVALUATED"


class CheckOutcome(StrEnum):
    PASS = "PASS"
    FAIL = "FAIL"
    INCONCLUSIVE = "INCONCLUSIVE"


class RunnerConnectionState(StrEnum):
    CONNECTED = "CONNECTED"
    STALE = "STALE"
    OFFLINE = "OFFLINE"


class RunnerCapacityState(StrEnum):
    AVAILABLE = "AVAILABLE"
    BUSY = "BUSY"
    NEEDS_CLEANUP = "NEEDS_CLEANUP"
    DISABLED = "DISABLED"


class CapabilitySupport(StrEnum):
    DECLARED = "DECLARED"
    VERIFIED = "VERIFIED"
    UNSUPPORTED = "UNSUPPORTED"


class SuiteStatus(StrEnum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"


class ErrorCode(StrEnum):
    VALIDATION_FAILED = "VALIDATION_FAILED"
    INVALID_JSON = "INVALID_JSON"
    CONTRACT_VERSION_UNSUPPORTED = "CONTRACT_VERSION_UNSUPPORTED"
    PROTOCOL_VERSION_UNSUPPORTED = "PROTOCOL_VERSION_UNSUPPORTED"
    CURSOR_EXPIRED = "CURSOR_EXPIRED"
    CAPABILITY_UNSUPPORTED = "CAPABILITY_UNSUPPORTED"
    PROFILE_MISMATCH = "PROFILE_MISMATCH"
    BUILD_UNAVAILABLE = "BUILD_UNAVAILABLE"
    RUNNER_UNAVAILABLE = "RUNNER_UNAVAILABLE"
    RATE_LIMITED = "RATE_LIMITED"
    QUEUE_LIMIT_REACHED = "QUEUE_LIMIT_REACHED"
    LEASE_EXPIRED = "LEASE_EXPIRED"
    STALE_ATTEMPT = "STALE_ATTEMPT"
    SEQUENCE_GAP = "SEQUENCE_GAP"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    MEMBERSHIP_CONFLICT = "MEMBERSHIP_CONFLICT"
    SUITE_DRAFT_CONFLICT = "SUITE_DRAFT_CONFLICT"
    ARTIFACT_INVALID = "ARTIFACT_INVALID"
    EVIDENCE_BUFFER_FULL = "EVIDENCE_BUFFER_FULL"
    CANCELLATION_UNCONFIRMED = "CANCELLATION_UNCONFIRMED"
    SESSION_EXPIRED = "SESSION_EXPIRED"
    CSRF_INVALID = "CSRF_INVALID"
    LOGIN_INVALID = "LOGIN_INVALID"
    IDENTITY_UNVERIFIED = "IDENTITY_UNVERIFIED"
    AUTH_UNAVAILABLE = "AUTH_UNAVAILABLE"
    UNAUTHENTICATED = "UNAUTHENTICATED"
    FORBIDDEN = "FORBIDDEN"
    NOT_FOUND = "NOT_FOUND"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"
    METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"
    UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE"


class FieldError(WireModel):
    field: Annotated[str, Field(min_length=1, max_length=256)]
    code: Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_]+$")]
    message: Annotated[str, Field(min_length=1, max_length=256)]


class ErrorBody(WireModel):
    code: ErrorCode
    message: Annotated[str, Field(min_length=1, max_length=512)]
    details: Annotated[list[FieldError], Field(max_length=50)]
    request_id: Identifier


class ErrorEnvelope(WireModel):
    error: ErrorBody


class SuccessEnvelope[T](WireModel):
    data: T


class ContractMeta(WireModel):
    supported_contract_versions: Annotated[
        list[ContractVersion], Field(min_length=1, max_length=1)
    ]
    supported_protocol_versions: Annotated[
        list[ProtocolVersion], Field(min_length=1, max_length=1)
    ]
    schema_digest: Digest


class ContractMetaEnvelope(SuccessEnvelope[ContractMeta]):
    pass


class RunSummary(WireModel):
    id: Identifier
    project_id: Identifier
    build_id: Identifier
    suite_revision_id: Identifier
    runner_id: Identifier
    execution_state: ExecutionState
    evaluation_outcome: EvaluationOutcome
    cancellation_requested_at: UtcTimestamp | None
    cancellation_deadline_at: UtcTimestamp | None
    created_at: UtcTimestamp
    started_at: UtcTimestamp | None
    finished_at: UtcTimestamp | None


class CursorMeta(WireModel):
    next_cursor: Cursor | None


class RunListEntry(RunSummary):
    build_label: Annotated[str, Field(min_length=1, max_length=128)]
    suite_title: Annotated[str, Field(min_length=1, max_length=128)]
    suite_revision: Annotated[int, Field(ge=1, le=1_000_000)]
    runner_display_name: Annotated[str, Field(min_length=1, max_length=128)]


class RunListEnvelope(WireModel):
    data: Annotated[list[RunListEntry], Field(max_length=MAX_PAGE_SIZE)]
    meta: CursorMeta


DisplayName = Annotated[str, Field(min_length=1, max_length=128)]


class RunRunnerOption(WireModel):
    id: Identifier
    display_name: DisplayName
    host_platform: DisplayName
    connection_state: RunnerConnectionState
    capacity_state: RunnerCapacityState
    last_seen_at: UtcTimestamp | None


class RunBuildOption(WireModel):
    id: Identifier
    label: DisplayName
    source_revision: DisplayName
    artifact_sha256: Digest


class RunLocalProfileOption(WireModel):
    id: Identifier
    display_name: DisplayName
    digest: Digest
    integration_profile_id: Identifier


class RunSuiteOption(WireModel):
    id: Identifier
    suite_id: Identifier
    title: DisplayName
    revision: Annotated[int, Field(ge=1, le=1_000_000)]
    status: Literal["PUBLISHED"]
    digest: Digest
    scenario_count: Annotated[int, Field(ge=1, le=100)]
    eligible: bool
    reason: Annotated[str, Field(min_length=1, max_length=512)] | None


class RunOptions(WireModel):
    runners: Annotated[list[RunRunnerOption], Field(max_length=MAX_PAGE_SIZE)]
    builds: Annotated[list[RunBuildOption], Field(max_length=MAX_PAGE_SIZE)]
    local_profiles: Annotated[
        list[RunLocalProfileOption], Field(max_length=MAX_PAGE_SIZE)
    ]
    suites: Annotated[list[RunSuiteOption], Field(max_length=MAX_PAGE_SIZE)]
    minimum_repetitions: Annotated[
        Literal[1], BeforeValidator(_reject_boolean_constant)
    ]
    maximum_repetitions: Annotated[
        Literal[10], BeforeValidator(_reject_boolean_constant)
    ]


class RunOptionsEnvelope(SuccessEnvelope[RunOptions]):
    pass


class CreateRunRequest(WireModel):
    schema_version: Annotated[Literal[1], BeforeValidator(_reject_boolean_constant)]
    runner_id: Identifier
    build_id: Identifier
    suite_revision_id: Identifier
    local_execution_profile_digest: Digest
    repetitions: Annotated[int, Field(ge=1, le=MAX_REPETITIONS)]


class RunEnvelope(SuccessEnvelope[RunSummary]):
    pass


# Export vocabulary used by later shared status presentation without inventing DTOs.
STATUS_MODELS = (
    ExecutionState,
    TrialExecutionState,
    EvaluationOutcome,
    CheckOutcome,
    RunnerConnectionState,
    RunnerCapacityState,
    CapabilitySupport,
    SuiteStatus,
)


class SessionUser(WireModel):
    id: Identifier
    display_name: Annotated[str, Field(min_length=1, max_length=200)]
    email: Annotated[str, Field(min_length=3, max_length=320)]


class SessionView(WireModel):
    user: SessionUser
    csrf_token: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class SessionEnvelope(SuccessEnvelope[SessionView]):
    pass


class LogoutResult(WireModel):
    signed_out: Annotated[Literal[True], BeforeValidator(_require_true_constant)]


class LogoutEnvelope(SuccessEnvelope[LogoutResult]):
    pass
