"""Validate the immutable admission family before a claim consumes it."""

from typing import TYPE_CHECKING

from featherlane_contracts.run_detail import ExecutionManifest, ExpectedTrial
from featherlane_contracts.suites import SuiteRevisionView, suite_digest
from pydantic import TypeAdapter

from featherlane_api.modules.runs.domain import trial_matrix

if TYPE_CHECKING:
    from featherlane_api.modules.runs.persistence import RunRecord


def admission_snapshot(
    row: "RunRecord",
) -> tuple[ExecutionManifest, SuiteRevisionView, list[ExpectedTrial]]:
    manifest = ExecutionManifest.model_validate(row.requested_manifest)
    suite = SuiteRevisionView.model_validate(row.suite_snapshot)
    trials = TypeAdapter(list[ExpectedTrial]).validate_python(row.expected_trials)
    expected = trial_matrix(row.id, suite, row.repetitions)
    if (
        suite.digest != suite_digest(suite)
        or suite.id != row.suite_revision_id
        or suite.project_id != row.project_id
        or manifest.suite_revision_id != suite.id
        or manifest.suite_digest != suite.digest
        or manifest.suite_revision != suite.revision
        or manifest.integration_profile_id != suite.integration_profile_id
        or manifest.integration_profile_digest != suite.integration_profile_digest
        or manifest.build_id != row.build_id
        or manifest.repetitions != row.repetitions
        or manifest.checks != suite.checks
        or manifest.evidence_policy != suite.evidence_policy.required_kinds
        or manifest.evaluator_version != suite.version_requirements.evaluator_version
        or trials != expected
    ):
        raise RuntimeError("The immutable admission snapshot is inconsistent.")
    return manifest, suite, trials
