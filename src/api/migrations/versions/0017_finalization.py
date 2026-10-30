"""Sealed finalization handoff and immutable terminal evaluation receipts.

Revision ID: 0017_finalization
Revises: 0016_private_evidence
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0017_finalization"
down_revision = "0016_private_evidence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "run_attempts",
        sa.Column("finalization_accepted_at", sa.DateTime(timezone=True)),
        schema="featherlane",
    )
    op.create_table(
        "attempt_finalizations",
        sa.Column(
            "attempt_id",
            sa.String(32),
            sa.ForeignKey("featherlane.run_attempts.id"),
            primary_key=True,
        ),
        sa.Column(
            "runner_id",
            sa.String(32),
            sa.ForeignKey("featherlane.runners.id"),
            nullable=False,
        ),
        sa.Column("operation_id", sa.String(128), nullable=False),
        sa.Column("input_digest", sa.String(64), nullable=False),
        sa.Column("inputs", JSONB(), nullable=False),
        sa.Column("acceptance", JSONB(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("terminal", JSONB(none_as_null=True), nullable=True),
        sa.UniqueConstraint(
            "runner_id", "operation_id", name=op.f("uq_attempt_finalizations_runner_id")
        ),
        sa.CheckConstraint(
            "deadline_at > accepted_at", name=op.f("ck_attempt_finalizations_deadline")
        ),
        schema="featherlane",
    )
    op.create_index(
        "ix_attempt_finalizations_deadline_at",
        "attempt_finalizations",
        ["deadline_at"],
        schema="featherlane",
    )
    op.execute("""
        CREATE FUNCTION featherlane.protect_finalization() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
          IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Immutable finalization'; END IF;
          IF (NEW.attempt_id, NEW.runner_id, NEW.operation_id, NEW.input_digest,
              NEW.inputs, NEW.acceptance, NEW.accepted_at, NEW.deadline_at)
             IS DISTINCT FROM
             (OLD.attempt_id, OLD.runner_id, OLD.operation_id, OLD.input_digest,
              OLD.inputs, OLD.acceptance, OLD.accepted_at, OLD.deadline_at)
             OR (OLD.terminal IS NOT NULL AND NEW IS DISTINCT FROM OLD)
          THEN RAISE EXCEPTION 'Immutable finalization'; END IF;
          RETURN NEW;
        END; $$;
    """)
    op.execute("""
        CREATE TRIGGER immutable_finalization BEFORE UPDATE OR DELETE
        ON featherlane.attempt_finalizations FOR EACH ROW
        EXECUTE FUNCTION featherlane.protect_finalization();
    """)
    op.execute("""
        CREATE FUNCTION featherlane.protect_finalization_handoff() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
          IF OLD.finalization_accepted_at IS NOT NULL
             AND NEW.finalization_accepted_at
                 IS DISTINCT FROM OLD.finalization_accepted_at
          THEN RAISE EXCEPTION 'Immutable finalization handoff'; END IF;
          IF NEW.finalization_accepted_at IS NOT NULL AND NOT EXISTS (
             SELECT 1 FROM featherlane.attempt_finalizations f
             WHERE f.attempt_id = NEW.id AND f.runner_id = NEW.runner_id
               AND f.accepted_at = NEW.finalization_accepted_at
          ) THEN RAISE EXCEPTION 'Missing finalization receipt'; END IF;
          RETURN NEW;
        END; $$;
    """)
    op.execute("""
        CREATE CONSTRAINT TRIGGER finalization_handoff
        AFTER INSERT OR UPDATE ON featherlane.run_attempts
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
        EXECUTE FUNCTION featherlane.protect_finalization_handoff();
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER finalization_handoff ON featherlane.run_attempts")
    op.execute("DROP FUNCTION featherlane.protect_finalization_handoff()")
    op.drop_table("attempt_finalizations", schema="featherlane")
    op.execute("DROP FUNCTION featherlane.protect_finalization()")
    op.drop_column("run_attempts", "finalization_accepted_at", schema="featherlane")
