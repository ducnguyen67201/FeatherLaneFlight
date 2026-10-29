"""Canonical queue snapshots; no fabricated attempts, events or evidence."""

from datetime import datetime

from featherlane_contracts import (
    EvaluationOutcome,
    ExecutionState,
    RunListEntry,
    RunSummary,
    TrialExecutionState,
)
from featherlane_contracts.run_detail import (
    ArtifactSummary,
    RunAttempt,
    RunDetail,
    TerminalReason,
    TrialCounts,
    TrialView,
)
from featherlane_contracts.usage import AttemptUsageSummary

from featherlane_api.modules.leases.persistence import AttemptRecord
from featherlane_api.modules.runs.persistence import RunRecord
from featherlane_api.modules.runs.snapshots import admission_snapshot


def timestamp(value: datetime | None) -> str | None:
    return value.isoformat().replace("+00:00", "Z") if value else None


def run_summary(row: RunRecord) -> RunSummary:
    return RunSummary.model_validate(
        {
            "id": row.id,
            "projectId": row.project_id,
            "buildId": row.build_id,
            "suiteRevisionId": row.suite_revision_id,
            "runnerId": row.runner_id,
            "executionState": ExecutionState(row.execution_state),
            "evaluationOutcome": EvaluationOutcome(row.evaluation_outcome),
            "cancellationRequestedAt": timestamp(row.cancellation_requested_at),
            "cancellationDeadlineAt": timestamp(row.cancellation_deadline_at),
            "createdAt": timestamp(row.created_at),
            "startedAt": timestamp(row.started_at),
            "finishedAt": timestamp(row.finished_at),
        }
    )


def run_entry(row: RunRecord) -> RunListEntry:
    return RunListEntry.model_validate(
        {
            **run_summary(row).model_dump(),
            "buildLabel": row.build_label,
            "suiteTitle": row.suite_title,
            "suiteRevision": row.suite_revision,
            "runnerDisplayName": row.runner_display_name,
        }
    )


def run_detail(
    row: RunRecord,
    now: datetime,
    attempts: list[AttemptRecord] | None = None,
    usage: dict[str, AttemptUsageSummary] | None = None,
) -> RunDetail:
    attempts = attempts or []
    if not attempts and (
        row.execution_state not in {"QUEUED", "CANCELED"} or row.started_at is not None
    ):
        raise RuntimeError("Attempt-backed run is missing its persisted attempt.")
    current = attempts[-1] if attempts else None
    manifest, suite, matrix = admission_snapshot(row)
    scenarios = {scenario.id: scenario for scenario in suite.scenarios}
    skipped = row.execution_state in {"CANCELED", "ERROR"}
    reason = (
        TerminalReason.model_validate(row.terminal_reason)
        if row.terminal_reason
        else None
    )
    trials = [
        TrialView.model_validate(
            {
                "id": trial.id,
                "attemptId": current.id if current else None,
                "scenarioId": trial.scenario_id,
                "scenarioTitle": scenarios[trial.scenario_id].title,
                "repetitionIndex": trial.repetition_index,
                "executionState": TrialExecutionState.SKIPPED
                if skipped
                else TrialExecutionState.PENDING,
                "evaluationOutcome": EvaluationOutcome.NOT_EVALUATED,
                "startedAt": None,
                "finishedAt": None,
                "disturbanceVerification": "NOT_REQUESTED",
                "observationSummary": [],
                "checkResults": [],
                "terminalReason": reason.model_dump() if reason else None,
            }
        )
        for trial in matrix
    ]
    return RunDetail.model_validate(
        {
            **run_entry(row).model_dump(),
            "requestedManifest": manifest.model_dump(),
            "attempts": [
                RunAttempt.model_validate(
                    {
                        "id": attempt.id,
                        "observedManifest": attempt.observed_manifest,
                        "startedAt": timestamp(attempt.manifest_accepted_at),
                        "finishedAt": timestamp(attempt.finished_at),
                        "terminalReason": attempt.terminal_reason,
                        "usage": usage[attempt.id].model_dump(mode="json")
                        if usage and attempt.id in usage
                        else None,
                    }
                ).model_dump()
                for attempt in attempts
            ],
            "trials": [trial.model_dump() for trial in trials],
            "checks": [check.model_dump() for check in suite.checks],
            "artifactSummary": ArtifactSummary(
                totalCount=0, availableVerifiedCount=0, missingCount=0, expiredCount=0
            ).model_dump(),
            "trialCounts": TrialCounts(
                scheduled=len(matrix),
                completed=0,
                failedCheck=0,
                inconclusive=0,
                canceled=0,
                infrastructureError=0,
                skipped=len(matrix) if skipped else 0,
            ).model_dump(),
            "terminalReason": reason.model_dump() if reason else None,
            "serverEventCursor": "0",
            "snapshotAt": timestamp(now),
        }
    )
