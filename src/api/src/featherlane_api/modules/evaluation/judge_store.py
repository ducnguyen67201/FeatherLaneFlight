"""Immutable judge inputs and once-accepted responses, independent of DBOS payloads."""

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.infrastructure.database import Base


class JudgeRecord(Base):
    __tablename__ = "trial_judgments"
    __table_args__ = (UniqueConstraint("attempt_id", "trial_id"),)
    trial_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    attempt_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.attempt_finalizations.attempt_id"), primary_key=True
    )
    packet: Mapped[dict] = mapped_column(JSONB)
    identity: Mapped[dict] = mapped_column(JSONB)
    response: Mapped[dict | None] = mapped_column(JSONB(none_as_null=True))
