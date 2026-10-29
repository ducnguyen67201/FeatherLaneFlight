"""Current membership is checked inside every caller-visible queue transaction."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from featherlane_contracts import (
    CreateRunRequest,
    CursorMeta,
    ErrorCode,
    RunEnvelope,
    RunListEnvelope,
)
from featherlane_contracts.registration import (
    BuildView,
    LocalProfileView,
    SyntheticBuildView,
    SyntheticIntegrationProfileView,
    metadata_digest,
)
from featherlane_contracts.run_detail import RunDetailEnvelope
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.access.persistence import AccessStore
from featherlane_api.modules.events.domain import EventCursors
from featherlane_api.modules.events.persistence import EventStore
from featherlane_api.modules.evidence.application import artifact_summary
from featherlane_api.modules.evidence.persistence import EvidenceStore
from featherlane_api.modules.evidence.storage import LocalPrivateArtifactStorage
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.leases.expiry import expire_attempt
from featherlane_api.modules.leases.persistence import AttemptRecord, LeaseStore
from featherlane_api.modules.leases.usage_reporting import usage_summaries
from featherlane_api.modules.registration.application import RegistrationService
from featherlane_api.modules.registration.domain import (
    validate_build,
    validate_local_profile,
)
from featherlane_api.modules.runners.application import require_runner_declarations
from featherlane_api.modules.runners.persistence import RunnerStore
from featherlane_api.modules.runs.domain import freeze_manifest, trial_matrix
from featherlane_api.modules.runs.persistence import RunReceipt, RunRecord, RunStore
from featherlane_api.modules.runs.presentation import run_detail, run_entry, run_summary
from featherlane_api.modules.suites.application import require_qualified_suite


class RunService:
    def __init__(
        self,
        session: AsyncSession,
        identity: IdentityService,
        queue_limit: int,
        event_cursors: EventCursors,
        artifact_storage: LocalPrivateArtifactStorage,
    ):
        self.session = session
        self.identity = identity
        self.store = RunStore(session)
        self.queue_limit = queue_limit
        self.event_cursors = event_cursors
        self.artifact_storage = artifact_storage

    async def authorize(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        csrf: str | None = None,
    ) -> None:
        await self.identity.require_live(principal, handle, csrf)
        await AccessStore(self.session).require_project(principal.user_id, project_id)

    async def options(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        runner_id: str | None,
        build_id: str | None,
        local_profile_id: str | None,
    ):
        from featherlane_api.modules.runs.options import run_options

        async with self.session.begin():
            await self.authorize(principal, handle, project_id)
            return await run_options(
                self.session,
                self.identity,
                project_id,
                runner_id,
                build_id,
                local_profile_id,
            )

    async def create(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        project_id: str,
        key: str,
        body: CreateRunRequest,
    ) -> RunEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id, csrf)
            await self.store.lock_project(project_id)
            digest = metadata_digest(body)
            receipt = await self.store.receipt(project_id, principal.user_id, key)
            if receipt is not None:
                if receipt.request_digest != digest:
                    raise ApiError(
                        409,
                        ErrorCode.IDEMPOTENCY_CONFLICT,
                        "This submission key was used with different inputs.",
                    )
                return RunEnvelope(
                    data=run_summary(await self.store.exact(receipt.run_id))
                )
            if await self.store.queued_count(project_id) >= self.queue_limit:
                raise ApiError(
                    409,
                    ErrorCode.QUEUE_LIMIT_REACHED,
                    "The project queued-run limit has been reached.",
                )
            runner = await require_runner_declarations(
                self.session, project_id=project_id, runner_id=body.runner_id
            )
            suite = await require_qualified_suite(
                self.session, project_id=project_id, revision_id=body.suite_revision_id
            )
            registrations = RegistrationService(self.session, self.identity)
            build = await registrations.read(project_id, "BUILD", body.build_id)
            if not isinstance(build, (BuildView, SyntheticBuildView)):
                raise RuntimeError("Unexpected build variant.")
            validate_build(build)
            matches = [
                local
                for local in runner.local_profiles
                if local.digest == body.local_execution_profile_digest
            ]
            if len(matches) != 1:
                raise ApiError(
                    422,
                    ErrorCode.PROFILE_MISMATCH,
                    "The selected local profile is unavailable or ambiguous.",
                )
            local = await registrations.read(project_id, "LOCAL_PROFILE", matches[0].id)
            if not isinstance(local, LocalProfileView):
                raise RuntimeError("Unexpected local profile variant.")
            validate_local_profile(local)
            profile = await registrations.read(
                project_id, "INTEGRATION", suite.integration_profile_id
            )
            if not isinstance(profile, SyntheticIntegrationProfileView):
                raise ApiError(
                    422,
                    ErrorCode.CAPABILITY_UNSUPPORTED,
                    "Only the qualified synthetic integration is available.",
                )
            manifest = freeze_manifest(
                runner, build, local, profile, suite, body.repetitions
            )
            now = datetime.now(UTC)
            run_id = "run_" + uuid4().hex
            row = RunRecord(
                id=run_id,
                project_id=project_id,
                actor_id=principal.user_id,
                runner_id=runner.id,
                build_id=build.id,
                suite_revision_id=suite.id,
                build_label=build.label,
                suite_title=suite.title,
                suite_revision=suite.revision,
                runner_display_name=runner.display_name,
                repetitions=body.repetitions,
                requested_manifest=manifest.model_dump(mode="json"),
                suite_snapshot=suite.model_dump(mode="json"),
                expected_trials=[
                    trial.model_dump(mode="json")
                    for trial in trial_matrix(run_id, suite, body.repetitions)
                ],
                execution_state="QUEUED",
                evaluation_outcome="NOT_EVALUATED",
                terminal_reason=None,
                created_at=now,
                started_at=None,
                finished_at=None,
                cancellation_requested_at=None,
                cancellation_deadline_at=None,
            )
            self.session.add(row)
            await self.session.flush()
            self.session.add(
                RunReceipt(
                    project_id=project_id,
                    actor_id=principal.user_id,
                    request_key=key,
                    request_digest=digest,
                    run_id=run_id,
                )
            )
            self.store.audit(row, principal.user_id, "ADMITTED", now)
            await self.session.flush()
            return RunEnvelope(data=run_summary(row))

    async def list(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        limit: int,
        cursor: str | None,
        search: str | None,
        execution_state: str | None,
        evaluation_outcome: str | None,
    ) -> RunListEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id)
            rows = await self.store.list(
                project_id, limit, cursor, search, execution_state, evaluation_outcome
            )
            return RunListEnvelope(
                data=[run_entry(row) for row in rows[:limit]],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1].id if len(rows) > limit else None
                ),
            )

    async def detail(
        self, principal: Principal, handle: str | None, run_id: str
    ) -> RunDetailEnvelope:
        async with self.session.begin():
            # Read-only inspection locks the run through attempt composition.
            # It never acquires a runner lock or mutates assignment state.
            lookup = await self.store.exact(run_id)
            await self.authorize(principal, handle, lookup.project_id)
            row = await self.store.exact(run_id, lock=True)
            attempts = await LeaseStore(self.session).for_run(run_id)
            usage = await usage_summaries(
                self.session, [attempt.id for attempt in attempts]
            )
            now = datetime.now(UTC)
            detail = run_detail(row, now, attempts, usage)
            detail.artifact_summary = artifact_summary(
                await EvidenceStore(self.session).for_run(run_id),
                now,
                self.artifact_storage,
            )
            stream = await EventStore(self.session).stream(run_id)
            detail.server_event_cursor = self.event_cursors.encode(
                run_id, stream.last_position if stream else 0
            )
            return RunDetailEnvelope(data=detail)

    async def cancel(
        self, principal: Principal, handle: str | None, csrf: str, run_id: str
    ) -> RunEnvelope:
        async with self.session.begin():
            lookup = await self.store.exact(run_id)
            await self.authorize(principal, handle, lookup.project_id, csrf)
            # Same ordering as future claims. Offline/revoked runner health must
            # never prevent a user from canceling its unclaimed work.
            runner = await RunnerStore(self.session).by_id(lookup.runner_id, lock=True)
            row = await self.store.exact(run_id, lock=True)
            if row.execution_state in {"COMPLETED", "CANCELED", "ERROR"}:
                return RunEnvelope(data=run_summary(row))
            if row.execution_state != "QUEUED":
                if runner is None:
                    raise RuntimeError("Active run runner is missing")
                attempt = await self.session.scalar(
                    select(AttemptRecord)
                    .where(
                        AttemptRecord.run_id == row.id,
                        AttemptRecord.finished_at.is_(None),
                    )
                    .with_for_update()
                    .execution_options(populate_existing=True)
                )
                if attempt is None:
                    raise RuntimeError("Active run attempt is missing")
                now = await self.session.scalar(select(func.clock_timestamp()))
                if now is None:
                    raise RuntimeError("Database clock unavailable")
                if not expire_attempt(runner, row, attempt, now):
                    if row.cancellation_requested_at is None:
                        row.cancellation_requested_at = now
                        row.cancellation_deadline_at = now + timedelta(seconds=30)
                        attempt.lease_expires_at = min(
                            attempt.lease_expires_at, row.cancellation_deadline_at
                        )
                        self.store.audit(
                            row, principal.user_id, "CANCELLATION_REQUESTED", now
                        )
                await self.session.flush()
                return RunEnvelope(data=run_summary(row))
            now = datetime.now(UTC)
            row.execution_state = "CANCELED"
            row.cancellation_requested_at = now
            row.finished_at = now
            row.terminal_reason = {
                "code": "CANCELED_BEFORE_CLAIM",
                "message": "Canceled before assignment; no trial was executed.",
            }
            self.store.audit(row, principal.user_id, "QUEUED_CANCELED", now)
            await self.session.flush()
            return RunEnvelope(data=run_summary(row))
