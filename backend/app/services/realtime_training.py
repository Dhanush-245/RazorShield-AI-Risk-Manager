from __future__ import annotations

import json
import os
import shutil
import uuid
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import joblib
import numpy as np
from fastapi import HTTPException, status
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.audit import AuditEvent
from app.models.risk import RiskAssessment, Transaction
from app.services.label_maturity import is_mature_label
from app.services.model_risk import TRAINING_FEATURE_NAMES, load_models

MINIMUM_TRAINING_ROWS = 100
MINIMUM_CLASS_ROWS = 10
BUSINESS_COSTS_INR = {
    "false_positive": 100.0,
    "false_negative": 5_000.0,
    "manual_review": 50.0,
}


def probability_pipeline() -> Pipeline:
    return Pipeline(
        [
            ("scale", StandardScaler()),
            ("model", LogisticRegression(max_iter=1_000, random_state=245)),
        ]
    )


def supporting_components(
    values: np.ndarray,
    fraud_probabilities: np.ndarray,
    anomaly_model: IsolationForest,
) -> np.ndarray:
    index = {name: position for position, name in enumerate(TRAINING_FEATURE_NAMES)}
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
    return np.column_stack([fraud_probabilities, anomaly, behavior, velocity, graph, contextual_rules])


def out_of_fold_components(values: np.ndarray, labels: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    splitter = TimeSeriesSplit(n_splits=5)
    components = np.zeros((len(values), 6), dtype=float)
    covered = np.zeros(len(values), dtype=bool)
    for fit_indices, holdout_indices in splitter.split(values, labels):
        if len(set(labels[fit_indices].tolist())) < 2:
            continue
        fold_fraud = probability_pipeline()
        fold_fraud.fit(values[fit_indices], labels[fit_indices])
        fold_anomaly = IsolationForest(contamination=0.05, random_state=245)
        fold_anomaly.fit(values[fit_indices][labels[fit_indices] == 0])
        probabilities = fold_fraud.predict_proba(values[holdout_indices])[:, 1]
        components[holdout_indices] = supporting_components(
            values[holdout_indices], probabilities, fold_anomaly
        )
        covered[holdout_indices] = True
    return components, covered


def best_threshold(labels: np.ndarray, probabilities: np.ndarray) -> float:
    candidates = np.linspace(0.05, 0.90, 172)
    return float(
        max(
            candidates,
            key=lambda value: f1_score(labels, probabilities >= value, zero_division=0),
        )
    )


def metric_report(labels: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict[str, object]:
    predictions = probabilities >= threshold
    return {
        "precision": round(float(precision_score(labels, predictions, zero_division=0)), 4),
        "recall": round(float(recall_score(labels, predictions, zero_division=0)), 4),
        "f1": round(float(f1_score(labels, predictions, zero_division=0)), 4),
        "pr_auc": round(float(average_precision_score(labels, probabilities)), 4),
        "roc_auc": round(float(roc_auc_score(labels, probabilities)), 4),
        "brier": round(float(brier_score_loss(labels, probabilities)), 4),
        "confusion_matrix": confusion_matrix(labels, predictions).tolist(),
    }


def business_cost_report(
    labels: np.ndarray, probabilities: np.ndarray, threshold: float
) -> dict[str, float | int]:
    predictions = probabilities >= threshold
    true_negative, false_positive, false_negative, true_positive = confusion_matrix(
        labels, predictions, labels=[0, 1]
    ).ravel()
    manual_reviews = int(predictions.sum())
    total_cost = (
        false_positive * BUSINESS_COSTS_INR["false_positive"]
        + false_negative * BUSINESS_COSTS_INR["false_negative"]
        + manual_reviews * BUSINESS_COSTS_INR["manual_review"]
    )
    return {
        "threshold": round(float(threshold), 6),
        "true_negative": int(true_negative),
        "false_positive": int(false_positive),
        "false_negative": int(false_negative),
        "true_positive": int(true_positive),
        "manual_reviews": manual_reviews,
        "total_cost_inr": round(float(total_cost), 2),
        "cost_per_transaction_inr": round(float(total_cost / max(len(labels), 1)), 2),
    }


def cost_optimal_threshold(labels: np.ndarray, probabilities: np.ndarray) -> float:
    candidates = np.linspace(0.01, 0.90, 180)
    return float(
        min(
            candidates,
            key=lambda threshold: business_cost_report(labels, probabilities, float(threshold))[
                "total_cost_inr"
            ],
        )
    )


def _validated_training_rows(
    db: Session, merchant_id: str, dataset_id: str
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rows = db.execute(
        select(RiskAssessment, Transaction)
        .join(Transaction, RiskAssessment.transaction_id == Transaction.id)
        .where(Transaction.merchant_id == merchant_id, Transaction.dataset_id == dataset_id)
        .order_by(Transaction.occurred_at)
    ).all()
    labeled: list[tuple[list[float], int, int]] = []
    immature = 0
    maturity_days = get_settings().label_maturity_days
    for assessment, transaction in rows:
        if (
            transaction.fraud_label is None
            or transaction.return_label is None
            or not assessment.feature_snapshot
        ):
            continue
        if not (
            is_mature_label(
                transaction.occurred_at,
                transaction.fraud_label_observed_at,
                maturity_days=maturity_days,
            )
            and is_mature_label(
                transaction.occurred_at,
                transaction.return_label_observed_at,
                maturity_days=maturity_days,
            )
        ):
            immature += 1
            continue
        snapshot = json.loads(assessment.feature_snapshot)
        if not all(name in snapshot for name in TRAINING_FEATURE_NAMES):
            continue
        labeled.append(
            (
                [float(snapshot[name]) for name in TRAINING_FEATURE_NAMES],
                int(transaction.fraud_label),
                int(transaction.return_label),
            )
        )
    if len(labeled) < MINIMUM_TRAINING_ROWS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"Training requires at least {MINIMUM_TRAINING_ROWS} rows with both fraud_label "
                f"and return_label observed at least {maturity_days} days after the event. "
                f"Found {len(labeled)} mature rows; withheld {immature} immature rows."
            ),
        )
    values = np.asarray([item[0] for item in labeled], dtype=float)
    fraud_labels = np.asarray([item[1] for item in labeled], dtype=int)
    return_labels = np.asarray([item[2] for item in labeled], dtype=int)
    for label_name, labels in (("fraud_label", fraud_labels), ("return_label", return_labels)):
        counts = Counter(labels.tolist())
        if set(counts) != {0, 1} or min(counts.values()) < MINIMUM_CLASS_ROWS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"{label_name} requires both outcome classes and at least "
                    f"{MINIMUM_CLASS_ROWS} rows in each class. Observed {dict(counts)}."
                ),
            )
    return values, fraud_labels, return_labels


def train_active_dataset_once(db: Session, merchant_id: str, dataset_id: str) -> dict[str, object]:
    existing = db.scalar(
        select(AuditEvent.id).where(
            AuditEvent.merchant_id == merchant_id,
            AuditEvent.dataset_id == dataset_id,
            AuditEvent.event_type == "DATASET_MODEL_TRAINED",
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The active dataset has already completed its one-time training run.",
        )
    values, fraud_labels, return_labels = _validated_training_rows(db, merchant_id, dataset_id)
    indices = np.arange(len(values))
    train_end = int(len(values) * 0.6)
    validation_end = int(len(values) * 0.8)
    train = indices[:train_end]
    validation = indices[train_end:validation_end]
    test = indices[validation_end:]
    for split_name, split_indices in (
        ("training", train),
        ("validation", validation),
        ("locked test", test),
    ):
        counts = Counter(fraud_labels[split_indices].tolist())
        if set(counts) != {0, 1}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Temporal {split_name} split must contain both fraud outcome classes.",
            )
    fraud_model = probability_pipeline()
    fraud_model.fit(values[train], fraud_labels[train])
    anomaly_model = IsolationForest(contamination=0.05, random_state=245)
    anomaly_model.fit(values[train][fraud_labels[train] == 0])
    fusion_model = LogisticRegression(max_iter=1_000, random_state=245)
    fusion_train, fusion_train_mask = out_of_fold_components(values[train], fraud_labels[train])
    fusion_model.fit(fusion_train[fusion_train_mask], fraud_labels[train][fusion_train_mask])
    return_model = probability_pipeline()
    return_model.fit(values[train], return_labels[train])

    fraud_validation = fraud_model.predict_proba(values[validation])[:, 1]
    fraud_test = fraud_model.predict_proba(values[test])[:, 1]
    fusion_validation = fusion_model.predict_proba(
        supporting_components(values[validation], fraud_validation, anomaly_model)
    )[:, 1]
    fusion_test = fusion_model.predict_proba(supporting_components(values[test], fraud_test, anomaly_model))[
        :, 1
    ]
    anomaly_test = 1 / (1 + np.exp(6 * anomaly_model.decision_function(values[test])))
    return_validation = return_model.predict_proba(values[validation])[:, 1]
    return_test = return_model.predict_proba(values[test])[:, 1]
    fraud_threshold = best_threshold(fraud_labels[validation], fraud_validation)
    high_threshold = max(0.20, best_threshold(fraud_labels[validation], fusion_validation))
    business_threshold = cost_optimal_threshold(fraud_labels[validation], fusion_validation)
    medium_threshold = max(0.05, min(high_threshold - 0.01, high_threshold * 0.5))
    return_threshold = best_threshold(return_labels[validation], return_validation)

    trained_at = datetime.now(UTC)
    stamp = trained_at.strftime("%Y%m%d%H%M%S")
    model_version = f"merchant-rt-{stamp}"
    base_artifact_dir = Path(get_settings().model_dir).resolve()
    artifact_dir = base_artifact_dir / "merchants" / merchant_id
    artifact_dir.mkdir(parents=True, exist_ok=True)
    filenames = {
        "fraud": f"fraud-rt-{stamp}.joblib",
        "anomaly": f"anomaly-rt-{stamp}.joblib",
        "fusion": f"fusion-rt-{stamp}.joblib",
        "return": f"return-rt-{stamp}.joblib",
    }
    for name, model in (
        ("fraud", fraud_model),
        ("anomaly", anomaly_model),
        ("fusion", fusion_model),
        ("return", return_model),
    ):
        temporary = artifact_dir / f".{filenames[name]}.tmp"
        joblib.dump(model, temporary)
        os.replace(temporary, artifact_dir / filenames[name])
    manifest_path = artifact_dir / "manifest.json"
    backup_path = artifact_dir / "manifest.pre-realtime.json"
    rollback_source = manifest_path if manifest_path.exists() else base_artifact_dir / "manifest.json"
    if rollback_source.exists() and not backup_path.exists():
        shutil.copy2(rollback_source, backup_path)
    feature_bounds = {
        name: {
            "minimum": round(float(np.min(values[:, index])), 6),
            "maximum": round(float(np.max(values[:, index])), 6),
        }
        for index, name in enumerate(TRAINING_FEATURE_NAMES)
    }
    manifest = {
        "schema_version": 5,
        "created_at": trained_at.isoformat(),
        "dataset": {
            "provenance": "MERCHANT_LABELED_REAL_TIME",
            "dataset_id": dataset_id,
            "rows": len(values),
            "train_rows": len(train),
            "validation_rows": len(validation),
            "held_out_rows": len(test),
            "split": "temporal_60_20_20",
            "fusion_training": "expanding_window_temporal_stacking",
            "leakage_policy": (
                "Thresholds use validation only; the latest 20% remains locked for final reporting."
            ),
            "label_maturity_days": get_settings().label_maturity_days,
            "label_policy": "Only outcomes observed after the full maturity window are eligible.",
        },
        "features": list(TRAINING_FEATURE_NAMES),
        "feature_bounds": feature_bounds,
        "fraud": {
            "version": f"fraud-rt-{stamp}",
            "artifact": filenames["fraud"],
            "algorithm": "standardized_logistic_regression",
            "threshold": round(fraud_threshold, 4),
            "metrics": metric_report(fraud_labels[test], fraud_test, fraud_threshold),
        },
        "anomaly": {
            "version": f"anomaly-rt-{stamp}",
            "artifact": filenames["anomaly"],
            "algorithm": "isolation_forest",
            "contamination": 0.05,
            "score_threshold": 0.5,
            "metrics": metric_report(fraud_labels[test], anomaly_test, 0.5),
            "evaluation_role": (
                "Held-out diagnostic against fraud labels; anomaly remains supporting evidence."
            ),
        },
        "fusion": {
            "version": f"fusion-rt-{stamp}",
            "artifact": filenames["fusion"],
            "algorithm": "logistic_regression_on_component_signals",
            "components": ["fraud", "anomaly", "behavior", "velocity", "graph", "context_rules"],
            "medium_threshold": round(medium_threshold, 4),
            "high_threshold": round(high_threshold, 4),
            "metrics": metric_report(fraud_labels[test], fusion_test, high_threshold),
            "business_cost_analysis": {
                "currency": "INR",
                "illustrative_costs": BUSINESS_COSTS_INR,
                "validation_at_cost_threshold": business_cost_report(
                    fraud_labels[validation], fusion_validation, business_threshold
                ),
                "locked_test_at_f1_threshold": business_cost_report(
                    fraud_labels[test], fusion_test, high_threshold
                ),
                "locked_test_at_cost_threshold": business_cost_report(
                    fraud_labels[test], fusion_test, business_threshold
                ),
                "locked_test_always_allow_baseline": business_cost_report(
                    fraud_labels[test], np.zeros_like(fusion_test), 0.5
                ),
                "limitation": "Costs are illustrative configuration inputs, not claimed prevented loss.",
            },
        },
        "return": {
            "version": f"return-rt-{stamp}",
            "artifact": filenames["return"],
            "algorithm": "standardized_logistic_regression",
            "threshold": round(return_threshold, 4),
            "metrics": metric_report(return_labels[test], return_test, return_threshold),
        },
    }
    temporary_manifest = artifact_dir / ".manifest.json.tmp"
    temporary_manifest.write_text(json.dumps(manifest, indent=2) + "\n")
    os.replace(temporary_manifest, manifest_path)
    load_models.cache_clear()
    return {
        "trainingId": str(uuid.uuid4()),
        "datasetId": dataset_id,
        "rows": len(values),
        "modelVersion": model_version,
        "status": "TRAINED_AND_ACTIVATED",
        "provenance": "MERCHANT_LABELED_REAL_TIME",
        "split": "TEMPORAL_60_20_20",
        "heldOutRows": len(test),
        "fraudMetrics": manifest["fraud"]["metrics"],
        "fusionMetrics": manifest["fusion"]["metrics"],
        "businessCostAnalysis": manifest["fusion"]["business_cost_analysis"],
        "returnMetrics": manifest["return"]["metrics"],
        "trainedAt": trained_at.isoformat(),
        "rollbackManifest": backup_path.name if backup_path.exists() else None,
    }
