"""Fenced declarations/publication and read-only recovery of immutable receipts."""

import asyncio
import hashlib
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import uuid4

from featherlane_contracts import ErrorCode
from featherlane_contracts.evidence import ArtifactDeclaration
from featherlane_contracts.leases import AttemptWrite
from featherlane_contracts.registration import metadata_digest
from featherlane_contracts.run_detail import ArtifactKind, ArtifactSummary, ArtifactView
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.http.errors import ApiError
from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.evidence.content import require_content
from featherlane_api.modules.evidence.domain import (
    KINDS,
    SERVER_POLICY,
    conflict,
    invalid,
    require_declaration,
)
from featherlane_api.modules.evidence.persistence import ArtifactRecord, EvidenceStore
from featherlane_api.modules.evidence.ports import StoredArtifact
from featherlane_api.modules.evidence.storage import (
    ArtifactInvalid,
    LocalPrivateArtifactStorage,
    StagedArtifact,
    StagingFull,
)
from featherlane_api.modules.leases.application import LeaseService
from featherlane_api.modules.leases.domain import (
    LeaseExpired,
    StaleAttempt,
    effective_lease_expiry,
    require_fence,
)
from featherlane_api.modules.leases.persistence import AttemptRecord
from featherlane_api.modules.runners.application import stamp
from featherlane_api.modules.runners.persistence import RunnerRecord
from featherlane_api.modules.runs.persistence import RunRecord
from featherlane_api.modules.runs.snapshots import admission_snapshot


def artifact_view(
    row: ArtifactRecord, now: datetime, storage: LocalPrivateArtifactStorage
) -> ArtifactView:
    availability = "MISSING"
    if row.disposition == "LOCAL_ONLY":
        availability = "LOCAL_ONLY"
    elif row.state == "VERIFIED":
        if row.expires_at <= now:
            availability = "EXPIRED"
        elif storage.has_object(
            StoredArtifact(key=row.id, size_bytes=row.byte_length, sha256=row.sha256)
        ):
            availability = "AVAILABLE"
    label, media_type, _ = KINDS[row.kind]
    return ArtifactView(
        id=row.id,
        attemptId=row.attempt_id,
        trialId=row.trial_id,
        kind=row.kind,
        displayName=label,
        mediaType=media_type,
        byteLength=row.byte_length,
        sha256=row.sha256,
        verificationState=row.state,
        createdAt=stamp(row.created_at),
        expiresAt=stamp(row.expires_at) if row.disposition == "UPLOAD" else None,
        availability=availability,
    )


def artifact_summary(
    rows: list[ArtifactRecord], now: datetime, storage: LocalPrivateArtifactStorage
) -> ArtifactSummary:
    views = [artifact_view(row, now, storage) for row in rows]
    return ArtifactSummary(
        totalCount=len(views),
        availableVerifiedCount=sum(
            view.verification_state == "VERIFIED" and view.availability == "AVAILABLE"
            for view in views
        ),
        missingCount=sum(view.availability == "MISSING" for view in views),
        expiredCount=sum(view.availability == "EXPIRED" for view in views),
    )


@dataclass(frozen=True)
class UploadTarget:
    attempt_id: str
    kind: ArtifactKind
    artifact: StoredArtifact
    verified: bool


class EvidenceService:
    def __init__(
        self,
        session: AsyncSession,
        leases: LeaseService,
        storage: LocalPrivateArtifactStorage,
        project_bytes_limit: int,
    ):
        self.session = session
        self.leases = leases
        self.store = EvidenceStore(session)
        self.storage = storage
        self.project_bytes_limit = project_bytes_limit

    def authority_error(
        self,
        runner: RunnerRecord,
        run: RunRecord,
        attempt: AttemptRecord,
        body: AttemptWrite,
        now: datetime,
        *,
        recovery: bool = False,
    ) -> Exception | None:
        # Even receipt recovery must prove the exact original attempt identity.
        # Recovery neither uses current runner fencing as new authority nor renews.
        if (
            body.lease_id != attempt.lease_id
            or body.fencing_number != attempt.fencing_number
        ):
            return StaleAttempt()
        if recovery:
            return None
        failure = self.leases.current_error(runner, run, attempt, now)
        if failure is not None:
            return failure
        deadline = effective_lease_expiry(attempt.created_at, attempt.lease_expires_at)
        if run.cancellation_deadline_at is not None:
            deadline = min(deadline, run.cancellation_deadline_at)
        try:
            require_fence(
                current_lease_id=attempt.lease_id,
                current_fencing_number=runner.fencing_number,
                lease_id=body.lease_id,
                fencing_number=body.fencing_number,
                active=attempt.finished_at is None,
                expires_at=deadline,
                now=now,
            )
        except (LeaseExpired, StaleAttempt) as exc:
            return exc
        if attempt.manifest_accepted_at is None:
            return invalid("The observed execution manifest is not accepted.")
        return None

    async def declare(
        self, credential: str, attempt_id: str, body: ArtifactDeclaration
    ) -> ArtifactView:
        failure = None
        result = None
        async with self.session.begin():
            runner = await self.leases.authenticate(credential)
            run, attempt = await self.leases.load_attempt(runner, attempt_id)
            row = await self.store.by_request(attempt_id, body.request_id)
            digest = metadata_digest(body)
            if row is not None and row.request_digest != digest:
                raise conflict()
            recovery = row is not None and (
                row.state == "VERIFIED" or row.disposition == "LOCAL_ONLY"
            )
            if row is None:
                await self.store.lock_quota(run.project_id)
            # Waiting for the project evidence lock must not retain a pre-wait
            # lease timestamp as publication/declaration authority.
            now = await self.leases.now()
            failure = self.authority_error(
                runner, run, attempt, body, now, recovery=recovery
            )
            if failure is None:
                if row is None:
                    manifest, suite, trials = admission_snapshot(run)
                    require_declaration(body, manifest.evidence_policy)
                    if (
                        body.byte_length is not None
                        and body.byte_length
                        > suite.evidence_policy.maximum_artifact_bytes
                    ):
                        raise invalid(
                            "Artifact exceeds the frozen suite evidence limit."
                        )
                    if body.trial_id is not None and body.trial_id not in {
                        t.id for t in trials
                    }:
                        raise invalid(
                            "Artifact trial is not in the admitted trial matrix."
                        )
                    count, size = await self.store.usage(
                        run_id=run.id, project_id=run.project_id
                    )
                    project_count, project_size = await self.store.usage(
                        project_id=run.project_id
                    )
                    if (
                        count >= SERVER_POLICY.max_run_artifacts
                        or size + (body.byte_length or 0) > SERVER_POLICY.max_run_bytes
                        or project_count >= 10_000
                        or project_size + (body.byte_length or 0)
                        > self.project_bytes_limit
                    ):
                        raise ApiError(
                            413,
                            ErrorCode.PAYLOAD_TOO_LARGE,
                            "The evidence quota is exhausted.",
                        )
                    row = ArtifactRecord(
                        id=uuid4().hex,
                        project_id=run.project_id,
                        run_id=run.id,
                        attempt_id=attempt.id,
                        runner_id=runner.id,
                        request_id=body.request_id,
                        request_digest=digest,
                        trial_id=body.trial_id,
                        kind=body.kind,
                        disposition=body.disposition,
                        byte_length=body.byte_length,
                        sha256=body.sha256,
                        state="PENDING"
                        if body.disposition == "UPLOAD"
                        else "NOT_VERIFIED",
                        created_at=now,
                        verified_at=None,
                        expires_at=now + timedelta(days=30),
                    )
                    self.session.add(row)
                    await self.session.flush()
                result = artifact_view(row, now, self.storage)
        if failure is not None:
            raise failure
        if result is None:
            raise RuntimeError("Artifact declaration produced no receipt.")
        return result

    async def load_target(
        self, runner: RunnerRecord, artifact_id: str
    ) -> tuple[RunRecord, AttemptRecord, ArtifactRecord]:
        row = await self.store.exact(artifact_id)
        if (
            row is None
            or row.runner_id != runner.id
            or row.project_id != runner.project_id
        ):
            raise AccessNotFound()
        run, attempt = await self.leases.load_attempt(runner, row.attempt_id)
        row = await self.store.exact(artifact_id, lock=True)
        if row is None or row.run_id != run.id or row.attempt_id != attempt.id:
            raise AccessNotFound()
        return run, attempt, row

    async def prepare_upload(
        self, credential: str, artifact_id: str, body: AttemptWrite
    ) -> UploadTarget:
        failure = None
        result = None
        async with self.session.begin():
            runner = await self.leases.authenticate(credential)
            run, attempt, row = await self.load_target(runner, artifact_id)
            if row.disposition != "UPLOAD":
                raise invalid("Local-only evidence cannot be uploaded.")
            failure = self.authority_error(
                runner,
                run,
                attempt,
                body,
                await self.leases.now(),
                recovery=row.state == "VERIFIED",
            )
            if failure is None:
                result = UploadTarget(
                    attempt.id,
                    row.kind,
                    StoredArtifact(
                        key=row.id, size_bytes=row.byte_length, sha256=row.sha256
                    ),
                    row.state == "VERIFIED",
                )
        if failure is not None:
            raise failure
        if result is None:
            raise RuntimeError("Artifact lookup produced no target.")
        return result

    async def finish_upload(
        self,
        credential: str,
        artifact_id: str,
        body: AttemptWrite,
        staged: StagedArtifact | None = None,
    ) -> ArtifactView:
        failure = None
        result = None
        async with self.session.begin():
            runner = await self.leases.authenticate(credential)
            run, attempt, row = await self.load_target(runner, artifact_id)
            now = await self.leases.now()
            failure = self.authority_error(
                runner, run, attempt, body, now, recovery=row.state == "VERIFIED"
            )
            if failure is None:
                if row.state != "VERIFIED":
                    if staged is None or staged.artifact.key != row.id:
                        raise invalid()
                    self.storage.publish_staged(staged)
                    # Filesystem publication may take time. Recheck the same
                    # authoritative clock/policy after it and before metadata
                    # visibility; an expired private orphan grants no read access.
                    now = await self.leases.now()
                    failure = self.authority_error(runner, run, attempt, body, now)
                    if failure is None:
                        row.state = "VERIFIED"
                        row.verified_at = now
                        await self.session.flush()
                if failure is None:
                    result = artifact_view(row, now, self.storage)
        if failure is not None:
            raise failure
        if result is None:
            raise RuntimeError("Artifact verification produced no receipt.")
        return result

    async def record_failure(
        self, credential: str, artifact_id: str, body: AttemptWrite
    ) -> None:
        async with self.session.begin():
            runner = await self.leases.authenticate(credential)
            run, attempt, row = await self.load_target(runner, artifact_id)
            failure = self.authority_error(
                runner, run, attempt, body, await self.leases.now()
            )
            if failure is None and row.state != "VERIFIED":
                row.state = "FAILED"
                await self.session.flush()

    async def upload(
        self,
        credential: str,
        artifact_id: str,
        body: AttemptWrite,
        chunks: AsyncIterator[bytes],
    ) -> ArtifactView:
        target = await self.prepare_upload(credential, artifact_id, body)
        try:
            async with asyncio.timeout(60):
                if target.verified:
                    # A terminal receipt retry may verify its stream, but creates
                    # no file, declaration, lease renewal or metadata mutation.
                    digest = hashlib.sha256()
                    size = 0
                    async for chunk in chunks:
                        size += len(chunk)
                        if size > target.artifact.size_bytes:
                            raise conflict()
                        digest.update(chunk)
                    if (
                        size != target.artifact.size_bytes
                        or digest.hexdigest() != target.artifact.sha256
                    ):
                        raise conflict()
                    return await self.finish_upload(credential, artifact_id, body)
                async with self.storage.stage(target.artifact, chunks) as staged:
                    # Reuse canonical shapes; unknown fields do not become
                    # cloud-verified simply because their digest matches.
                    try:
                        require_content(target.kind, staged)
                    except ApiError:
                        await self.record_failure(credential, artifact_id, body)
                        raise
                    return await self.finish_upload(
                        credential, artifact_id, body, staged
                    )
        except ArtifactInvalid:
            await self.record_failure(credential, artifact_id, body)
            raise invalid() from None
        except StagingFull:
            raise ApiError(
                413, ErrorCode.PAYLOAD_TOO_LARGE, "Private upload staging is full."
            ) from None
        except TimeoutError:
            raise invalid(
                "The bounded upload window elapsed; retry the same declaration."
            ) from None
