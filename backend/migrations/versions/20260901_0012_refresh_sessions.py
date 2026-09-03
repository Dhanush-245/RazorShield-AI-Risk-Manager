"""Add rotating refresh-token sessions."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260901_0012"
down_revision: str | None = "20260829_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "refresh_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_id", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["replaced_by_id"], ["refresh_sessions.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_refresh_sessions_user_expiry",
        "refresh_sessions",
        ["user_id", "expires_at"],
        unique=False,
    )
    op.create_index(
        "ux_refresh_sessions_token_hash",
        "refresh_sessions",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ux_refresh_sessions_token_hash", table_name="refresh_sessions")
    op.drop_index("ix_refresh_sessions_user_expiry", table_name="refresh_sessions")
    op.drop_table("refresh_sessions")
