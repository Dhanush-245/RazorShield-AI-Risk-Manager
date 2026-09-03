"""Pure, non-persisting risk experiments and evidence snapshots.

Counterfactuals are sensitivity analyses, not causal guarantees or verification.
Risk index points are never described as calibrated fraud probabilities.
"""

import hashlib
import json
from dataclasses import asdict

import numpy as np

from app.schemas.risk import RiskAssessmentRequest
from app.services.model_risk import (
    TRAINING_FEATURE_NAMES,
    ModelRiskResult,
    RuleThresholds,
    assess_with_models,
    feature_vector,
)


def digest(value: dict) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def result_view(result: ModelRiskResult) -> dict:
    return {
        "score": result.score,
        "level": result.level,
        "recommendation": result.recommended_action,
        "modelVersion": result.versions,
        "provenance": result.provenance,
        "components": {
            "Fraud probability": result.fraud_probability * 100,
            "Anomaly": result.anomaly_score * 100,
            "Behavior": result.behavior_score * 100,
            "Velocity": result.velocity_score * 100,
            "Graph": result.graph_score * 100,
            "Rules": result.rule_score * 100,
        },
        "explanations": result.explanation,
        "rules": [{**asdict(rule), "fired": bool(rule.fired)} for rule in result.rule_results],
        "contributions": [asdict(item) for item in result.fusion_contributions],
        "protectiveEvidence": [
            rule.evidence for rule in result.rule_results if rule.fired and rule.weight < 0
        ],
        "scoreMeaning": "Threshold-mapped risk index, not probability of guilt. Anomaly is not fraud.",
        "explanationMethod": "STRUCTURED_RULES_AND_LINEAR_CONTRIBUTIONS_NOT_SHAP",
    }


def decision_snapshot(
    payload: RiskAssessmentRequest,
    rules: RuleThresholds,
    result: ModelRiskResult,
    *,
    feature_provenance: dict | None = None,
    graph_context: dict | None = None,
) -> str:
    # Store risk inputs, not duplicate contact/account identifiers into audit exports.
    excluded = {
        "customer_name",
        "customer_email",
        "customer_phone",
        "sender_account_reference",
        "sender_bank_name",
        "sender_bank_ifsc",
        "recipient_name",
        "recipient_email",
        "recipient_phone",
        "recipient_account_reference",
        "recipient_bank_name",
        "recipient_bank_ifsc",
        "fraud_label",
        "return_label",
    }
    body = {
        "schemaVersion": 2,
        "input": payload.model_dump(mode="json", exclude=excluded),
        "features": dict(zip(TRAINING_FEATURE_NAMES, feature_vector(payload)[0].tolist(), strict=True)),
        "featureProvenance": feature_provenance or {},
        "graphContext": graph_context or {},
        "rules": asdict(rules),
        "result": result_view(result),
    }
    return json.dumps({"body": body, "sha256": digest(body)}, separators=(",", ":"))


def simulate(payload: RiskAssessmentRequest, rules: RuleThresholds) -> dict:
    baseline = assess_with_models(payload, rules)
    changes = [
        ("Recipient verified", {"recipient_verified": True}),
        ("Device recognized", {"is_new_device": False}),
        ("Location recognized", {"is_new_location": False}),
        (
            "Velocity normal",
            {
                "transactions_last_5_minutes": 1,
                "transactions_last_15_minutes": 1,
                "transactions_last_hour": 2,
                "transactions_to_same_recipient_last_15_minutes": 1,
            },
        ),
    ]
    combined = {key: value for _, change in changes for key, value in change.items()}
    scenarios = []
    for label, change in [*changes, ("All four assumptions", combined)]:
        changed = RiskAssessmentRequest.model_validate({**payload.model_dump(), **change})
        result = assess_with_models(changed, rules)
        scenarios.append(
            {
                "label": label,
                "changes": change,
                "score": result.score,
                "level": result.level,
                "delta": result.score - baseline.score,
            }
        )
    return {
        "baseline": result_view(baseline),
        "counterfactuals": scenarios,
        "input": payload.model_dump(mode="json", exclude={"fraud_label", "return_label"}),
        "persisted": False,
        "financialActionExecuted": False,
        "disclaimer": "Hypothetical sensitivity only. Changes are independent except the combined row. "
        "Verification is not performed, prior history is not rewritten, and risk may remain high. "
        "OTP is not a model feature, so no OTP score reduction is claimed. Age is not changed as advice.",
    }


def scenario_inputs(merchant_id: str) -> dict[str, RiskAssessmentRequest]:
    base = {
        "transaction_id": "SIMULATION",
        "customer_id": "FICTIONAL-CUSTOMER",
        "merchant_id": merchant_id,
        "amount": 2000,
        "customer_average_amount": 2500,
        "recipient_verified": True,
        "recipient_used_before": True,
        "recipient_category": "UTILITY",
        "recipient_risk_score": 0.05,
        "account_age_days": 900,
        "transactions_last_5_minutes": 1,
        "transactions_last_hour": 2,
        "is_new_device": False,
        "is_new_location": False,
    }
    suspicious = {
        **base,
        "amount": 120000,
        "customer_average_amount": 5000,
        "recipient_category": "UNKNOWN",
        "recipient_verified": False,
        "recipient_used_before": False,
        "recipient_risk_score": 0.9,
        "transactions_last_5_minutes": 8,
        "transactions_last_15_minutes": 8,
        "transactions_last_hour": 20,
        "transactions_to_same_recipient_last_15_minutes": 8,
        "failed_attempts_last_10_minutes": 4,
        "shared_device_accounts": 6,
        "is_new_device": True,
        "is_new_location": True,
    }
    education = {
        **base,
        "amount": 120000,
        "customer_average_amount": 100000,
        "recipient_category": "EDUCATION",
        "transaction_intent": "EDUCATION",
        "recipient_id": "VERIFIED-UNIVERSITY",
        "customer_recipient_transactions": 4,
        "customer_age": 21,
        "account_age_days": 1095,
        "recipient_risk_score": 0.08,
    }
    return {
        name: RiskAssessmentRequest.model_validate(values)
        for name, values in {
            "Normal payment": base,
            "Suspicious transfer": suspicious,
            "Education payment": education,
        }.items()
    }


def distribution_shift(reference: list, current: list, categorical: bool = False) -> dict:
    if len(reference) < 30 or len(current) < 30:
        return {
            "status": "INSUFFICIENT_DATA",
            "value": None,
            "method": "TV distance" if categorical else "PSI",
        }
    if categorical:
        categories = set(reference) | set(current)
        value = 0.5 * sum(
            abs(reference.count(x) / len(reference) - current.count(x) / len(current)) for x in categories
        )
    else:
        boundaries = np.unique(np.quantile(np.asarray(reference, dtype=float), [0.2, 0.4, 0.6, 0.8]))
        if min(reference) == max(reference):
            # A constant reference needs its own central bin; otherwise an upward
            # shift and the reference both fall in the final open-ended bin.
            center = float(reference[0])
            epsilon = max(abs(center) * 1e-6, 1e-6)
            boundaries = np.asarray([center - epsilon, center + epsilon])
        edges = np.concatenate(([-np.inf], boundaries, [np.inf]))
        r = np.histogram(reference, bins=edges)[0].astype(float) + 0.5
        c = np.histogram(current, bins=edges)[0].astype(float) + 0.5
        r, c = r / r.sum(), c / c.sum()
        value = float(np.sum((c - r) * np.log(c / r)))
    return {
        "status": "HIGH" if value >= 0.25 else "MEDIUM" if value >= 0.1 else "LOW",
        "value": round(value, 5),
        "method": "TV distance" if categorical else "PSI",
    }


def confusion(
    rows: list[tuple[int, bool]], threshold: int, fp_cost: float, fn_cost: float, review_cost: float
) -> dict:
    tp = sum(score >= threshold and label for score, label in rows)
    fp = sum(score >= threshold and not label for score, label in rows)
    fn = sum(score < threshold and label for score, label in rows)
    tn = len(rows) - tp - fp - fn
    return {
        "threshold": threshold,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "fpr": fp / (fp + tn) if fp + tn else None,
        "reviewRate": (tp + fp) / len(rows) if rows else None,
        "cost": fp * fp_cost + fn * fn_cost + (tp + fp) * review_cost,
    }


def reliability_table(rows: list[tuple[float, bool]], bins: int = 10) -> dict:
    """Summarize fraud-probability calibration without treating risk index as probability."""

    if not rows:
        return {
            "status": "INSUFFICIENT_DATA",
            "samples": 0,
            "bins": [],
            "ece": None,
            "brier": None,
        }
    table = []
    ece = 0.0
    for index in range(bins):
        lower, upper = index / bins, (index + 1) / bins
        selected = [
            (probability, label)
            for probability, label in rows
            if lower <= probability < upper or (index == bins - 1 and probability == 1)
        ]
        if not selected:
            continue
        mean_probability = sum(item[0] for item in selected) / len(selected)
        observed_rate = sum(item[1] for item in selected) / len(selected)
        gap = abs(mean_probability - observed_rate)
        ece += len(selected) / len(rows) * gap
        table.append(
            {
                "lower": lower,
                "upper": upper,
                "support": len(selected),
                "meanPredicted": mean_probability,
                "observedRate": observed_rate,
                "absoluteGap": gap,
            }
        )
    brier = sum((probability - int(label)) ** 2 for probability, label in rows) / len(rows)
    classes = {label for _, label in rows}
    return {
        "status": "AVAILABLE" if len(rows) >= 50 and len(classes) == 2 else "LIMITED_SAMPLE",
        "samples": len(rows),
        "bins": table,
        "ece": ece,
        "brier": brier,
        "method": "Equal-width bins over stored fraud-model probabilities and supplied labels.",
    }


def slice_report(
    groups: dict[str, list[tuple[int, bool]]], threshold: int = 71, minimum_support: int = 10
) -> list[dict]:
    report = []
    for name, rows in sorted(groups.items()):
        metrics = confusion(rows, threshold, 0, 0, 0) if len(rows) >= minimum_support else None
        report.append(
            {
                "slice": name,
                "support": len(rows),
                "status": "AVAILABLE" if metrics else "WITHHELD_LOW_SUPPORT",
                "metrics": metrics,
            }
        )
    return report
