"""Request dependencies adapt HTTP context to shared runtime resources."""

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from featherlane_api.infrastructure.database import Database


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    """Never auto-commit: services commit atomic writes before returning a response.

    Use `async with session.begin():` around a complete operation, including its
    authorization/audit writes. Closing rolls back any uncommitted work. A task
    or concurrent operation must open its own session from the session factory.
    Read/auth dependencies must finish their read transaction before returning;
    a bare SELECT autobegins and would prevent a service from beginning its write.
    Recheck authorization inside the write transaction rather than trusting an
    earlier read. Never silently roll back someone else's transaction to nest it.
    """
    database: Database = request.app.state.database
    async with database.session_factory() as session:
        yield session
