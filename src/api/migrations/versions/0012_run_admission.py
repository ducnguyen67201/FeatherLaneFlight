"""Bounded run queue and measured synthetic readiness.

Revision ID: 0012_run_admission
Revises: 0010_suite_catalog
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012_run_admission"
down_revision = "0010_suite_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "runners",
        sa.Column("synthetic_readiness", postgresql.JSONB(), nullable=True),
        schema="featherlane",
    )
    op.create_table(
        "runs",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            sa.String(32),
            sa.ForeignKey("featherlane.users.id"),
            nullable=False,
        ),
        sa.Column("runner_id", sa.String(32), nullable=False),
        sa.Column("build_id", sa.String(128), nullable=False),
        sa.Column(
            "suite_revision_id",
            sa.String(128),
            sa.ForeignKey("featherlane.suite_revisions.id"),
            nullable=False,
        ),
        sa.Column("build_label", sa.String(128), nullable=False),
        sa.Column("suite_title", sa.String(128), nullable=False),
        sa.Column("suite_revision", sa.Integer(), nullable=False),
        sa.Column("runner_display_name", sa.String(128), nullable=False),
        sa.Column("repetitions", sa.Integer(), nullable=False),
        sa.Column("requested_manifest", postgresql.JSONB(), nullable=False),
        sa.Column("suite_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("expected_trials", postgresql.JSONB(), nullable=False),
        sa.Column("execution_state", sa.String(16), nullable=False),
        sa.Column("evaluation_outcome", sa.String(16), nullable=False),
        sa.Column("terminal_reason", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "cancellation_requested_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column(
            "cancellation_deadline_at", sa.DateTime(timezone=True), nullable=True
        ),
        sa.ForeignKeyConstraint(
            ["runner_id", "project_id"],
            ["featherlane.runners.id", "featherlane.runners.project_id"],
        ),
        sa.CheckConstraint(
            "execution_state IN ('QUEUED','CLAIMED','STARTING','RUNNING',"
            "'FINALIZING','COMPLETED','CANCELED','ERROR')",
            name=op.f("ck_runs_execution_state"),
        ),
        sa.CheckConstraint(
            "evaluation_outcome IN ('NOT_EVALUATED','PASS','FAIL','INCONCLUSIVE')",
            name=op.f("ck_runs_evaluation_outcome"),
        ),
        sa.CheckConstraint(
            "repetitions BETWEEN 1 AND 10", name=op.f("ck_runs_repetitions")
        ),
        schema="featherlane",
    )
    op.create_index(
        "ix_runs_project_queue",
        "runs",
        ["project_id", "execution_state", "id"],
        schema="featherlane",
    )
    op.create_index(
        "ix_runs_runner_queue",
        "runs",
        ["runner_id", "execution_state", "id"],
        schema="featherlane",
    )
    op.create_table(
        "run_submission_receipts",
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            primary_key=True,
        ),
        sa.Column(
            "actor_id",
            sa.String(32),
            sa.ForeignKey("featherlane.users.id"),
            primary_key=True,
        ),
        sa.Column("request_key", sa.String(128), primary_key=True),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column(
            "run_id",
            sa.String(128),
            sa.ForeignKey("featherlane.runs.id"),
            nullable=False,
        ),
        schema="featherlane",
    )
    op.create_table(
        "run_audit_events",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            sa.String(32),
            sa.ForeignKey("featherlane.users.id"),
            nullable=False,
        ),
        sa.Column(
            "run_id",
            sa.String(128),
            sa.ForeignKey("featherlane.runs.id"),
            nullable=False,
        ),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("run_id", "action"),
        schema="featherlane",
    )
    op.execute("""
        CREATE FUNCTION featherlane.protect_run_snapshot() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            IF (NEW.id, NEW.project_id, NEW.actor_id, NEW.runner_id, NEW.build_id,
                NEW.suite_revision_id, NEW.build_label, NEW.suite_title,
                NEW.suite_revision, NEW.runner_display_name, NEW.repetitions,
                NEW.requested_manifest, NEW.suite_snapshot,
                NEW.expected_trials, NEW.created_at)
                IS DISTINCT FROM
               (OLD.id, OLD.project_id, OLD.actor_id, OLD.runner_id, OLD.build_id,
                OLD.suite_revision_id, OLD.build_label, OLD.suite_title,
                OLD.suite_revision, OLD.runner_display_name, OLD.repetitions,
                OLD.requested_manifest, OLD.suite_snapshot,
                OLD.expected_trials, OLD.created_at)
            THEN RAISE EXCEPTION 'Run admission snapshots are immutable'; END IF;
            RETURN NEW;
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER immutable_run_snapshot BEFORE UPDATE ON featherlane.runs
        FOR EACH ROW EXECUTE FUNCTION featherlane.protect_run_snapshot();
    """)
    for table in ("run_submission_receipts", "run_audit_events"):
        op.execute(f"""
            CREATE TRIGGER immutable_run_receipt BEFORE UPDATE OR DELETE
            ON featherlane.{table} FOR EACH ROW
            EXECUTE FUNCTION featherlane.reject_registration_mutation();
        """)


def downgrade() -> None:
    op.drop_table("run_audit_events", schema="featherlane")
    op.drop_table("run_submission_receipts", schema="featherlane")
    op.drop_table("runs", schema="featherlane")
    op.execute("DROP FUNCTION featherlane.protect_run_snapshot()")
    op.drop_column("runners", "synthetic_readiness", schema="featherlane")
