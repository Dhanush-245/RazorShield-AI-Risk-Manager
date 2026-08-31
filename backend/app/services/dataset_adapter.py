from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from app.schemas.risk import RiskAssessmentRequest


def normalized_key(value: str) -> str:
    return re.sub(r"^_|_$", "", re.sub(r"[^a-z0-9]+", "_", value.strip().lower()))


CANONICAL_FIELDS = set(RiskAssessmentRequest.model_fields) - {"merchant_id"}
ALIASES = {
    "transaction": "transaction_id",
    "transactionid": "transaction_id",
    "txn": "transaction_id",
    "txn_id": "transaction_id",
    "payment_id": "transaction_id",
    "order_id": "transaction_id",
    "customer": "customer_id",
    "customerid": "customer_id",
    "user_id": "customer_id",
    "buyer_id": "customer_id",
    "account_id": "customer_id",
    "sender_id": "customer_id",
    "sender_name": "customer_name",
    "customer_full_name": "customer_name",
    "sender_email": "customer_email",
    "sender_phone": "customer_phone",
    "kyc_status": "customer_verification_status",
    "sender_kyc_status": "customer_verification_status",
    "sender_account": "sender_account_reference",
    "sender_account_number": "sender_account_reference",
    "from_account": "sender_account_reference",
    "source_account": "sender_account_reference",
    "sender_bank": "sender_bank_name",
    "sender_ifsc": "sender_bank_ifsc",
    "transaction_amount": "amount",
    "transactionamount": "amount",
    "payment_amount": "amount",
    "order_amount": "amount",
    "value": "amount",
    "transaction_time": "timestamp",
    "transactiontime": "timestamp",
    "event_time": "timestamp",
    "created_at": "timestamp",
    "customer_avg_amount": "customer_average_amount",
    "average_transaction_amount": "customer_average_amount",
    "avg_transaction_amount": "customer_average_amount",
    "transactions_last_5m": "transactions_last_5_minutes",
    "transactions_5m": "transactions_last_5_minutes",
    "transactions_last_15m": "transactions_last_15_minutes",
    "transactions_15m": "transactions_last_15_minutes",
    "transactions_last_1h": "transactions_last_hour",
    "transactions_1h": "transactions_last_hour",
    "failed_attempts_10m": "failed_attempts_last_10_minutes",
    "same_recipient_transactions_15m": "transactions_to_same_recipient_last_15_minutes",
    "amount_to_recipient_1h": "amount_to_same_recipient_last_hour",
    "previous_fraud_count": "historical_fraud_count",
    "prior_fraud_count": "historical_fraud_count",
    "recipient_previous_customers": "unique_customers_to_recipient",
    "recipient_customer_count": "unique_customers_to_recipient",
    "recipient_device_count": "unique_devices_to_recipient",
    "receiver_id": "recipient_id",
    "beneficiary_id": "recipient_id",
    "payee_id": "recipient_id",
    "receiver_name": "recipient_name",
    "beneficiary_name": "recipient_name",
    "payee_name": "recipient_name",
    "receiver_account": "recipient_account_reference",
    "receiver_account_number": "recipient_account_reference",
    "beneficiary_account": "recipient_account_reference",
    "to_account": "recipient_account_reference",
    "destination_account": "recipient_account_reference",
    "receiver_bank": "recipient_bank_name",
    "beneficiary_bank": "recipient_bank_name",
    "receiver_ifsc": "recipient_bank_ifsc",
    "beneficiary_ifsc": "recipient_bank_ifsc",
    "receiver_email": "recipient_email",
    "beneficiary_email": "recipient_email",
    "receiver_phone": "recipient_phone",
    "beneficiary_phone": "recipient_phone",
    "transaction_purpose": "transaction_intent",
    "purpose": "transaction_intent",
    "is_fraud": "fraud_label",
    "fraud": "fraud_label",
    "fraudulent": "fraud_label",
    "fraud_flag": "fraud_label",
    "target": "fraud_label",
    "label": "fraud_label",
    "is_return": "return_label",
    "returned": "return_label",
    "return_flag": "return_label",
    "device_status": "is_new_device",
    "location_status": "is_new_location",
}


@dataclass
class DatasetAdaptationReport:
    mapping: dict[str, str] = field(default_factory=dict)
    transformed_fields: set[str] = field(default_factory=set)
    unmapped_columns: set[str] = field(default_factory=set)
    warnings: set[str] = field(default_factory=set)


def _boolean_status(value: Any, *, positive: set[str], negative: set[str]) -> Any:
    if isinstance(value, bool) or value is None:
        return value
    normalized = str(value).strip().upper()
    if normalized in positive:
        return True
    if normalized in negative:
        return False
    return value


def _scaled_rate(value: Any, report: DatasetAdaptationReport, field_name: str) -> Any:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return value
    if 1 < numeric <= 100:
        report.transformed_fields.add(f"{field_name}: percentage converted to 0–1 scale")
        return numeric / 100
    return value


def adapt_dataset_row(
    source: dict[str, object],
    *,
    row_number: int,
    merchant_id: str,
    report: DatasetAdaptationReport,
) -> RiskAssessmentRequest:
    adapted: dict[str, object] = {"merchant_id": merchant_id}
    for raw_key, value in source.items():
        source_key = normalized_key(str(raw_key))
        compact_key = source_key.replace("_", "")
        target = (
            source_key
            if source_key in CANONICAL_FIELDS
            else ALIASES.get(source_key) or ALIASES.get(compact_key)
        )
        if target is None:
            report.unmapped_columns.add(source_key)
            continue
        report.mapping[source_key] = target
        if target == "is_new_device" and source_key == "device_status":
            value = _boolean_status(
                value,
                positive={"NEW", "UNRECOGNIZED", "UNKNOWN"},
                negative={"KNOWN", "RECOGNIZED", "TRUSTED", "NORMAL"},
            )
            report.transformed_fields.add("device_status: NEW/KNOWN converted to boolean")
        elif target == "is_new_location" and source_key == "location_status":
            value = _boolean_status(
                value,
                positive={"NEW", "UNUSUAL", "DIFFERENT", "UNKNOWN"},
                negative={"KNOWN", "NORMAL", "USUAL", "TRUSTED"},
            )
            report.transformed_fields.add("location_status: UNUSUAL/NORMAL converted to boolean")
        elif target in {"recipient_risk_score", "historical_return_rate"}:
            value = _scaled_rate(value, report, target)
        adapted[target] = value

    if not adapted.get("transaction_id"):
        adapted["transaction_id"] = f"UPLOAD-{row_number:06d}"
        report.warnings.add("transaction_id was missing and was generated from the row number")
    if not adapted.get("customer_id"):
        adapted["customer_id"] = f"CUSTOMER-UNKNOWN-{row_number:06d}"
        report.warnings.add("customer_id was missing; row-specific fallback IDs were generated")
    if "amount" not in adapted:
        raise ValueError(
            f"Row {row_number}: no transaction amount column could be identified. "
            "Use a recognizable heading such as amount, transaction_amount, payment_amount, or order_amount."
        )
    try:
        return RiskAssessmentRequest.model_validate(adapted)
    except ValidationError as exc:
        messages = []
        for item in exc.errors()[:4]:
            location = ".".join(str(part) for part in item["loc"])
            messages.append(f"{location}: {item['msg']}")
        raise ValueError(f"Row {row_number}: {'; '.join(messages)}") from exc


def adapt_dataset_rows(
    rows: list[dict[str, object]], merchant_id: str
) -> tuple[list[RiskAssessmentRequest], DatasetAdaptationReport]:
    report = DatasetAdaptationReport()
    adapted = [
        adapt_dataset_row(
            row,
            row_number=index,
            merchant_id=merchant_id,
            report=report,
        )
        for index, row in enumerate(rows, start=1)
    ]
    transaction_ids = [item.transaction_id for item in adapted]
    if len(transaction_ids) != len(set(transaction_ids)):
        raise ValueError("Dataset contains duplicate transaction identifiers after schema conversion.")
    return adapted, report
