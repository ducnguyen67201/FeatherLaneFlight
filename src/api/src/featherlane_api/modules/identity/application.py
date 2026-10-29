"""Authentication use cases commit before transport produces successful responses."""

import hmac
import secrets
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from featherlane_api.modules.identity.domain import (
    AuthenticationRequired,
    IdentityConflict,
    IdentityProvider,
    InvalidCsrf,
    InvalidLogin,
    Principal,
    SessionExpired,
    SessionSecrets,
    User,
    VerifiedIdentity,
)
from featherlane_api.modules.identity.persistence import IdentityStore


@dataclass(frozen=True)
class LoginStart:
    url: str
    browser_handle: str


@dataclass(frozen=True)
class LoginSuccess:
    handle: str
    principal: Principal


class IdentityService:
    def __init__(
        self,
        store: IdentityStore,
        secrets: SessionSecrets,
        session_ttl: int,
        login_ttl: int,
        on_verified_login: Callable[[User], Awaitable[None]] | None = None,
    ):
        self.store = store
        self.secrets = secrets
        self.session_ttl = session_ttl
        self.login_ttl = login_ttl
        self.on_verified_login = on_verified_login

    async def users(self, user_ids: list[str]) -> dict[str, User]:
        """Display-only lookup inside an authorized consumer transaction."""
        return await self.store.users(user_ids)

    async def lookup_user(
        self, issuer: str, subject: str, *, lock: bool = False
    ) -> User | None:
        """Resolve an active identity without creating or linking an account.

        Locking lookup belongs to the operator's already-open transaction; the
        caller retains commit/rollback ownership and the user lock until then.
        """
        if lock:
            self.store.require_transaction()
            return await self.store.lookup_user(issuer, subject, lock=True)
        async with self.store.transaction():
            return await self.store.lookup_user(issuer, subject)

    async def start_login(
        self,
        provider: IdentityProvider,
        previous_handle: str | None,
        old_browser: str | None,
    ) -> LoginStart:
        authorization = await provider.begin()
        browser = secrets.token_urlsafe(32)
        now = datetime.now(UTC)
        async with self.store.transaction():
            previous_digest = self.secrets.handle_digest(previous_handle)
            previous = (
                await self.store.authenticate(previous_digest, now)
                if previous_digest
                else None
            )
            await self.store.save_login(
                browser_digest=self.secrets.digest(browser, "oidc-browser"),
                state_digest=self.secrets.digest(authorization.state, "oidc-state"),
                session_data=authorization.session_data,
                previous_session_digest=previous_digest,
                rotation_session_id=previous[0].session_id if previous else None,
                expires_at=now + timedelta(seconds=self.login_ttl),
                old_browser_digest=self.secrets.digest(old_browser, "oidc-browser")
                if old_browser
                else None,
                now=now,
            )
        return LoginStart(authorization.url, browser)

    async def finish_login(
        self,
        provider: IdentityProvider,
        browser: str | None,
        state: str,
        query: str,
        current_handle: str | None,
    ) -> LoginSuccess:
        if browser is None or len(browser) != 43:
            raise InvalidLogin()
        async with self.store.transaction():
            record = await self.store.consume_login(
                self.secrets.digest(browser, "oidc-browser"),
                self.secrets.digest(state, "oidc-state"),
                datetime.now(UTC),
            )
            if record is None:
                raise InvalidLogin()
            session_data, previous_digest = (
                record.session_data,
                record.previous_session_digest,
            )
        # Consume before contacting Google, including denied/failed callbacks.
        if previous_digest != self.secrets.handle_digest(current_handle):
            raise InvalidLogin()
        identity = await provider.complete(query, session_data)
        return await self._establish_session(identity, record.rotation_session_id)

    async def _establish_session(
        self, identity: VerifiedIdentity, rotation_session_id: str | None
    ) -> LoginSuccess:
        handle = secrets.token_urlsafe(32)
        now = datetime.now(UTC)
        expires = now + timedelta(seconds=self.session_ttl)
        session_id = uuid4().hex
        try:
            async with self.store.transaction():
                if rotation_session_id:
                    await self.store.rotate_previous(rotation_session_id, now)
                user = await self.store.resolve_user(identity, uuid4().hex, uuid4().hex)
                if self.on_verified_login is not None:
                    await self.on_verified_login(user)
                await self.store.add_session(
                    session_id=session_id,
                    handle_digest=self.secrets.digest(handle, "session"),
                    user_id=user.id,
                    csrf_digest=self.secrets.digest(
                        self.secrets.csrf_token(handle), "csrf-check"
                    ),
                    expires_at=expires,
                )
        except IdentityConflict:
            # Unique identity races do not link by email or leak database details.
            raise InvalidLogin() from None
        return LoginSuccess(handle, Principal(user, session_id, expires))

    async def read_session(self, handle: str | None) -> Principal:
        digest = self.secrets.handle_digest(handle)
        if digest is None:
            raise AuthenticationRequired()
        async with self.store.transaction():
            found = await self.store.authenticate(digest, datetime.now(UTC))
            if found:
                return found[0]
            if await self.store.expired(digest, datetime.now(UTC)):
                raise SessionExpired()
            raise AuthenticationRequired()

    async def require_live(
        self, principal: Principal, handle: str | None, csrf: str | None = None
    ) -> Principal:
        """Call INSIDE the consumer's write transaction; holds auth locks to commit.

        P07 checks both current memberships in that same transaction. This method
        never begins/commits a transaction and never trusts a cached ORM identity.
        """
        self.store.require_transaction()
        digest = self.secrets.handle_digest(handle)
        found = (
            await self.store.authenticate(digest, datetime.now(UTC), lock=True)
            if digest
            else None
        )
        if (
            found is None
            or found[0].session_id != principal.session_id
            or found[0].user_id != principal.user_id
        ):
            raise AuthenticationRequired()
        if csrf is not None:
            self.check_csrf(found[1], csrf)
        return found[0]

    def check_csrf(self, expected: str, token: str) -> None:
        if len(token) != 64 or not hmac.compare_digest(
            expected, self.secrets.digest(token, "csrf-check")
        ):
            raise InvalidCsrf()

    async def validate_mutation(
        self, handle: str | None, token: str | None
    ) -> Principal:
        if token is None:
            raise InvalidCsrf()
        principal = await self.read_session(handle)
        async with self.store.transaction():
            return await self.require_live(principal, handle, token)

    async def logout(
        self, principal: Principal, handle: str | None, token: str
    ) -> None:
        async with self.store.transaction():
            await self.require_live(principal, handle, token)
            await self.store.revoke(principal.session_id, datetime.now(UTC))
