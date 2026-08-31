"""Create Phase 1 transaction, assessment, signal, and audit tables."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260823_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "transactions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=False),
        sa.Column("merchant_id", sa.String(length=100), nullable=False),
        sa.Column("customer_id", sa.String(length=100), nullable=False),
        sa.Column("amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("device_id", sa.String(length=100), nullable=True),
        sa.Column("location", sa.String(length=160), nullable=True),
        sa.Column("payment_method", sa.String(length=60), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transactions_customer", "transactions", ["merchant_id", "customer_id"])
    op.create_index("ix_transactions_merchant_timestamp", "transactions", ["merchant_id", "occurred_at"])
    op.create_table(
        "risk_assessments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("transaction_id", sa.String(length=36), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("risk_level", sa.String(length=20), nullable=False),
        sa.Column("engine_type", sa.String(length=60), nullable=False),
        sa.Column("engine_version", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_risk_assessments_transaction_id", "risk_assessments", ["transaction_id"])
    op.create_table(
        "risk_signals",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("assessment_id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["assessment_id"], ["risk_assessments.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_risk_signals_assessment_id", "risk_signals", ["assessment_id"])
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("merchant_id", sa.String(length=100), nullable=False),
        sa.Column("entity_type", sa.String(length=60), nullable=False),
        sa.Column("entity_id", sa.String(length=100), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("actor_type", sa.String(length=40), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("request_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_merchant_created", "audit_events", ["merchant_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_merchant_created", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_risk_signals_assessment_id", table_name="risk_signals")
    op.drop_table("risk_signals")
    op.drop_index("ix_risk_assessments_transaction_id", table_name="risk_assessments")
    op.drop_table("risk_assessments")
    op.drop_index("ix_transactions_merchant_timestamp", table_name="transactions")
    op.drop_index("ix_transactions_customer", table_name="transactions")
    op.drop_table("transactions")
