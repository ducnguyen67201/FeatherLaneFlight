"""Identity transport: fixed browser navigation and generated JSON operations."""

from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Header, Request, Response
from featherlane_contracts import (
    ContractVersion,
    ErrorCode,
    ErrorEnvelope,
    LogoutEnvelope,
    LogoutResult,
    SessionEnvelope,
    SessionUser,
    SessionView,
)
from starlette.responses import JSONResponse, RedirectResponse

from featherlane_api.http.errors import ERROR_RESPONSES, ApiError, error_response
from featherlane_api.modules.identity.application import IdentityService
from featherlane_api.modules.identity.dependencies import (
    get_identity_service,
    get_principal,
    login_cookie_name,
    require_canonical_request,
    require_csrf,
    session_cookie_name,
    session_handle,
)
from featherlane_api.modules.identity.domain import (
    AuthenticationRequired,
    InvalidCsrf,
    InvalidLogin,
    Principal,
    ProviderUnavailable,
    SessionExpired,
    UnverifiedIdentity,
)
from featherlane_api.modules.identity.oidc import GoogleOidc

router = APIRouter(
    responses={
        **ERROR_RESPONSES,
        503: {
            "model": ErrorEnvelope,
            "description": "Authentication provider unavailable",
        },
    }
)


def install_identity_errors(app: FastAPI) -> None:
    errors = {
        AuthenticationRequired: (
            401,
            ErrorCode.UNAUTHENTICATED,
            "Authentication is required.",
        ),
        SessionExpired: (
            401,
            ErrorCode.SESSION_EXPIRED,
            "The session has expired. Sign in again.",
        ),
        InvalidCsrf: (
            403,
            ErrorCode.CSRF_INVALID,
            "The request origin or CSRF token is invalid.",
        ),
        InvalidLogin: (
            400,
            ErrorCode.LOGIN_INVALID,
            "The sign-in transaction is invalid or has expired.",
        ),
        UnverifiedIdentity: (
            403,
            ErrorCode.IDENTITY_UNVERIFIED,
            "A verified Google identity is required.",
        ),
        ProviderUnavailable: (
            503,
            ErrorCode.AUTH_UNAVAILABLE,
            "Google sign-in is currently unavailable.",
        ),
    }

    async def handle(request: Request, exc: Exception) -> Response:
        status, code, message = errors[type(exc)]
        response = error_response(request, ApiError(status, code, message))
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path == "/auth/google/callback":
            response.delete_cookie(
                login_cookie_name(request.app.state.settings),
                secure=request.app.state.settings.secure_cookies,
                httponly=True,
                samesite="lax",
            )
        return response

    for exception in errors:
        app.add_exception_handler(exception, handle)


@router.get(
    "/auth/google/login",
    operation_id="beginGoogleLogin",
    response_class=RedirectResponse,
    status_code=302,
    openapi_extra={"x-flf-transport": "navigation"},
)
async def login(
    request: Request, service: Annotated[IdentityService, Depends(get_identity_service)]
) -> Response:
    require_canonical_request(request)
    settings = request.app.state.settings
    # Browser navigations cannot set the JSON API's contract header. No caller-
    # supplied callback/return URI is accepted, including unknown query keys.
    if request.query_params or request.headers.get("sec-fetch-site") not in (
        None,
        "none",
        "same-origin",
    ):
        raise InvalidLogin()
    origins = request.headers.getlist("origin")
    if origins and origins != [settings.canonical_origin]:
        raise InvalidLogin()
    provider: GoogleOidc = request.app.state.google_oidc
    result = await service.start_login(
        provider,
        session_handle(request),
        request.cookies.get(login_cookie_name(settings)),
    )
    response = RedirectResponse(result.url, status_code=302)
    response.set_cookie(
        login_cookie_name(settings),
        result.browser_handle,
        max_age=settings.oidc_ttl_seconds,
        secure=settings.secure_cookies,
        httponly=True,
        samesite="lax",
        path="/",
    )
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@router.get(
    "/auth/google/callback",
    operation_id="completeGoogleLogin",
    response_class=RedirectResponse,
    status_code=303,
    openapi_extra={"x-flf-transport": "navigation"},
)
async def callback(
    request: Request, service: Annotated[IdentityService, Depends(get_identity_service)]
) -> Response:
    require_canonical_request(request)
    settings = request.app.state.settings
    query = request.scope["query_string"]
    if len(query) > 8192 or not query.isascii():
        raise InvalidLogin()
    params = request.query_params
    if (
        any(len(params.getlist(key)) != 1 for key in params)
        or not 1 <= len(params.get("state", "")) <= 256
    ):
        raise InvalidLogin()
    if not params.get("code") and not params.get("error"):
        raise InvalidLogin()
    result = await service.finish_login(
        request.app.state.google_oidc,
        request.cookies.get(login_cookie_name(settings)),
        params["state"],
        query.decode("ascii"),
        session_handle(request),
    )
    response = RedirectResponse(settings.login_return_url, status_code=303)
    response.delete_cookie(
        login_cookie_name(settings),
        secure=settings.secure_cookies,
        httponly=True,
        samesite="lax",
    )
    response.set_cookie(
        session_cookie_name(settings),
        result.handle,
        max_age=settings.session_ttl_seconds,
        secure=settings.secure_cookies,
        httponly=True,
        samesite="lax",
        path="/",
    )
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@router.get(
    "/api/v1/session", operation_id="getSession", response_model=SessionEnvelope
)
async def get_current_session(
    request: Request,
    principal: Annotated[Principal, Depends(get_principal)],
    service: Annotated[IdentityService, Depends(get_identity_service)],
    contract_version: Annotated[
        ContractVersion, Header(alias="x-flf-contract-version")
    ],
) -> SessionEnvelope:
    return SessionEnvelope(
        data=SessionView(
            user=SessionUser(
                id=principal.user_id,
                displayName=principal.user.display_name,
                email=principal.user.email,
            ),
            csrfToken=service.secrets.csrf_token(session_handle(request)),
        )
    )


@router.post("/api/v1/logout", operation_id="logout", response_model=LogoutEnvelope)
async def logout(
    request: Request,
    principal: Annotated[Principal, Depends(require_csrf)],
    service: Annotated[IdentityService, Depends(get_identity_service)],
    contract_version: Annotated[
        ContractVersion, Header(alias="x-flf-contract-version")
    ],
    csrf_token: Annotated[
        str, Header(alias="x-csrf-token", min_length=64, max_length=64)
    ],
) -> Response:
    await service.logout(principal, session_handle(request), csrf_token)
    settings = request.app.state.settings
    response = JSONResponse(
        LogoutEnvelope(data=LogoutResult(signedOut=True)).model_dump(mode="json")
    )
    response.delete_cookie(
        session_cookie_name(settings),
        secure=settings.secure_cookies,
        httponly=True,
        samesite="lax",
    )
    response.delete_cookie(
        login_cookie_name(settings),
        secure=settings.secure_cookies,
        httponly=True,
        samesite="lax",
    )
    return response
