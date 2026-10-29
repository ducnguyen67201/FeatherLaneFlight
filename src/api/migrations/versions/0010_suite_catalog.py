"""Published suite revisions and separate immutable synthetic provenance.

Follows the merged P09 registration migration.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0010_suite_catalog"
down_revision = "0009_registration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "synthetic_suite_qualifications",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            nullable=False,
        ),
        sa.Column("suite_digest", sa.String(64), nullable=False),
        sa.Column("profile_id", sa.String(128), nullable=False),
        sa.Column("profile_revision", sa.Integer(), nullable=False),
        sa.Column("profile_digest", sa.String(64), nullable=False),
        sa.Column("report_sha256", sa.String(64), nullable=False),
        sa.Column("report", JSONB(), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "project_id", "suite_digest", name="uq_synthetic_qualification_suite"
        ),
        sa.UniqueConstraint(
            "project_id", "id", name="uq_synthetic_qualification_project_id"
        ),
        schema="featherlane",
    )
    op.create_table(
        "suite_revisions",
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            nullable=False,
        ),
        sa.Column("suite_id", sa.String(128), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("qualification_id", sa.String(128), nullable=False),
        sa.Column("definition", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id", "qualification_id"],
            [
                "featherlane.synthetic_suite_qualifications.project_id",
                "featherlane.synthetic_suite_qualifications.id",
            ],
        ),
        sa.UniqueConstraint("project_id", "suite_id", "revision"),
        sa.CheckConstraint("revision BETWEEN 1 AND 1000000", name="revision_bounds"),
        sa.CheckConstraint("digest ~ '^[a-f0-9]{64}$'", name="digest_format"),
        schema="featherlane",
    )
    op.create_index(
        "ix_suite_revisions_project_id",
        "suite_revisions",
        ["project_id"],
        schema="featherlane",
    )
    op.create_table(
        "suite_audit_events",
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
        sa.Column("suite_revision_id", sa.String(128), nullable=False),
        sa.Column("qualification_id", sa.String(128), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="featherlane",
    )
    op.create_index(
        "ix_suite_audit_events_project_id",
        "suite_audit_events",
        ["project_id"],
        schema="featherlane",
    )
    op.execute("""
        CREATE FUNCTION featherlane.reject_suite_revision_mutation()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Published suite/qualification records are immutable';
        END;
        $$
    """)
    for table in ("suite_revisions", "synthetic_suite_qualifications"):
        op.execute(f"""
            CREATE TRIGGER {table}_immutable BEFORE UPDATE OR DELETE
            ON featherlane.{table} FOR EACH ROW
            EXECUTE FUNCTION featherlane.reject_suite_revision_mutation()
        """)


def downgrade() -> None:
    op.drop_table("suite_audit_events", schema="featherlane")
    op.drop_table("suite_revisions", schema="featherlane")
    op.drop_table("synthetic_suite_qualifications", schema="featherlane")
    op.execute("DROP FUNCTION featherlane.reject_suite_revision_mutation()")
