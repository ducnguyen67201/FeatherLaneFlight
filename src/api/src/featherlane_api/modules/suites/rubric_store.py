"""Rubric companions preserve legacy definition serialization and digests."""

from sqlalchemy import ForeignKey, ForeignKeyConstraint, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from featherlane_api.infrastructure.database import Base


class DraftRubricRecord(Base):
    __tablename__ = "suite_draft_rubrics"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "suite_id"],
            [
                "featherlane.suite_drafts.project_id",
                "featherlane.suite_drafts.suite_id",
            ],
        ),
    )
    project_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    suite_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    rubric: Mapped[dict] = mapped_column(JSONB)


class PublishedRubricRecord(Base):
    __tablename__ = "suite_revision_rubrics"
    revision_id: Mapped[str] = mapped_column(
        ForeignKey("featherlane.suite_revisions.id"), primary_key=True
    )
    rubric: Mapped[dict] = mapped_column(JSONB)
    digest: Mapped[str] = mapped_column(String(64))
