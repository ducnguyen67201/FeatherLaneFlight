"""Bounded options from registered declarations; admission revalidates on submit."""

from datetime import UTC, datetime

from featherlane_contracts import (
    RunBuildOption,
    RunLocalProfileOption,
    RunOptions,
    RunOptionsEnvelope,
    RunRunnerOption,
    RunSuiteOption,
)
from featherlane_contracts.registration import (
    BuildView,
    LocalProfileView,
    SyntheticBuildView,
    SyntheticIntegrationProfileView,
)
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.registration.application import RegistrationService
from featherlane_api.modules.registration.domain import compatibility
from featherlane_api.modules.registration.persistence import RegistrationStore
from featherlane_api.modules.runners.application import (
    require_runner_declarations,
    summary,
)
from featherlane_api.modules.runners.persistence import RunnerStore
from featherlane_api.modules.runs.domain import freeze_manifest
from featherlane_api.modules.suites.application import require_qualified_suite
from featherlane_api.modules.suites.persistence import SuiteStore, revision_view


async def run_options(
    session: AsyncSession,
    identity: IdentityService,
    project_id: str,
    runner_id: str | None,
    build_id: str | None,
    local_profile_id: str | None,
) -> RunOptionsEnvelope:
    """Caller authorizes project and owns transaction; never admits a Run here."""
    runners = [
        summary(row, datetime.now(UTC))
        for row in await RunnerStore(session).list(project_id, 100, None)
    ]
    runner_options = [
        RunRunnerOption(
            id=row.id,
            displayName=row.display_name,
            hostPlatform=row.host_platform,
            connectionState=row.connection_state,
            capacityState=row.capacity_state,
            lastSeenAt=row.last_seen_at,
        )
        for row in runners
    ]
    builds = []
    profiles = []
    suites = []
    if runner_id is not None:
        runner = await require_runner_declarations(
            session, project_id=project_id, runner_id=runner_id
        )
        registrations = RegistrationService(session, identity)
        store = RegistrationStore(session)
        available_builds = []
        for declaration in runner.available_builds:
            row = await store.get(project_id, "BUILD", declaration.id)
            if row is not None:
                view = registrations.project(
                    "BUILD",
                    row.id,
                    project_id,
                    row.created_at.isoformat().replace("+00:00", "Z"),
                    row.payload,
                )
                if isinstance(
                    view, (BuildView, SyntheticBuildView)
                ) and declaration.model_dump() == view.model_dump(
                    exclude={"project_id", "created_at"}
                ):
                    available_builds.append(view)
        builds = [
            RunBuildOption(
                id=row.id,
                label=row.label,
                sourceRevision=row.source_revision,
                artifactSha256=row.artifact_sha256,
            )
            for row in available_builds
        ]
        build = next((row for row in available_builds if row.id == build_id), None)
        available_profiles = []
        if build:
            for declaration in runner.local_profiles:
                row = await store.get(project_id, "LOCAL_PROFILE", declaration.id)
                if row is None:
                    continue
                local = registrations.project(
                    "LOCAL_PROFILE",
                    row.id,
                    project_id,
                    row.created_at.isoformat().replace("+00:00", "Z"),
                    row.payload,
                )
                if not isinstance(local, LocalProfileView):
                    raise RuntimeError("Unexpected local profile variant.")
                profile = await registrations.read(
                    project_id, "INTEGRATION", local.integration_profile_id
                )
                if (
                    isinstance(profile, SyntheticIntegrationProfileView)
                    and compatibility(build, local, profile).compatible
                    and declaration.model_dump()
                    == local.model_dump(exclude={"project_id", "created_at"})
                ):
                    available_profiles.append((local, profile))
            profiles = [
                RunLocalProfileOption(
                    id=local.id,
                    displayName=local.display_name,
                    digest=local.digest,
                    integrationProfileId=local.integration_profile_id,
                )
                for local, _ in available_profiles
            ]
        selected = next(
            (
                (local, profile)
                for local, profile in available_profiles
                if local.id == local_profile_id
            ),
            None,
        )
        if build and selected:
            local, profile = selected
            for row in (await SuiteStore(session).catalog(project_id, 100, None))[:100]:
                suite = revision_view(row)
                if suite.integration_profile_id != profile.id:
                    continue
                reason = None
                try:
                    suite = await require_qualified_suite(
                        session, project_id=project_id, revision_id=suite.id
                    )
                    freeze_manifest(runner, build, local, profile, suite, 1)
                except ApiError as exc:
                    reason = exc.message
                suites.append(
                    RunSuiteOption(
                        id=suite.id,
                        suiteId=suite.suite_id,
                        title=suite.title,
                        revision=suite.revision,
                        status="PUBLISHED",
                        digest=suite.digest,
                        scenarioCount=len(suite.scenarios),
                        eligible=reason is None,
                        reason=reason,
                    )
                )
    return RunOptionsEnvelope(
        data=RunOptions(
            runners=runner_options,
            builds=builds,
            localProfiles=profiles,
            suites=suites,
            minimumRepetitions=1,
            maximumRepetitions=10,
        )
    )
