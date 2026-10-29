"""Typed contiguous event persistence and browser cursor progress.

Revision ID: 0015_events
Revises: 0014_cleanup_receipts (reviewed P14 source; actual merge gates publication)
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0015_events"
down_revision = "0014_cleanup_receipts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "run_event_streams",
        sa.Column(
            "run_id",
            sa.String(128),
            sa.ForeignKey("featherlane.runs.id"),
            primary_key=True,
        ),
        sa.Column("last_position", sa.BigInteger(), nullable=False),
        sa.Column("retained_after", sa.BigInteger(), nullable=False),
        sa.CheckConstraint(
            "last_position BETWEEN 0 AND 9007199254740991",
            name=op.f("ck_run_event_streams_position"),
        ),
        sa.CheckConstraint(
            "retained_after BETWEEN 0 AND last_position",
            name=op.f("ck_run_event_streams_retained_after"),
        ),
        schema="featherlane",
    )
    op.create_table(
        "attempt_event_progress",
        sa.Column(
            "attempt_id",
            sa.String(32),
            sa.ForeignKey("featherlane.run_attempts.id"),
            primary_key=True,
        ),
        sa.Column("last_sequence", sa.Integer(), nullable=False),
        sa.Column("progress", postgresql.JSONB(), nullable=False),
        sa.CheckConstraint(
            "last_sequence BETWEEN 0 AND 2147483647",
            name=op.f("ck_attempt_event_progress_sequence"),
        ),
        schema="featherlane",
    )
    op.create_table(
        "run_events",
        sa.Column(
            "run_id",
            sa.String(128),
            sa.ForeignKey("featherlane.runs.id"),
            primary_key=True,
        ),
        sa.Column("position", sa.BigInteger(), primary_key=True),
        sa.Column(
            "attempt_id",
            sa.String(32),
            sa.ForeignKey("featherlane.run_attempts.id"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(128), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "attempt_id", "sequence", name="uq_run_events_attempt_sequence"
        ),
        sa.UniqueConstraint(
            "attempt_id", "event_id", name="uq_run_events_attempt_event"
        ),
        sa.CheckConstraint(
            "position BETWEEN 1 AND 9007199254740991",
            name=op.f("ck_run_events_position"),
        ),
        sa.CheckConstraint(
            "sequence BETWEEN 1 AND 2147483647", name=op.f("ck_run_events_sequence")
        ),
        schema="featherlane",
    )


def downgrade() -> None:
    op.drop_table("run_events", schema="featherlane")
    op.drop_table("attempt_event_progress", schema="featherlane")
    op.drop_table("run_event_streams", schema="featherlane")
