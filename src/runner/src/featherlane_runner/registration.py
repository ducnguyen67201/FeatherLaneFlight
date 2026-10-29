"""Resolve operator-approved local files without launching or downloading anything."""

import hashlib
import json
import os
import stat
from pathlib import Path
from typing import Annotated, Literal

from featherlane_contracts import Digest, Identifier, WireModel
from featherlane_contracts.registration import (
    BuildDeclaration,
    BuildMetadata,
    IntegrationProfileSpec,
    LocalProfileDeclaration,
    LocalProfileMetadata,
    build_identity,
    integration_digest,
    integration_identity,
    local_profile_identity,
    metadata_digest,
)
from pydantic import Field

LocalPath = Annotated[str, Field(min_length=1, max_length=4096)]


class ApprovedFile(WireModel):
    name: Identifier
    path: LocalPath


class ApprovedBuild(WireModel):
    metadata: BuildMetadata
    executable: LocalPath
    source_files: Annotated[list[ApprovedFile], Field(min_length=1, max_length=10000)]
    configuration_files: Annotated[
        list[ApprovedFile], Field(min_length=1, max_length=100)
    ]
    patch_file: LocalPath | None = None


class LocalLaunchProfile(WireModel):
    """Private launch policy. The cloud receives only its fingerprint/projection."""

    display_name: Annotated[str, Field(min_length=1, max_length=128)]
    role: Literal["PX4_SIMULATOR"]
    working_directory: LocalPath
    arguments: Annotated[
        list[Annotated[str, Field(max_length=512)]], Field(max_length=32)
    ]
    environment_references: Annotated[
        list[Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_]{0,127}$")]],
        Field(max_length=32),
    ]
    endpoint_host: Literal["127.0.0.1"]
    endpoint_port: Annotated[int, Field(ge=1024, le=65535)]
    artifact_directory: LocalPath
    configuration_files: Annotated[
        list[ApprovedFile], Field(min_length=1, max_length=100)
    ]
    integration_profile: IntegrationProfileSpec


class LocalRegistrationError(Exception):
    """Safe reason only; never expose local filenames, environment or file bytes."""


def _path(value: str, *, directory: bool = False) -> Path:
    path = Path(value)
    if not path.is_absolute() or path.resolve() != path:
        raise LocalRegistrationError(
            "Use an approved absolute local path without symlinks."
        )
    if (directory and not path.is_dir()) or (not directory and not path.is_file()):
        raise LocalRegistrationError(
            "An approved local file or directory is unavailable."
        )
    return path


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        # Hash the opened regular file; detect changes during measurement.
        with path.open("rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode):
                raise LocalRegistrationError("Only regular local files are allowed.")
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
            after = os.fstat(stream.fileno())
            if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
                after.st_size,
                after.st_mtime_ns,
                after.st_ctime_ns,
            ):
                raise LocalRegistrationError(
                    "An approved local file changed during measurement."
                )
    except OSError:
        raise LocalRegistrationError(
            "An approved local file could not be measured."
        ) from None
    return digest.hexdigest()


def files_digest(files: list[ApprovedFile]) -> str:
    names = [item.name for item in files]
    if len(set(names)) != len(names):
        raise LocalRegistrationError("Approved file names must be unique.")
    manifest = {item.name: file_digest(_path(item.path)) for item in files}
    content = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(content.encode()).hexdigest()


def resolve_build(
    approved: list[ApprovedBuild], build_id: str, expected_artifact_sha256: str
) -> tuple[BuildDeclaration, Path]:
    matches = [item for item in approved if build_identity(item.metadata) == build_id]
    if len(matches) != 1:
        raise LocalRegistrationError(
            "The requested build is not uniquely locally approved."
        )
    build = matches[0]
    executable = _path(build.executable)
    if not os.access(executable, os.X_OK):
        raise LocalRegistrationError("The approved artifact is not executable.")
    if (
        expected_artifact_sha256 != build.metadata.artifact_sha256
        or file_digest(executable) != build.metadata.artifact_sha256
        or files_digest(build.source_files) != build.metadata.source_digest
        or files_digest(build.configuration_files)
        != build.metadata.configuration_digest
        or (build.metadata.patch_digest is None) != (build.patch_file is None)
        or (
            build.patch_file is not None
            and file_digest(_path(build.patch_file)) != build.metadata.patch_digest
        )
    ):
        raise LocalRegistrationError(
            "The approved build source, artifact or configuration has changed."
        )
    return BuildDeclaration(id=build_id, **build.metadata.model_dump()), executable


def declare_local_profile(profile: LocalLaunchProfile) -> LocalProfileDeclaration:
    _path(profile.working_directory, directory=True)
    _path(profile.artifact_directory, directory=True)
    configuration = files_digest(profile.configuration_files)
    if configuration != profile.integration_profile.configuration_digest:
        raise LocalRegistrationError(
            "The local configuration does not match the integration profile."
        )
    metadata = LocalProfileMetadata(
        displayName=profile.display_name,
        digest=metadata_digest(profile),
        integrationProfileId=integration_identity(profile.integration_profile),
        integrationProfileDigest=integration_digest(profile.integration_profile),
        configurationDigest=configuration,
        executionTarget=profile.integration_profile.execution_target,
    )
    return LocalProfileDeclaration(
        id=local_profile_identity(metadata), **metadata.model_dump()
    )


def resolve_local_profile(
    approved: list[LocalLaunchProfile], profile_id: str, expected_digest: Digest
) -> LocalLaunchProfile:
    matches = []
    for profile in approved:
        declaration = declare_local_profile(profile)
        if declaration.id == profile_id and declaration.digest == expected_digest:
            matches.append(profile)
    if len(matches) != 1:
        raise LocalRegistrationError(
            "The requested local profile is unavailable or has changed."
        )
    return matches[0]
