"""Evaluator v1: deterministic normalized observations, never runner PASS flags."""

from featherlane_contracts import CheckOutcome, EvaluationOutcome, TrialExecutionState
from featherlane_contracts.finalization import FinalizationRequest
from featherlane_contracts.run_detail import (
    CheckDefinition,
    CheckResult,
    ExecutionManifest,
    TrialView,
)
from featherlane_contracts.suites import SuiteRevisionView

from featherlane_api.modules.evaluation.evidence import (
    ValidatedArtifact,
    contains_observation,
)


def aggregate(outcomes: list[str]) -> str:
    if "FAIL" in outcomes:
        return "FAIL"
    if not outcomes or any(value != "PASS" for value in outcomes):
        return "INCONCLUSIVE"
    return "PASS"


def evaluate_check(
    check: CheckDefinition,
    trial: TrialView,
    artifact_ids: list[str],
    artifacts: dict[str, ValidatedArtifact],
    manifest: ExecutionManifest,
) -> CheckResult:
    candidates = [o for o in trial.observation_summary if o.check_id == check.id]
    observation = candidates[0] if len(candidates) == 1 else None
    applicable = [artifacts[i] for i in artifact_ids if i in artifacts]
    kinds = {a.kind for a in applicable}
    valid = (
        manifest.evaluator_version == "1"
        and manifest.runtime_family == "SYNTHETIC"
        and observation is not None
        and observation.check_version == check.version
        and observation.key == check.id
        and observation.unit == check.unit
        and observation.sample_count == 1
        and observation.source_clock == "MONOTONIC"
        and set(check.required_evidence_kinds).issubset(kinds)
        and set(manifest.evidence_policy).issubset(kinds)
        and observation.artifact_ids
        and all(i in artifacts for i in observation.artifact_ids)
        and any(
            a.id in observation.artifact_ids
            and a.kind == "OBSERVATIONS"
            and a.trial_id == trial.id
            and contains_observation(a, observation)
            for a in applicable
        )
    )
    outcome = CheckOutcome.INCONCLUSIVE
    summary = check.inconclusive_when
    if valid:
        if check.kind == "METRIC_THRESHOLD":
            passed = observation.value <= check.threshold
        else:
            passed = observation.value is True
        outcome = CheckOutcome.PASS if passed else CheckOutcome.FAIL
        summary = (
            "Observed value satisfies the frozen criterion."
            if passed
            else "Observed value fails the frozen criterion."
        )
    return CheckResult(
        checkId=check.id,
        outcome=outcome,
        observationId=observation.id if observation else None,
        artifactIds=observation.artifact_ids if observation else [],
        summary=summary,
    )


def evaluate_trials(
    manifest: ExecutionManifest,
    suite: SuiteRevisionView,
    body: FinalizationRequest,
    trials: list[TrialView],
    artifacts: dict[str, ValidatedArtifact],
) -> list[TrialView]:
    submitted = {t.id: t for t in body.trials}
    scenarios = {s.id: s for s in suite.scenarios}
    checks = {c.id: c for c in manifest.checks}
    evaluated = []
    for trial in trials:
        trial = trial.model_copy(deep=True)
        if trial.execution_state == TrialExecutionState.COMPLETED:
            trial.check_results = [
                evaluate_check(
                    checks[identity],
                    trial,
                    submitted[trial.id].artifact_ids,
                    artifacts,
                    manifest,
                )
                for identity in scenarios[trial.scenario_id].check_ids
            ]
            trial.evaluation_outcome = EvaluationOutcome(
                aggregate([r.outcome.value for r in trial.check_results])
            )
        evaluated.append(trial)
    return evaluated
