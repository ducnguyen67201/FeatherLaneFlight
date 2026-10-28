"""Browser identity, opaque sessions and one-use OIDC transactions.

Revision ID: 0002_identity
Revises: 0001_foundation
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_identity"
down_revision = "0001_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        schema="featherlane",
    )
    op.create_table(
        "external_identities",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("user_id", sa.String(32), nullable=False),
        sa.Column("issuer", sa.String(256), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["featherlane.users.id"],
            name="fk_external_identities_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_external_identities"),
        sa.UniqueConstraint("issuer", "subject", name="uq_external_identities_issuer"),
        schema="featherlane",
    )
    op.create_index(
        "ix_external_identities_user_id",
        "external_identities",
        ["user_id"],
        schema="featherlane",
    )
    op.create_table(
        "browser_sessions",
        sa.Column("id", sa.String(32), nullable=False),
        sa.Column("handle_digest", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(32), nullable=False),
        sa.Column("csrf_digest", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["featherlane.users.id"],
            name="fk_browser_sessions_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_browser_sessions"),
        sa.UniqueConstraint("handle_digest", name="uq_browser_sessions_handle_digest"),
        schema="featherlane",
    )
    op.create_index(
        "ix_browser_sessions_user_id",
        "browser_sessions",
        ["user_id"],
        schema="featherlane",
    )
    op.create_index(
        "ix_browser_sessions_expires_at",
        "browser_sessions",
        ["expires_at"],
        schema="featherlane",
    )
    op.create_table(
        "oidc_transactions",
        sa.Column("browser_digest", sa.String(64), nullable=False),
        sa.Column("state_digest", sa.String(64), nullable=False),
        sa.Column("session_data", sa.JSON(), nullable=False),
        sa.Column("previous_session_digest", sa.String(64), nullable=True),
        sa.Column("rotation_session_id", sa.String(32), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("browser_digest", name="pk_oidc_transactions"),
        sa.UniqueConstraint("state_digest", name="uq_oidc_transactions_state_digest"),
        schema="featherlane",
    )
    op.create_index(
        "ix_oidc_transactions_expires_at",
        "oidc_transactions",
        ["expires_at"],
        schema="featherlane",
    )


def downgrade() -> None:
    op.drop_table("oidc_transactions", schema="featherlane")
    op.drop_table("browser_sessions", schema="featherlane")
    op.drop_table("external_identities", schema="featherlane")
    op.drop_table("users", schema="featherlane")
