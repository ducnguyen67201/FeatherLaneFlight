"""Stable FastAPI auth seams; read transactions finish before dependencies return."""

from typing import Annotated
from urllib.parse import urlsplit

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.config import ApiSettings
from featherlane_api.http.dependencies import get_session
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.domain import (
    InvalidCsrf,
    InvalidLogin,
    Principal,
    SessionSecrets,
)
from featherlane_api.modules.identity.persistence import IdentityStore


def session_cookie_name(settings: ApiSettings) -> str:
    return (
        "__Host-flf-session"
        if settings.secure_cookies
        else f"flf-session-dev-{urlsplit(settings.canonical_origin).port or 80}"
    )


def login_cookie_name(settings: ApiSettings) -> str:
    return (
        "__Host-flf-oidc"
        if settings.secure_cookies
        else f"flf-oidc-dev-{urlsplit(settings.canonical_origin).port or 80}"
    )


def get_identity_service(
    request: Request, session: Annotated[AsyncSession, Depends(get_session)]
) -> IdentityService:
    settings: ApiSettings = request.app.state.settings
    return IdentityService(
        IdentityStore(session),
        SessionSecrets(settings.session_hash_key.get_secret_value()),
        settings.session_ttl_seconds,
        settings.oidc_ttl_seconds,
    )


def session_handle(request: Request) -> str | None:
    return request.cookies.get(session_cookie_name(request.app.state.settings))


def require_canonical_request(request: Request) -> None:
    settings: ApiSettings = request.app.state.settings
    if f"{request.url.scheme}://{request.url.netloc}" != settings.canonical_origin:
        raise InvalidLogin()


def require_same_origin(request: Request) -> None:
    settings: ApiSettings = request.app.state.settings
    if request.headers.getlist("origin") != [settings.canonical_origin]:
        raise InvalidCsrf()
    if request.headers.get("sec-fetch-site") not in (None, "same-origin"):
        raise InvalidCsrf()
    require_canonical_request(request)


async def get_principal(
    request: Request, service: Annotated[IdentityService, Depends(get_identity_service)]
) -> Principal:
    require_canonical_request(request)
    return await service.read_session(session_handle(request))


async def require_csrf(
    request: Request, service: Annotated[IdentityService, Depends(get_identity_service)]
) -> Principal:
    require_same_origin(request)
    tokens = request.headers.getlist("x-csrf-token")
    return await service.validate_mutation(
        session_handle(request), tokens[0] if len(tokens) == 1 else None
    )
