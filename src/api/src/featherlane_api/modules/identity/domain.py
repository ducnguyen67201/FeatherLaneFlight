"""Identity outcomes and immutable cross-module authentication context."""

import hashlib
import hmac
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


class IdentityConflict(Exception):
    pass


class AuthenticationRequired(Exception):
    pass


class SessionExpired(AuthenticationRequired):
    pass


class InvalidCsrf(Exception):
    pass


class InvalidLogin(Exception):
    pass


class UnverifiedIdentity(Exception):
    pass


class ProviderUnavailable(Exception):
    pass


@dataclass(frozen=True)
class User:
    id: str
    display_name: str
    email: str


@dataclass(frozen=True)
class Principal:
    user: User
    session_id: str
    expires_at: datetime

    @property
    def user_id(self) -> str:
        return self.user.id


@dataclass(frozen=True)
class VerifiedIdentity:
    issuer: str
    subject: str
    display_name: str
    email: str


@dataclass(frozen=True)
class Authorization:
    url: str
    state: str
    session_data: dict[str, object]


class IdentityProvider(Protocol):
    async def begin(self) -> Authorization: ...
    async def complete(
        self, query: str, session_data: dict[str, object]
    ) -> VerifiedIdentity: ...


class SessionSecrets:
    def __init__(self, key: str):
        self.key = key.encode()

    def digest(self, value: str, purpose: str) -> str:
        return hmac.new(
            self.key, (purpose + ":" + value).encode(), hashlib.sha256
        ).hexdigest()

    def handle_digest(self, handle: str | None) -> str | None:
        if handle is None or re.fullmatch(r"[A-Za-z0-9_-]{43}", handle) is None:
            return None
        return self.digest(handle, "session")

    def csrf_token(self, handle: str) -> str:
        return self.digest(handle, "csrf")


@dataclass(frozen=True)
class PendingLogin:
    session_data: dict[str, object]
    previous_session_digest: str | None
    rotation_session_id: str | None
