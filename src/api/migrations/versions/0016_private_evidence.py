"""Private evidence declarations, quotas and immutable verification receipts.

Revision ID: 0016_private_evidence
Revises: 0015_events
"""

import sqlalchemy as sa
from alembic import op

revision = "0016_private_evidence"
down_revision = "0015_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "evidence_project_quotas",
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            primary_key=True,
        ),
        schema="featherlane",
    )
    op.create_table(
        "artifacts",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            nullable=False,
        ),
        sa.Column(
            "run_id",
            sa.String(128),
            sa.ForeignKey("featherlane.runs.id"),
            nullable=False,
        ),
        sa.Column(
            "attempt_id",
            sa.String(32),
            sa.ForeignKey("featherlane.run_attempts.id"),
            nullable=False,
        ),
        sa.Column(
            "runner_id",
            sa.String(32),
            sa.ForeignKey("featherlane.runners.id"),
            nullable=False,
        ),
        sa.Column("request_id", sa.String(128), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("trial_id", sa.String(128), nullable=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("disposition", sa.String(16), nullable=False),
        sa.Column("byte_length", sa.BigInteger(), nullable=True),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "attempt_id", "request_id", name=op.f("uq_artifacts_attempt_id")
        ),
        sa.CheckConstraint(
            "kind IN ('OBSERVATIONS','REDACTED_PROCESS_LOG','PX4_ULOG')",
            name=op.f("ck_artifacts_kind"),
        ),
        sa.CheckConstraint(
            "disposition IN ('UPLOAD','LOCAL_ONLY')",
            name=op.f("ck_artifacts_disposition"),
        ),
        sa.CheckConstraint(
            "state IN ('PENDING','FAILED','VERIFIED','NOT_VERIFIED')",
            name=op.f("ck_artifacts_state"),
        ),
        sa.CheckConstraint(
            "(disposition = 'UPLOAD' AND byte_length IS NOT NULL "
            "AND sha256 IS NOT NULL "
            "AND byte_length BETWEEN 0 AND 104857600 "
            "AND sha256 ~ '^[a-f0-9]{64}$' AND state <> 'NOT_VERIFIED') OR "
            "(disposition = 'LOCAL_ONLY' AND byte_length IS NULL AND sha256 IS NULL "
            "AND state = 'NOT_VERIFIED')",
            name=op.f("ck_artifacts_content"),
        ),
        sa.CheckConstraint(
            "(state = 'VERIFIED') = (verified_at IS NOT NULL)",
            name=op.f("ck_artifacts_verification"),
        ),
        schema="featherlane",
    )
    for column in ("project_id", "run_id"):
        op.create_index(
            f"ix_artifacts_{column}", "artifacts", [column], schema="featherlane"
        )
    op.execute("""
        CREATE FUNCTION featherlane.guard_artifact_receipt() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP = 'UPDATE' THEN
                IF OLD.state IN ('VERIFIED','NOT_VERIFIED')
                   AND NEW IS DISTINCT FROM OLD THEN
                    RAISE EXCEPTION 'Immutable artifact receipt';
                END IF;
                IF (NEW.id, NEW.project_id, NEW.run_id, NEW.attempt_id, NEW.runner_id,
                    NEW.request_id, NEW.request_digest, NEW.trial_id, NEW.kind,
                    NEW.disposition, NEW.byte_length, NEW.sha256,
                    NEW.created_at, NEW.expires_at)
                   IS DISTINCT FROM
                   (OLD.id, OLD.project_id, OLD.run_id, OLD.attempt_id, OLD.runner_id,
                    OLD.request_id, OLD.request_digest, OLD.trial_id, OLD.kind,
                    OLD.disposition, OLD.byte_length, OLD.sha256,
                    OLD.created_at, OLD.expires_at) THEN
                    RAISE EXCEPTION 'Immutable artifact declaration';
                END IF;
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM featherlane.run_attempts a
                WHERE a.id = NEW.attempt_id AND a.project_id = NEW.project_id
                  AND a.run_id = NEW.run_id AND a.runner_id = NEW.runner_id
            ) THEN
                RAISE EXCEPTION 'Artifact scope mismatch';
            END IF;
            RETURN NEW;
        END $$;
    """)
    op.execute("""
        CREATE TRIGGER immutable_artifact_receipt
        BEFORE INSERT OR UPDATE ON featherlane.artifacts
        FOR EACH ROW EXECUTE FUNCTION featherlane.guard_artifact_receipt()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER immutable_artifact_receipt ON featherlane.artifacts")
    op.execute("DROP FUNCTION featherlane.guard_artifact_receipt()")
    op.drop_table("artifacts", schema="featherlane")
    op.drop_table("evidence_project_quotas", schema="featherlane")
