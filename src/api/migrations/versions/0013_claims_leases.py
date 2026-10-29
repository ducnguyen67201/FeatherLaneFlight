"""Fenced attempts and durable claim receipts.

Revision ID: 0013_claims_leases
Revises: 0011_suite_drafts
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013_claims_leases"
down_revision = "0011_suite_drafts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "runners",
        sa.Column(
            "fencing_number", sa.BigInteger(), nullable=False, server_default="0"
        ),
        schema="featherlane",
    )
    op.create_check_constraint(
        op.f("ck_runners_fencing_number"),
        "runners",
        "fencing_number BETWEEN 0 AND 9007199254740991",
        schema="featherlane",
    )
    op.create_table(
        "run_attempts",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column(
            "run_id",
            sa.String(128),
            sa.ForeignKey("featherlane.runs.id"),
            nullable=False,
        ),
        sa.Column(
            "runner_id",
            sa.String(32),
            sa.ForeignKey("featherlane.runners.id"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            nullable=False,
        ),
        sa.Column("lease_id", sa.String(32), nullable=False, unique=True),
        sa.Column("fencing_number", sa.BigInteger(), nullable=False),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("heartbeat_sequence", sa.BigInteger(), nullable=False),
        sa.Column("heartbeat_digest", sa.String(64), nullable=True),
        sa.Column("observed_manifest", postgresql.JSONB(), nullable=True),
        sa.Column("manifest_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("terminal_reason", postgresql.JSONB(), nullable=True),
        sa.UniqueConstraint("runner_id", "fencing_number"),
        sa.CheckConstraint(
            "fencing_number BETWEEN 1 AND 9007199254740991",
            name=op.f("ck_run_attempts_fencing_number"),
        ),
        sa.CheckConstraint(
            "heartbeat_sequence BETWEEN 0 AND 9007199254740991",
            name=op.f("ck_run_attempts_heartbeat_sequence"),
        ),
        schema="featherlane",
    )
    for name, column in [
        ("uq_attempt_active_run", "run_id"),
        ("uq_attempt_active_runner", "runner_id"),
    ]:
        op.create_index(
            name,
            "run_attempts",
            [column],
            unique=True,
            postgresql_where=sa.text("finished_at IS NULL"),
            schema="featherlane",
        )
    op.create_index(
        "ix_attempt_expiry",
        "run_attempts",
        ["lease_expires_at"],
        postgresql_where=sa.text("finished_at IS NULL"),
        schema="featherlane",
    )
    op.create_table(
        "runner_claim_receipts",
        sa.Column(
            "runner_id",
            sa.String(32),
            sa.ForeignKey("featherlane.runners.id"),
            primary_key=True,
        ),
        sa.Column("request_id", sa.String(128), primary_key=True),
        sa.Column(
            "attempt_id",
            sa.String(32),
            sa.ForeignKey("featherlane.run_attempts.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="featherlane",
    )
    op.execute("""
        CREATE TRIGGER immutable_claim_receipt BEFORE UPDATE OR DELETE
        ON featherlane.runner_claim_receipts FOR EACH ROW
        EXECUTE FUNCTION featherlane.reject_registration_mutation();
    """)
    op.execute("""
        CREATE FUNCTION featherlane.protect_attempt_identity() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
          IF (NEW.id, NEW.run_id, NEW.runner_id, NEW.project_id, NEW.lease_id,
              NEW.fencing_number, NEW.created_at) IS DISTINCT FROM
             (OLD.id, OLD.run_id, OLD.runner_id, OLD.project_id, OLD.lease_id,
              OLD.fencing_number, OLD.created_at)
             OR (OLD.observed_manifest IS NOT NULL
                 AND OLD.observed_manifest <> 'null'::jsonb AND
                 (NEW.observed_manifest, NEW.manifest_accepted_at) IS DISTINCT FROM
                 (OLD.observed_manifest, OLD.manifest_accepted_at))
             OR (OLD.finished_at IS NOT NULL AND NEW IS DISTINCT FROM OLD)
          THEN RAISE EXCEPTION 'Attempt identity and manifest are immutable';
          END IF;
          RETURN NEW;
        END; $$;
    """)
    op.execute("""
        CREATE TRIGGER immutable_attempt_identity
        BEFORE UPDATE ON featherlane.run_attempts
        FOR EACH ROW EXECUTE FUNCTION featherlane.protect_attempt_identity();
    """)


def downgrade() -> None:
    op.drop_table("runner_claim_receipts", schema="featherlane")
    op.drop_table("run_attempts", schema="featherlane")
    op.execute("DROP FUNCTION featherlane.protect_attempt_identity()")
    op.drop_constraint(
        op.f("ck_runners_fencing_number"),
        "runners",
        schema="featherlane",
        type_="check",
    )
    op.drop_column("runners", "fencing_number", schema="featherlane")
