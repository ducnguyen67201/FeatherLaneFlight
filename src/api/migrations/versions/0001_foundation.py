"""Create the private application schema; domain tables follow in later phases."""

from alembic import op
from sqlalchemy.schema import CreateSchema, DropSchema

revision = "0001_foundation"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(CreateSchema("featherlane"))


def downgrade() -> None:
    # No CASCADE: refuse to delete a schema containing later/user-created tables.
    op.execute(DropSchema("featherlane"))
