"""Protocol readiness is not execution capability or independent attestation."""

from featherlane_contracts import ErrorCode
from featherlane_contracts.registration import SyntheticBuildDeclaration
from featherlane_contracts.runners import RunnerHeartbeat, SyntheticReadiness

from featherlane_api.http.errors import ApiError


def validate_readiness(body: RunnerHeartbeat) -> SyntheticReadiness | None:
    ready = body.synthetic_readiness
    if ready is None:
        return None
    builds = {item.id: item for item in body.available_builds}
    profiles = {item.id: item for item in body.local_profiles}
    if (
        body.capacity_state != "DISABLED"
        or set(ready.supported_operations) != {"CLAIM", "MANIFEST", "HEARTBEAT"}
        or not set(ready.build_ids) <= builds.keys()
        or not set(ready.local_profile_ids) <= profiles.keys()
        or any(
            not isinstance(builds[identity], SyntheticBuildDeclaration)
            or builds[identity].artifact_sha256 != ready.input_artifact_sha256
            or builds[identity].execution_target != ready.execution_target
            or builds[identity].configuration_digest != ready.configuration_digest
            for identity in ready.build_ids
        )
        or any(
            profiles[identity].execution_target != ready.execution_target
            or profiles[identity].configuration_digest != ready.configuration_digest
            for identity in ready.local_profile_ids
        )
    ):
        raise ApiError(
            422,
            ErrorCode.CAPABILITY_UNSUPPORTED,
            "Non-executing protocol readiness requires disabled matched declarations.",
        )
    return ready
