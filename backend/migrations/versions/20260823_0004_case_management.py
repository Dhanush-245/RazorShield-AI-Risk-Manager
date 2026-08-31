"""Create human-review risk cases."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260823_0004"
down_revision: str | None = "20260823_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "risk_cases",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("case_reference", sa.String(100), nullable=False),
        sa.Column("merchant_id", sa.String(36), nullable=False),
        sa.Column("transaction_id", sa.String(36), nullable=True),
        sa.Column("case_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("recommendation", sa.String(60), nullable=False),
        sa.Column("assigned_user_id", sa.String(36), nullable=True),
        sa.Column("human_decision", sa.String(40), nullable=True),
        sa.Column("reviewer_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["merchant_id"], ["merchants.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("case_reference"),
    )
    op.create_index("ix_cases_merchant_status", "risk_cases", ["merchant_id", "status"])
    op.create_index("ix_risk_cases_transaction_id", "risk_cases", ["transaction_id"])


def downgrade() -> None:
    op.drop_index("ix_risk_cases_transaction_id", table_name="risk_cases")
    op.drop_index("ix_cases_merchant_status", table_name="risk_cases")
    op.drop_table("risk_cases")
