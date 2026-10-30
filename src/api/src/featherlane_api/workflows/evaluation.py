"""DBOS owns delivery/retry; domain processor owns immutable terminal decisions."""

from dbos import DBOS
from sqlalchemy.exc import DBAPIError

from featherlane_api.config import ApiSettings
from featherlane_api.infrastructure.database import Database
from featherlane_api.modules.evaluation.judge import JudgeEvaluator
from featherlane_api.modules.evaluation.judge_provider import JudgeTransient
from featherlane_api.modules.evidence.storage import LocalPrivateArtifactStorage
from featherlane_api.modules.finalization.processing import EvaluationProcessor
from featherlane_api.workflows.runtime import JUDGE_WORKFLOW, WORKFLOW

_settings: ApiSettings | None = None
_storage: LocalPrivateArtifactStorage | None = None


class TransientEvaluationFailure(RuntimeError):
    """Safe checkpoint diagnostic without SQL parameters or evidence."""


class PermanentEvaluationFailure(RuntimeError):
    """Safe nonretryable processing diagnostic."""


def configure(settings: ApiSettings, storage: LocalPrivateArtifactStorage) -> None:
    global _settings, _storage
    _settings, _storage = settings, storage


async def run_processor(
    attempt_id: str, failure: str | None = None, stage: str = "commit"
) -> None:
    if _settings is None or _storage is None:
        raise RuntimeError("Evaluation worker must be configured before launch")
    # DBOS runs async work on its own loop. Never share the maintenance loop's
    # asyncpg pool; each bounded step owns and closes its database resources.
    database = Database(_settings)
    try:
        if stage == "prepare":
            await JudgeEvaluator(database, _storage).prepare(attempt_id)
        elif stage == "judge":
            await JudgeEvaluator(database, _storage).invoke(attempt_id)
        else:
            await EvaluationProcessor(database, _storage).process(
                attempt_id, failure=failure
            )
    finally:
        await database.close()


def transient_database_error(exc: BaseException) -> bool:
    if not isinstance(exc, DBAPIError):
        return False
    state = getattr(exc.orig, "sqlstate", None)
    return (
        exc.connection_invalidated
        or state in {"40001", "40P01", "57P01"}
        or (isinstance(state, str) and state.startswith("08"))
    )


async def process(
    attempt_id: str, failure: str | None = None, stage: str = "commit"
) -> None:
    safe_failure = None
    try:
        await run_processor(attempt_id, failure, stage)
    except Exception as exc:
        safe_failure = (
            TransientEvaluationFailure("Transient evaluation storage failure")
            if transient_database_error(exc) or isinstance(exc, JudgeTransient)
            else PermanentEvaluationFailure("Evaluation processing failed")
        )
    # Raise outside the handler so DBOS cannot checkpoint a chained database
    # exception containing SQL parameters, observations or private paths.
    if safe_failure is not None:
        raise safe_failure


def transient(exc: BaseException) -> bool:
    return isinstance(exc, TransientEvaluationFailure)


@DBOS.step(
    name="validate-evaluate-commit-v1",
    retries_allowed=True,
    max_attempts=4,
    interval_seconds=1,
    backoff_rate=2,
    should_retry=transient,
)
async def evaluate(attempt_id: str) -> None:
    await process(attempt_id)


@DBOS.step(
    name="commit-evaluation-error-v1",
    retries_allowed=True,
    max_attempts=4,
    interval_seconds=1,
    backoff_rate=2,
    should_retry=transient,
)
async def fail(attempt_id: str) -> None:
    await process(attempt_id, "EVALUATION_PROCESSING_FAILED")


@DBOS.workflow(name=WORKFLOW, max_recovery_attempts=5)
async def evaluate_attempt(attempt_id: str) -> None:
    try:
        # A single idempotent domain step keeps raw evidence and observations out
        # of framework checkpoints. A crash repeats validation before commit.
        await evaluate(attempt_id)
    except Exception:
        # No exception text/evidence/credential is stored in public diagnostics.
        # If this write is unavailable too, maintenance enforces the domain deadline.
        await fail(attempt_id)


@DBOS.step(
    name="prepare-judge-packets-v1",
    retries_allowed=True,
    max_attempts=4,
    interval_seconds=1,
    backoff_rate=2,
    should_retry=transient,
)
async def prepare_judge(attempt_id: str) -> None:
    await process(attempt_id, stage="prepare")


@DBOS.step(
    name="invoke-validate-judge-v1",
    retries_allowed=True,
    max_attempts=4,
    interval_seconds=1,
    backoff_rate=2,
    should_retry=transient,
)
async def invoke_judge(attempt_id: str) -> None:
    await process(attempt_id, stage="judge")


@DBOS.step(
    name="commit-judge-results-v1",
    retries_allowed=True,
    max_attempts=4,
    interval_seconds=1,
    backoff_rate=2,
    should_retry=transient,
)
async def commit_judge(attempt_id: str) -> None:
    await process(attempt_id)


@DBOS.workflow(name=JUDGE_WORKFLOW, max_recovery_attempts=5)
async def judge_attempt(attempt_id: str) -> None:
    try:
        await prepare_judge(attempt_id)
        await invoke_judge(attempt_id)
        await commit_judge(attempt_id)
    except Exception:
        await fail(attempt_id)
