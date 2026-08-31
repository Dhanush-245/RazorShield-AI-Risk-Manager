"""Persist outcome labels and training feature snapshots."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260827_0010"
down_revision: str | None = "20260826_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("fraud_label", sa.Boolean(), nullable=True))
    op.add_column("transactions", sa.Column("return_label", sa.Boolean(), nullable=True))
    op.add_column("risk_assessments", sa.Column("feature_snapshot", sa.Text(), nullable=True))
    with op.batch_alter_table("risk_assessments") as batch_op:
        batch_op.alter_column(
            "engine_version",
            existing_type=sa.String(length=30),
            type_=sa.String(length=120),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("risk_assessments") as batch_op:
        batch_op.alter_column(
            "engine_version",
            existing_type=sa.String(length=120),
            type_=sa.String(length=30),
            existing_nullable=False,
        )
    op.drop_column("risk_assessments", "feature_snapshot")
    op.drop_column("transactions", "return_label")
    op.drop_column("transactions", "fraud_label")
