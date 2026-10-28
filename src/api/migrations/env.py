"""Reviewed PostgreSQL migrations; no application startup or provider imports."""

import asyncio

from alembic import context
from featherlane_api.config import load_database_settings
from featherlane_api.infrastructure.database import Base
from sqlalchemy import Connection, pool
from sqlalchemy.ext.asyncio import create_async_engine


def include_name(name: str | None, type_: str, parent_names: dict) -> bool:
    if type_ == "schema":
        return name == "featherlane"
    return True


def configure(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        version_table_schema="public",
        include_schemas=True,
        include_name=include_name,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_online() -> None:
    settings = load_database_settings()
    engine = create_async_engine(
        settings.database_url.get_secret_value(),
        poolclass=pool.NullPool,
        hide_parameters=True,
        connect_args={"timeout": 5, "command_timeout": 30},
    )
    try:
        async with engine.connect() as connection:
            await connection.run_sync(configure)
    except Exception:
        # SQL/driver exceptions can contain connection parameters and SQL values.
        raise RuntimeError(
            "Migration failed; check the database and reviewed revision."
        ) from None
    finally:
        await engine.dispose()


if context.is_offline_mode():
    context.configure(
        dialect_name="postgresql",
        target_metadata=Base.metadata,
        version_table_schema="public",
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(run_online())
