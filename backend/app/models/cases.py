import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class RiskCase(Base):
    __tablename__ = "risk_cases"
    __table_args__ = (Index("ix_cases_merchant_status", "merchant_id", "status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_reference: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    merchant_id: Mapped[str] = mapped_column(ForeignKey("merchants.id"), nullable=False)
    transaction_id: Mapped[str | None] = mapped_column(ForeignKey("transactions.id"), index=True)
    case_type: Mapped[str] = mapped_column(String(30), nullable=False, default="FRAUD_REVIEW")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="OPEN")
    recommendation: Mapped[str] = mapped_column(String(60), nullable=False)
    assigned_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    human_decision: Mapped[str | None] = mapped_column(String(40))
    reviewer_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
