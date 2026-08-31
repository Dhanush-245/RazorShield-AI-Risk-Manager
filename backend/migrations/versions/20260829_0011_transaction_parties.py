"""Persist complete sender and recipient verification details."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260829_0011"
down_revision: str | None = "20260827_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = (
        sa.Column("customer_name", sa.String(length=160), nullable=True),
        sa.Column("customer_email", sa.String(length=254), nullable=True),
        sa.Column("customer_phone", sa.String(length=30), nullable=True),
        sa.Column(
            "customer_verification_status",
            sa.String(length=40),
            nullable=False,
            server_default="NOT_COLLECTED",
        ),
        sa.Column("sender_account_reference", sa.String(length=100), nullable=True),
        sa.Column("sender_bank_name", sa.String(length=160), nullable=True),
        sa.Column("sender_bank_ifsc", sa.String(length=20), nullable=True),
        sa.Column("recipient_name", sa.String(length=160), nullable=True),
        sa.Column("recipient_account_reference", sa.String(length=100), nullable=True),
        sa.Column("recipient_bank_name", sa.String(length=160), nullable=True),
        sa.Column("recipient_bank_ifsc", sa.String(length=20), nullable=True),
        sa.Column("recipient_email", sa.String(length=254), nullable=True),
        sa.Column("recipient_phone", sa.String(length=30), nullable=True),
    )
    for column in columns:
        op.add_column("transactions", column)


def downgrade() -> None:
    for name in (
        "recipient_phone",
        "recipient_email",
        "recipient_bank_ifsc",
        "recipient_bank_name",
        "recipient_account_reference",
        "recipient_name",
        "sender_bank_ifsc",
        "sender_bank_name",
        "sender_account_reference",
        "customer_verification_status",
        "customer_phone",
        "customer_email",
        "customer_name",
    ):
        op.drop_column("transactions", name)
