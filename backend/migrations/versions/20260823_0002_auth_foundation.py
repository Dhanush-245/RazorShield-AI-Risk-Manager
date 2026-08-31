"""Create merchants, users, roles, and password reset challenges."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260823_0002"
down_revision: str | None = "20260823_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

user_role = sa.Enum("ADMIN", "RISK_ANALYST", "REVIEWER", "VIEWER", name="user_role")


def upgrade() -> None:
    op.create_table(
        "merchants",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("external_id"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("merchant_id", sa.String(length=36), nullable=False),
        sa.Column("email_normalized", sa.String(length=254), nullable=True),
        sa.Column("phone_normalized", sa.String(length=20), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["merchant_id"], ["merchants.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_merchant_id", "users", ["merchant_id"])
    op.create_index("ux_users_email", "users", ["email_normalized"], unique=True)
    op.create_index("ux_users_phone", "users", ["phone_normalized"], unique=True)
    op.create_table(
        "password_reset_challenges",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("identifier_hash", sa.String(length=64), nullable=False),
        sa.Column("otp_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_password_reset_challenges_user_id", "password_reset_challenges", ["user_id"])
    op.create_index(
        "ix_password_reset_lookup",
        "password_reset_challenges",
        ["identifier_hash", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_password_reset_lookup", table_name="password_reset_challenges")
    op.drop_index("ix_password_reset_challenges_user_id", table_name="password_reset_challenges")
    op.drop_table("password_reset_challenges")
    op.drop_index("ux_users_phone", table_name="users")
    op.drop_index("ux_users_email", table_name="users")
    op.drop_index("ix_users_merchant_id", table_name="users")
    op.drop_table("users")
    op.drop_table("merchants")
    user_role.drop(op.get_bind(), checkfirst=True)
