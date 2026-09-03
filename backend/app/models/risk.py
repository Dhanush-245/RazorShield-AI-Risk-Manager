import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


def new_id() -> str:
    return str(uuid.uuid4())


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_merchant_timestamp", "merchant_id", "occurred_at"),
        Index("ix_transactions_customer", "merchant_id", "customer_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    merchant_id: Mapped[str] = mapped_column(String(100), nullable=False)
    dataset_id: Mapped[str | None] = mapped_column(String(36), index=True)
    customer_id: Mapped[str] = mapped_column(String(100), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(160))
    customer_email: Mapped[str | None] = mapped_column(String(254))
    customer_phone: Mapped[str | None] = mapped_column(String(30))
    customer_verification_status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="NOT_COLLECTED"
    )
    sender_account_reference: Mapped[str | None] = mapped_column(String(100))
    sender_bank_name: Mapped[str | None] = mapped_column(String(160))
    sender_bank_ifsc: Mapped[str | None] = mapped_column(String(20))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    device_id: Mapped[str | None] = mapped_column(String(100))
    location: Mapped[str | None] = mapped_column(String(160))
    payment_method: Mapped[str | None] = mapped_column(String(60))
    customer_age: Mapped[int | None] = mapped_column(Integer)
    account_age_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recipient_id: Mapped[str | None] = mapped_column(String(100), index=True)
    recipient_name: Mapped[str | None] = mapped_column(String(160))
    recipient_account_reference: Mapped[str | None] = mapped_column(String(100))
    recipient_bank_name: Mapped[str | None] = mapped_column(String(160))
    recipient_bank_ifsc: Mapped[str | None] = mapped_column(String(20))
    recipient_email: Mapped[str | None] = mapped_column(String(254))
    recipient_phone: Mapped[str | None] = mapped_column(String(30))
    recipient_type: Mapped[str] = mapped_column(String(60), nullable=False, default="UNKNOWN")
    recipient_category: Mapped[str] = mapped_column(String(60), nullable=False, default="UNKNOWN")
    recipient_verified: Mapped[bool] = mapped_column(nullable=False, default=False)
    transaction_intent: Mapped[str] = mapped_column(String(60), nullable=False, default="UNKNOWN")
    fraud_label: Mapped[bool | None] = mapped_column(nullable=True)
    return_label: Mapped[bool | None] = mapped_column(nullable=True)
    fraud_label_observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    return_label_observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    label_provenance: Mapped[str | None] = mapped_column(String(60))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    assessments: Mapped[list["RiskAssessment"]] = relationship(back_populates="transaction")


class RiskAssessment(Base):
    __tablename__ = "risk_assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    transaction_id: Mapped[str] = mapped_column(ForeignKey("transactions.id"), nullable=False, index=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    engine_type: Mapped[str] = mapped_column(String(60), nullable=False)
    engine_version: Mapped[str] = mapped_column(String(120), nullable=False)
    fraud_probability: Mapped[Decimal | None] = mapped_column(Numeric(7, 6))
    anomaly_score: Mapped[Decimal | None] = mapped_column(Numeric(7, 6))
    behavior_score: Mapped[Decimal | None] = mapped_column(Numeric(7, 6))
    velocity_score: Mapped[Decimal | None] = mapped_column(Numeric(7, 6))
    graph_score: Mapped[Decimal | None] = mapped_column(Numeric(7, 6))
    rule_score: Mapped[Decimal | None] = mapped_column(Numeric(7, 6))
    contextual_adjustment: Mapped[Decimal | None] = mapped_column(Numeric(7, 6))
    return_risk_score: Mapped[Decimal | None] = mapped_column(Numeric(7, 6))
    model_provenance: Mapped[str | None] = mapped_column(String(30))
    inference_latency_ms: Mapped[float | None] = mapped_column(Float)
    feature_snapshot: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    transaction: Mapped[Transaction] = relationship(back_populates="assessments")
    signals: Mapped[list["RiskSignal"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan"
    )


class RiskSignal(Base):
    __tablename__ = "risk_signals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    assessment_id: Mapped[str] = mapped_column(ForeignKey("risk_assessments.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    evidence: Mapped[str] = mapped_column(Text, nullable=False)
    assessment: Mapped[RiskAssessment] = relationship(back_populates="signals")


class RuleConfiguration(Base):
    __tablename__ = "rule_configurations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    merchant_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    high_amount_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=3.0)
    velocity_5m_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    failed_attempts_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    shared_device_accounts_threshold: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    new_device_amount_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    geographic_amount_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=2.0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
