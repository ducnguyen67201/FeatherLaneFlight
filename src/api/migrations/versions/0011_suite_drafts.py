"""Incomplete suite drafts, revision preconditions and publication receipts.

Revision ID: 0011_suite_drafts
Revises: 0012_run_admission (actual P10 migration required before final integration)
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011_suite_drafts"
down_revision = "0012_run_admission"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "suite_drafts",
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            primary_key=True,
        ),
        sa.Column("suite_id", sa.String(128), primary_key=True),
        sa.Column("draft_version", sa.Integer(), nullable=False),
        sa.Column("content", postgresql.JSONB(), nullable=False),
        sa.Column(
            "last_published_revision_id",
            sa.String(128),
            sa.ForeignKey("featherlane.suite_revisions.id"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "draft_version BETWEEN 1 AND 1000000",
            name=op.f("ck_suite_drafts_draft_version_bounds"),
        ),
        schema="featherlane",
    )
    op.create_table(
        "suite_draft_creations",
        sa.Column("project_id", sa.String(32), primary_key=True),
        sa.Column(
            "actor_id",
            sa.String(32),
            sa.ForeignKey("featherlane.users.id"),
            primary_key=True,
        ),
        sa.Column("request_key", sa.String(128), primary_key=True),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("suite_id", sa.String(128), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id", "suite_id"],
            [
                "featherlane.suite_drafts.project_id",
                "featherlane.suite_drafts.suite_id",
            ],
        ),
        schema="featherlane",
    )
    op.create_table(
        "suite_draft_publications",
        sa.Column("project_id", sa.String(32), primary_key=True),
        sa.Column("suite_id", sa.String(128), primary_key=True),
        sa.Column("draft_version", sa.Integer(), primary_key=True),
        sa.Column(
            "suite_revision_id",
            sa.String(128),
            sa.ForeignKey("featherlane.suite_revisions.id"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "suite_id"],
            [
                "featherlane.suite_drafts.project_id",
                "featherlane.suite_drafts.suite_id",
            ],
        ),
        schema="featherlane",
    )
    op.create_table(
        "suite_draft_audit_events",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            nullable=False,
        ),
        sa.Column("suite_id", sa.String(128), nullable=False),
        sa.Column("draft_version", sa.Integer(), nullable=False),
        sa.Column(
            "actor_id",
            sa.String(32),
            sa.ForeignKey("featherlane.users.id"),
            nullable=False,
        ),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="featherlane",
    )
    op.create_index(
        "ix_suite_draft_audit_events_project_id",
        "suite_draft_audit_events",
        ["project_id"],
        schema="featherlane",
    )
    op.execute("""
        CREATE FUNCTION featherlane.reject_suite_draft_journal_mutation()
        RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Suite draft journals are immutable';
        END;
        $$;
    """)
    for table in (
        "suite_draft_creations",
        "suite_draft_publications",
        "suite_draft_audit_events",
    ):
        op.execute(f"""
            CREATE TRIGGER immutable_draft_journal BEFORE UPDATE OR DELETE
            ON featherlane.{table} FOR EACH ROW
            EXECUTE FUNCTION featherlane.reject_suite_draft_journal_mutation();
        """)


def downgrade() -> None:
    op.drop_table("suite_draft_audit_events", schema="featherlane")
    op.drop_table("suite_draft_publications", schema="featherlane")
    op.drop_table("suite_draft_creations", schema="featherlane")
    op.drop_table("suite_drafts", schema="featherlane")
    op.execute("DROP FUNCTION featherlane.reject_suite_draft_journal_mutation()")
