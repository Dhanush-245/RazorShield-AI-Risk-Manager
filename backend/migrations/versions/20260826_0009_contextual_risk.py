"""Add contextual transaction and recipient fields."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260826_0009"
down_revision: str | None = "20260824_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("customer_age", sa.Integer(), nullable=True))
    op.add_column(
        "transactions",
        sa.Column("account_age_days", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("transactions", sa.Column("recipient_id", sa.String(length=100), nullable=True))
    op.add_column(
        "transactions",
        sa.Column("recipient_type", sa.String(length=60), nullable=False, server_default="UNKNOWN"),
    )
    op.add_column(
        "transactions",
        sa.Column("recipient_category", sa.String(length=60), nullable=False, server_default="UNKNOWN"),
    )
    op.add_column(
        "transactions",
        sa.Column("recipient_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "transactions",
        sa.Column("transaction_intent", sa.String(length=60), nullable=False, server_default="UNKNOWN"),
    )
    op.create_index("ix_transactions_recipient_id", "transactions", ["recipient_id"])
    op.add_column(
        "risk_assessments",
        sa.Column("contextual_adjustment", sa.Numeric(precision=7, scale=6), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("risk_assessments", "contextual_adjustment")
    op.drop_index("ix_transactions_recipient_id", table_name="transactions")
    op.drop_column("transactions", "transaction_intent")
    op.drop_column("transactions", "recipient_verified")
    op.drop_column("transactions", "recipient_category")
    op.drop_column("transactions", "recipient_type")
    op.drop_column("transactions", "recipient_id")
    op.drop_column("transactions", "account_age_days")
    op.drop_column("transactions", "customer_age")
