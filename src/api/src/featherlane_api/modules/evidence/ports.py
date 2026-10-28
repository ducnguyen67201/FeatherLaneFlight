"""Evidence-owned storage port. Upload transport and publication belong to P16."""

from collections.abc import AsyncIterator
from typing import Protocol

from featherlane_contracts import Digest, Identifier
from pydantic import BaseModel, ConfigDict, Field


class StoredArtifact(BaseModel):
    """Internal metadata; never serialize a storage location into a wire response."""

    model_config = ConfigDict(strict=True, extra="forbid", frozen=True)

    key: Identifier
    size_bytes: int = Field(ge=0, le=104_857_600)
    sha256: Digest


class PrivateArtifactStorage(Protocol):
    """Keys are server-issued opaque IDs, never client filenames or host paths.

    The adapter must enforce private access, bounded streams, immutable atomic
    publication and size/digest verification. Authorization remains in services.
    No adapter or upload endpoint is supplied by the foundation.
    """

    async def publish(
        self, artifact: StoredArtifact, chunks: AsyncIterator[bytes]
    ) -> None: ...

    def read(self, key: Identifier) -> AsyncIterator[bytes]: ...

    async def delete(self, key: Identifier) -> None: ...
