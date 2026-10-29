"""Project-bound runner enrollment and idle health.

Revision ID: 0005_runners
Revises: 0004_owner_admission
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_runners"
down_revision = "0004_owner_admission"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "runners",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("display_name", sa.String(128), nullable=False),
        sa.Column("host_platform", sa.String(128), nullable=False),
        sa.Column("credential_digest", sa.String(64), nullable=False, unique=True),
        sa.Column("key_id", sa.String(32), nullable=False),
        sa.Column("credential_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column("contract_version", sa.String(32), nullable=False),
        sa.Column("protocol_version", sa.String(32), nullable=False),
        sa.Column("capacity_state", sa.String(32), nullable=False),
        sa.Column("heartbeat_sequence", sa.BigInteger(), nullable=False),
        sa.Column("heartbeat_digest", sa.String(64)),
        sa.Column("available_builds", postgresql.JSONB(), nullable=False),
        sa.Column("local_profiles", postgresql.JSONB(), nullable=False),
        sa.Column("diagnostics", postgresql.JSONB(), nullable=False),
        sa.UniqueConstraint("id", "project_id", name="uq_runners_id_project"),
        sa.CheckConstraint(
            "capacity_state IN ('AVAILABLE','BUSY','NEEDS_CLEANUP','DISABLED')",
            name=op.f("ck_runners_capacity_state"),
        ),
        sa.CheckConstraint(
            "heartbeat_sequence >= 0", name=op.f("ck_runners_heartbeat_sequence")
        ),
        schema="featherlane",
    )
    op.create_index(
        "ix_runners_project_id", "runners", ["project_id"], schema="featherlane"
    )
    op.create_table(
        "runner_enrollment_grants",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(32),
            sa.ForeignKey("featherlane.projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            sa.String(32),
            sa.ForeignKey("featherlane.users.id"),
            nullable=False,
        ),
        sa.Column("request_id", sa.String(128), nullable=False),
        sa.Column("display_name", sa.String(128), nullable=False),
        sa.Column("token_digest", sa.String(64), nullable=False, unique=True),
        sa.Column("key_id", sa.String(32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "consumed_by",
            sa.String(32),
            sa.ForeignKey("featherlane.runners.id"),
            unique=True,
        ),
        sa.Column("enrollment_request_id", sa.String(128)),
        sa.Column("enrollment_digest", sa.String(64)),
        sa.UniqueConstraint(
            "project_id", "created_by", "request_id", name="uq_runner_grant_request"
        ),
        schema="featherlane",
    )
    op.create_index(
        "ix_runner_enrollment_grants_project_id",
        "runner_enrollment_grants",
        ["project_id"],
        schema="featherlane",
    )


def downgrade() -> None:
    op.drop_table("runner_enrollment_grants", schema="featherlane")
    op.drop_table("runners", schema="featherlane")
