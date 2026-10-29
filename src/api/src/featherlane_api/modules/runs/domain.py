"""Pure admission policy and exact trial identity; no runner execution."""

from uuid import NAMESPACE_URL, uuid5

from featherlane_contracts import ErrorCode
from featherlane_contracts.registration import (
    LocalProfileView,
    RegisteredBuildView,
    SyntheticBuildView,
    SyntheticIntegrationProfileView,
)
from featherlane_contracts.run_detail import ExecutionManifest, ExpectedTrial
from featherlane_contracts.runners import RunnerSummary
from featherlane_contracts.suites import SuiteRevisionView

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.registration.domain import compatibility


def require_available(runner: RunnerSummary) -> None:
    if (
        runner.connection_state != "CONNECTED"
        or runner.capacity_state not in {"AVAILABLE", "BUSY"}
        or runner.revoked_at is not None
        or runner.diagnostics
    ):
        raise ApiError(
            409,
            ErrorCode.RUNNER_UNAVAILABLE,
            "The runner is unavailable for admission.",
        )


def freeze_manifest(
    runner: RunnerSummary,
    build: RegisteredBuildView,
    local: LocalProfileView,
    profile: SyntheticIntegrationProfileView,
    suite: SuiteRevisionView,
    repetitions: int,
) -> ExecutionManifest:
    require_available(runner)
    ready = runner.synthetic_readiness
    if (
        ready is None
        or not isinstance(build, SyntheticBuildView)
        or build.id not in ready.build_ids
        or local.id not in ready.local_profile_ids
        or ready.execution_mode == "NON_EXECUTING"
        or build.artifact_sha256 != ready.input_artifact_sha256
        or ready.execution_target != profile.execution_target
        or ready.python_version != profile.python_version
        or not set(suite.evidence_policy.required_kinds)
        <= set(ready.allowed_evidence_kinds)
        or suite.evidence_policy.maximum_artifact_bytes > ready.maximum_artifact_bytes
    ):
        raise ApiError(
            422,
            ErrorCode.CAPABILITY_UNSUPPORTED,
            "The matching synthetic runtime and local evidence policy are not ready.",
        )
    build_declaration = build.model_dump(exclude={"project_id", "created_at"})
    local_declaration = local.model_dump(exclude={"project_id", "created_at"})
    if not any(
        item.model_dump() == build_declaration for item in runner.available_builds
    ):
        raise ApiError(
            409,
            ErrorCode.BUILD_UNAVAILABLE,
            "The exact build declaration is unavailable.",
        )
    if not any(
        item.model_dump() == local_declaration for item in runner.local_profiles
    ):
        raise ApiError(
            409,
            ErrorCode.PROFILE_MISMATCH,
            "The exact local profile declaration is unavailable.",
        )
    if not compatibility(build, local, profile).compatible:
        raise ApiError(
            422, ErrorCode.PROFILE_MISMATCH, "Build and profiles are incompatible."
        )
    required = {(item.key, item.version) for item in suite.required_capabilities}
    if required != {("fake.nominal", 1)} or not {
        item.key for item in suite.required_capabilities
    } <= set(profile.declared_capabilities):
        raise ApiError(
            422,
            ErrorCode.CAPABILITY_UNSUPPORTED,
            "The required capability is unsupported.",
        )
    if not {check.id for check in suite.checks} <= set(profile.available_checks):
        raise ApiError(
            422,
            ErrorCode.CAPABILITY_UNSUPPORTED,
            "The required check inventory is unsupported.",
        )
    if (
        runner.contract_version != suite.version_requirements.contract_version
        or runner.protocol_version != suite.version_requirements.protocol_version
    ):
        raise ApiError(
            422,
            ErrorCode.PROTOCOL_VERSION_UNSUPPORTED,
            "Runner versions do not satisfy this suite.",
        )
    seeds = {scenario.parameters.random_seed for scenario in suite.scenarios}
    return ExecutionManifest(
        runtimeFamily="SYNTHETIC",
        contractVersion=runner.contract_version,
        protocolVersion=runner.protocol_version,
        buildId=build.id,
        buildDigest=build.id.removeprefix("build_"),
        configurationDigest=build.configuration_digest,
        suiteRevisionId=suite.id,
        suiteRevision=suite.revision,
        suiteDigest=suite.digest,
        integrationProfileId=profile.id,
        integrationProfileDigest=profile.digest,
        localProfileId=local.id,
        localProfileDigest=local.digest,
        runnerVersion=ready.runner_version,
        pythonVersion=ready.python_version,
        mavsdkVersion=None,
        px4Version=None,
        simulator="FAKE",
        vehicleConfiguration=None,
        operatingSystem=ready.execution_target.operating_system,
        architecture=ready.execution_target.architecture,
        clockPolicy=profile.clock_policy,
        speedFactor=profile.speed_factor,
        randomizationPolicy=profile.randomization_policy,
        randomSeed=next(iter(seeds)) if len(seeds) == 1 else None,
        repetitions=repetitions,
        checks=suite.checks,
        evidencePolicy=suite.evidence_policy.required_kinds,
        evaluatorVersion=suite.version_requirements.evaluator_version,
    )


def trial_matrix(
    run_id: str, suite: SuiteRevisionView, repetitions: int
) -> list[ExpectedTrial]:
    return [
        ExpectedTrial(
            id="trial_" + uuid5(NAMESPACE_URL, f"{run_id}/{scenario.id}/{index}").hex,
            scenarioId=scenario.id,
            repetitionIndex=index,
            randomSeed=scenario.parameters.random_seed,
        )
        for scenario in suite.scenarios
        for index in range(1, repetitions + 1)
    ]
