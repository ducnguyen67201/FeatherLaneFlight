"""Explicit owners and opt-in email/domain organization admission.

Revision ID: 0004_owner_admission
Revises: 0003_access
"""

import sqlalchemy as sa
from alembic import op

revision = "0004_owner_admission"
down_revision = "0003_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "access_audit_events", sa.Column("rule_id", sa.String(32)), schema="featherlane"
    )
    # Existing organizations deliberately have no owner until an explicit backfill.
    op.add_column(
        "organizations", sa.Column("owner_user_id", sa.String(32)), schema="featherlane"
    )
    op.create_foreign_key(
        "fk_organizations_owner_membership",
        "organizations",
        "organization_memberships",
        ["id", "owner_user_id"],
        ["organization_id", "user_id"],
        source_schema="featherlane",
        referent_schema="featherlane",
        deferrable=True,
        initially="DEFERRED",
    )
    op.add_column(
        "organization_memberships",
        sa.Column("source", sa.String(16), nullable=False, server_default="OPERATOR"),
        schema="featherlane",
    )
    op.add_column(
        "organization_memberships",
        sa.Column("admission_email", sa.String(320)),
        schema="featherlane",
    )
    op.create_table(
        "organization_email_grants",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("claimed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["featherlane.organizations.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("organization_id", "email"),
        schema="featherlane",
    )
    op.create_table(
        "organization_domain_rules",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("domain", sa.String(253), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["featherlane.organizations.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("organization_id", "domain"),
        schema="featherlane",
    )
    op.create_table(
        "organization_join_exclusions",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("value", sa.String(320), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["featherlane.organizations.id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint("kind IN ('email', 'user')", name="kind"),
        sa.UniqueConstraint("organization_id", "kind", "value"),
        schema="featherlane",
    )
    for table in (
        "organization_email_grants",
        "organization_domain_rules",
        "organization_join_exclusions",
    ):
        op.create_index(
            f"ix_{table}_organization_id",
            table,
            ["organization_id"],
            schema="featherlane",
        )


def downgrade() -> None:
    for table in (
        "organization_join_exclusions",
        "organization_domain_rules",
        "organization_email_grants",
    ):
        op.drop_table(table, schema="featherlane")
    op.drop_column("organization_memberships", "admission_email", schema="featherlane")
    op.drop_column("organization_memberships", "source", schema="featherlane")
    op.drop_constraint(
        "fk_organizations_owner_membership",
        "organizations",
        schema="featherlane",
        type_="foreignkey",
    )
    op.drop_column("organizations", "owner_user_id", schema="featherlane")
    op.drop_column("access_audit_events", "rule_id", schema="featherlane")
