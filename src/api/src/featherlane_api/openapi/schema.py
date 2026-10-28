"""Route declarations for generation only; no services or startup side effects."""

import hashlib
import json
from typing import Annotated

from fastapi import FastAPI, Header, Path, Query
from featherlane_contracts import (
    CONTRACT_VERSION,
    MAX_PAGE_SIZE,
    STATUS_MODELS,
    ContractMetaEnvelope,
    ContractVersion,
    CreateRunRequest,
    Cursor,
    ErrorEnvelope,
    EvaluationOutcome,
    ExecutionState,
    Identifier,
    RunEnvelope,
    RunListEnvelope,
    RunOptionsEnvelope,
)
from pydantic import TypeAdapter

from featherlane_api.http.errors import ERROR_RESPONSES


def schema_json(schema: dict) -> str:
    return json.dumps(schema, indent=2, sort_keys=True) + "\n"


def schema_digest(schema: dict) -> str:
    return hashlib.sha256(schema_json(schema).encode()).hexdigest()


def create_schema_app() -> FastAPI:
    app = FastAPI(title="FeatherLaneFlight contract metadata", version=CONTRACT_VERSION)
    errors = {
        **ERROR_RESPONSES,
        501: {"model": ErrorEnvelope, "description": "Metadata-only declaration"},
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
        search: Annotated[str | None, Query(min_length=1, max_length=128)] = None,
        execution_state: Annotated[
            ExecutionState | None, Query(alias="executionState")
        ] = None,
        evaluation_outcome: Annotated[
            EvaluationOutcome | None, Query(alias="evaluationOutcome")
        ] = None,
    ) -> RunListEnvelope:
        raise RuntimeError("Metadata-only declaration; no business Runs API exists yet")

    @app.get(
        "/api/v1/projects/{projectId}/run-options",
        operation_id="getRunOptions",
        response_model=RunOptionsEnvelope,
        responses=errors,
    )
    def get_run_options(
        project_id: Annotated[Identifier, Path(alias="projectId")],
        contract_version: Annotated[
            ContractVersion, Header(alias="x-flf-contract-version")
        ],
        runner_id: Annotated[Identifier | None, Query(alias="runnerId")] = None,
        build_id: Annotated[Identifier | None, Query(alias="buildId")] = None,
        local_profile_id: Annotated[
            Identifier | None, Query(alias="localProfileId")
        ] = None,
    ) -> RunOptionsEnvelope:
        raise RuntimeError("Metadata-only declaration; no live eligibility API exists")

    @app.post(
        "/api/v1/projects/{projectId}/runs",
        operation_id="createRun",
        response_model=RunEnvelope,
        status_code=201,
        responses=errors,
    )
    def create_run(
        project_id: Annotated[Identifier, Path(alias="projectId")],
        contract_version: Annotated[
            ContractVersion, Header(alias="x-flf-contract-version")
        ],
        idempotency_key: Annotated[Identifier, Header(alias="idempotency-key")],
        body: CreateRunRequest,
    ) -> RunEnvelope:
        raise RuntimeError("Metadata-only declaration; no live run admission exists")

    schema = app.openapi()
    for model in STATUS_MODELS:
        schema["components"]["schemas"][model.__name__] = TypeAdapter(
            model
        ).json_schema()
    app.openapi_schema = schema
    return app
