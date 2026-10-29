"""Runnable service composition; schema-only declarations are never mounted."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from featherlane_contracts import CONTRACT_VERSION

from featherlane_api.config import ApiSettings, load_settings
from featherlane_api.http.errors import ERROR_RESPONSES, install_error_handlers
from featherlane_api.http.meta import router as meta_router
from featherlane_api.http.middleware import HttpBoundary
from featherlane_api.infrastructure.database import Database
from featherlane_api.modules.access.enrollment import AccessEnrollment
from featherlane_api.modules.access.http import install_access_errors
from featherlane_api.modules.access.http import router as access_router
from featherlane_api.modules.access.people_http import router as people_router
from featherlane_api.modules.access.persistence import AccessStore
from featherlane_api.modules.identity.http import install_identity_errors
from featherlane_api.modules.identity.http import router as identity_router
from featherlane_api.modules.identity.oidc import GoogleOidc
from featherlane_api.modules.identity.persistence import IdentityStore
from featherlane_api.modules.runners.http import install_runner_errors
from featherlane_api.modules.runners.http import router as runners_router
from featherlane_api.modules.runners.persistence import RunnerStore
from featherlane_api.openapi.schema import create_schema_app, schema_digest

logger = logging.getLogger(__name__)


def create_app(settings: ApiSettings | None = None) -> FastAPI:
    settings = settings if settings is not None else load_settings()
    digest = schema_digest(create_schema_app().openapi())

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database = Database(settings)
        app.state.database = database
        try:
            try:
                await database.check_ready()
                async with database.session_factory() as session, session.begin():
                    await IdentityStore(session).check_ready()
                    await AccessStore(session).check_ready()
                    await RunnerStore(session).check_ready()
            except Exception:
                logger.error("Database startup check failed")
                raise RuntimeError(
                    "Database unavailable or migrations missing; check local setup."
                ) from None
            yield
        finally:
            await database.close()

    app = FastAPI(
        title="FeatherLaneFlight API",
        version=CONTRACT_VERSION,
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        responses=ERROR_RESPONSES,
    )
    app.state.google_oidc = GoogleOidc(settings)
    app.state.on_verified_login = lambda session: AccessEnrollment(session).apply
    app.state.settings = settings
    app.state.schema_digest = digest
    app.add_middleware(HttpBoundary, settings=settings)
    install_error_handlers(app)
    install_identity_errors(app)
    install_access_errors(app)
    install_runner_errors(app)
    app.include_router(meta_router)
    app.include_router(identity_router)
    app.include_router(access_router)
    app.include_router(runners_router)
    app.include_router(people_router)
    return app
