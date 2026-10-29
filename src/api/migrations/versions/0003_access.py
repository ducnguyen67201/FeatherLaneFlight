"""Organizations, projects, explicit memberships and atomic access audits.

Revision ID: 0003_access
Revises: 0002_identity
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_access"
down_revision = "0002_identity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 128",
            name=op.f("ck_organizations_name_length"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_organizations"),
        schema="featherlane",
    )
    op.create_table(
        "organization_memberships",
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("user_id", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["featherlane.organizations.id"],
            name="fk_organization_memberships_organization_id_organizations",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["featherlane.users.id"],
            name="fk_organization_memberships_user_id_users",
        ),
        sa.PrimaryKeyConstraint(
            "organization_id", "user_id", name="pk_organization_memberships"
        ),
        schema="featherlane",
    )
    op.create_table(
        "projects",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("created_by", sa.String(32), nullable=False),
        sa.Column("creation_key", sa.String(128), nullable=False),
        sa.CheckConstraint(
            "char_length(name) BETWEEN 1 AND 100", name=op.f("ck_projects_name_length")
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["featherlane.organizations.id"],
            name="fk_projects_organization_id_organizations",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["featherlane.users.id"],
            name="fk_projects_created_by_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_projects"),
        sa.UniqueConstraint(
            "id", "organization_id", name="uq_projects_id_organization"
        ),
        sa.UniqueConstraint(
            "organization_id", "created_by", "creation_key", name="uq_projects_creation"
        ),
        schema="featherlane",
    )
    op.create_index(
        "ix_projects_organization_id",
        "projects",
        ["organization_id"],
        schema="featherlane",
    )
    op.create_table(
        "project_memberships",
        sa.Column("project_id", sa.String(32), nullable=False),
        sa.Column("user_id", sa.String(32), nullable=False),
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id", "organization_id"],
            ["featherlane.projects.id", "featherlane.projects.organization_id"],
            ondelete="CASCADE",
            name="fk_project_memberships_project",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id", "user_id"],
            [
                "featherlane.organization_memberships.organization_id",
                "featherlane.organization_memberships.user_id",
            ],
            ondelete="CASCADE",
            name="fk_project_memberships_organization_member",
        ),
        sa.PrimaryKeyConstraint("project_id", "user_id", name="pk_project_memberships"),
        schema="featherlane",
    )
    op.create_index(
        "ix_project_memberships_organization_id",
        "project_memberships",
        ["organization_id"],
        schema="featherlane",
    )
    op.create_table(
        "access_audit_events",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("project_id", sa.String(32), nullable=True),
        sa.Column("actor", sa.String(32), nullable=False),
        sa.Column("user_id", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_access_audit_events"),
        schema="featherlane",
    )
    op.create_index(
        "ix_access_audit_events_organization_id",
        "access_audit_events",
        ["organization_id"],
        schema="featherlane",
    )


def downgrade() -> None:
    op.drop_table("access_audit_events", schema="featherlane")
    op.drop_table("project_memberships", schema="featherlane")
    op.drop_table("projects", schema="featherlane")
    op.drop_table("organization_memberships", schema="featherlane")
    op.drop_table("organizations", schema="featherlane")
