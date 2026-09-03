from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import time
from datetime import UTC, datetime
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import xgboost as xgb
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, SGDClassifier
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

SEED = 245
NUMERIC_FEATURES = [
    "TransactionAmt",
    "card1",
    "card2",
    "card3",
    "card5",
    "addr1",
    "addr2",
    "dist1",
    "dist2",
    *[f"C{i}" for i in range(1, 15)],
    *[f"D{i}" for i in range(1, 16)],
    *[
        "V12",
        "V13",
        "V17",
        "V19",
        "V20",
        "V30",
        "V34",
        "V36",
        "V44",
        "V45",
        "V47",
        "V48",
        "V52",
        "V53",
        "V54",
        "V61",
        "V62",
        "V70",
        "V75",
        "V76",
        "V78",
        "V82",
        "V86",
        "V87",
        "V91",
        "V94",
        "V127",
        "V128",
        "V130",
        "V131",
        "V178",
        "V187",
        "V189",
        "V201",
        "V203",
        "V207",
        "V209",
        "V210",
        "V221",
        "V234",
        "V243",
        "V244",
        "V246",
        "V257",
        "V258",
        "V261",
        "V264",
        "V266",
        "V267",
        "V274",
        "V277",
        "V283",
        "V285",
        "V289",
        "V291",
        "V294",
        "V303",
        "V307",
        "V310",
        "V312",
        "V313",
        "V314",
        "V317",
    ],
]
TRANSACTION_CATEGORICALS = [
    "ProductCD",
    "card4",
    "card6",
    "P_emaildomain",
    "R_emaildomain",
    *[f"M{i}" for i in range(1, 10)],
]
IDENTITY_CATEGORICALS = [
    "DeviceType",
    "DeviceInfo",
    "id_12",
    "id_15",
    "id_16",
    "id_28",
    "id_29",
    "id_30",
    "id_31",
    "id_34",
    "id_35",
    "id_36",
    "id_37",
    "id_38",
]
DERIVED_FEATURES = [
    "transaction_hour",
    "transaction_day",
    "amount_log1p",
    "identity_present",
]
FEATURES = [
    *NUMERIC_FEATURES,
    *DERIVED_FEATURES,
    *TRANSACTION_CATEGORICALS,
    *IDENTITY_CATEGORICALS,
]
CATEGORICAL_START = len(NUMERIC_FEATURES) + len(DERIVED_FEATURES)
CATEGORY_BUCKETS = 128
FALSE_POSITIVE_COST_INR = 100.0
FALSE_NEGATIVE_COST_INR = 5000.0
MANUAL_REVIEW_COST_INR = 50.0
MAX_REVIEW_RATE = 0.05
OPERATING_REVIEW_RATE = 0.04
TARGET_RECALL = 0.85
TARGET_PRECISION = 0.80


def stable_category(value: str | None) -> float:
    if not value:
        return float(CATEGORY_BUCKETS)
    digest = hashlib.blake2b(value.encode("utf-8"), digest_size=4).digest()
    return float(int.from_bytes(digest, "little") % CATEGORY_BUCKETS)


def numeric(value: str | None) -> float:
    if value in (None, ""):
        return math.nan
    try:
        return float(value)
    except ValueError:
        return math.nan


def load_identity(path: Path) -> dict[str, list[float]]:
    values: dict[str, list[float]] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = {"TransactionID", *IDENTITY_CATEGORICALS} - set(
            reader.fieldnames or []
        )
        if missing:
            raise ValueError(f"Identity file is missing columns: {sorted(missing)}")
        for row in reader:
            values[row["TransactionID"]] = [
                stable_category(row[name]) for name in IDENTITY_CATEGORICALS
            ]
    return values


def load_transactions(
    path: Path, identities: dict[str, list[float]]
) -> tuple[np.ndarray, np.ndarray]:
    rows: list[list[float]] = []
    labels: list[int] = []
    required = {
        "TransactionID",
        "TransactionDT",
        "isFraud",
        *NUMERIC_FEATURES,
        *TRANSACTION_CATEGORICALS,
    }
    missing_identity = [float(CATEGORY_BUCKETS)] * len(IDENTITY_CATEGORICALS)
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Transaction file is missing columns: {sorted(missing)}")
        previous_dt = -math.inf
        for row_number, row in enumerate(reader, start=2):
            transaction_dt = numeric(row["TransactionDT"])
            if transaction_dt < previous_dt:
                raise ValueError(
                    f"TransactionDT is not monotonic at CSV row {row_number}"
                )
            previous_dt = transaction_dt
            amount = numeric(row["TransactionAmt"])
            identity = identities.get(row["TransactionID"])
            derived = [
                float((int(transaction_dt) // 3600) % 24),
                float(int(transaction_dt) // 86400),
                math.log1p(max(amount, 0.0)) if not math.isnan(amount) else math.nan,
                float(identity is not None),
            ]
            rows.append(
                [numeric(row[name]) for name in NUMERIC_FEATURES]
                + derived
                + [stable_category(row[name]) for name in TRANSACTION_CATEGORICALS]
                + (identity if identity is not None else missing_identity)
            )
            labels.append(int(row["isFraud"]))
    return np.asarray(rows, dtype=np.float32), np.asarray(labels, dtype=np.int8)


def metric_report(
    y_true: np.ndarray, probability: np.ndarray, threshold: float
) -> dict[str, object]:
    prediction = probability >= threshold
    tn, fp, fn, tp = confusion_matrix(y_true, prediction, labels=[0, 1]).ravel()
    return {
        "rows": len(y_true),
        "fraud_rows": int(y_true.sum()),
        "threshold": round(float(threshold), 6),
        "precision": round(
            float(precision_score(y_true, prediction, zero_division=0)), 6
        ),
        "recall": round(float(recall_score(y_true, prediction, zero_division=0)), 6),
        "f1": round(float(f1_score(y_true, prediction, zero_division=0)), 6),
        "pr_auc": round(float(average_precision_score(y_true, probability)), 6),
        "roc_auc": round(float(roc_auc_score(y_true, probability)), 6),
        "brier_score": round(float(brier_score_loss(y_true, probability)), 6),
        "false_positive_rate": round(float(fp / max(fp + tn, 1)), 6),
        "false_negative_rate": round(float(fn / max(fn + tp, 1)), 6),
        "alert_rate": round(float(prediction.mean()), 6),
        "confusion_matrix_tn_fp_fn_tp": [int(tn), int(fp), int(fn), int(tp)],
    }


def f1_threshold(y_true: np.ndarray, probability: np.ndarray) -> float:
    candidates = np.unique(np.quantile(probability, np.linspace(0.70, 0.9995, 500)))
    return float(
        max(candidates, key=lambda value: f1_score(y_true, probability >= value))
    )


def cost_threshold(
    y_true: np.ndarray,
    probability: np.ndarray,
    fp_cost: float = 100.0,
    fn_cost: float = 5000.0,
    review_cost: float = 50.0,
) -> tuple[float, float]:
    candidates = np.unique(np.quantile(probability, np.linspace(0.01, 0.9995, 750)))
    best = (math.inf, 0.5)
    for threshold in candidates:
        prediction = probability >= threshold
        fp = int(((prediction == 1) & (y_true == 0)).sum())
        fn = int(((prediction == 0) & (y_true == 1)).sum())
        reviews = int(prediction.sum())
        cost = fp * fp_cost + fn * fn_cost + reviews * review_cost
        if cost < best[0]:
            best = (cost, float(threshold))
    return best[1], float(best[0])


def capacity_constrained_cost_threshold(
    y_true: np.ndarray,
    probability: np.ndarray,
    max_review_rate: float = MAX_REVIEW_RATE,
    fp_cost: float = FALSE_POSITIVE_COST_INR,
    fn_cost: float = FALSE_NEGATIVE_COST_INR,
    review_cost: float = MANUAL_REVIEW_COST_INR,
) -> tuple[float, float]:
    """Minimize cost while never scheduling more than the review capacity."""

    order = np.argsort(probability, kind="stable")[::-1]
    ordered_labels = y_true[order]
    maximum_reviews = math.floor(len(y_true) * max_review_rate)
    if maximum_reviews == 0:
        return float(np.nextafter(probability.max(), math.inf)), float(
            y_true.sum() * fn_cost
        )

    # A threshold cannot split equal scores. Evaluate only complete score groups so
    # tied probabilities can never silently exceed the configured review capacity.
    ordered_probability = probability[order]
    group_ends = (
        np.flatnonzero(np.r_[ordered_probability[:-1] != ordered_probability[1:], True])
        + 1
    )
    reviews = np.r_[0, group_ends[group_ends <= maximum_reviews]]
    cumulative_all = np.cumsum(ordered_labels)
    cumulative_tp = np.r_[0, cumulative_all[reviews[1:] - 1]]
    fp = reviews - cumulative_tp
    fn = int(y_true.sum()) - cumulative_tp
    costs = fp * fp_cost + fn * fn_cost + reviews * review_cost
    best_reviews = int(np.argmin(costs))
    selected_reviews = int(reviews[best_reviews])
    if selected_reviews == 0:
        threshold = float(np.nextafter(probability.max(), math.inf))
    elif selected_reviews >= len(probability):
        threshold = float(probability.min())
    else:
        upper = float(ordered_probability[selected_reviews - 1])
        lower = float(ordered_probability[selected_reviews])
        threshold = (upper + lower) / 2
    return threshold, float(costs[best_reviews])


def acceptance_report(metrics: dict[str, object]) -> dict[str, object]:
    checks = {
        "recall_at_least_85_percent": float(metrics["recall"]) >= TARGET_RECALL,
        "precision_at_least_80_percent": float(metrics["precision"])
        >= TARGET_PRECISION,
        "review_rate_at_most_5_percent": float(metrics["alert_rate"])
        <= MAX_REVIEW_RATE,
    }
    return {
        "targets": {
            "recall": TARGET_RECALL,
            "precision": TARGET_PRECISION,
            "maximum_review_rate": MAX_REVIEW_RATE,
        },
        "checks": checks,
        "all_targets_met": all(checks.values()),
    }


def calibrate(
    calibration_y: np.ndarray,
    calibration_probability: np.ndarray,
    probability: np.ndarray,
) -> tuple[LogisticRegression, np.ndarray]:
    transform = lambda p: np.log(np.clip(p, 1e-6, 1 - 1e-6) / np.clip(1 - p, 1e-6, 1))
    model = LogisticRegression(C=1e6, random_state=SEED)
    model.fit(transform(calibration_probability).reshape(-1, 1), calibration_y)
    return model, model.predict_proba(transform(probability).reshape(-1, 1))[:, 1]


def calibrated_predict(
    model: LogisticRegression, probability: np.ndarray
) -> np.ndarray:
    clipped = np.clip(probability, 1e-6, 1 - 1e-6)
    logits = np.log(clipped / (1 - clipped)).reshape(-1, 1)
    return model.predict_proba(logits)[:, 1]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train leakage-controlled IEEE-CIS candidates"
    )
    parser.add_argument("--transactions", type=Path, required=True)
    parser.add_argument("--identity", type=Path, required=True)
    parser.add_argument(
        "--output-dir", type=Path, default=Path("ml/models/real/ieee_cis_v2")
    )
    args = parser.parse_args()
    started = time.perf_counter()
    print("Loading identity rows...", flush=True)
    identities = load_identity(args.identity)
    print("Loading chronological transaction matrix...", flush=True)
    x, y = load_transactions(args.transactions, identities)
    train_end = int(len(y) * 0.70)
    validation_end = int(len(y) * 0.85)
    validation_mid = train_end + (validation_end - train_end) // 2
    x_train, y_train = x[:train_end], y[:train_end]
    x_cal, y_cal = x[train_end:validation_mid], y[train_end:validation_mid]
    x_select, y_select = (
        x[validation_mid:validation_end],
        y[validation_mid:validation_end],
    )
    x_test, y_test = x[validation_end:], y[validation_end:]

    candidates = {
        "logistic_sgd": Pipeline(
            [
                ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
                ("scale", StandardScaler()),
                (
                    "model",
                    SGDClassifier(
                        loss="log_loss",
                        class_weight="balanced",
                        alpha=1e-5,
                        max_iter=80,
                        early_stopping=True,
                        validation_fraction=0.1,
                        random_state=SEED,
                    ),
                ),
            ]
        ),
        "random_forest": Pipeline(
            [
                ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
                (
                    "model",
                    RandomForestClassifier(
                        n_estimators=120,
                        max_depth=18,
                        min_samples_leaf=4,
                        max_features="sqrt",
                        class_weight="balanced_subsample",
                        n_jobs=-1,
                        random_state=SEED,
                    ),
                ),
            ]
        ),
        "hist_gradient_boosting": HistGradientBoostingClassifier(
            learning_rate=0.08,
            max_iter=180,
            max_leaf_nodes=31,
            min_samples_leaf=30,
            l2_regularization=1.0,
            class_weight="balanced",
            random_state=SEED,
            categorical_features=list(range(CATEGORICAL_START, len(FEATURES))),
        ),
        "xgboost": xgb.XGBClassifier(
            n_estimators=500,
            max_depth=8,
            learning_rate=0.05,
            min_child_weight=5,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=2.0,
            objective="binary:logistic",
            eval_metric="aucpr",
            tree_method="hist",
            n_jobs=-1,
            random_state=SEED,
        ),
        "lightgbm": lgb.LGBMClassifier(
            n_estimators=500,
            num_leaves=63,
            learning_rate=0.05,
            min_child_samples=30,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=2.0,
            class_weight="balanced",
            n_jobs=-1,
            random_state=SEED,
            verbosity=-1,
        ),
    }
    selection: dict[str, dict[str, object]] = {}
    selection_probabilities: dict[str, np.ndarray] = {}
    calibrators: dict[str, LogisticRegression] = {}
    for name, model in candidates.items():
        candidate_started = time.perf_counter()
        print(f"Training {name}...", flush=True)
        model.fit(x_train, y_train)
        cal_probability = model.predict_proba(x_cal)[:, 1]
        select_probability = model.predict_proba(x_select)[:, 1]
        calibrator, calibrated_selection_probability = calibrate(
            y_cal, cal_probability, select_probability
        )
        calibrators[name] = calibrator
        selection_probabilities[name] = calibrated_selection_probability
        threshold = f1_threshold(y_select, calibrated_selection_probability)
        capacity_threshold, capacity_cost = capacity_constrained_cost_threshold(
            y_select,
            calibrated_selection_probability,
            max_review_rate=OPERATING_REVIEW_RATE,
        )
        capacity_metrics = metric_report(
            y_select, calibrated_selection_probability, capacity_threshold
        )
        selection[name] = {
            **metric_report(y_select, calibrated_selection_probability, threshold),
            "capacity_operating_point": {
                **capacity_metrics,
                "business_cost_inr": round(capacity_cost, 2),
                "acceptance": acceptance_report(capacity_metrics),
            },
            "training_seconds": round(time.perf_counter() - candidate_started, 3),
        }
        print(
            f"{name}: validation PR-AUC={selection[name]['pr_auc']} "
            f"capacity-cost=₹{capacity_cost:,.0f}",
            flush=True,
        )

    selected_name = min(
        selection,
        key=lambda name: float(
            selection[name]["capacity_operating_point"]["business_cost_inr"]
        ),
    )
    selected_model = candidates[selected_name]
    calibrator = calibrators[selected_name]
    selected_probability = selection_probabilities[selected_name]
    f1_cutoff = f1_threshold(y_select, selected_probability)
    cost_cutoff, validation_cost = cost_threshold(y_select, selected_probability)
    capacity_cutoff, capacity_validation_cost = capacity_constrained_cost_threshold(
        y_select, selected_probability, max_review_rate=OPERATING_REVIEW_RATE
    )
    print(f"Selected {selected_name}; evaluating locked test once...", flush=True)
    raw_test_probability = selected_model.predict_proba(x_test)[:, 1]
    test_probability = calibrated_predict(calibrator, raw_test_probability)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    artifact = args.output_dir / "model.joblib"
    joblib.dump(
        {
            "model": selected_model,
            "calibrator": calibrator,
            "features": FEATURES,
            "category_buckets": CATEGORY_BUCKETS,
            "schema_version": 1,
        },
        artifact,
        compress=3,
    )
    report = {
        "schema_version": 1,
        "created_at": datetime.now(UTC).isoformat(),
        "dataset": "IEEE-CIS Fraud Detection train_transaction + train_identity",
        "data_usage": {
            "commercial_production_authorized": False,
            "allowed_purposes": ["competition", "academic research", "education"],
            "source_rules": "https://www.kaggle.com/competitions/ieee-fraud-detection/rules",
        },
        "training_rows": len(y_train),
        "calibration_rows": len(y_cal),
        "selection_rows": len(y_select),
        "locked_test_rows": len(y_test),
        "feature_count": len(FEATURES),
        "split": "chronological 70/7.5/7.5/15 (train/calibration/selection/locked-test)",
        "candidate_validation_results": selection,
        "selection_metric": (
            "minimum validation business cost at a 4% operating review rate, "
            "reserving headroom below the 5% hard capacity"
        ),
        "selected_model": selected_name,
        "calibration": "Platt sigmoid fitted on first half of validation window",
        "thresholds": {
            "f1_optimal": round(f1_cutoff, 6),
            "cost_optimal": round(cost_cutoff, 6),
            "validation_cost_at_cost_optimal": round(validation_cost, 2),
            "capacity_constrained_cost_optimal": round(capacity_cutoff, 6),
            "validation_cost_at_capacity_constrained_optimal": round(
                capacity_validation_cost, 2
            ),
            "maximum_review_rate": MAX_REVIEW_RATE,
            "operating_review_rate": OPERATING_REVIEW_RATE,
            "illustrative_costs_inr": {
                "false_positive": 100,
                "false_negative": 5000,
                "review": 50,
            },
        },
        "locked_test_f1_threshold": metric_report(y_test, test_probability, f1_cutoff),
        "locked_test_cost_threshold": metric_report(
            y_test, test_probability, cost_cutoff
        ),
        "locked_test_capacity_threshold": metric_report(
            y_test, test_probability, capacity_cutoff
        ),
        "locked_test_acceptance": acceptance_report(
            metric_report(y_test, test_probability, capacity_cutoff)
        ),
        "artifact": str(artifact),
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "promotion_status": "candidate_only_not_connected_to_production_api",
    }
    report_path = args.output_dir / "training_report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
