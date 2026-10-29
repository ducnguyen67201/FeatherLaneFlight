"""Immutable simulator registration metadata; no local paths or launch commands."""

import hashlib
import json
from typing import Annotated, Literal

from pydantic import Field, model_validator

from featherlane_contracts import (
    CursorMeta,
    Digest,
    DisplayName,
    Identifier,
    SuccessEnvelope,
    UtcTimestamp,
    WireModel,
)

Revision = Annotated[str, Field(pattern=r"^[a-f0-9]{40,64}$")]
Version = Annotated[
    str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.+-]+$")
]


class ExecutionTarget(WireModel):
    operating_system: Literal["macos", "linux"]
    architecture: Literal["arm64", "x86_64"]


class BuildMetadata(WireModel):
    label: DisplayName
    base_flight_stack_revision: Revision
    source_revision: Revision
    source_digest: Digest
    patch_digest: Digest | None
    artifact_sha256: Digest
    flight_stack: Literal["PX4"]
    flight_stack_version: Version
    execution_target: ExecutionTarget
    configuration_digest: Digest


class BuildDeclaration(BuildMetadata):
    id: Identifier


class BuildView(BuildDeclaration):
    project_id: Identifier
    created_at: UtcTimestamp


class IntegrationProfileSpec(WireModel):
    runtime_family: Literal["PX4"]
    name: DisplayName
    revision: Annotated[int, Field(ge=1, le=1_000_000)]
    flight_stack: Literal["PX4"]
    base_flight_stack_revision: Revision
    flight_stack_version: Version
    simulator: Literal["SIH"]
    vehicle: Literal["sihsim_quadx"]
    execution_target: ExecutionTarget
    python_version: Version
    mavsdk_version: Version
    configuration_digest: Digest
    speed_factor: Annotated[float, Field(ge=1, le=1)]
    clock_policy: Literal["MONOTONIC_AND_SIMULATION"]
    randomization_policy: Literal["FIXED_SEED"]
    available_checks: Annotated[list[Identifier], Field(max_length=100)]
    declared_capabilities: Annotated[list[Identifier], Field(max_length=100)]


class IntegrationProfileView(IntegrationProfileSpec):
    id: Identifier
    digest: Digest
    project_id: Identifier
    created_at: UtcTimestamp
    support_level: Literal["DECLARED"]


class SyntheticIntegrationProfileSpec(WireModel):
    runtime_family: Literal["SYNTHETIC"]
    name: DisplayName
    revision: Annotated[int, Field(ge=1, le=1_000_000)]
    simulator: Literal["FAKE"]
    execution_target: ExecutionTarget
    python_version: Version
    configuration_digest: Digest
    speed_factor: Annotated[float, Field(ge=1, le=1)]
    clock_policy: Literal["MONOTONIC_AND_SIMULATION"]
    randomization_policy: Literal["FIXED_SEED"]
    available_checks: Annotated[
        list[Literal["mission_complete", "landed_disarmed", "duration"]],
        Field(min_length=3, max_length=3),
    ]
    declared_capabilities: Annotated[
        list[Literal["fake.nominal"]], Field(min_length=1, max_length=1)
    ]

    @model_validator(mode="after")
    def unique_check_inventory(self) -> "SyntheticIntegrationProfileSpec":
        if len(set(self.available_checks)) != 3:
            raise ValueError("The synthetic check inventory must contain unique checks")
        return self


class SyntheticIntegrationProfileView(SyntheticIntegrationProfileSpec):
    id: Identifier
    digest: Digest
    project_id: Identifier
    created_at: UtcTimestamp
    support_level: Literal["DECLARED"]


RegisteredIntegrationProfileSpec = Annotated[
    IntegrationProfileSpec | SyntheticIntegrationProfileSpec,
    Field(discriminator="runtime_family"),
]
RegisteredIntegrationProfileView = Annotated[
    IntegrationProfileView | SyntheticIntegrationProfileView,
    Field(discriminator="runtime_family"),
]


class LocalProfileMetadata(WireModel):
    display_name: DisplayName
    digest: Digest
    integration_profile_id: Identifier
    integration_profile_digest: Digest
    configuration_digest: Digest
    execution_target: ExecutionTarget


class LocalProfileDeclaration(LocalProfileMetadata):
    id: Identifier


class LocalProfileView(LocalProfileDeclaration):
    project_id: Identifier
    created_at: UtcTimestamp


class RegisterBuildRequest(WireModel):
    runner_id: Identifier
    declaration: BuildDeclaration


class RegisterLocalProfileRequest(WireModel):
    runner_id: Identifier
    declaration: LocalProfileDeclaration


class RegisterIntegrationProfileRequest(WireModel):
    profile: RegisteredIntegrationProfileSpec


class BuildEnvelope(SuccessEnvelope[BuildView]):
    pass


class IntegrationProfileEnvelope(SuccessEnvelope[RegisteredIntegrationProfileView]):
    pass


class LocalProfileEnvelope(SuccessEnvelope[LocalProfileView]):
    pass


class BuildListEnvelope(WireModel):
    data: Annotated[list[BuildView], Field(max_length=100)]
    meta: CursorMeta


class IntegrationProfileListEnvelope(WireModel):
    data: Annotated[list[RegisteredIntegrationProfileView], Field(max_length=100)]
    meta: CursorMeta


class LocalProfileListEnvelope(WireModel):
    data: Annotated[list[LocalProfileView], Field(max_length=100)]
    meta: CursorMeta


class RegistrationCompatibility(WireModel):
    build_id: Identifier
    local_profile_id: Identifier
    integration_profile_id: Identifier
    compatible: bool
    reasons: Annotated[
        list[
            Literal[
                "TARGET_MISMATCH",
                "BASE_REVISION_MISMATCH",
                "STACK_VERSION_MISMATCH",
                "CONFIGURATION_MISMATCH",
                "PROFILE_DIGEST_MISMATCH",
                "RUNTIME_FAMILY_MISMATCH",
            ]
        ],
        Field(max_length=6),
    ]
    qualification: Literal["NOT_EVALUATED"]


class RegistrationCompatibilityEnvelope(SuccessEnvelope[RegistrationCompatibility]):
    pass


def metadata_digest(model: WireModel, fields: set[str] | None = None) -> str:
    """Stable UTF-8 JSON fingerprint, shared by runner and control plane."""
    data = json.dumps(
        model.model_dump(mode="json", include=fields),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return hashlib.sha256(data.encode()).hexdigest()


def build_identity(metadata: BuildMetadata) -> str:
    return "build_" + metadata_digest(metadata, set(BuildMetadata.model_fields))


def integration_digest(
    spec: IntegrationProfileSpec | SyntheticIntegrationProfileSpec,
) -> str:
    fields = (
        SyntheticIntegrationProfileSpec.model_fields
        if isinstance(spec, SyntheticIntegrationProfileSpec)
        else IntegrationProfileSpec.model_fields
    )
    return metadata_digest(spec, set(fields))


def integration_identity(
    spec: IntegrationProfileSpec | SyntheticIntegrationProfileSpec,
) -> str:
    return "integration_" + integration_digest(spec)


def local_profile_identity(metadata: LocalProfileMetadata) -> str:
    return "local_" + metadata_digest(metadata, set(LocalProfileMetadata.model_fields))
