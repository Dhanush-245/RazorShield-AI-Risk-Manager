from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

from app.core.config import get_settings
from app.schemas.risk import RiskAssessmentRequest
from app.services.baseline_risk import BaselineSignal

FEATURE_NAMES = (
    "amount",
    "transaction_hour",
    "transactions_last_5_minutes",
    "transactions_last_15_minutes",
    "transactions_last_hour",
    "failed_attempts_last_10_minutes",
    "amount_deviation_ratio",
    "is_new_device",
    "is_new_location",
    "shared_device_accounts",
    "historical_return_rate",
    "customer_age",
    "account_age_days",
    "historical_fraud_count",
    "recipient_verified",
    "recipient_used_before",
    "recipient_risk_score",
    "same_recipient_transactions_15m",
    "amount_to_recipient_1h_ratio",
    "customer_recipient_transactions",
    "unique_customers_to_recipient",
    "unique_devices_to_recipient",
    "verified_education_context",
    "unknown_recipient_high_amount",
)
TRAINING_FEATURE_NAMES = (
    "amount",
    "hour",
    "transactions_5m",
    "transactions_15m",
    "transactions_1h",
    "failed_attempts_10m",
    "amount_deviation",
    "new_device",
    "new_location",
    "shared_device_accounts",
    "historical_return_rate",
    "customer_age",
    "account_age_days",
    "historical_fraud_count",
    "recipient_verified",
    "recipient_used_before",
    "recipient_risk_score",
    "same_recipient_transactions_15m",
    "amount_to_recipient_1h_ratio",
    "customer_recipient_transactions",
    "unique_customers_to_recipient",
    "unique_devices_to_recipient",
    "verified_education_context",
    "unknown_recipient_high_amount",
)
COMPONENT_NAMES = ("Fraud", "Anomaly", "Behavior", "Velocity", "Graph", "Context rules")
MAX_TRAINED_SHARED_DEVICE_ACCOUNTS = 20
MAX_TRAINED_RECIPIENT_RELATIONSHIPS = 2_000


@dataclass(frozen=True)
class RuleThresholds:
    version: int = 1
    high_amount_ratio: float = 3.0
    velocity_5m_threshold: int = 5
    failed_attempts_threshold: int = 3
    shared_device_accounts_threshold: int = 4
    new_device_amount_ratio: float = 2.0
    geographic_amount_ratio: float = 2.0


@dataclass(frozen=True)
class RuleResult:
    code: str
    label: str
    condition: str
    observed: str
    fired: bool
    weight: float
    evidence: str


@dataclass(frozen=True)
class ModelContribution:
    feature: str
    impact: float
    direction: str


@dataclass(frozen=True)
class ModelRiskResult:
    score: int
    level: str
    recommended_action: str
    signals: list[BaselineSignal]
    fraud_probability: float
    anomaly_score: float
    behavior_score: float
    velocity_score: float
    graph_score: float
    rule_score: float
    contextual_adjustment: float
    return_risk_score: float
    versions: str
    provenance: str
    rule_results: list[RuleResult]
    fusion_contributions: list[ModelContribution]
    model_contributions: list[ModelContribution]
    explanation: list[str]


@dataclass(frozen=True)
class ModelBundle:
    fraud: object
    anomaly: object
    fusion: object
    returns: object
    manifest: dict[str, object]


@lru_cache
def load_models(merchant_id: str | None = None) -> ModelBundle:
    base_artifact_dir = Path(get_settings().model_dir).resolve()
    merchant_artifact_dir = base_artifact_dir / "merchants" / merchant_id if merchant_id else None
    artifact_dir = (
        merchant_artifact_dir
        if merchant_artifact_dir is not None and (merchant_artifact_dir / "manifest.json").is_file()
        else base_artifact_dir
    )
    manifest = json.loads((artifact_dir / "manifest.json").read_text())
    if tuple(manifest.get("features", ())) != TRAINING_FEATURE_NAMES:
        raise RuntimeError("Model manifest features do not match the inference feature contract")

    def artifact(component: str, fallback: str) -> Path:
        configuration = manifest.get(component, {})
        filename = configuration.get("artifact", fallback)
        path = artifact_dir / str(filename)
        if not path.is_file():
            raise RuntimeError(f"Missing {component} model artifact: {path.name}")
        return path

    fusion_configuration = manifest.get("fusion", {})
    if "medium_threshold" in fusion_configuration:
        medium = float(fusion_configuration["medium_threshold"])
        high = float(fusion_configuration["high_threshold"])
        if not 0 < medium < high < 1:
            raise RuntimeError("Model manifest risk thresholds must satisfy 0 < medium < high < 1")

    return ModelBundle(
        fraud=joblib.load(artifact("fraud", "fraud-v1.joblib")),
        anomaly=joblib.load(artifact("anomaly", "anomaly-v1.joblib")),
        fusion=joblib.load(artifact("fusion", "fusion-v1.joblib")),
        returns=joblib.load(artifact("return", "return-v1.joblib")),
        manifest=manifest,
    )


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def calibrated_risk_index(probability: float, medium_threshold: float, high_threshold: float) -> int:
    probability = clamp(probability)
    medium_threshold = max(0.0001, min(medium_threshold, 0.99))
    high_threshold = max(medium_threshold + 0.0001, min(high_threshold, 0.9999))
    if probability < medium_threshold:
        return round(30 * probability / medium_threshold)
    if probability < high_threshold:
        position = (probability - medium_threshold) / (high_threshold - medium_threshold)
        return round(31 + 39 * position)
    position = (probability - high_threshold) / (1 - high_threshold)
    return round(71 + 29 * position)


def feature_vector(payload: RiskAssessmentRequest) -> np.ndarray:
    average = float(payload.customer_average_amount or payload.amount)
    amount_deviation = float(payload.amount) / max(average, 0.01)
    # The bundled models were trained with shared-device counts in the 0–20
    # range. Keep inference inside that support instead of allowing an
    # out-of-distribution count to saturate the linear fraud model.
    model_shared_device_accounts = min(payload.shared_device_accounts, MAX_TRAINED_SHARED_DEVICE_ACCOUNTS)
    education_context = payload.recipient_category == "EDUCATION" or payload.transaction_intent == "EDUCATION"
    verified_education_context = int(
        float(payload.amount) > 100_000
        and education_context
        and payload.recipient_verified
        and payload.recipient_used_before
        and payload.customer_recipient_transactions >= 1
        and payload.transactions_last_5_minutes <= 2
        and not payload.is_new_device
        and not payload.is_new_location
    )
    unknown_recipient_high_amount = int(
        float(payload.amount) > 100_000
        and payload.recipient_category == "UNKNOWN"
        and not payload.recipient_verified
        and not payload.recipient_used_before
    )
    amount_to_recipient = float(payload.amount_to_same_recipient_last_hour or payload.amount)
    amount_to_recipient_ratio = amount_to_recipient / max(average, 0.01)
    return np.asarray(
        [
            [
                float(payload.amount),
                payload.timestamp.hour,
                payload.transactions_last_5_minutes,
                payload.transactions_last_15_minutes,
                payload.transactions_last_hour,
                payload.failed_attempts_last_10_minutes,
                amount_deviation,
                int(payload.is_new_device is True),
                int(payload.is_new_location is True),
                model_shared_device_accounts,
                payload.historical_return_rate,
                payload.customer_age if payload.customer_age is not None else 35,
                min(payload.account_age_days, 8_000),
                min(payload.historical_fraud_count, 12),
                int(payload.recipient_verified),
                int(payload.recipient_used_before),
                payload.recipient_risk_score,
                min(payload.transactions_to_same_recipient_last_15_minutes, 100),
                min(amount_to_recipient_ratio, 500),
                min(payload.customer_recipient_transactions, 120),
                min(payload.unique_customers_to_recipient, MAX_TRAINED_RECIPIENT_RELATIONSHIPS),
                min(payload.unique_devices_to_recipient, MAX_TRAINED_RECIPIENT_RELATIONSHIPS),
                verified_education_context,
                unknown_recipient_high_amount,
            ]
        ],
        dtype=float,
    )


def evaluate_rules(
    payload: RiskAssessmentRequest,
    amount_deviation: float,
    thresholds: RuleThresholds,
) -> list[RuleResult]:
    definitions = [
        (
            "HIGH_AMOUNT",
            "Unusually high amount",
            f"amount deviation ≥ {thresholds.high_amount_ratio:.1f}×",
            f"{amount_deviation:.2f}× customer average",
            amount_deviation >= thresholds.high_amount_ratio,
            0.2,
            f"Transaction amount is {amount_deviation:.2f}× the submitted customer average.",
        ),
        (
            "VELOCITY_ALERT",
            "Excessive transaction velocity",
            (
                f"transactions / 5 min ≥ {thresholds.velocity_5m_threshold} AND "
                f"amount deviation ≥ {thresholds.high_amount_ratio:.1f}×"
            ),
            f"{payload.transactions_last_5_minutes} events / 5 min; {amount_deviation:.2f}× average",
            payload.transactions_last_5_minutes >= thresholds.velocity_5m_threshold
            and amount_deviation >= thresholds.high_amount_ratio,
            0.25,
            (
                f"Transaction velocity reached {payload.transactions_last_5_minutes} events in five minutes "
                f"while amount deviation reached {amount_deviation:.2f}×."
            ),
        ),
        (
            "NEW_DEVICE_HIGH_AMOUNT",
            "New device with elevated amount",
            f"new device AND amount deviation ≥ {thresholds.new_device_amount_ratio:.1f}×",
            f"new device={bool(payload.is_new_device)}; {amount_deviation:.2f}× average",
            bool(payload.is_new_device) and amount_deviation >= thresholds.new_device_amount_ratio,
            0.15,
            "The submitted device is new and the transaction amount is elevated.",
        ),
        (
            "REPEATED_FAILURES",
            "Repeated failed transactions",
            f"failed attempts / 10 min ≥ {thresholds.failed_attempts_threshold}",
            f"{payload.failed_attempts_last_10_minutes} failed attempts / 10 min",
            payload.failed_attempts_last_10_minutes >= thresholds.failed_attempts_threshold,
            0.15,
            (f"There were {payload.failed_attempts_last_10_minutes} failed attempts in ten minutes."),
        ),
        (
            "GEOGRAPHIC_MOVEMENT",
            "Unusual geographic movement",
            f"new location AND amount deviation ≥ {thresholds.geographic_amount_ratio:.1f}×",
            f"new location={bool(payload.is_new_location)}; {amount_deviation:.2f}× average",
            bool(payload.is_new_location) and amount_deviation >= thresholds.geographic_amount_ratio,
            0.1,
            "The submitted location is new and the transaction amount is elevated.",
        ),
        (
            "SHARED_DEVICE_NETWORK",
            "Device linked to multiple accounts",
            f"shared accounts ≥ {thresholds.shared_device_accounts_threshold}",
            f"{payload.shared_device_accounts} accounts",
            payload.shared_device_accounts >= thresholds.shared_device_accounts_threshold,
            0.15,
            f"The device is associated with {payload.shared_device_accounts} customer accounts.",
        ),
        (
            "SAME_RECIPIENT_BURST",
            "Rapid repeated payments to one recipient",
            "same-recipient transactions / 15 min ≥ 4",
            f"{payload.transactions_to_same_recipient_last_15_minutes} payments / 15 min",
            payload.transactions_to_same_recipient_last_15_minutes >= 4,
            0.25,
            (
                f"The customer sent {payload.transactions_to_same_recipient_last_15_minutes} "
                "transactions to the same recipient in fifteen minutes."
            ),
        ),
        (
            "HIGH_RISK_RECIPIENT",
            "Recipient intelligence indicates elevated risk",
            "recipient risk score ≥ 0.70",
            f"recipient risk={payload.recipient_risk_score:.2f}",
            payload.recipient_risk_score >= 0.70,
            0.2,
            f"Recipient intelligence score is {payload.recipient_risk_score:.2f}.",
        ),
        (
            "UNKNOWN_RECIPIENT_HIGH_AMOUNT",
            "High-value payment to an unknown recipient",
            "amount > ₹100,000 AND recipient unknown, unverified, and unused",
            (
                f"amount=₹{float(payload.amount):,.2f}; category={payload.recipient_category}; "
                f"verified={payload.recipient_verified}; used before={payload.recipient_used_before}"
            ),
            (
                float(payload.amount) > 100_000
                and payload.recipient_category == "UNKNOWN"
                and not payload.recipient_verified
                and not payload.recipient_used_before
            ),
            0.35,
            "A high-value transaction is going to an unknown, unverified, previously unused recipient.",
        ),
        (
            "VERIFIED_EDUCATION_CONTEXT",
            "Verified education-payment context",
            (
                "amount > ₹100,000 AND education intent/category AND verified, known recipient "
                "AND normal device, location, and velocity"
            ),
            (
                f"category={payload.recipient_category}; intent={payload.transaction_intent}; "
                f"verified={payload.recipient_verified}; relationship="
                f"{payload.customer_recipient_transactions} prior payments"
            ),
            (
                float(payload.amount) > 100_000
                and (payload.recipient_category == "EDUCATION" or payload.transaction_intent == "EDUCATION")
                and payload.recipient_verified
                and payload.recipient_used_before
                and payload.customer_recipient_transactions >= 1
                and payload.transactions_last_5_minutes <= 2
                and not payload.is_new_device
                and not payload.is_new_location
            ),
            -0.4,
            (
                "The high-value payment has verified education context, an established recipient "
                "relationship, and normal device, location, and velocity signals. This lowers risk; "
                "it does not prove legitimacy."
            ),
        ),
    ]
    return [RuleResult(*definition) for definition in definitions]


def linear_contributions(
    model: object, values: np.ndarray, names: tuple[str, ...]
) -> list[ModelContribution]:
    estimator = model
    transformed = values
    if hasattr(model, "named_steps"):
        scaler = model.named_steps.get("scale")
        estimator = model.named_steps.get("model")
        if scaler is not None:
            transformed = scaler.transform(values)
    coefficients = np.asarray(estimator.coef_[0], dtype=float)
    impacts = transformed[0] * coefficients
    return sorted(
        [
            ModelContribution(
                feature=name,
                impact=round(float(abs(impact)), 4),
                direction="INCREASES_RISK" if impact >= 0 else "DECREASES_RISK",
            )
            for name, impact in zip(names, impacts, strict=True)
        ],
        key=lambda item: item.impact,
        reverse=True,
    )


def assess_with_models(
    payload: RiskAssessmentRequest,
    thresholds: RuleThresholds | None = None,
) -> ModelRiskResult:
    bundle = load_models(payload.merchant_id)
    thresholds = thresholds or RuleThresholds()
    values = feature_vector(payload)
    index = {name: position for position, name in enumerate(FEATURE_NAMES)}
    fraud_probability = float(bundle.fraud.predict_proba(values)[0, 1])
    anomaly_score = clamp(float(1 / (1 + np.exp(6 * bundle.anomaly.decision_function(values)[0]))))
    amount_deviation = values[0, index["amount_deviation_ratio"]]
    behavior_score = clamp(
        0.45 * max(amount_deviation - 1, 0) / 5
        + 0.3 * values[0, index["is_new_device"]]
        + 0.2 * values[0, index["is_new_location"]]
        + 0.05 * min(values[0, index["historical_fraud_count"]], 5) / 5
    )
    velocity_score = clamp(
        0.3 * values[0, index["transactions_last_5_minutes"]] / 10
        + 0.15 * values[0, index["transactions_last_15_minutes"]] / 20
        + 0.15 * values[0, index["transactions_last_hour"]] / 40
        + 0.15 * values[0, index["failed_attempts_last_10_minutes"]] / 5
        + 0.25 * values[0, index["same_recipient_transactions_15m"]] / 8
    )
    graph_score = clamp(
        0.35 * values[0, index["shared_device_accounts"]] / 8
        + 0.35 * values[0, index["recipient_risk_score"]]
        + 0.15 * values[0, index["unique_customers_to_recipient"]] / 250
        + 0.15 * values[0, index["unique_devices_to_recipient"]] / 250
    )
    rule_results = evaluate_rules(payload, amount_deviation, thresholds)
    contextual_adjustment = max(-1.0, min(1.0, sum(rule.weight for rule in rule_results if rule.fired)))
    rule_score = clamp(contextual_adjustment)
    component_vector = np.asarray(
        [
            [
                fraud_probability,
                anomaly_score,
                behavior_score,
                velocity_score,
                graph_score,
                contextual_adjustment,
            ]
        ]
    )
    fused_probability = float(bundle.fusion.predict_proba(component_vector)[0, 1])
    return_risk = float(bundle.returns.predict_proba(values)[0, 1])
    fusion_configuration = bundle.manifest.get("fusion", {})
    medium_threshold = float(fusion_configuration.get("medium_threshold", 0.31))
    high_threshold = float(
        fusion_configuration.get("high_threshold", fusion_configuration.get("threshold", 0.71))
    )
    score = calibrated_risk_index(fused_probability, medium_threshold, high_threshold)
    level = "HIGH" if score >= 71 else "MEDIUM" if score >= 31 else "LOW"
    action = (
        "MANUAL_REVIEW" if level == "HIGH" else "ADDITIONAL_VERIFICATION" if level == "MEDIUM" else "ALLOW"
    )

    signals: list[BaselineSignal] = []
    candidates = [
        (
            behavior_score,
            "BEHAVIOR_DEVIATION",
            f"Transaction amount is {amount_deviation:.2f}× the customer's submitted historical average.",
        ),
        (
            velocity_score,
            "VELOCITY",
            (
                f"Velocity readout: {payload.transactions_last_5_minutes} transactions in five minutes "
                f"and {payload.transactions_last_hour} in one hour."
            ),
        ),
        (
            graph_score,
            "RELATIONSHIP_GRAPH",
            (
                f"Device is shared with {payload.shared_device_accounts} accounts; recipient links "
                f"span {payload.unique_customers_to_recipient} customers and "
                f"{payload.unique_devices_to_recipient} devices."
            ),
        ),
        (anomaly_score, "ANOMALY", f"Anomaly score is {anomaly_score:.2f}; anomaly is not proof of fraud."),
        (
            abs(contextual_adjustment),
            "CONTEXT_RULES",
            (
                f"{sum(rule.fired for rule in rule_results)} of {len(rule_results)} "
                f"configured rules fired (v{thresholds.version}); net contextual adjustment "
                f"{contextual_adjustment:+.2f}."
            ),
        ),
    ]
    for contribution, code, evidence in sorted(candidates, reverse=True)[:4]:
        if contribution > 0:
            signals.append(BaselineSignal(code, round(contribution * 100), evidence))
    if not signals:
        signals.append(
            BaselineSignal("NO_ELEVATED_SUPPORTING_SIGNAL", 0, "No elevated supporting signal was observed.")
        )

    model_contributions = linear_contributions(bundle.fraud, values, FEATURE_NAMES)
    fusion_contributions = linear_contributions(bundle.fusion, component_vector, COMPONENT_NAMES)
    explanation = [rule.evidence for rule in rule_results if rule.fired]
    if not explanation:
        explanation = ["No configured deterministic risk rule fired for this transaction."]

    versions = "/".join(
        str(bundle.manifest[name]["version"]) for name in ("fraud", "anomaly", "fusion", "return")
    )
    return ModelRiskResult(
        score=score,
        level=level,
        recommended_action=action,
        signals=signals,
        fraud_probability=fraud_probability,
        anomaly_score=anomaly_score,
        behavior_score=behavior_score,
        velocity_score=velocity_score,
        graph_score=graph_score,
        rule_score=rule_score,
        contextual_adjustment=contextual_adjustment,
        return_risk_score=return_risk,
        versions=versions,
        provenance=str(bundle.manifest["dataset"]["provenance"]),
        rule_results=rule_results,
        fusion_contributions=fusion_contributions,
        model_contributions=model_contributions,
        explanation=explanation,
    )
