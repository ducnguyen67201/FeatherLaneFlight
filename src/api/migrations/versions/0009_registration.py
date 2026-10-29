"""Immutable build/profile metadata and scoped audit records.

Revision ID: 0009_registration
Revises: 0005_runners
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009_registration"
down_revision = "0005_runners"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "registrations",
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id"),
            primary_key=True,
        ),
        sa.Column("kind", sa.String(16), primary_key=True),
        sa.Column("id", sa.String(128), primary_key=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('BUILD', 'INTEGRATION', 'LOCAL_PROFILE')",
            name=op.f("ck_registrations_kind"),
        ),
        schema="featherlane",
    )
    op.create_table(
        "registration_audit_events",
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
        sa.Column("registration_id", sa.String(128), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        schema="featherlane",
    )
    op.create_index(
        "ix_registration_audit_events_project_id",
        "registration_audit_events",
        ["project_id"],
        schema="featherlane",
    )
    op.create_table(
        "registration_receipts",
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
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("registration_id", sa.String(128), nullable=False),
        schema="featherlane",
    )
    op.execute("""
        CREATE FUNCTION featherlane.reject_registration_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Registrations are immutable';
        END;
        $$;
    """)
    op.execute("""
        CREATE TRIGGER immutable_registration BEFORE UPDATE OR DELETE
        ON featherlane.registrations FOR EACH ROW
        EXECUTE FUNCTION featherlane.reject_registration_mutation();
    """)
    for table in ("registration_receipts", "registration_audit_events"):
        op.execute(f"""
            CREATE TRIGGER immutable_registration BEFORE UPDATE OR DELETE
            ON featherlane.{table} FOR EACH ROW
            EXECUTE FUNCTION featherlane.reject_registration_mutation();
        """)


def downgrade() -> None:
    op.drop_table("registration_receipts", schema="featherlane")
    op.drop_table("registration_audit_events", schema="featherlane")
    op.drop_table("registrations", schema="featherlane")
    op.execute("DROP FUNCTION featherlane.reject_registration_mutation()")
