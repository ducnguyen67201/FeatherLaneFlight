"""Route declarations for generation only; no services or startup side effects."""

from typing import Annotated

from fastapi import FastAPI, Header, Path, Query
from featherlane_contracts import (
    CONTRACT_VERSION,
    MAX_PAGE_SIZE,
    STATUS_MODELS,
    ContractMetaEnvelope,
    ContractVersion,
    Cursor,
    ErrorEnvelope,
    Identifier,
    RunListEnvelope,
)
from pydantic import TypeAdapter


def create_schema_app() -> FastAPI:
    app = FastAPI(title="FeatherLaneFlight contract metadata", version=CONTRACT_VERSION)
    errors = {
        code: {"model": ErrorEnvelope, "description": description}
        for code, description in {
            400: "Invalid JSON or unsupported contract version",
            401: "Authentication required",
            403: "Access forbidden",
            404: "Resource not found",
            422: "Request validation failed",
            500: "Internal error",
            501: "Metadata-only declaration; business API not implemented",
        }.items()
    }

    @app.get(
        "/api/v1/meta",
        operation_id="getContractMeta",
        response_model=ContractMetaEnvelope,
        responses=errors,
    )
    def get_contract_meta() -> ContractMetaEnvelope:
        raise RuntimeError(
            "Metadata-only declaration; use the exported OpenAPI snapshot"
        )

    @app.get(
        "/api/v1/projects/{projectId}/runs",
        operation_id="listRuns",
        response_model=RunListEnvelope,
        responses=errors,
    )
    def list_runs(
        project_id: Annotated[Identifier, Path(alias="projectId")],
        contract_version: Annotated[
            ContractVersion, Header(alias="x-flf-contract-version")
        ],
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 50,
        cursor: Annotated[Cursor | None, Query()] = None,
    ) -> RunListEnvelope:
        raise RuntimeError("Metadata-only declaration; no business Runs API exists yet")

    schema = app.openapi()
    for model in STATUS_MODELS:
        schema["components"]["schemas"][model.__name__] = TypeAdapter(
            model
        ).json_schema()
    app.openapi_schema = schema
    return app
