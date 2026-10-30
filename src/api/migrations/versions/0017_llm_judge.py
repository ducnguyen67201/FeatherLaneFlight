"""Versioned rubric companions and immutable judge checkpoints.

Revision ID: 0017_llm_judge
Revises: 0017_finalization
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0017_llm_judge"
down_revision = "0017_finalization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "suite_draft_rubrics",
        sa.Column("project_id", sa.String(32), primary_key=True),
        sa.Column("suite_id", sa.String(128), primary_key=True),
        sa.Column("rubric", JSONB(), nullable=False),
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
        "suite_revision_rubrics",
        sa.Column(
            "revision_id",
            sa.String(128),
            sa.ForeignKey("featherlane.suite_revisions.id"),
            primary_key=True,
        ),
        sa.Column("rubric", JSONB(), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        schema="featherlane",
    )
    op.create_table(
        "trial_judgments",
        sa.Column("trial_id", sa.String(128), primary_key=True),
        sa.Column(
            "attempt_id",
            sa.String(32),
            sa.ForeignKey("featherlane.attempt_finalizations.attempt_id"),
            primary_key=True,
        ),
        sa.Column("packet", JSONB(), nullable=False),
        sa.Column("identity", JSONB(), nullable=False),
        sa.Column("response", JSONB(none_as_null=True), nullable=True),
        sa.UniqueConstraint("attempt_id", "trial_id"),
        schema="featherlane",
    )
    op.execute("""CREATE FUNCTION featherlane.protect_published_rubric() RETURNS
      trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'Immutable published judge rubric'; END; $$;""")
    op.execute("""CREATE TRIGGER immutable_rubric BEFORE UPDATE OR DELETE ON
      featherlane.suite_revision_rubrics
      FOR EACH ROW EXECUTE FUNCTION featherlane.protect_published_rubric();""")
    op.execute("""CREATE FUNCTION featherlane.protect_judgment() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Immutable judgment'; END IF;
      IF (NEW.trial_id, NEW.attempt_id, NEW.packet, NEW.identity) IS DISTINCT FROM
         (OLD.trial_id, OLD.attempt_id, OLD.packet, OLD.identity)
         OR (OLD.response IS NOT NULL AND NEW IS DISTINCT FROM OLD)
      THEN RAISE EXCEPTION 'Immutable judgment'; END IF; RETURN NEW; END; $$;""")
    op.execute("""CREATE TRIGGER immutable_judgment BEFORE UPDATE OR DELETE ON
      featherlane.trial_judgments
      FOR EACH ROW EXECUTE FUNCTION featherlane.protect_judgment();""")


def downgrade() -> None:
    op.drop_table("trial_judgments", schema="featherlane")
    op.execute("DROP FUNCTION featherlane.protect_judgment()")
    op.drop_table("suite_revision_rubrics", schema="featherlane")
    op.execute("DROP FUNCTION featherlane.protect_published_rubric()")
    op.drop_table("suite_draft_rubrics", schema="featherlane")
