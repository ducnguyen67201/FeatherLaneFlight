"""Event rows and progress are serialized by the existing run row lock."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.infrastructure.database import Base


class EventStreamRecord(Base):
    __tablename__ = "run_event_streams"
    __table_args__ = (
        CheckConstraint(
            "last_position BETWEEN 0 AND 9007199254740991", name="position"
        ),
        CheckConstraint(
            "retained_after BETWEEN 0 AND last_position", name="retained_after"
        ),
    )
    run_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.runs.id"), primary_key=True
    )
    last_position: Mapped[int] = mapped_column(BigInteger)
    retained_after: Mapped[int] = mapped_column(BigInteger)


class EventAttemptRecord(Base):
    __tablename__ = "attempt_event_progress"
    __table_args__ = (
        CheckConstraint("last_sequence BETWEEN 0 AND 2147483647", name="sequence"),
    )
    attempt_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.run_attempts.id"), primary_key=True
    )
    last_sequence: Mapped[int] = mapped_column(Integer)
    progress: Mapped[dict] = mapped_column(JSONB)


class EventRecord(Base):
    __tablename__ = "run_events"
    __table_args__ = (
        UniqueConstraint(
            "attempt_id", "sequence", name="uq_run_events_attempt_sequence"
        ),
        UniqueConstraint("attempt_id", "event_id", name="uq_run_events_attempt_event"),
        CheckConstraint("position BETWEEN 1 AND 9007199254740991", name="position"),
        CheckConstraint("sequence BETWEEN 1 AND 2147483647", name="sequence"),
    )
    run_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.runs.id"), primary_key=True
    )
    position: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("featherlane.run_attempts.id"))
    sequence: Mapped[int] = mapped_column(Integer)
    event_id: Mapped[str] = mapped_column(String(128))
    digest: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSONB)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class EventStore:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def check_ready(self) -> None:
        for model in (EventStreamRecord, EventAttemptRecord, EventRecord):
            await self.session.execute(select(model).limit(0))

    async def stream(self, run_id: str) -> EventStreamRecord | None:
        return await self.session.get(EventStreamRecord, run_id, populate_existing=True)

    async def attempt(self, attempt_id: str) -> EventAttemptRecord | None:
        return await self.session.get(
            EventAttemptRecord, attempt_id, populate_existing=True
        )

    async def event(self, attempt_id: str, sequence: int) -> EventRecord | None:
        return await self.session.scalar(
            select(EventRecord).where(
                EventRecord.attempt_id == attempt_id, EventRecord.sequence == sequence
            )
        )

    async def event_id(self, attempt_id: str, event_id: str) -> EventRecord | None:
        return await self.session.scalar(
            select(EventRecord).where(
                EventRecord.attempt_id == attempt_id, EventRecord.event_id == event_id
            )
        )

    async def page(self, run_id: str, after: int, limit: int) -> list[EventRecord]:
        return list(
            (
                await self.session.scalars(
                    select(EventRecord)
                    .where(EventRecord.run_id == run_id, EventRecord.position > after)
                    .order_by(EventRecord.position)
                    .limit(limit + 1)
                )
            ).all()
        )
