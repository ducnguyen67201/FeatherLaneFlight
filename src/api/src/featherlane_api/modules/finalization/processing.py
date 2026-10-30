"""Idempotent processing and terminalization with current domain guards."""

import asyncio
import json

from featherlane_contracts import EvaluationOutcome, TrialExecutionState
from featherlane_contracts.finalization import FinalizationRequest, FinalizationTerminal
from featherlane_contracts.run_detail import TrialView
from pydantic import TypeAdapter
from sqlalchemy import func, select

from featherlane_api.infrastructure.database import Database
from featherlane_api.modules.evaluation.evidence import validate_artifact
from featherlane_api.modules.evaluation.judge import apply_judgments
from featherlane_api.modules.evaluation.rules import aggregate, evaluate_trials
from featherlane_api.modules.evidence.persistence import EvidenceStore
from featherlane_api.modules.evidence.storage import LocalPrivateArtifactStorage
from featherlane_api.modules.finalization.persistence import FinalizationRecord
from featherlane_api.modules.leases.persistence import AttemptRecord
from featherlane_api.modules.runners.application import stamp
from featherlane_api.modules.runners.persistence import RunnerStore
from featherlane_api.modules.runs.persistence import RunStore
from featherlane_api.modules.runs.snapshots import admission_snapshot

TRIALS = TypeAdapter(list[TrialView])


class EvaluationProcessor:
    def __init__(self, database: Database, storage: LocalPrivateArtifactStorage):
        self.database, self.storage = database, storage

    async def process(self, attempt_id: str, *, failure: str | None = None) -> None:
        async with self.database.session_factory() as session, session.begin():
            saved = await session.get(FinalizationRecord, attempt_id)
            if saved is None or saved.terminal is not None:
                return
            attempt = await session.get(AttemptRecord, attempt_id)
            run = await RunStore(session).exact(attempt.run_id)
            manifest, suite, _ = admission_snapshot(run)
            body = FinalizationRequest.model_validate(saved.inputs["request"])
            trials = TRIALS.validate_json(json.dumps(saved.inputs["trials"]))
            now = await session.scalar(select(func.clock_timestamp()))
            artifact_ids = {i for t in body.trials for i in t.artifact_ids}
            records = {}
            for identity in artifact_ids:
                artifact = await EvidenceStore(session).exact(identity)
                if artifact is not None and (
                    artifact.project_id,
                    artifact.run_id,
                    artifact.attempt_id,
                    artifact.runner_id,
                ) == (run.project_id, run.id, attempt.id, attempt.runner_id):
                    records[identity] = artifact
        validated = {}
        if failure is None and saved.deadline_at > now:
            for identity, artifact in records.items():
                # One bounded read at a time; expiry/cancellation maintenance keeps
                # its own sessions and event loop time while disk I/O runs.
                value = await asyncio.to_thread(
                    validate_artifact, artifact, self.storage, now
                )
                if value is not None:
                    validated[identity] = value
            if "judgePolicy" not in saved.inputs:
                trials = evaluate_trials(manifest, suite, body, trials, validated)
        async with self.database.session_factory() as session, session.begin():
            # All lifecycle mutators use runner -> run -> attempt ordering.
            runner = await RunnerStore(session).by_id(attempt.runner_id, lock=True)
            run = await RunStore(session).exact(attempt.run_id, lock=True)
            attempt = await session.scalar(
                select(AttemptRecord)
                .where(AttemptRecord.id == attempt_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            saved = await session.scalar(
                select(FinalizationRecord)
                .where(FinalizationRecord.attempt_id == attempt_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            if saved.terminal is not None:
                return
            now = await session.scalar(select(func.clock_timestamp()))
            if attempt.finished_at is not None or run.execution_state != "FINALIZING":
                # A competing terminal decision is immutable; never overwrite it.
                raise RuntimeError("Accepted finalization lost its lifecycle binding")
            reason = None
            execution, outcome = (
                "COMPLETED",
                aggregate([t.evaluation_outcome.value for t in trials]),
            )
            if run.cancellation_requested_at is not None:
                execution, outcome = "CANCELED", "NOT_EVALUATED"
                reason = {
                    "code": "CANCELED",
                    "message": "Cancellation committed before evaluation completed.",
                }
            elif (
                failure is not None
                or saved.deadline_at <= now
                or runner.revoked_at is not None
                or runner.fencing_number != attempt.fencing_number
                or body.cleanup.exit_code != 0
                or any(t.execution_state == TrialExecutionState.ERROR for t in trials)
            ):
                execution, outcome = "ERROR", "NOT_EVALUATED"
                reason = {
                    "code": failure
                    or (
                        "EVALUATION_DEADLINE"
                        if saved.deadline_at <= now
                        else "EXECUTION_OR_AUTHORITY_ERROR"
                    ),
                    "message": "Evaluation lacks valid execution or authority.",
                }
            elif any(
                t.execution_state != TrialExecutionState.COMPLETED for t in trials
            ):
                execution, outcome = "ERROR", "NOT_EVALUATED"
                reason = {
                    "code": "INCOMPLETE_EXECUTION",
                    "message": "Not all admitted trials completed.",
                }
            else:
                # Checkpoints must never turn expired or rebound evidence into PASS.
                stale = False
                for identity, value in validated.items():
                    artifact = await EvidenceStore(session).exact(identity, lock=True)
                    if (
                        artifact is None
                        or artifact.expires_at <= now
                        or (
                            artifact.state != "VERIFIED"
                            or artifact.sha256 != value.sha256
                            or artifact.trial_id != value.trial_id
                            or artifact.attempt_id != attempt.id
                            or artifact.run_id != run.id
                            or artifact.project_id != run.project_id
                        )
                    ):
                        stale = True
                if "judgePolicy" in saved.inputs:
                    trials = await apply_judgments(
                        session, attempt_id, trials, validated, stale=stale
                    )
                    outcome = aggregate([t.evaluation_outcome.value for t in trials])
                elif stale:
                    trials = evaluate_trials(manifest, suite, body, trials, {})
                    outcome = aggregate([t.evaluation_outcome.value for t in trials])
            if execution != "COMPLETED":
                for trial in trials:
                    trial.evaluation_outcome = EvaluationOutcome.NOT_EVALUATED
                    trial.check_results = []
            terminal = FinalizationTerminal(
                executionState=execution,
                evaluationOutcome=outcome,
                finishedAt=stamp(now),
                terminalReason=reason,
                trials=trials,
            )
            saved.terminal = terminal.model_dump(mode="json")
            run.execution_state, run.evaluation_outcome = execution, outcome
            run.finished_at, run.terminal_reason = now, reason
            attempt.finished_at, attempt.terminal_reason = now, reason
            # Confirmed cleanup closes this attempt, without qualifying a runner.
            runner.capacity_state = "DISABLED"
            RunStore(session).audit(run, run.actor_id, "EVALUATION_FINISHED", now)
            await session.flush()

    async def expire(self) -> int:
        async with self.database.session_factory() as session, session.begin():
            ids = list(
                await session.scalars(
                    select(FinalizationRecord.attempt_id)
                    .where(
                        FinalizationRecord.terminal.is_(None),
                        FinalizationRecord.deadline_at <= func.clock_timestamp(),
                    )
                    .order_by(FinalizationRecord.deadline_at)
                    .limit(100)
                )
            )
        for identity in ids:
            await self.process(identity, failure="EVALUATION_DEADLINE")
        return len(ids)
