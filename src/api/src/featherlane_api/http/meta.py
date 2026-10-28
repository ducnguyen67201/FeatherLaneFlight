"""Public compatibility metadata; independent of authentication and business data."""

from fastapi import APIRouter, Request
from featherlane_contracts import (
    CONTRACT_VERSION,
    PROTOCOL_VERSION,
    ContractMeta,
    ContractMetaEnvelope,
)

router = APIRouter(prefix="/api/v1")


@router.get(
    "/meta", operation_id="getContractMeta", response_model=ContractMetaEnvelope
)
async def get_contract_meta(request: Request) -> ContractMetaEnvelope:
    return ContractMetaEnvelope(
        data=ContractMeta(
            supportedContractVersions=[CONTRACT_VERSION],
            supportedProtocolVersions=[PROTOCOL_VERSION],
            schemaDigest=request.app.state.schema_digest,
        )
    )
