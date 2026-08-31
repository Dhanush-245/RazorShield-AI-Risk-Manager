"""Add merchant-scoped deterministic rule configuration.

Revision ID: 20260824_0008
Revises: 20260824_0007
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260824_0008"
down_revision: str | None = "20260824_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rule_configurations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("merchant_id", sa.String(length=100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("high_amount_ratio", sa.Float(), nullable=False),
        sa.Column("velocity_5m_threshold", sa.Integer(), nullable=False),
        sa.Column("failed_attempts_threshold", sa.Integer(), nullable=False),
        sa.Column("shared_device_accounts_threshold", sa.Integer(), nullable=False),
        sa.Column("new_device_amount_ratio", sa.Float(), nullable=False),
        sa.Column("geographic_amount_ratio", sa.Float(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("merchant_id"),
    )
    op.create_index(
        "ix_rule_configurations_merchant_id",
        "rule_configurations",
        ["merchant_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_rule_configurations_merchant_id",
        table_name="rule_configurations",
    )
    op.drop_table("rule_configurations")
