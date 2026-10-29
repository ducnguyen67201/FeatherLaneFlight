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
    Cursor,
    ErrorEnvelope,
    Identifier,
)
from featherlane_contracts.projects import OrganizationView, ProjectView
from featherlane_contracts.run_detail import (
    ArtifactListEnvelope,
    RunEventPage,
)
from pydantic import TypeAdapter

from featherlane_api.http.errors import ERROR_RESPONSES
from featherlane_api.modules.access.http import router as access_router
from featherlane_api.modules.access.people_http import router as people_router
from featherlane_api.modules.identity.http import router as identity_router
from featherlane_api.modules.leases.http import router as leases_router
from featherlane_api.modules.registration.http import router as registration_router
from featherlane_api.modules.runners.http import router as runners_router
from featherlane_api.modules.runs.http import router as runs_router
from featherlane_api.modules.suites.draft_http import router as draft_router
from featherlane_api.modules.suites.http import router as suites_router


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
        "/api/v1/runs/{runId}/events",
        operation_id="getRunEvents",
        response_model=RunEventPage,
        responses={
            **errors,
            410: {"model": ErrorEnvelope, "description": "Event cursor expired"},
        },
    )
    def get_run_events(
        run_id: Annotated[Identifier, Path(alias="runId")],
        contract_version: Annotated[
            ContractVersion, Header(alias="x-flf-contract-version")
        ],
        after: Annotated[Cursor | None, Query()] = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 100,
    ) -> RunEventPage:
        raise RuntimeError("Metadata-only declaration; JSON event pages only")

    @app.get(
        "/api/v1/runs/{runId}/artifacts",
        operation_id="getRunArtifacts",
        response_model=ArtifactListEnvelope,
        responses=errors,
    )
    def get_run_artifacts(
        run_id: Annotated[Identifier, Path(alias="runId")],
        contract_version: Annotated[
            ContractVersion, Header(alias="x-flf-contract-version")
        ],
    ) -> ArtifactListEnvelope:
        raise RuntimeError("Metadata-only declaration; artifact metadata only")

    app.include_router(identity_router)
    app.include_router(runners_router)
    app.include_router(access_router)
    app.include_router(people_router)
    app.include_router(registration_router)
    app.include_router(suites_router)
    app.include_router(draft_router)
    app.include_router(runs_router)
    app.include_router(leases_router)
    schema = app.openapi()
    for model in (*STATUS_MODELS, OrganizationView, ProjectView):
        schema["components"]["schemas"][model.__name__] = TypeAdapter(
            model
        ).json_schema()
    app.openapi_schema = schema
    return app
