"""Live membership checks protect metadata and every attachment stream chunk."""

import asyncio
from collections.abc import AsyncIterator
from typing import BinaryIO

from featherlane_contracts.run_detail import ArtifactListEnvelope
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.modules.access.domain import AccessNotFound
from featherlane_api.modules.access.persistence import AccessStore
from featherlane_api.modules.evidence.application import artifact_view
from featherlane_api.modules.evidence.domain import KINDS
from featherlane_api.modules.evidence.persistence import ArtifactRecord, EvidenceStore
from featherlane_api.modules.evidence.ports import StoredArtifact
from featherlane_api.modules.evidence.storage import (
    ArtifactInvalid,
    LocalPrivateArtifactStorage,
)
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.domain import Principal
from featherlane_api.modules.runs.persistence import RunStore


class EvidenceDownloads:
    def __init__(
        self,
        session: AsyncSession,
        identity: IdentityService,
        storage: LocalPrivateArtifactStorage,
    ):
        self.session = session
        self.identity = identity
        self.storage = storage
        self.store = EvidenceStore(session)

    async def artifacts(
        self, principal: Principal, handle: str | None, run_id: str
    ) -> ArtifactListEnvelope:
        async with self.session.begin():
            await self.identity.require_live(principal, handle)
            run = await RunStore(self.session).exact(run_id)
            await AccessStore(self.session).require_project(
                principal.user_id, run.project_id
            )
            rows = await self.store.for_run(run.id)
            now = await self.session.scalar(select(func.clock_timestamp()))
            if now is None:
                raise RuntimeError("Database clock unavailable.")
            return ArtifactListEnvelope(
                data=[artifact_view(row, now, self.storage) for row in rows]
            )

    async def authorize(
        self, principal: Principal, handle: str | None, artifact_id: str
    ) -> ArtifactRecord:
        await self.identity.require_live(principal, handle)
        row = await self.store.exact(artifact_id)
        if row is None:
            raise AccessNotFound()
        await AccessStore(self.session).require_project(
            principal.user_id, row.project_id
        )
        now = await self.session.scalar(select(func.clock_timestamp()))
        if (
            now is None
            or row.state != "VERIFIED"
            or row.disposition != "UPLOAD"
            or row.expires_at <= now
        ):
            raise AccessNotFound()
        return row

    async def open(
        self, principal: Principal, handle: str | None, artifact_id: str
    ) -> tuple[BinaryIO, int, str, str]:
        stream = None
        try:
            async with self.session.begin():
                row = await self.authorize(principal, handle, artifact_id)
                try:
                    stream = self.storage.open_verified(
                        StoredArtifact(
                            key=row.id, size_bytes=row.byte_length, sha256=row.sha256
                        )
                    )
                except (OSError, ArtifactInvalid):
                    raise AccessNotFound() from None
                _, media_type, filename = KINDS[row.kind]
                return stream, row.byte_length, media_type, filename
        except BaseException:
            if stream is not None:
                stream.close()
            raise

    async def stream(
        self,
        principal: Principal,
        handle: str | None,
        artifact_id: str,
        stream: BinaryIO,
        size: int,
    ) -> AsyncIterator[bytes]:
        try:
            remaining = size
            while remaining:
                async with self.session.begin():
                    await self.authorize(principal, handle, artifact_id)
                chunk = stream.read(min(65_536, remaining))
                if not chunk:
                    raise ArtifactInvalid("Verified content became incomplete.")
                remaining -= len(chunk)
                yield chunk
                await asyncio.sleep(0)
        finally:
            stream.close()
