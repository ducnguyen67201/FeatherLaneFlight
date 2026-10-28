"""Authlib Starlette adapter; request.session state lives only in PostgreSQL.

A minimal request scope adapts the provider port to Authlib, without letting
HTTP objects or provider tokens enter application use cases. The session dict
is persisted before redirect and restored only after atomic browser-bound consume.
"""

from urllib.parse import parse_qs, urlsplit

import httpx2
from authlib.integrations.base_client import OAuthError
from authlib.integrations.starlette_client import OAuth
from authlib.oidc.core import UserInfo
from joserfc.errors import JoseError
from starlette.requests import Request

from featherlane_api.config import ApiSettings
from featherlane_api.modules.identity.domain import (
    Authorization,
    InvalidLogin,
    ProviderUnavailable,
    UnverifiedIdentity,
    VerifiedIdentity,
)

GOOGLE_ISSUER = "https://accounts.google.com"


def _request(session_data: dict[str, object], query: str = "") -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "headers": [],
            "query_string": query.encode("ascii"),
            "session": session_data,
        }
    )


class GoogleOidc:
    def __init__(self, settings: ApiSettings):
        self.callback = settings.google_callback_url
        self.client = None
        if settings.google_client_id and settings.google_client_secret:
            oauth = OAuth()
            self.client = oauth.register(
                "google",
                client_id=settings.google_client_id,
                client_secret=settings.google_client_secret.get_secret_value(),
                server_metadata_url=GOOGLE_ISSUER + "/.well-known/openid-configuration",
                client_kwargs={
                    "scope": "openid email profile",
                    "code_challenge_method": "S256",
                    "timeout": 10.0,
                    "trust_env": False,
                },
            )

    async def begin(self) -> Authorization:
        if self.client is None:
            raise ProviderUnavailable()
        session_data: dict[str, object] = {}
        try:
            response = await self.client.authorize_redirect(
                _request(session_data), self.callback
            )
        except (httpx2.HTTPError, OAuthError, ValueError):
            raise ProviderUnavailable() from None
        url = response.headers["location"]
        state = parse_qs(urlsplit(url).query)["state"][0]
        return Authorization(url, state, session_data)

    async def complete(
        self, query: str, session_data: dict[str, object]
    ) -> VerifiedIdentity:
        if self.client is None:
            raise ProviderUnavailable()
        try:
            token = await self.client.authorize_access_token(
                _request(session_data, query),
                leeway=30,
                claims_options={"iss": {"essential": True, "value": GOOGLE_ISSUER}},
            )
        except httpx2.HTTPError:
            raise ProviderUnavailable() from None
        except (OAuthError, JoseError, ValueError, KeyError):
            raise InvalidLogin() from None
        # Authlib validated the signed ID token, audience, expiry and stored nonce.
        # No provider token or raw claims are retained after this method returns.
        claims = token.get("userinfo")
        if (
            not isinstance(token.get("id_token"), str)
            or not isinstance(claims, UserInfo)
            or claims.get("iss") != GOOGLE_ISSUER
            or claims.get("email_verified") is not True
        ):
            raise UnverifiedIdentity()
        subject, email = claims.get("sub"), claims.get("email")
        name = claims.get("name") or email
        if (
            not isinstance(subject, str)
            or not 1 <= len(subject) <= 255
            or not isinstance(email, str)
            or not 3 <= len(email) <= 320
            or not isinstance(name, str)
            or not 1 <= len(name) <= 200
            or any(ord(c) < 32 or ord(c) == 127 for c in email + name)
        ):
            raise UnverifiedIdentity()
        return VerifiedIdentity(GOOGLE_ISSUER, subject, name, email)
