"""One session per request/task, with explicit service transactions."""

from sqlalchemy import MetaData, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from featherlane_api.config import DatabaseSettings


class Base(DeclarativeBase):
    metadata = MetaData(
        schema="featherlane",
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        },
    )


class Database:
    def __init__(self, settings: DatabaseSettings) -> None:
        self.engine = create_async_engine(
            settings.database_url.get_secret_value(),
            pool_size=settings.database_pool_size,
            max_overflow=0,
            pool_pre_ping=True,
            hide_parameters=True,
            connect_args={"timeout": 5, "command_timeout": 30},
        )
        self.session_factory = async_sessionmaker(
            self.engine, expire_on_commit=False, autoflush=False
        )

    async def check_ready(self) -> None:
        async with self.engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
            schema = await connection.scalar(
                text("SELECT to_regnamespace('featherlane')")
            )
            revision = await connection.scalar(
                text("SELECT version_num FROM public.alembic_version")
            )
            if schema is None or revision is None:
                raise RuntimeError("Apply the reviewed database migrations first")

    async def close(self) -> None:
        await self.engine.dispose()
