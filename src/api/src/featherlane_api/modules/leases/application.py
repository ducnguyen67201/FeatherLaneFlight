"""Runner -> run -> attempt locking, with expiry committed before rejection."""

from datetime import datetime, timedelta
from uuid import uuid4

from featherlane_contracts import ErrorCode, ExecutionState
from featherlane_contracts.leases import (
    AttemptHeartbeat,
    AttemptHeartbeatReceipt,
    AttemptManifestReceipt,
    AttemptManifestRequest,
    ClaimAssignment,
    ClaimRequest,
    LeaseGrant,
)
from featherlane_contracts.registration import (
    LocalProfileView,
    SyntheticBuildView,
    SyntheticIntegrationProfileView,
    metadata_digest,
)
from featherlane_contracts.run_detail import ExecutionManifest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.leases.domain import (
    HEARTBEAT_INTERVAL_SECONDS,
    LEASE_LIFETIME_SECONDS,
    MAX_ATTEMPT_DURATION_SECONDS,
    STOPPING_MARGIN_SECONDS,
    LeaseExpired,
    StaleAttempt,
    effective_lease_expiry,
    remaining_ttl_ms,
    require_fence,
    verify_manifest,
)
from featherlane_api.modules.leases.persistence import (
    AttemptRecord,
    ClaimReceipt,
    LeaseStore,
)
from featherlane_api.modules.registration.application import RegistrationService
from featherlane_api.modules.registration.persistence import RegistrationStore
from featherlane_api.modules.runners.application import (
    require_live_record,
    stamp,
    summary,
)
from featherlane_api.modules.runners.domain import (
    RunnerConflict,
    RunnerSecrets,
    RunnerUnavailable,
    require_versions,
)
from featherlane_api.modules.runners.persistence import RunnerRecord, RunnerStore
from featherlane_api.modules.runs.domain import freeze_manifest, require_available
from featherlane_api.modules.runs.persistence import (
    RunRecord,
    RunStore,
    require_queued_run,
)
from featherlane_api.modules.runs.snapshots import admission_snapshot
from featherlane_api.modules.suites.application import require_qualified_suite

ACTIVE_STATES = {"CLAIMED", "STARTING", "RUNNING", "FINALIZING"}


class LeaseService:
    def __init__(self, session: AsyncSession, secrets: RunnerSecrets):
        self.session = session
        self.secrets = secrets
        self.store = LeaseStore(session)

    async def now(self) -> datetime:
        value = await self.session.scalar(select(func.clock_timestamp()))
        if value is None:
            raise RuntimeError("Database clock unavailable")
        return value

    async def authenticate(self, credential: str) -> RunnerRecord:
        runner = require_live_record(
            await RunnerStore(self.session).by_credential(
                self.secrets.digest(credential, "credential")
            ),
            self.secrets.key_id,
            await self.now(),
        )
        require_versions(runner.contract_version, runner.protocol_version)
        return runner

    async def claim(
        self, credential: str, body: ClaimRequest
    ) -> ClaimAssignment | None:
        failure = None
        result = None
        async with self.session.begin():
            runner = await self.authenticate(credential)
            receipt = await self.session.get(ClaimReceipt, (runner.id, body.request_id))
            if receipt is not None:
                if receipt.attempt_id is not None:
                    run, attempt = await self.load_attempt(runner, receipt.attempt_id)
                    failure = self.current_error(runner, run, attempt, await self.now())
                    if failure is None:
                        result = self.assignment(run, attempt, await self.now())
            else:
                active = await self.store.active_for_runner(runner.id)
                if active is not None:
                    run, attempt = await self.load_attempt(runner, active.id)
                    self.expire(runner, run, attempt, await self.now())
                    failure = RunnerUnavailable()
                else:
                    require_available(summary(runner, await self.now()))
                    if runner.capacity_state != "AVAILABLE":
                        raise RunnerUnavailable()
                    candidate = await self.session.scalar(
                        select(RunRecord.id)
                        .where(
                            RunRecord.runner_id == runner.id,
                            RunRecord.project_id == runner.project_id,
                            RunRecord.execution_state == "QUEUED",
                            RunRecord.cancellation_requested_at.is_(None),
                        )
                        .order_by(RunRecord.created_at, RunRecord.id)
                        .limit(1)
                    )
                    if candidate is None:
                        self.session.add(
                            ClaimReceipt(
                                runner_id=runner.id,
                                request_id=body.request_id,
                                attempt_id=None,
                                created_at=await self.now(),
                            )
                        )
                    else:
                        run = await require_queued_run(
                            self.session,
                            project_id=runner.project_id,
                            runner_id=runner.id,
                            run_id=candidate,
                        )
                        await self.require_inputs(runner, run)
                        attempt = await self._reserve(runner, run, body.request_id)
                        result = self.assignment(run, attempt, await self.now())
            await self.session.flush()
        if failure is not None:
            raise failure
        return result

    async def require_inputs(self, runner: RunnerRecord, run: RunRecord) -> None:
        requested, _, _ = admission_snapshot(run)
        suite = await require_qualified_suite(
            self.session, project_id=run.project_id, revision_id=run.suite_revision_id
        )
        values = []
        for kind, identity in (
            ("BUILD", run.build_id),
            ("LOCAL_PROFILE", requested.local_profile_id),
            ("INTEGRATION", requested.integration_profile_id),
        ):
            row = await RegistrationStore(self.session).get(
                run.project_id, kind, identity
            )
            if row is None:
                raise AccessNotFound()
            values.append(
                RegistrationService.project(
                    kind, row.id, row.project_id, stamp(row.created_at), row.payload
                )
            )
        build, local, profile = values
        if (
            not isinstance(build, SyntheticBuildView)
            or not isinstance(local, LocalProfileView)
            or not isinstance(profile, SyntheticIntegrationProfileView)
        ):
            raise ApiError(
                422,
                ErrorCode.CAPABILITY_UNSUPPORTED,
                "Only the qualified synthetic input family is supported.",
            )
        current = freeze_manifest(
            summary(runner, await self.now()),
            build,
            local,
            profile,
            suite,
            run.repetitions,
        )
        verify_manifest(requested, current)

    async def _reserve(
        self, runner: RunnerRecord, run: RunRecord, request_id: str
    ) -> AttemptRecord:
        """Internal reservation core. Caller holds authenticated runner lock and policy.

        It still locks/revalidates the queued run and active uniqueness; it cannot
        be reached from a second HTTP route or an eligibility bypass.
        """
        if not self.session.in_transaction():
            raise RuntimeError("Reservation requires caller-owned transaction")
        run = await require_queued_run(
            self.session,
            project_id=runner.project_id,
            runner_id=runner.id,
            run_id=run.id,
        )
        if (
            runner.capacity_state != "AVAILABLE"
            or await self.store.active_for_runner(runner.id) is not None
            or runner.fencing_number >= 9_007_199_254_740_991
        ):
            raise RunnerUnavailable()
        now = await self.now()
        runner.fencing_number += 1
        runner.capacity_state = "BUSY"
        run.execution_state = "CLAIMED"
        attempt = AttemptRecord(
            id=uuid4().hex,
            run_id=run.id,
            runner_id=runner.id,
            project_id=runner.project_id,
            lease_id=uuid4().hex,
            fencing_number=runner.fencing_number,
            lease_expires_at=min(
                now + timedelta(seconds=LEASE_LIFETIME_SECONDS),
                runner.credential_expires_at,
            ),
            heartbeat_sequence=0,
            heartbeat_digest=None,
            observed_manifest=None,
            manifest_accepted_at=None,
            created_at=now,
            finished_at=None,
            terminal_reason=None,
        )
        self.session.add(attempt)
        await self.session.flush()
        self.session.add(
            ClaimReceipt(
                runner_id=runner.id,
                request_id=request_id,
                attempt_id=attempt.id,
                created_at=now,
            )
        )
        await self.session.flush()
        return attempt

    async def load_attempt(
        self, runner: RunnerRecord, attempt_id: str
    ) -> tuple[RunRecord, AttemptRecord]:
        lookup = await self.session.get(AttemptRecord, attempt_id)
        if (
            lookup is None
            or lookup.runner_id != runner.id
            or lookup.project_id != runner.project_id
        ):
            raise AccessNotFound()
        run = await RunStore(self.session).exact(lookup.run_id, lock=True)
        attempt = await self.session.scalar(
            select(AttemptRecord)
            .where(AttemptRecord.id == attempt_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if (
            attempt is None
            or run.runner_id != runner.id
            or run.project_id != runner.project_id
        ):
            raise AccessNotFound()
        return run, attempt

    def current_error(
        self,
        runner: RunnerRecord,
        run: RunRecord,
        attempt: AttemptRecord,
        now: datetime,
    ) -> Exception | None:
        self.expire(runner, run, attempt, now)
        if attempt.finished_at is not None:
            return (
                LeaseExpired()
                if (attempt.terminal_reason or {}).get("code") == "LEASE_EXPIRED"
                else StaleAttempt()
            )
        if (
            runner.capacity_state != "BUSY"
            or runner.fencing_number != attempt.fencing_number
            or run.execution_state not in ACTIVE_STATES
        ):
            return StaleAttempt()
        return None

    def expire(
        self,
        runner: RunnerRecord,
        run: RunRecord,
        attempt: AttemptRecord,
        now: datetime,
    ) -> bool:
        if (
            attempt.finished_at is not None
            or effective_lease_expiry(attempt.created_at, attempt.lease_expires_at)
            > now
        ):
            return False
        reason = {
            "code": "LEASE_EXPIRED",
            "message": "Lease expired; execution and cleanup are unconfirmed.",
        }
        attempt.finished_at = now
        attempt.terminal_reason = reason
        if run.execution_state in ACTIVE_STATES:
            run.execution_state = "ERROR"
            run.evaluation_outcome = "NOT_EVALUATED"
            run.finished_at = now
            run.terminal_reason = reason
        runner.capacity_state = "NEEDS_CLEANUP"
        return True

    def grant(self, attempt: AttemptRecord, now: datetime) -> LeaseGrant:
        expires_at = effective_lease_expiry(
            attempt.created_at, attempt.lease_expires_at
        )
        return LeaseGrant(
            leaseId=attempt.lease_id,
            fencingNumber=attempt.fencing_number,
            attemptId=attempt.id,
            runId=attempt.run_id,
            runnerId=attempt.runner_id,
            projectId=attempt.project_id,
            expiresAt=stamp(expires_at),
            remainingTtlMs=remaining_ttl_ms(expires_at, now),
            policyVersion="2",
            heartbeatIntervalSeconds=HEARTBEAT_INTERVAL_SECONDS,
            stoppingMarginSeconds=STOPPING_MARGIN_SECONDS,
            lastHeartbeatSequence=attempt.heartbeat_sequence,
        )

    def assignment(
        self, run: RunRecord, attempt: AttemptRecord, now: datetime
    ) -> ClaimAssignment:
        manifest, _, trials = admission_snapshot(run)
        return ClaimAssignment(
            lease=self.grant(attempt, now),
            executionState=ExecutionState(run.execution_state),
            requestedManifest=manifest,
            expectedTrials=trials,
            observedManifest=ExecutionManifest.model_validate(attempt.observed_manifest)
            if attempt.observed_manifest
            else None,
        )

    async def write(
        self,
        credential: str,
        attempt_id: str,
        body: AttemptHeartbeat | AttemptManifestRequest,
    ) -> AttemptHeartbeatReceipt | AttemptManifestReceipt:
        failure = None
        result = None
        async with self.session.begin():
            runner = await self.authenticate(credential)
            run, attempt = await self.load_attempt(runner, attempt_id)
            now = await self.now()
            failure = self.current_error(runner, run, attempt, now)
            if failure is None:
                require_fence(
                    current_lease_id=attempt.lease_id,
                    current_fencing_number=runner.fencing_number,
                    lease_id=body.lease_id,
                    fencing_number=body.fencing_number,
                    active=True,
                    expires_at=effective_lease_expiry(
                        attempt.created_at, attempt.lease_expires_at
                    ),
                    now=now,
                )
                if isinstance(body, AttemptHeartbeat):
                    digest = metadata_digest(body)
                    if body.sequence == attempt.heartbeat_sequence:
                        if attempt.heartbeat_digest != digest:
                            raise RunnerConflict()
                    elif body.sequence == attempt.heartbeat_sequence + 1:
                        attempt.heartbeat_sequence = body.sequence
                        attempt.heartbeat_digest = digest
                        attempt.lease_expires_at = min(
                            now + timedelta(seconds=LEASE_LIFETIME_SECONDS),
                            runner.credential_expires_at,
                            attempt.created_at
                            + timedelta(seconds=MAX_ATTEMPT_DURATION_SECONDS),
                        )
                        if run.cancellation_deadline_at is not None:
                            attempt.lease_expires_at = min(
                                attempt.lease_expires_at, run.cancellation_deadline_at
                            )
                        runner.last_seen_at = now
                    else:
                        raise ApiError(
                            409,
                            ErrorCode.SEQUENCE_GAP,
                            "Heartbeat sequence must follow the last "
                            "acknowledged sequence.",
                        )
                    result = AttemptHeartbeatReceipt(
                        lease=self.grant(attempt, now),
                        cancellationRequested=run.cancellation_requested_at is not None,
                    )
                else:
                    requested, _, _ = admission_snapshot(run)
                    frozen = (
                        ExecutionManifest.model_validate(attempt.observed_manifest)
                        if attempt.observed_manifest
                        else None
                    )
                    verify_manifest(requested, body.observed_manifest, frozen)
                    if frozen is None:
                        attempt.observed_manifest = body.observed_manifest.model_dump(
                            mode="json"
                        )
                        attempt.manifest_accepted_at = now
                        run.execution_state = "STARTING"
                        run.started_at = now
                    result = AttemptManifestReceipt(
                        lease=self.grant(attempt, now),
                        observedManifest=body.observed_manifest,
                    )
            await self.session.flush()
        if failure is not None:
            raise failure
        if result is None:
            raise RuntimeError("Attempt write produced no receipt")
        return result

    async def sweep(self, limit: int = 100) -> int:
        if not 1 <= limit <= 100:
            raise ValueError("Expiry batch must be bounded")
        # Select runner candidates without locking attempts. Every mutator follows
        # runner -> run -> attempt; SKIP LOCKED avoids delaying a live heartbeat.
        async with self.session.begin():
            ids = list(
                (
                    await self.session.scalars(
                        select(AttemptRecord.runner_id)
                        .where(
                            AttemptRecord.finished_at.is_(None),
                            (AttemptRecord.lease_expires_at <= func.clock_timestamp())
                            | (
                                AttemptRecord.created_at
                                <= func.clock_timestamp()
                                - timedelta(seconds=MAX_ATTEMPT_DURATION_SECONDS)
                            ),
                        )
                        .order_by(AttemptRecord.lease_expires_at)
                        .limit(limit)
                    )
                ).all()
            )
        expired = 0
        for runner_id in ids:
            async with self.session.begin():
                runner = await self.session.scalar(
                    select(RunnerRecord)
                    .where(RunnerRecord.id == runner_id)
                    .with_for_update(skip_locked=True)
                    .execution_options(populate_existing=True)
                )
                if runner is None:
                    continue
                active = await self.store.active_for_runner(runner.id)
                if active is None:
                    continue
                run, attempt = await self.load_attempt(runner, active.id)
                expired += int(self.expire(runner, run, attempt, await self.now()))
                await self.session.flush()
        return expired
