"""Measure explicit owner-approved local inventory for metadata-only heartbeats."""

import os
import platform
import stat
from pathlib import Path
from typing import Annotated

from featherlane_contracts import CONTRACT_VERSION, PROTOCOL_VERSION, WireModel
from featherlane_contracts.registration import build_identity
from featherlane_contracts.runners import RunnerDiagnostic, RunnerHeartbeat
from pydantic import Field

from featherlane_runner.registration import (
    ApprovedBuild,
    LocalLaunchProfile,
    LocalRegistrationError,
    _path,
    declare_local_profile,
    resolve_build,
)


class ApprovedInventory(WireModel):
    builds: Annotated[list[ApprovedBuild], Field(max_length=100)]
    local_profiles: Annotated[list[LocalLaunchProfile], Field(max_length=100)]


def read_private_input(path: Path) -> bytes:
    selected = _path(str(path.expanduser().absolute()))
    if any((parent / ".git").exists() for parent in selected.parents):
        raise LocalRegistrationError("Keep private inventory outside the checkout.")
    descriptor = os.open(selected, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != 0o600
            or info.st_nlink != 1
        ):
            raise LocalRegistrationError("Private inventory must be owner-only.")
        raw = stream.read(1_048_577)
    if len(raw) > 1_048_576:
        raise LocalRegistrationError("The approved inventory is too large.")
    return raw


def load_inventory(path: Path) -> ApprovedInventory:
    return ApprovedInventory.model_validate_json(read_private_input(path))


def declaration_heartbeat(sequence: int, path: Path | None) -> RunnerHeartbeat:
    builds = []
    profiles = []
    diagnostic = "NOT_CONFIGURED"
    if path is not None:
        inventory = load_inventory(path)
        operating_system = {"Darwin": "macos", "Linux": "linux"}.get(platform.system())
        architecture = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x86_64"}.get(
            platform.machine()
        )
        targets = [item.metadata.execution_target for item in inventory.builds]
        targets.extend(
            item.integration_profile.execution_target
            for item in inventory.local_profiles
        )
        if any(
            target.operating_system != operating_system
            or target.architecture != architecture
            for target in targets
        ):
            raise LocalRegistrationError(
                "Approved inputs do not match this host target."
            )
        builds = [
            resolve_build(
                inventory.builds,
                build_identity(item.metadata),
                item.metadata.artifact_sha256,
            )[0]
            for item in inventory.builds
        ]
        profiles = [declare_local_profile(item) for item in inventory.local_profiles]
        if builds or profiles:
            diagnostic = "INPUTS_DECLARED"
    return RunnerHeartbeat(
        sequence=sequence,
        contractVersion=CONTRACT_VERSION,
        protocolVersion=PROTOCOL_VERSION,
        capacityState="DISABLED",
        availableBuilds=builds,
        localProfiles=profiles,
        diagnostics=[RunnerDiagnostic(code=diagnostic)],
    )
