"""Identity mappings and ORM queries on the shared PostgreSQL foundation."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    delete,
    select,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.infrastructure.database import Base
from featherlane_api.modules.identity.domain import (
    AuthenticationRequired,
    IdentityConflict,
    PendingLogin,
    Principal,
    User,
    VerifiedIdentity,
)


class UserRecord(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class ExternalIdentityRecord(Base):
    __tablename__ = "external_identities"
    __table_args__ = (UniqueConstraint("issuer", "subject"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("featherlane.users.id"), index=True)
    issuer: Mapped[str] = mapped_column(String(256))
    subject: Mapped[str] = mapped_column(String(255))


class SessionRecord(Base):
    __tablename__ = "browser_sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    handle_digest: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("featherlane.users.id"), index=True)
    csrf_digest: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LoginRecord(Base):
    __tablename__ = "oidc_transactions"
    browser_digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    state_digest: Mapped[str] = mapped_column(String(64), unique=True)
    session_data: Mapped[dict[str, object]] = mapped_column(JSON)
    previous_session_digest: Mapped[str | None] = mapped_column(String(64))
    rotation_session_id: Mapped[str | None] = mapped_column(String(32))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class IdentityStore:
    def __init__(self, session: AsyncSession):
        self.session = session

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[None]:
        try:
            async with self.session.begin():
                yield
        except IntegrityError:
            raise IdentityConflict() from None

    async def check_ready(self) -> None:
        for record in (UserRecord, ExternalIdentityRecord, SessionRecord, LoginRecord):
            await self.session.execute(select(record).limit(0))

    def require_transaction(self) -> None:
        if not self.session.in_transaction():
            raise RuntimeError("Live authentication requires an explicit transaction")

    async def authenticate(
        self, digest: str, now: datetime, *, lock: bool = False
    ) -> tuple[Principal, str] | None:
        query = (
            select(SessionRecord, UserRecord)
            .join(UserRecord)
            .where(
                SessionRecord.handle_digest == digest,
                SessionRecord.revoked_at.is_(None),
                SessionRecord.expires_at > now,
                UserRecord.active.is_(True),
            )
            .execution_options(populate_existing=True)
        )
        if lock:
            query = query.with_for_update(of=(SessionRecord, UserRecord))
        row = (await self.session.execute(query)).first()
        if row is None:
            return None
        record, user = row
        if record.expires_at <= datetime.now(UTC):
            return None
        return Principal(
            User(user.id, user.display_name, user.email), record.id, record.expires_at
        ), record.csrf_digest

    async def expired(self, digest: str, now: datetime) -> bool:
        return (
            await self.session.scalar(
                select(SessionRecord.id).where(
                    SessionRecord.handle_digest == digest,
                    SessionRecord.revoked_at.is_(None),
                    SessionRecord.expires_at <= now,
                )
            )
            is not None
        )

    async def save_login(
        self,
        browser_digest: str,
        state_digest: str,
        session_data: dict[str, object],
        previous_session_digest: str | None,
        rotation_session_id: str | None,
        expires_at: datetime,
        old_browser_digest: str | None,
        now: datetime,
    ) -> None:
        # Bounded by the transaction TTL; remove stale verifier/nonce material too.
        await self.session.execute(
            delete(LoginRecord).where(LoginRecord.expires_at <= now)
        )
        if old_browser_digest:
            await self.session.execute(
                delete(LoginRecord).where(
                    LoginRecord.browser_digest == old_browser_digest
                )
            )
        self.session.add(
            LoginRecord(
                browser_digest=browser_digest,
                state_digest=state_digest,
                session_data=session_data,
                previous_session_digest=previous_session_digest,
                rotation_session_id=rotation_session_id,
                expires_at=expires_at,
            )
        )

    async def consume_login(
        self, browser_digest: str, state_digest: str, now: datetime
    ) -> PendingLogin | None:
        record = await self.session.scalar(
            select(LoginRecord)
            .where(
                LoginRecord.browser_digest == browser_digest,
                LoginRecord.state_digest == state_digest,
                LoginRecord.expires_at > now,
            )
            .with_for_update()
        )
        if record is not None and record.expires_at <= datetime.now(UTC):
            return None
        if record is not None:
            await self.session.delete(record)
            await self.session.flush()
        return (
            PendingLogin(
                record.session_data,
                record.previous_session_digest,
                record.rotation_session_id,
            )
            if record
            else None
        )

    async def resolve_user(
        self, identity: VerifiedIdentity, user_id: str, external_id: str
    ) -> User:
        # Existing users are locked; a unique-identity insert race rolls back
        # without linking by email. The caller can safely start a fresh login.
        user = await self.session.scalar(
            select(UserRecord)
            .join(ExternalIdentityRecord)
            .where(
                ExternalIdentityRecord.issuer == identity.issuer,
                ExternalIdentityRecord.subject == identity.subject,
            )
            .with_for_update(of=UserRecord)
            .execution_options(populate_existing=True)
        )
        if user is None:
            user = UserRecord(
                id=user_id,
                display_name=identity.display_name,
                email=identity.email,
                active=True,
            )
            self.session.add(user)
            await self.session.flush()
            self.session.add(
                ExternalIdentityRecord(
                    id=external_id,
                    user_id=user.id,
                    issuer=identity.issuer,
                    subject=identity.subject,
                )
            )
        elif not user.active:
            raise AuthenticationRequired()
        else:
            user.display_name = identity.display_name
            user.email = identity.email
        return User(user.id, user.display_name, user.email)

    async def revoke(self, session_id: str, now: datetime) -> None:
        record = await self.session.get(SessionRecord, session_id)
        if record:
            record.revoked_at = now

    async def add_session(
        self,
        session_id: str,
        handle_digest: str,
        user_id: str,
        csrf_digest: str,
        expires_at: datetime,
    ) -> None:
        self.session.add(
            SessionRecord(
                id=session_id,
                handle_digest=handle_digest,
                user_id=user_id,
                csrf_digest=csrf_digest,
                expires_at=expires_at,
            )
        )
        await self.session.flush()

    async def rotate_previous(self, session_id: str, now: datetime) -> None:
        record = await self.session.scalar(
            select(SessionRecord)
            .where(
                SessionRecord.id == session_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if record is None or record.revoked_at is not None:
            raise AuthenticationRequired()
        # A session may expire during the Google round trip; verified reauth is
        # still allowed, but logout/revocation after initiation cancels rotation.
        record.revoked_at = now
