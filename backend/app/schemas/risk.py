from datetime import UTC, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class RiskAssessmentRequest(BaseModel):
    transaction_id: str = Field(min_length=1, max_length=100)
    customer_id: str = Field(min_length=1, max_length=100)
    customer_name: str | None = Field(default=None, max_length=160)
    customer_email: str | None = Field(default=None, max_length=254)
    customer_phone: str | None = Field(default=None, max_length=30)
    customer_verification_status: str = Field(default="NOT_COLLECTED", max_length=40)
    sender_account_reference: str | None = Field(default=None, max_length=100)
    sender_bank_name: str | None = Field(default=None, max_length=160)
    sender_bank_ifsc: str | None = Field(default=None, max_length=20)
    merchant_id: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    device_id: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=160)
    payment_method: str | None = Field(default=None, max_length=60)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    transactions_last_5_minutes: int = Field(default=0, ge=0, le=10_000)
    transactions_last_hour: int = Field(default=0, ge=0, le=100_000)
    failed_attempts_last_10_minutes: int = Field(default=0, ge=0, le=10_000)
    customer_average_amount: Decimal | None = Field(default=None, gt=0)
    is_new_device: bool | None = None
    is_new_location: bool | None = None
    shared_device_accounts: int = Field(default=0, ge=0, le=10_000)
    historical_return_rate: float = Field(default=0, ge=0, le=1)
    customer_age: int | None = Field(default=None, ge=13, le=120)
    account_age_days: int = Field(default=0, ge=0, le=50_000)
    historical_fraud_count: int = Field(default=0, ge=0, le=100_000)
    transactions_last_15_minutes: int = Field(default=0, ge=0, le=100_000)
    recipient_id: str | None = Field(default=None, max_length=100)
    recipient_name: str | None = Field(default=None, max_length=160)
    recipient_account_reference: str | None = Field(default=None, max_length=100)
    recipient_bank_name: str | None = Field(default=None, max_length=160)
    recipient_bank_ifsc: str | None = Field(default=None, max_length=20)
    recipient_email: str | None = Field(default=None, max_length=254)
    recipient_phone: str | None = Field(default=None, max_length=30)
    recipient_type: str = Field(default="UNKNOWN", max_length=60)
    recipient_category: str = Field(default="UNKNOWN", max_length=60)
    recipient_verified: bool = False
    recipient_used_before: bool = False
    recipient_risk_score: float = Field(default=0.5, ge=0, le=1)
    recipient_transaction_count: int = Field(default=0, ge=0, le=10_000_000)
    customer_recipient_transactions: int = Field(default=0, ge=0, le=1_000_000)
    transactions_to_same_recipient_last_15_minutes: int = Field(default=0, ge=0, le=100_000)
    amount_to_same_recipient_last_hour: Decimal = Field(default=Decimal("0"), ge=0)
    unique_customers_to_recipient: int = Field(default=0, ge=0, le=10_000_000)
    unique_devices_to_recipient: int = Field(default=0, ge=0, le=10_000_000)
    transaction_intent: str = Field(default="UNKNOWN", max_length=60)
    fraud_label: bool | None = None
    return_label: bool | None = None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.upper()

    @field_validator(
        "recipient_type",
        "recipient_category",
        "transaction_intent",
        "customer_verification_status",
    )
    @classmethod
    def normalize_context_category(cls, value: str) -> str:
        return value.strip().upper().replace(" ", "_") or "UNKNOWN"


class RiskSignalResponse(BaseModel):
    code: str
    score: int
    evidence: str


class RuleConfigurationPayload(BaseModel):
    high_amount_ratio: float = Field(default=3.0, ge=1, le=100)
    velocity_5m_threshold: int = Field(default=5, ge=1, le=10_000)
    failed_attempts_threshold: int = Field(default=3, ge=1, le=10_000)
    shared_device_accounts_threshold: int = Field(default=4, ge=1, le=10_000)
    new_device_amount_ratio: float = Field(default=2.0, ge=1, le=100)
    geographic_amount_ratio: float = Field(default=2.0, ge=1, le=100)


class RuleConfigurationResponse(RuleConfigurationPayload):
    version: int
    updated_at: datetime | None = None


class RiskAssessmentResponse(BaseModel):
    assessment_id: str
    transaction_id: str
    risk_score: int
    risk_level: str
    recommended_action: str
    engine_type: str
    engine_version: str
    model_status: str
    disclaimer: str
    signals: list[RiskSignalResponse]
    fraud_probability: float | None = None
    anomaly_score: float | None = None
    behavior_score: float | None = None
    velocity_score: float | None = None
    graph_score: float | None = None
    rule_score: float | None = None
    contextual_adjustment: float | None = None
    return_risk_score: float | None = None
    model_provenance: str | None = None
    inference_latency_ms: float | None = None
    feature_snapshot: dict[str, float | int | str | bool | None] = Field(default_factory=dict)
    behavior_context: dict[str, float | int | str | bool | None] = Field(default_factory=dict)
    rule_results: list[dict[str, float | int | str | bool]] = Field(default_factory=list)
    fusion_contributions: list[dict[str, float | str]] = Field(default_factory=list)
    model_contributions: list[dict[str, float | str]] = Field(default_factory=list)
    risk_explanation: list[str] = Field(default_factory=list)


class BatchRiskAssessmentRequest(BaseModel):
    # Batch uploads intentionally accept row-shaped objects instead of forcing
    # callers to know RazorShield's canonical field names. The ingestion
    # adapter maps common merchant schemas into RiskAssessmentRequest before
    # any transaction is scored or persisted.
    transactions: list[dict[str, object]] = Field(min_length=1, max_length=5_000)
    dataset_name: str = Field(default="Uploaded dataset", min_length=1, max_length=255)


class BatchRiskAssessmentResponse(BaseModel):
    processed: int
    dataset_id: str
    dataset_name: str
    activated_at: datetime
    assessments: list[RiskAssessmentResponse]
    schema_mapping: dict[str, str] = Field(default_factory=dict)
    transformed_fields: list[str] = Field(default_factory=list)
    unmapped_columns: list[str] = Field(default_factory=list)
    ingestion_warnings: list[str] = Field(default_factory=list)


class IEEECISPredictionRequest(BaseModel):
    transaction: dict[str, object]
    identity: dict[str, object] | None = None


class IEEECISPredictionResponse(BaseModel):
    transaction_id: str
    fraud_probability: float = Field(ge=0, le=1)
    risk_score: int = Field(ge=0, le=100)
    risk_level: str
    recommendation: str
    model_version: str
    threshold_profile: str
    explanation_method: str
    contributions: list[dict[str, float | str | None]]
    model_status: str = "CANDIDATE_NOT_PROMOTED"
    explanation_status: str = "PERMUTATION_SHAP_VERIFIED_FINAL_PROBABILITY"
    disclaimer: str = (
        "Candidate score for IEEE-CIS-compatible rows only; human review remains required "
        "for consequential action."
    )
