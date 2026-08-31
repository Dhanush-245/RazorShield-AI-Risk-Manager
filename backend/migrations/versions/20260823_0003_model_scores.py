"""Persist versioned model component scores and provenance."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260823_0003"
down_revision: str | None = "20260823_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

columns = (
    "fraud_probability",
    "anomaly_score",
    "behavior_score",
    "velocity_score",
    "graph_score",
    "rule_score",
    "return_risk_score",
)


def upgrade() -> None:
    for name in columns:
        op.add_column("risk_assessments", sa.Column(name, sa.Numeric(7, 6), nullable=True))
    op.add_column("risk_assessments", sa.Column("model_provenance", sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column("risk_assessments", "model_provenance")
    for name in reversed(columns):
        op.drop_column("risk_assessments", name)
