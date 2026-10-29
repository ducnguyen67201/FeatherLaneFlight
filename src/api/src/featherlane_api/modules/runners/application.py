"""Atomic project enrollment and idle health use cases."""

import hmac
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from featherlane_contracts import CursorMeta, RunnerCapacityState
from featherlane_contracts.registration import (
    BuildDeclaration,
    LocalProfileDeclaration,
    metadata_digest,
)
from featherlane_contracts.runners import (
    CreateEnrollmentRequest,
    EnrollmentGrant,
    EnrollmentGrantEnvelope,
    EnrollRunnerRequest,
    RunnerDiagnostic,
    RunnerEnvelope,
    RunnerHeartbeat,
    RunnerIdentity,
    RunnerIdentityEnvelope,
    RunnerListEnvelope,
    RunnerSummary,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.access.persistence import AccessStore
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.runners.domain import (
    InvalidEnrollment,
    InvalidRunnerCredential,
    RunnerConflict,
    RunnerSecrets,
    RunnerUnavailable,
    connection_state,
    require_versions,
)
from featherlane_api.modules.runners.persistence import (
    EnrollmentRecord,
    RunnerRecord,
    RunnerStore,
)


def stamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def summary(record: RunnerRecord, now: datetime) -> RunnerSummary:
    disabled = record.revoked_at is not None or record.credential_expires_at <= now
    return RunnerSummary(
        id=record.id,
        projectId=record.project_id,
        displayName=record.display_name,
        connectionState=connection_state(record.last_seen_at, now),
        capacityState=RunnerCapacityState.DISABLED
        if disabled
        else RunnerCapacityState(record.capacity_state),
        lastSeenAt=stamp(record.last_seen_at) if record.last_seen_at else None,
        contractVersion=record.contract_version,
        protocolVersion=record.protocol_version,
        hostPlatform=record.host_platform,
        credentialExpiresAt=stamp(record.credential_expires_at),
        revokedAt=stamp(record.revoked_at) if record.revoked_at else None,
        availableBuilds=[
            BuildDeclaration.model_validate(item) for item in record.available_builds
        ],
        localProfiles=[
            LocalProfileDeclaration.model_validate(item)
            for item in record.local_profiles
        ],
        diagnostics=[
            RunnerDiagnostic.model_validate(item) for item in record.diagnostics
        ],
        capabilitySupport="DECLARED",
    )


def identity(record: RunnerRecord, now: datetime) -> RunnerIdentityEnvelope:
    return RunnerIdentityEnvelope(
        data=RunnerIdentity(
            runner=summary(record, now),
            heartbeatIntervalSeconds=10,
            staleAfterSeconds=30,
            offlineAfterSeconds=90,
            lastHeartbeatSequence=record.heartbeat_sequence,
        )
    )


def require_live_record(
    record: RunnerRecord | None, key_id: str, now: datetime
) -> RunnerRecord:
    if (
        record is None
        or record.revoked_at is not None
        or record.credential_expires_at <= now
        or record.key_id != key_id
    ):
        raise InvalidRunnerCredential()
    return record


async def require_runner_declarations(
    session: AsyncSession,
    *,
    project_id: str,
    runner_id: str,
) -> RunnerSummary:
    """Caller authorizes project and owns transaction; keep identity locked to commit.

    This returns declared metadata, never capability qualification or local paths.
    """
    if not session.in_transaction():
        raise RuntimeError("Runner lookup requires a caller-owned transaction")
    record = await RunnerStore(session).by_id(runner_id, lock=True)
    if record is None or record.project_id != project_id:
        raise AccessNotFound()
    now = datetime.now(UTC)
    if record.revoked_at is not None or record.credential_expires_at <= now:
        raise RunnerUnavailable()
    return summary(record, now)


class RunnerService:
    def __init__(
        self,
        session: AsyncSession,
        secrets: RunnerSecrets,
        identity_service: IdentityService,
    ):
        self.session = session
        self.secrets = secrets
        self.identity_service = identity_service
        self.store = RunnerStore(session)
        self.access = AccessStore(session)

    async def authorize(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        csrf: str | None = None,
    ) -> None:
        await self.identity_service.require_live(principal, handle, csrf)
        await self.access.require_project(principal.user_id, project_id)

    async def create_grant(
        self,
        principal: Principal,
        handle: str | None,
        csrf: str,
        project_id: str,
        key: str,
        body: CreateEnrollmentRequest,
    ) -> EnrollmentGrantEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id, csrf)
            record = await self.store.grant_request(project_id, principal.user_id, key)
            if record is None:
                grant_id = uuid4().hex
                token = self.secrets.grant_token(grant_id)
                record = EnrollmentRecord(
                    id=grant_id,
                    project_id=project_id,
                    created_by=principal.user_id,
                    request_id=key,
                    display_name=body.display_name,
                    token_digest=self.secrets.digest(token, "grant"),
                    key_id=self.secrets.key_id,
                    expires_at=datetime.now(UTC) + timedelta(minutes=10),
                    consumed_by=None,
                    enrollment_request_id=None,
                    enrollment_digest=None,
                )
                self.session.add(record)
                await self.session.flush()
            elif record.display_name != body.display_name:
                raise RunnerConflict()
            if record.key_id != self.secrets.key_id or not hmac.compare_digest(
                record.token_digest,
                self.secrets.digest(self.secrets.grant_token(record.id), "grant"),
            ):
                raise InvalidEnrollment()
            return EnrollmentGrantEnvelope(
                data=EnrollmentGrant(
                    id=record.id,
                    projectId=record.project_id,
                    displayName=record.display_name,
                    token=self.secrets.grant_token(record.id),
                    expiresAt=stamp(record.expires_at),
                )
            )

    async def enroll(self, body: EnrollRunnerRequest) -> RunnerIdentityEnvelope:
        require_versions(body.contract_version, body.protocol_version)
        fingerprint = self.secrets.digest(metadata_digest(body), "enrollment")
        async with self.session.begin():
            grant = await self.store.grant_by_token(
                self.secrets.digest(body.enrollment_token, "grant")
            )
            if grant is None or grant.key_id != self.secrets.key_id:
                raise InvalidEnrollment()
            if grant.consumed_by:
                # Recovery requires the exact request AND already-persisted secret.
                if (
                    grant.enrollment_request_id != body.request_id
                    or not hmac.compare_digest(
                        grant.enrollment_digest or "", fingerprint
                    )
                ):
                    raise RunnerConflict()
                record = require_live_record(
                    await self.store.by_id(grant.consumed_by, lock=True),
                    self.secrets.key_id,
                    datetime.now(UTC),
                )
                return identity(record, datetime.now(UTC))
            if grant.expires_at <= datetime.now(UTC):
                raise InvalidEnrollment()
            await self.access.require_project(grant.created_by, grant.project_id)
            credential_digest = self.secrets.digest(body.credential, "credential")
            if await self.store.by_credential(credential_digest):
                raise RunnerConflict()
            now = datetime.now(UTC)
            if grant.expires_at <= now:
                raise InvalidEnrollment()
            record = RunnerRecord(
                id=uuid4().hex,
                project_id=grant.project_id,
                display_name=grant.display_name,
                host_platform=body.host_platform,
                credential_digest=credential_digest,
                key_id=self.secrets.key_id,
                credential_expires_at=now + timedelta(days=30),
                revoked_at=None,
                created_at=now,
                last_seen_at=None,
                contract_version=body.contract_version,
                protocol_version=body.protocol_version,
                capacity_state="DISABLED",
                heartbeat_sequence=0,
                heartbeat_digest=None,
                available_builds=[],
                local_profiles=[],
                diagnostics=[{"code": "NOT_CONFIGURED"}],
            )
            self.session.add(record)
            try:
                await self.session.flush()
            except IntegrityError:
                raise RunnerConflict() from None
            grant.consumed_by = record.id
            grant.enrollment_request_id = body.request_id
            grant.enrollment_digest = fingerprint
            await self.session.flush()
            return identity(record, now)

    async def me(self, credential: str) -> RunnerIdentityEnvelope:
        async with self.session.begin():
            record = require_live_record(
                await self.store.by_credential(
                    self.secrets.digest(credential, "credential")
                ),
                self.secrets.key_id,
                datetime.now(UTC),
            )
            return identity(record, datetime.now(UTC))

    async def heartbeat(
        self, credential: str, body: RunnerHeartbeat
    ) -> RunnerIdentityEnvelope:
        require_versions(body.contract_version, body.protocol_version)
        fingerprint = metadata_digest(body)
        async with self.session.begin():
            record = require_live_record(
                await self.store.by_credential(
                    self.secrets.digest(credential, "credential")
                ),
                self.secrets.key_id,
                datetime.now(UTC),
            )
            if body.sequence < record.heartbeat_sequence:
                raise RunnerConflict()
            if body.sequence == record.heartbeat_sequence:
                if not hmac.compare_digest(record.heartbeat_digest or "", fingerprint):
                    raise RunnerConflict()
                # A replay does not revive a stale/offline machine.
                return identity(record, datetime.now(UTC))
            if record.capacity_state == "BUSY" or (
                record.capacity_state == "NEEDS_CLEANUP"
                and body.capacity_state != "NEEDS_CLEANUP"
            ):
                raise RunnerUnavailable()
            record.capacity_state = body.capacity_state
            record.heartbeat_sequence = body.sequence
            record.heartbeat_digest = fingerprint
            record.last_seen_at = datetime.now(UTC)
            record.available_builds = [
                item.model_dump(mode="json") for item in body.available_builds
            ]
            record.local_profiles = [
                item.model_dump(mode="json") for item in body.local_profiles
            ]
            record.diagnostics = [
                item.model_dump(mode="json") for item in body.diagnostics
            ]
            await self.session.flush()
            return identity(record, datetime.now(UTC))

    async def list(
        self,
        principal: Principal,
        handle: str | None,
        project_id: str,
        limit: int,
        cursor: str | None,
    ) -> RunnerListEnvelope:
        async with self.session.begin():
            await self.authorize(principal, handle, project_id)
            rows = await self.store.list(project_id, limit, cursor)
            now = datetime.now(UTC)
            return RunnerListEnvelope(
                data=[summary(row, now) for row in rows[:limit]],
                meta=CursorMeta(
                    nextCursor=rows[limit - 1].id if len(rows) > limit else None
                ),
            )

    async def revoke(
        self, principal: Principal, handle: str | None, csrf: str, runner_id: str
    ) -> RunnerEnvelope:
        async with self.session.begin():
            record = await self.store.by_id(runner_id)
            if record is None:
                raise AccessNotFound()
            await self.authorize(principal, handle, record.project_id, csrf)
            record = await self.store.by_id(runner_id, lock=True)
            if record is None:
                raise AccessNotFound()
            if record.capacity_state == "BUSY":
                raise RunnerUnavailable()
            if record.revoked_at is None:
                record.revoked_at = datetime.now(UTC)
                record.capacity_state = "DISABLED"
            await self.session.flush()
            return RunnerEnvelope(data=summary(record, datetime.now(UTC)))
