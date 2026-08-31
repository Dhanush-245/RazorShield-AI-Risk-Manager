"""Persist measured inference latency.

Revision ID: 20260823_0006
Revises: 20260823_0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260823_0006"
down_revision: str | None = "20260823_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("risk_assessments", sa.Column("inference_latency_ms", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("risk_assessments", "inference_latency_ms")
