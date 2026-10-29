"""Bounded reference-handler qualification using explicitly generated evidence.

No runner, child process, MAVLink, simulator connection or real flight is involved.
The separate provenance never promotes a DECLARED integration registration.
"""

import hashlib
import json
import platform

from featherlane_contracts import ErrorCode
from featherlane_contracts.registration import (
    ExecutionTarget,
    SyntheticIntegrationProfileSpec,
    SyntheticIntegrationProfileView,
)
from featherlane_contracts.suites import (
    PublishedSuiteDefinition,
    SyntheticNominalParameters,
    SyntheticReferenceObservation,
    suite_digest,
)

from featherlane_api.http.errors import ApiError

CONFIGURATION = {
    "handlerId": "fake.nominal",
    "handlerVersion": 1,
    "evidenceVersion": 1,
    "clockPolicy": "MONOTONIC_AND_SIMULATION",
    "randomizationPolicy": "FIXED_SEED",
}
CHECK_KINDS = {
    "mission_complete": "MISSION_COMPLETION",
    "landed_disarmed": "LANDING_DISARM",
    "duration": "METRIC_THRESHOLD",
}


def canonical_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def sha256(value: object) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def reference_profile() -> SyntheticIntegrationProfileSpec:
    system = {"Darwin": "macos", "Linux": "linux"}.get(platform.system())
    architecture = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x86_64"}.get(
        platform.machine()
    )
    if system is None or architecture is None:
        raise ValueError("The reference preset requires a supported host target.")
    return SyntheticIntegrationProfileSpec(
        runtimeFamily="SYNTHETIC",
        name="Synthetic nominal reference",
        revision=1,
        simulator="FAKE",
        executionTarget=ExecutionTarget(
            operatingSystem=system, architecture=architecture
        ),
        pythonVersion=platform.python_version(),
        configurationDigest=sha256(CONFIGURATION),
        speedFactor=1.0,
        clockPolicy="MONOTONIC_AND_SIMULATION",
        randomizationPolicy="FIXED_SEED",
        availableChecks=list(CHECK_KINDS),
        declaredCapabilities=["fake.nominal"],
    )


def run_reference(
    scenario_id: str, parameters: SyntheticNominalParameters
) -> SyntheticReferenceObservation:
    # Virtual monotonic/simulation time is intentional for this fake handler.
    # These observations demonstrate the bounded fixture path, not elapsed
    # physical time or aircraft behavior. No random-independence claim is made.
    return SyntheticReferenceObservation(
        scenarioId=scenario_id,
        handlerId="fake.nominal",
        handlerVersion=1,
        randomSeed=parameters.random_seed,
        missionCompleted=True,
        landed=True,
        disarmed=True,
        elapsedMonotonicMs=parameters.duration_ms,
        elapsedSimulationMs=parameters.duration_ms,
    )


def qualify_reference(
    definition: PublishedSuiteDefinition, profile: SyntheticIntegrationProfileView
) -> dict:
    reference = reference_profile()
    if (
        profile.configuration_digest != reference.configuration_digest
        or profile.execution_target != reference.execution_target
        or profile.python_version != reference.python_version
        or set(profile.available_checks) != set(CHECK_KINDS)
        or profile.declared_capabilities != ["fake.nominal"]
    ):
        raise ApiError(
            422,
            ErrorCode.PROFILE_MISMATCH,
            "Synthetic profile does not match the reference host/configuration.",
        )
    if {
        check.id: check.kind for check in definition.checks
    } != CHECK_KINDS or definition.evidence_policy.required_kinds != [
        "OBSERVATIONS",
        "REDACTED_PROCESS_LOG",
    ]:
        raise ApiError(
            422,
            ErrorCode.CAPABILITY_UNSUPPORTED,
            "Reference qualification requires the built-in check/evidence inventory.",
        )
    observations = []
    results = []
    for scenario in definition.scenarios:
        observation = run_reference(scenario.id, scenario.parameters)
        observations.append(observation.model_dump(mode="json"))
        for check in definition.checks:
            if check.id not in scenario.check_ids:
                continue
            if check.kind == "MISSION_COMPLETION":
                passed = observation.mission_completed
            elif check.kind == "LANDING_DISARM":
                passed = observation.landed and observation.disarmed
            else:
                passed = observation.elapsed_monotonic_ms / 1000 <= check.threshold
            if not passed:
                raise ApiError(
                    422,
                    ErrorCode.CAPABILITY_UNSUPPORTED,
                    "Synthetic reference evidence does not satisfy the check limits.",
                )
            results.append(
                {
                    "scenarioId": scenario.id,
                    "checkId": check.id,
                    "kind": check.kind,
                    "version": check.version,
                    "outcome": "PASS",
                    "requiredEvidenceKinds": check.required_evidence_kinds,
                }
            )
    process_log = {
        "synthetic": True,
        "ownedChildProcesses": 0,
        "handlerId": "fake.nominal",
        "handlerVersion": 1,
        "scenarioIds": [scenario.id for scenario in definition.scenarios],
    }
    if (
        max(len(canonical_bytes(observations)), len(canonical_bytes(process_log)))
        > definition.evidence_policy.maximum_artifact_bytes
    ):
        raise ApiError(
            422,
            ErrorCode.CAPABILITY_UNSUPPORTED,
            "Synthetic reference evidence exceeds the imported artifact bound.",
        )
    return {
        "suiteDigest": suite_digest(definition),
        "schemaVersion": 1,
        "method": "SYNTHETIC_REFERENCE_HANDLER",
        "runtimeFamily": "SYNTHETIC",
        "verifierId": "fake.nominal.reference",
        "verifierVersion": 1,
        "profileId": profile.id,
        "profileRevision": profile.revision,
        "profileDigest": profile.digest,
        "configurationDigest": profile.configuration_digest,
        "pythonVersion": profile.python_version,
        "executionTarget": profile.execution_target.model_dump(mode="json"),
        "capabilities": [
            item.model_dump(mode="json") for item in definition.required_capabilities
        ],
        "versionRequirements": definition.version_requirements.model_dump(mode="json"),
        "clockPolicy": profile.clock_policy,
        "evidenceVersion": 1,
        "evidencePolicy": definition.evidence_policy.model_dump(mode="json"),
        "observations": observations,
        "redactedProcessLog": process_log,
        "evidence": [
            {
                "kind": "OBSERVATIONS",
                "sha256": sha256(observations),
                "byteLength": len(canonical_bytes(observations)),
            },
            {
                "kind": "REDACTED_PROCESS_LOG",
                "sha256": sha256(process_log),
                "byteLength": len(canonical_bytes(process_log)),
            },
        ],
        "checkResults": results,
    }
