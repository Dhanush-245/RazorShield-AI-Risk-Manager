from __future__ import annotations

import json
import math
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    fbeta_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "ml" / "artifacts"
DATA_DIR = ROOT / "ml" / "data"
FEATURES = [
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
]
BUSINESS_COSTS_INR = {
    "false_positive": 100.0,
    "false_negative": 5_000.0,
    "manual_review": 50.0,
}


def sigmoid(value: float) -> float:
    return 1 / (1 + math.exp(-value))


def generate_dataset(
    size: int = 60000, seed: int = 245
) -> list[dict[str, float | int | str]]:
    rng = random.Random(seed)
    start = datetime(2025, 1, 1, tzinfo=UTC)
    rows: list[dict[str, float | int | str]] = []
    for index in range(size):
        customer_age = rng.randrange(16, 76)
        account_age_days = min(8_000, int(rng.expovariate(1 / 900)))
        average = max(300, rng.lognormvariate(8.0, 0.55))
        recipient_category = rng.choices(
            [
                "EDUCATION",
                "HEALTHCARE",
                "RENT",
                "UTILITY",
                "SHOPPING",
                "PERSONAL_TRANSFER",
                "UNKNOWN",
            ],
            weights=[12, 7, 10, 12, 30, 19, 10],
        )[0]
        recipient_verified = int(
            rng.random()
            < (
                0.96
                if recipient_category in {"EDUCATION", "HEALTHCARE", "UTILITY"}
                else 0.72
            )
        )
        recipient_used_before = int(
            rng.random() < min(0.88, 0.25 + account_age_days / 3_000)
        )
        customer_recipient_transactions = (
            min(120, 1 + int(rng.expovariate(0.12))) if recipient_used_before else 0
        )
        recipient_risk_score = min(
            1.0,
            max(
                0.0,
                rng.betavariate(1.3, 6.0)
                + (0.22 if recipient_category == "UNKNOWN" else 0)
                + (0.18 if not recipient_verified else -0.08),
            ),
        )
        amount_deviation = max(0.1, rng.lognormvariate(0.0, 0.7))
        if recipient_category == "EDUCATION" and rng.random() < 0.42:
            amount = rng.uniform(55_000, 280_000)
            if recipient_used_before:
                average = amount / rng.uniform(0.75, 1.35)
                amount_deviation = amount / average
        else:
            amount = min(500_000, average * amount_deviation)
        hour = rng.randrange(24)
        transactions_5m = min(30, int(rng.expovariate(0.45)))
        transactions_15m = transactions_5m + min(50, int(rng.expovariate(0.25)))
        transactions_1h = transactions_15m + min(80, int(rng.expovariate(0.12)))
        failed_attempts = min(15, int(rng.expovariate(0.7)))
        new_device = int(rng.random() < 0.18)
        new_location = int(rng.random() < 0.12)
        shared_accounts = min(20, int(rng.expovariate(0.8)))
        return_rate = min(1.0, rng.betavariate(1.4, 8.0))
        historical_fraud_count = min(12, int(rng.expovariate(0.9)))
        same_recipient_transactions_15m = min(
            transactions_15m,
            int(rng.expovariate(0.55))
            + (2 if rng.random() < recipient_risk_score * 0.35 else 0),
        )
        amount_to_recipient_1h_ratio = max(
            amount_deviation,
            amount_deviation
            * max(1, same_recipient_transactions_15m)
            * rng.uniform(0.65, 1.2),
        )
        unique_customers_to_recipient = min(
            2_000,
            int(rng.expovariate(1 / (20 + 250 * recipient_risk_score))),
        )
        unique_devices_to_recipient = min(
            2_000,
            int(unique_customers_to_recipient * rng.uniform(0.35, 1.25)),
        )
        verified_education_context = int(
            amount > 100_000
            and recipient_category == "EDUCATION"
            and recipient_verified
            and recipient_used_before
            and customer_recipient_transactions >= 1
            and transactions_5m <= 2
            and not new_device
            and not new_location
        )
        unknown_recipient_high_amount = int(
            amount > 100_000
            and recipient_category == "UNKNOWN"
            and not recipient_verified
            and not recipient_used_before
        )
        logit = (
            -5.6
            + 0.55 * max(0, amount_deviation - 1.5)
            + 0.16 * transactions_5m
            + 0.035 * transactions_1h
            + 0.11 * same_recipient_transactions_15m
            + 0.38 * failed_attempts
            + 0.85 * new_device
            + 0.55 * new_location
            + 0.22 * shared_accounts
            + 0.24 * historical_fraud_count
            + 2.6 * recipient_risk_score
            + 0.55 * (1 - recipient_verified)
            + 1.35 * unknown_recipient_high_amount
            + 0.002 * unique_devices_to_recipient
            - 0.45 * recipient_used_before
            - 1.9 * verified_education_context
            + 1.3 * int(hour < 5)
        )
        fraud_probability = sigmoid(logit)
        fraud = int(rng.random() < fraud_probability)
        return_logit = (
            -3.2
            + 4.2 * return_rate
            + 0.22 * max(0, amount_deviation - 2)
            + 0.5 * new_device
        )
        returned = int(rng.random() < sigmoid(return_logit))
        rows.append(
            {
                "timestamp": (start + timedelta(minutes=index * 3)).isoformat(),
                "amount": round(amount, 2),
                "hour": hour,
                "transactions_5m": transactions_5m,
                "transactions_15m": transactions_15m,
                "transactions_1h": transactions_1h,
                "failed_attempts_10m": failed_attempts,
                "amount_deviation": round(amount_deviation, 4),
                "new_device": new_device,
                "new_location": new_location,
                "shared_device_accounts": shared_accounts,
                "historical_return_rate": round(return_rate, 4),
                "customer_age": customer_age,
                "account_age_days": account_age_days,
                "historical_fraud_count": historical_fraud_count,
                "recipient_verified": recipient_verified,
                "recipient_used_before": recipient_used_before,
                "recipient_risk_score": round(recipient_risk_score, 4),
                "same_recipient_transactions_15m": same_recipient_transactions_15m,
                "amount_to_recipient_1h_ratio": round(amount_to_recipient_1h_ratio, 4),
                "customer_recipient_transactions": customer_recipient_transactions,
                "unique_customers_to_recipient": unique_customers_to_recipient,
                "unique_devices_to_recipient": unique_devices_to_recipient,
                "verified_education_context": verified_education_context,
                "unknown_recipient_high_amount": unknown_recipient_high_amount,
                "recipient_category": recipient_category,
                "fraud": fraud,
                "returned": returned,
            }
        )
    return rows


def matrix(rows: list[dict[str, float | int | str]]) -> np.ndarray:
    return np.asarray(
        [[float(row[name]) for name in FEATURES] for row in rows], dtype=float
    )


def metrics(
    y_true: np.ndarray, probabilities: np.ndarray, threshold: float
) -> dict[str, float | int | list[list[int]]]:
    predictions = (probabilities >= threshold).astype(int)
    matrix_values = confusion_matrix(y_true, predictions, labels=[0, 1])
    true_negative, false_positive, false_negative, true_positive = matrix_values.ravel()
    return {
        "precision": round(
            float(precision_score(y_true, predictions, zero_division=0)), 4
        ),
        "recall": round(float(recall_score(y_true, predictions, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, predictions, zero_division=0)), 4),
        "pr_auc": round(float(average_precision_score(y_true, probabilities)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, probabilities)), 4),
        "brier_score": round(float(brier_score_loss(y_true, probabilities)), 4),
        "false_positive_rate": round(
            float(false_positive / max(false_positive + true_negative, 1)), 4
        ),
        "false_negative_rate": round(
            float(false_negative / max(false_negative + true_positive, 1)), 4
        ),
        "confusion_matrix": matrix_values.astype(int).tolist(),
    }


def business_cost_report(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    threshold: float,
    costs: dict[str, float] | None = None,
) -> dict[str, float | int]:
    """Measure operational cost without claiming prevented-loss value.

    Threshold selection must use validation data. The same chosen threshold can
    then be evaluated once on the locked test split.
    """
    configured = costs or BUSINESS_COSTS_INR
    predictions = (probabilities >= threshold).astype(int)
    true_negative, false_positive, false_negative, true_positive = confusion_matrix(
        y_true, predictions, labels=[0, 1]
    ).ravel()
    reviews = int(predictions.sum())
    total_cost = (
        false_positive * configured["false_positive"]
        + false_negative * configured["false_negative"]
        + reviews * configured["manual_review"]
    )
    return {
        "threshold": round(float(threshold), 6),
        "true_negative": int(true_negative),
        "false_positive": int(false_positive),
        "false_negative": int(false_negative),
        "true_positive": int(true_positive),
        "manual_reviews": reviews,
        "total_cost_inr": round(float(total_cost), 2),
        "cost_per_transaction_inr": round(float(total_cost / max(len(y_true), 1)), 2),
    }


def cost_optimal_threshold(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    costs: dict[str, float] | None = None,
) -> float:
    candidates = np.linspace(0.01, 0.90, 180)
    return float(
        min(
            candidates,
            key=lambda threshold: business_cost_report(
                y_true, probabilities, float(threshold), costs
            )["total_cost_inr"],
        )
    )


def age_slice_metrics(
    rows: list[dict[str, float | int | str]],
    labels: np.ndarray,
    probabilities: np.ndarray,
    threshold: float,
) -> dict[str, dict[str, float | int]]:
    ages = np.asarray([int(row["customer_age"]) for row in rows])
    slices = {
        "under_18": ages < 18,
        "18_to_25": (ages >= 18) & (ages <= 25),
        "26_plus": ages >= 26,
    }
    report: dict[str, dict[str, float | int]] = {}
    for name, mask in slices.items():
        slice_labels = labels[mask]
        slice_probabilities = probabilities[mask]
        predictions = slice_probabilities >= threshold
        report[name] = {
            "rows": int(mask.sum()),
            "observed_fraud_rate": round(float(slice_labels.mean()), 4),
            "average_predicted_risk": round(float(slice_probabilities.mean()), 4),
            "alert_rate": round(float(predictions.mean()), 4),
            "recall": round(
                float(recall_score(slice_labels, predictions, zero_division=0)), 4
            ),
            "false_positive_rate": round(
                float(
                    ((predictions == 1) & (slice_labels == 0)).sum()
                    / max((slice_labels == 0).sum(), 1)
                ),
                4,
            ),
        }
    return report


def best_threshold(y_true: np.ndarray, probabilities: np.ndarray) -> float:
    candidates = np.linspace(0.01, 0.9, 180)
    return float(
        max(
            candidates,
            key=lambda value: f1_score(y_true, probabilities >= value, zero_division=0),
        )
    )


def medium_threshold(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    high_threshold: float,
    minimum_probability: float = 0.10,
) -> float:
    candidates = np.linspace(0.005, high_threshold, 180)
    f2_threshold = max(
        candidates,
        key=lambda value: fbeta_score(
            y_true, probabilities >= value, beta=2, zero_division=0
        ),
    )
    return float(min(high_threshold, max(minimum_probability, f2_threshold)))


def probability_pipeline() -> Pipeline:
    return Pipeline(
        [
            ("scale", StandardScaler()),
            ("model", LogisticRegression(max_iter=1000, random_state=245)),
        ]
    )


def out_of_fold_components(
    values: np.ndarray,
    labels: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Build leakage-safe stacking features with expanding temporal windows.

    TimeSeriesSplit deliberately leaves the first window without predictions: it
    has no earlier observations from which a model could have been trained.  The
    returned mask identifies the rows that are valid fusion-training examples.
    """
    components = np.zeros((len(values), 6), dtype=float)
    covered = np.zeros(len(values), dtype=bool)
    folds = TimeSeriesSplit(n_splits=5)
    for fit_indices, holdout_indices in folds.split(values):
        fold_fraud = probability_pipeline()
        fold_fraud.fit(values[fit_indices], labels[fit_indices])
        fold_anomaly = IsolationForest(contamination=0.05, random_state=245)
        normal_fit = values[fit_indices][labels[fit_indices] == 0]
        fold_anomaly.fit(normal_fit)
        probabilities = fold_fraud.predict_proba(values[holdout_indices])[:, 1]
        components[holdout_indices] = supporting_components(
            values[holdout_indices], probabilities, fold_anomaly
        )
        covered[holdout_indices] = True
    return components, covered


def supporting_components(
    values: np.ndarray,
    fraud_probabilities: np.ndarray,
    anomaly_model: IsolationForest,
) -> np.ndarray:
    index = {name: position for position, name in enumerate(FEATURES)}
    anomaly = 1 / (1 + np.exp(6 * anomaly_model.decision_function(values)))
    behavior = np.clip(
        0.45 * np.maximum(values[:, index["amount_deviation"]] - 1, 0) / 5
        + 0.3 * values[:, index["new_device"]]
        + 0.2 * values[:, index["new_location"]]
        + 0.05 * np.minimum(values[:, index["historical_fraud_count"]], 5) / 5,
        0,
        1,
    )
    velocity = np.clip(
        0.3 * values[:, index["transactions_5m"]] / 10
        + 0.15 * values[:, index["transactions_15m"]] / 20
        + 0.15 * values[:, index["transactions_1h"]] / 40
        + 0.15 * values[:, index["failed_attempts_10m"]] / 5
        + 0.25 * values[:, index["same_recipient_transactions_15m"]] / 8,
        0,
        1,
    )
    graph = np.clip(
        0.35 * values[:, index["shared_device_accounts"]] / 8
        + 0.35 * values[:, index["recipient_risk_score"]]
        + 0.15 * values[:, index["unique_customers_to_recipient"]] / 250
        + 0.15 * values[:, index["unique_devices_to_recipient"]] / 250,
        0,
        1,
    )
    contextual_rules = np.clip(
        0.2 * (values[:, index["amount_deviation"]] >= 3)
        + 0.25 * (values[:, index["same_recipient_transactions_15m"]] >= 4)
        + 0.15 * (values[:, index["failed_attempts_10m"]] >= 3)
        + 0.15 * (values[:, index["shared_device_accounts"]] >= 4)
        + 0.35 * values[:, index["unknown_recipient_high_amount"]]
        - 0.4 * values[:, index["verified_education_context"]],
        -1,
        1,
    )
    return np.column_stack(
        [fraud_probabilities, anomaly, behavior, velocity, graph, contextual_rules]
    )


def main() -> None:
    rows = generate_dataset()
    train_end = int(len(rows) * 0.6)
    validation_end = int(len(rows) * 0.8)
    train_rows = rows[:train_end]
    validation_rows = rows[train_end:validation_end]
    test_rows = rows[validation_end:]
    x_train = matrix(train_rows)
    x_validation = matrix(validation_rows)
    x_test = matrix(test_rows)
    y_fraud_train = np.asarray([int(row["fraud"]) for row in train_rows])
    y_fraud_validation = np.asarray([int(row["fraud"]) for row in validation_rows])
    y_fraud_test = np.asarray([int(row["fraud"]) for row in test_rows])
    y_return_train = np.asarray([int(row["returned"]) for row in train_rows])
    y_return_validation = np.asarray([int(row["returned"]) for row in validation_rows])
    y_return_test = np.asarray([int(row["returned"]) for row in test_rows])

    fusion_train, fusion_train_mask = out_of_fold_components(x_train, y_fraud_train)

    fraud_model = probability_pipeline()
    fraud_model.fit(x_train, y_fraud_train)
    fraud_validation_probabilities = fraud_model.predict_proba(x_validation)[:, 1]
    fraud_probabilities = fraud_model.predict_proba(x_test)[:, 1]
    fraud_threshold = best_threshold(y_fraud_validation, fraud_validation_probabilities)

    normal_train = x_train[y_fraud_train == 0]
    anomaly_model = IsolationForest(contamination=0.05, random_state=245)
    anomaly_model.fit(normal_train)
    anomaly_test_scores = 1 / (1 + np.exp(6 * anomaly_model.decision_function(x_test)))

    fusion_validation = supporting_components(
        x_validation, fraud_validation_probabilities, anomaly_model
    )
    fusion_test = supporting_components(x_test, fraud_probabilities, anomaly_model)
    fusion_model = LogisticRegression(max_iter=1000, random_state=245)
    fusion_model.fit(fusion_train[fusion_train_mask], y_fraud_train[fusion_train_mask])
    fusion_validation_probabilities = fusion_model.predict_proba(fusion_validation)[
        :, 1
    ]
    fusion_probabilities = fusion_model.predict_proba(fusion_test)[:, 1]
    fusion_threshold = best_threshold(
        y_fraud_validation, fusion_validation_probabilities
    )
    fusion_cost_threshold = cost_optimal_threshold(
        y_fraud_validation, fusion_validation_probabilities
    )
    fusion_medium_threshold = medium_threshold(
        y_fraud_validation, fusion_validation_probabilities, fusion_threshold
    )

    return_model = probability_pipeline()
    return_model.fit(x_train, y_return_train)
    return_validation_probabilities = return_model.predict_proba(x_validation)[:, 1]
    return_probabilities = return_model.predict_proba(x_test)[:, 1]
    return_threshold = best_threshold(
        y_return_validation, return_validation_probabilities
    )

    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(fraud_model, ARTIFACTS / "fraud-v3.joblib")
    joblib.dump(anomaly_model, ARTIFACTS / "anomaly-v3.joblib")
    joblib.dump(return_model, ARTIFACTS / "return-v3.joblib")
    joblib.dump(fusion_model, ARTIFACTS / "fusion-v3.joblib")
    manifest = {
        "schema_version": 4,
        "created_at": datetime.now(UTC).isoformat(),
        "dataset": {
            "provenance": "SYNTHETIC",
            "generator_seed": 245,
            "rows": len(rows),
            "train_rows": len(train_rows),
            "validation_rows": len(validation_rows),
            "held_out_rows": len(test_rows),
            "split": "temporal_60_20_20",
            "fusion_training": "five_fold_expanding_window_temporal_stacking",
            "fusion_training_rows": int(fusion_train_mask.sum()),
            "leakage_policy": "Every stacking prediction is produced by models fitted only on earlier rows.",
            "dataset_roles": {
                "supervised_fraud": "Synthetic labelled transaction rows; demo validation only",
                "anomaly": "Legitimate rows from the chronological training window only",
                "behavioral_history": "Prior-only customer and recipient aggregates",
                "relationship_graph": "Customer-device-location-recipient relationship features",
                "application_testing": "Synthetic RazorShield records; not production training evidence",
            },
        },
        "features": FEATURES,
        "feature_bounds": {
            "shared_device_accounts": {"minimum": 0, "maximum": 20},
            "customer_age": {"minimum": 13, "maximum": 120},
            "recipient_risk_score": {"minimum": 0, "maximum": 1},
            "same_recipient_transactions_15m": {"minimum": 0, "maximum": 100},
            "unique_customers_to_recipient": {"minimum": 0, "maximum": 2000},
            "unique_devices_to_recipient": {"minimum": 0, "maximum": 2000},
        },
        "fraud": {
            "version": "fraud-v3",
            "artifact": "fraud-v3.joblib",
            "algorithm": "logistic_regression_probability",
            "threshold": round(fraud_threshold, 4),
            "metrics": metrics(y_fraud_test, fraud_probabilities, fraud_threshold),
        },
        "anomaly": {
            "version": "anomaly-v3",
            "artifact": "anomaly-v3.joblib",
            "algorithm": "isolation_forest",
            "contamination": 0.05,
            "score_threshold": 0.5,
            "metrics": metrics(y_fraud_test, anomaly_test_scores, 0.5),
            "evaluation_role": (
                "Held-out diagnostic against fraud labels; anomaly remains supporting evidence."
            ),
        },
        "fusion": {
            "version": "fusion-v3",
            "artifact": "fusion-v3.joblib",
            "algorithm": "logistic_regression_on_out_of_fold_component_signals",
            "components": [
                "fraud",
                "anomaly",
                "behavior",
                "velocity",
                "graph",
                "context_rules",
            ],
            "medium_threshold": round(fusion_medium_threshold, 4),
            "high_threshold": round(fusion_threshold, 4),
            "threshold_selection": {
                "medium": "maximum validation F2 with a calibrated probability floor of 0.10",
                "high": "maximum validation F1",
                "business_cost": "minimum validation cost using configured false-positive, false-negative, and review costs",
            },
            "metrics": metrics(y_fraud_test, fusion_probabilities, fusion_threshold),
            "medium_metrics": metrics(
                y_fraud_test, fusion_probabilities, fusion_medium_threshold
            ),
            "age_slice_evaluation": age_slice_metrics(
                test_rows, y_fraud_test, fusion_probabilities, fusion_threshold
            ),
            "business_cost_analysis": {
                "currency": "INR",
                "illustrative_costs": BUSINESS_COSTS_INR,
                "validation_at_cost_threshold": business_cost_report(
                    y_fraud_validation,
                    fusion_validation_probabilities,
                    fusion_cost_threshold,
                ),
                "locked_test_at_f1_threshold": business_cost_report(
                    y_fraud_test, fusion_probabilities, fusion_threshold
                ),
                "locked_test_at_cost_threshold": business_cost_report(
                    y_fraud_test, fusion_probabilities, fusion_cost_threshold
                ),
                "locked_test_always_allow_baseline": business_cost_report(
                    y_fraud_test, np.zeros_like(fusion_probabilities), 0.5
                ),
                "limitation": "Costs are illustrative configuration inputs, not claimed prevented loss.",
            },
        },
        "return": {
            "version": "return-v3",
            "artifact": "return-v3.joblib",
            "algorithm": "logistic_regression_probability",
            "threshold": round(return_threshold, 4),
            "metrics": metrics(y_return_test, return_probabilities, return_threshold),
        },
    }
    (ARTIFACTS / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (DATA_DIR / "synthetic_dataset_manifest.json").write_text(
        json.dumps(manifest["dataset"], indent=2) + "\n"
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    sys.exit(main())
