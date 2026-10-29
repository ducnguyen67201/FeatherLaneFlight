"""Shared registration invariants; metadata compatibility is not qualification."""

from featherlane_contracts import ErrorCode
from featherlane_contracts.registration import (
    BuildDeclaration,
    BuildView,
    IntegrationProfileView,
    LocalProfileDeclaration,
    LocalProfileView,
    RegisteredIntegrationProfileView,
    RegistrationCompatibility,
    build_identity,
    integration_digest,
    integration_identity,
    local_profile_identity,
)

from featherlane_api.http.errors import ApiError


def validate_build(declaration: BuildDeclaration) -> None:
    if declaration.id != build_identity(declaration):
        raise ApiError(
            422,
            ErrorCode.BUILD_UNAVAILABLE,
            "The build identity does not match its metadata.",
        )


def validate_local_profile(declaration: LocalProfileDeclaration) -> None:
    if declaration.id != local_profile_identity(declaration):
        raise ApiError(
            422,
            ErrorCode.PROFILE_MISMATCH,
            "The local profile identity does not match its metadata.",
        )


def validate_integration(profile: RegisteredIntegrationProfileView) -> None:
    digest = integration_digest(profile)
    if profile.id != integration_identity(profile) or profile.digest != digest:
        raise ApiError(
            422,
            ErrorCode.PROFILE_MISMATCH,
            "The integration profile identity does not match its specification.",
        )


def compatibility(
    build: BuildView,
    local: LocalProfileView,
    integration: RegisteredIntegrationProfileView,
) -> RegistrationCompatibility:
    reasons = []
    if integration.runtime_family != "PX4":
        reasons.append("RUNTIME_FAMILY_MISMATCH")
    if not (
        build.execution_target == local.execution_target == integration.execution_target
    ):
        reasons.append("TARGET_MISMATCH")
    if isinstance(integration, IntegrationProfileView):
        if build.base_flight_stack_revision != integration.base_flight_stack_revision:
            reasons.append("BASE_REVISION_MISMATCH")
        if build.flight_stack_version != integration.flight_stack_version:
            reasons.append("STACK_VERSION_MISMATCH")
    if not (
        build.configuration_digest
        == local.configuration_digest
        == integration.configuration_digest
    ):
        reasons.append("CONFIGURATION_MISMATCH")
    if (
        local.integration_profile_id != integration.id
        or local.integration_profile_digest != integration.digest
    ):
        reasons.append("PROFILE_DIGEST_MISMATCH")
    return RegistrationCompatibility(
        buildId=build.id,
        localProfileId=local.id,
        integrationProfileId=integration.id,
        compatible=not reasons,
        reasons=reasons,
        qualification="NOT_EVALUATED",
    )
