"""Scope merchant operations to the active uploaded dataset.

Revision ID: 20260824_0007
Revises: 20260823_0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260824_0007"
down_revision: str | None = "20260823_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("merchants", sa.Column("active_dataset_id", sa.String(length=36), nullable=True))
    op.add_column("merchants", sa.Column("active_dataset_name", sa.String(length=255), nullable=True))
    op.add_column(
        "merchants", sa.Column("active_dataset_activated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index("ix_merchants_active_dataset_id", "merchants", ["active_dataset_id"])
    op.add_column("transactions", sa.Column("dataset_id", sa.String(length=36), nullable=True))
    op.create_index("ix_transactions_dataset_id", "transactions", ["dataset_id"])
    op.add_column("audit_events", sa.Column("dataset_id", sa.String(length=36), nullable=True))
    op.create_index("ix_audit_events_dataset_id", "audit_events", ["dataset_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_dataset_id", table_name="audit_events")
    op.drop_column("audit_events", "dataset_id")
    op.drop_index("ix_transactions_dataset_id", table_name="transactions")
    op.drop_column("transactions", "dataset_id")
    op.drop_index("ix_merchants_active_dataset_id", table_name="merchants")
    op.drop_column("merchants", "active_dataset_activated_at")
    op.drop_column("merchants", "active_dataset_name")
    op.drop_column("merchants", "active_dataset_id")
