"""Measure precomputed synthetic input data; never invoke a scenario or process."""

import hashlib
import importlib.metadata
import json
import platform
from pathlib import Path
from typing import Annotated, Literal

from featherlane_contracts import (
    CONTRACT_VERSION,
    PROTOCOL_VERSION,
    DisplayName,
    Identifier,
    WireModel,
    _require_true_constant,
)
from featherlane_contracts.registration import (
    ExecutionTarget,
    LocalProfileDeclaration,
    LocalProfileMetadata,
    SyntheticBuildDeclaration,
    SyntheticBuildMetadata,
    SyntheticIntegrationProfileSpec,
    build_identity,
    integration_digest,
    integration_identity,
    local_profile_identity,
    metadata_digest,
)
from featherlane_contracts.runners import (
    RunnerDiagnostic,
    RunnerHeartbeat,
    SyntheticReadiness,
)
from featherlane_contracts.suites import SyntheticReferenceObservation
from pydantic import BeforeValidator, Field, model_validator

from featherlane_runner.inventory import read_private_input
from featherlane_runner.registration import LocalPath, LocalRegistrationError

RUNTIME_ID = "flf-synthetic-protocol-v1"


class SyntheticProcessLog(WireModel):
    synthetic: Annotated[Literal[True], BeforeValidator(_require_true_constant)]
    owned_child_processes: Annotated[int, Field(ge=0, le=0)]
    handler_id: Literal["fake.nominal"]
    handler_version: Annotated[int, Field(ge=1, le=1)]
    scenario_ids: Annotated[list[Identifier], Field(min_length=1, max_length=10)]


class SyntheticInputData(WireModel):
    """Private input file; this is neither uploaded evidence nor qualification."""

    observations: Annotated[
        list[SyntheticReferenceObservation], Field(min_length=1, max_length=10)
    ]
    redacted_process_log: SyntheticProcessLog

    @model_validator(mode="after")
    def coherent_input(self) -> "SyntheticInputData":
        ids = [item.scenario_id for item in self.observations]
        if len(ids) != len(set(ids)) or self.redacted_process_log.scenario_ids != ids:
            raise ValueError("Synthetic input scenario identities must match")
        if any(
            item.elapsed_monotonic_ms != item.elapsed_simulation_ms
            for item in self.observations
        ):
            raise ValueError("Synthetic input uses coherent virtual clocks")
        return self


def installed_runtime() -> tuple[str, str, ExecutionTarget]:
    version = importlib.metadata.version("featherlane-runner")
    system = {"Darwin": "macos", "Linux": "linux"}.get(platform.system())
    architecture = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x86_64"}.get(
        platform.machine()
    )
    if system is None or architecture is None:
        raise LocalRegistrationError("Synthetic protocol host target is unsupported.")
    return (
        version,
        platform.python_version(),
        ExecutionTarget(operatingSystem=system, architecture=architecture),
    )


def runtime_source_digest() -> str:
    # Measure the installed client modules, not a self-reported revision string.
    root = Path(__file__).parent
    manifest = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.glob("*.py"))
    }
    if not manifest:
        raise LocalRegistrationError("Synthetic protocol source is unavailable.")
    content = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(content).hexdigest()


def load_synthetic_input(path: Path) -> tuple[SyntheticInputData, str]:
    raw = read_private_input(path)
    data = SyntheticInputData.model_validate_json(raw)
    return data, hashlib.sha256(raw).hexdigest()


class SyntheticInventory(WireModel):
    """Explicit private input allowlist, with no commands or executable paths."""

    build_metadata: SyntheticBuildMetadata
    input_file: LocalPath
    configuration_file: LocalPath
    integration_profile: SyntheticIntegrationProfileSpec
    display_name: DisplayName


def synthetic_heartbeat(sequence: int, path: Path) -> RunnerHeartbeat:
    inventory = SyntheticInventory.model_validate_json(read_private_input(path))
    _, artifact = load_synthetic_input(Path(inventory.input_file))
    configuration = hashlib.sha256(
        read_private_input(Path(inventory.configuration_file))
    ).hexdigest()
    version, python, target = installed_runtime()
    source = runtime_source_digest()
    build = inventory.build_metadata
    profile = inventory.integration_profile
    if (
        build.artifact_sha256 != artifact
        or build.source_digest != source
        or build.configuration_digest != configuration
        or profile.configuration_digest != configuration
        or build.execution_target != target
        or profile.execution_target != target
        or profile.python_version != python
    ):
        raise LocalRegistrationError("Approved synthetic inputs or runtime changed.")
    declaration = SyntheticBuildDeclaration(
        id=build_identity(build), **build.model_dump()
    )
    metadata = LocalProfileMetadata(
        displayName=inventory.display_name,
        digest=metadata_digest(inventory),
        integrationProfileId=integration_identity(profile),
        integrationProfileDigest=integration_digest(profile),
        configurationDigest=configuration,
        executionTarget=target,
    )
    local = LocalProfileDeclaration(
        id=local_profile_identity(metadata), **metadata.model_dump()
    )
    readiness = SyntheticReadiness(
        runtimeFamily="SYNTHETIC",
        runtimeId=RUNTIME_ID,
        executionMode="NON_EXECUTING",
        supportedOperations=["CLAIM", "MANIFEST", "HEARTBEAT"],
        runnerVersion=version,
        pythonVersion=python,
        executionTarget=target,
        protocolSourceDigest=source,
        configurationDigest=configuration,
        inputArtifactSha256=artifact,
        buildIds=[declaration.id],
        localProfileIds=[local.id],
        allowedEvidenceKinds=["OBSERVATIONS", "REDACTED_PROCESS_LOG"],
        maximumArtifactBytes=1_048_576,
    )
    return RunnerHeartbeat(
        sequence=sequence,
        contractVersion=CONTRACT_VERSION,
        protocolVersion=PROTOCOL_VERSION,
        capacityState="DISABLED",
        availableBuilds=[declaration],
        localProfiles=[local],
        diagnostics=[RunnerDiagnostic(code="INPUTS_DECLARED")],
        syntheticReadiness=readiness,
    )
