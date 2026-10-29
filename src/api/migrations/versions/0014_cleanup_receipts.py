"""Durable cleanup/recovery acknowledgments, separate from terminal attempt rows.

Revision ID: 0014_cleanup_receipts
Revises: 0013_claims_leases
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014_cleanup_receipts"
down_revision = "0013_claims_leases"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "runner_cleanup_receipts",
        sa.Column(
            "runner_id",
            sa.String(32),
            sa.ForeignKey("featherlane.runners.id"),
            primary_key=True,
        ),
        sa.Column("operation_id", sa.String(128), primary_key=True),
        sa.Column(
            "attempt_id",
            sa.String(32),
            sa.ForeignKey("featherlane.run_attempts.id"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('CLEANUP','RECOVERY')", name="kind"),
        schema="featherlane",
    )
    op.create_table(
        "attempt_usage_reports",
        sa.Column("runner_id", sa.String(32), primary_key=True),
        sa.Column("operation_id", sa.String(128), primary_key=True),
        sa.Column(
            "attempt_id",
            sa.String(32),
            sa.ForeignKey("featherlane.run_attempts.id"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            nullable=False,
        ),
        sa.Column("lease_id", sa.String(32), nullable=False),
        sa.Column("fencing_number", sa.BigInteger(), nullable=False),
        sa.Column("generation", sa.String(128), nullable=False),
        sa.Column("clock_session_id", sa.String(128), nullable=True),
        sa.Column("observed_elapsed_ms", sa.BigInteger(), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["runner_id", "operation_id"],
            [
                "featherlane.runner_cleanup_receipts.runner_id",
                "featherlane.runner_cleanup_receipts.operation_id",
            ],
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.CheckConstraint(
            "observed_elapsed_ms BETWEEN 0 AND 9007199254740991", name="elapsed_range"
        ),
        schema="featherlane",
    )
    op.create_index(
        "ix_usage_attempt_received",
        "attempt_usage_reports",
        ["attempt_id", "received_at"],
        schema="featherlane",
    )
    op.create_index(
        "ix_usage_attempt_elapsed",
        "attempt_usage_reports",
        ["attempt_id", "observed_elapsed_ms"],
        schema="featherlane",
    )
    op.execute("""
        CREATE FUNCTION featherlane.protect_usage_report() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
          RAISE EXCEPTION 'Usage observations are append-only';
        END; $$;
    """)
    op.execute("""
        CREATE TRIGGER immutable_usage_report BEFORE UPDATE OR DELETE
        ON featherlane.attempt_usage_reports
        FOR EACH ROW EXECUTE FUNCTION featherlane.protect_usage_report();
    """)


def downgrade() -> None:
    op.drop_table("attempt_usage_reports", schema="featherlane")
    op.execute("DROP FUNCTION featherlane.protect_usage_report()")
    op.drop_table("runner_cleanup_receipts", schema="featherlane")
