"""Persist outcome observation time and label provenance.

Revision ID: 20260901_0013
Revises: 20260901_0012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260901_0013"
down_revision: str | None = "20260901_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("fraud_label_observed_at", sa.DateTime(timezone=True)))
    op.add_column("transactions", sa.Column("return_label_observed_at", sa.DateTime(timezone=True)))
    op.add_column("transactions", sa.Column("label_provenance", sa.String(length=60)))


def downgrade() -> None:
    op.drop_column("transactions", "label_provenance")
    op.drop_column("transactions", "return_label_observed_at")
    op.drop_column("transactions", "fraud_label_observed_at")
