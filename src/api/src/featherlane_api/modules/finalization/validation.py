"""Validate exact admitted inputs and acknowledged event history before sealing."""

from featherlane_contracts import ErrorCode, EvaluationOutcome, TrialExecutionState
from featherlane_contracts.finalization import FinalizationRequest
from featherlane_contracts.registration import metadata_digest
from featherlane_contracts.run_detail import ExecutionManifest, RunEvent, TrialView
from pydantic import TypeAdapter
from sqlalchemy import select

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.events.domain import EventProgress
from featherlane_api.modules.events.persistence import EventRecord, EventStore
from featherlane_api.modules.evidence.persistence import EvidenceStore
from featherlane_api.modules.leases.application import LeaseService
from featherlane_api.modules.leases.domain import verify_manifest
from featherlane_api.modules.leases.persistence import AttemptRecord
from featherlane_api.modules.runs.persistence import RunRecord
from featherlane_api.modules.runs.snapshots import admission_snapshot

EVENT = TypeAdapter(RunEvent)


def invalid(message: str) -> ApiError:
    return ApiError(422, ErrorCode.VALIDATION_FAILED, message)


async def validate_inputs(
    leases: LeaseService,
    run: RunRecord,
    attempt: AttemptRecord,
    body: FinalizationRequest,
) -> list[TrialView]:
    manifest, suite, expected = admission_snapshot(run)
    if attempt.observed_manifest is None:
        raise invalid("An accepted observed manifest is required.")
    observed = ExecutionManifest.model_validate(attempt.observed_manifest)
    verify_manifest(manifest, observed)
    if (
        metadata_digest(manifest) != body.requested_manifest_digest
        or metadata_digest(observed) != body.observed_manifest_digest
        or manifest.evaluator_version != body.evaluator_version
    ):
        raise invalid("Finalization must match the frozen manifests and evaluator.")
    submitted = {trial.id: trial for trial in body.trials}
    if len(submitted) != len(body.trials) or set(submitted) != {t.id for t in expected}:
        raise invalid("Submit exactly the admitted trial matrix, once per trial.")
    progress = await EventStore(leases.session).attempt(attempt.id)
    if progress is None or progress.last_sequence != body.final_sequence:
        raise invalid("Final sequence must equal the acknowledged event sequence.")
    state = EventProgress.model_validate(progress.progress)
    if not state.cleanup or state.active_trial is not None:
        raise invalid("Acknowledged trial termination and cleanup are required.")
    # Ingestion already bounds total retained events to 10,000 per run.
    rows = list(
        await leases.session.scalars(
            select(EventRecord)
            .where(EventRecord.attempt_id == attempt.id)
            .order_by(EventRecord.sequence)
            .limit(10_001)
        )
    )
    if len(rows) != body.final_sequence or len(rows) > 10_000:
        raise invalid("The complete acknowledged event history must be retained.")
    events = [EVENT.validate_python(row.payload) for row in rows]
    if events[-1].type != "CLEANUP_FINISHED" or not events[-1].payload.process_exited:
        raise invalid("Final event must record process exit.")
    observation_ids: set[str] = set()
    views = []
    scenarios = {scenario.id: scenario for scenario in suite.scenarios}
    for trial in expected:
        item = submitted[trial.id]
        if (item.scenario_id, item.repetition_index) != (
            trial.scenario_id,
            trial.repetition_index,
        ):
            raise invalid("Trial scenario/repetition differs from admission.")
        history = [event for event in events if event.trial_id == trial.id]
        starts = [e for e in history if e.type == "TRIAL_STARTED"]
        finishes = [e for e in history if e.type == "TRIAL_FINISHED"]
        recorded = [
            e.payload.observation_id
            for e in history
            if e.type == "OBSERVATION_RECORDED"
        ]
        if item.execution_state == "SKIPPED":
            if history:
                raise invalid("Started work cannot be reported as skipped.")
        elif (
            len(starts) != 1
            or len(finishes) != 1
            or (finishes[0].payload.execution_state.value != item.execution_state)
        ):
            raise invalid("Trial outcome must match its acknowledged events.")
        if len(recorded) != len(set(recorded)):
            raise invalid("Observation events must have unique identities.")
        for observation in item.observations:
            if observation.id in observation_ids or observation.id not in recorded:
                raise invalid("Observation identity lacks a unique matching event.")
            observation_ids.add(observation.id)
            event = next(
                e
                for e in history
                if e.type == "OBSERVATION_RECORDED"
                and e.payload.observation_id == observation.id
            )
            if (
                observation.monotonic_elapsed_ms != event.monotonic_elapsed_ms
                or observation.simulation_time_us != event.simulation_time_us
                or not set(observation.artifact_ids).issubset(item.artifact_ids)
                or observation.check_id not in scenarios[trial.scenario_id].check_ids
            ):
                raise invalid("Observation timing, check or artifact binding differs.")
        for artifact_id in item.artifact_ids:
            artifact = await EvidenceStore(leases.session).exact(artifact_id, lock=True)
            if (
                artifact is None
                or (
                    artifact.project_id,
                    artifact.run_id,
                    artifact.attempt_id,
                    artifact.runner_id,
                )
                != (run.project_id, run.id, attempt.id, attempt.runner_id)
                or (artifact.trial_id is not None and artifact.trial_id != trial.id)
            ):
                raise invalid(
                    "Artifact references must belong to this attempt and trial."
                )
        views.append(
            TrialView.model_validate(
                {
                    "id": trial.id,
                    "attemptId": attempt.id,
                    "scenarioId": trial.scenario_id,
                    "scenarioTitle": scenarios[trial.scenario_id].title,
                    "repetitionIndex": trial.repetition_index,
                    "executionState": TrialExecutionState(item.execution_state),
                    "evaluationOutcome": EvaluationOutcome.NOT_EVALUATED,
                    "startedAt": starts[0].wall_time_utc if starts else None,
                    "finishedAt": finishes[0].wall_time_utc if finishes else None,
                    "disturbanceVerification": "NOT_REQUESTED",
                    "observationSummary": [
                        o.model_dump(mode="json") for o in item.observations
                    ],
                    "checkResults": [],
                    "terminalReason": item.terminal_reason,
                }
            )
        )
    return views
