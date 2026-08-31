from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

import joblib
import numpy as np
from app.services.ieee_cis_risk import (
    DERIVED_FEATURES,
    FEATURES,
    IDENTITY_CATEGORICALS,
    NUMERIC_FEATURES,
    TRANSACTION_CATEGORICALS,
    IEEEPreprocessor,
)
from sklearn.metrics import confusion_matrix, precision_score, recall_score

from ml.training.train_ieee_cis import (
    calibrated_predict,
    load_identity,
    load_transactions,
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def threshold_row(
    labels: np.ndarray,
    probabilities: np.ndarray,
    threshold: float,
    fp_cost: float,
    fn_cost: float,
    review_cost: float,
) -> dict[str, float | int]:
    predictions = probabilities >= threshold
    tn, fp, fn, tp = confusion_matrix(labels, predictions, labels=[0, 1]).ravel()
    reviews = int(predictions.sum())
    return {
        "threshold": round(threshold, 6),
        "precision": round(
            float(precision_score(labels, predictions, zero_division=0)), 6
        ),
        "recall": round(float(recall_score(labels, predictions, zero_division=0)), 6),
        "false_positive_rate": round(float(fp / max(fp + tn, 1)), 6),
        "alert_rate": round(float(predictions.mean()), 6),
        "tn": int(tn),
        "fp": int(fp),
        "fn": int(fn),
        "tp": int(tp),
        "business_cost_inr": round(
            fp * fp_cost + fn * fn_cost + reviews * review_cost, 2
        ),
    }


def recall_floor_threshold(
    labels: np.ndarray,
    probabilities: np.ndarray,
    target_recall: float,
) -> float:
    candidates = np.unique(np.quantile(probabilities, np.linspace(0.001, 0.999, 2_000)))
    eligible = [
        float(value)
        for value in candidates
        if recall_score(labels, probabilities >= value, zero_division=0)
        >= target_recall
    ]
    return max(eligible) if eligible else float(candidates[0])


def write_model_card(
    path: Path, report: dict[str, object], risk: dict[str, object]
) -> None:
    test = report["locked_test_f1_threshold"]
    assert isinstance(test, dict)
    path.write_text(
        "\n".join(
            [
                f"# {risk['model_version']}",
                "",
                "## Intended use",
                "",
                "Offline/candidate scoring of rows that satisfy the IEEE-CIS feature contract. ",
                "The artifact is not approved for automatic financial action.",
                "",
                "## Evaluation",
                "",
                f"- Temporal locked-test rows: {report['locked_test_rows']:,}",
                f"- PR-AUC: {test['pr_auc']}",
                f"- ROC-AUC: {test['roc_auc']}",
                f"- Precision: {test['precision']}",
                f"- Recall: {test['recall']}",
                f"- F1: {test['f1']}",
                f"- False-positive rate: {test['false_positive_rate']}",
                "",
                "## Thresholds",
                "",
                f"- Medium-risk threshold: {risk['low_threshold']}",
                f"- High-risk/review threshold: {risk['high_threshold']}",
                f"- Alternate cost-sensitive threshold: {risk['profiles']['cost_sensitive']['threshold']}",
                "",
                "## Limitations",
                "",
                "- IEEE-CIS fields are anonymized and do not directly match the ordinary merchant API.",
                "- Identity coverage in the audited training data is 24.42%.",
                "- Cost assumptions are illustrative and require merchant approval.",
                "- Explanations use verified model-agnostic permutation SHAP on the final calibrated probability.",
                "- Human review is required before consequential action.",
                "",
            ]
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Package the trained IEEE-CIS candidate"
    )
    parser.add_argument("--bundle-dir", type=Path, required=True)
    parser.add_argument("--transactions", type=Path, required=True)
    parser.add_argument("--identity", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    bundle = joblib.load(args.bundle_dir / "model.joblib")
    report = json.loads((args.bundle_dir / "training_report.json").read_text())
    model_version = f"ieee-cis-{report['selected_model']}-v2"
    identities = load_identity(args.identity)
    values, labels = load_transactions(args.transactions, identities)
    train_end = int(len(labels) * 0.70)
    validation_end = int(len(labels) * 0.85)
    validation_mid = train_end + (validation_end - train_end) // 2
    selection_values = values[validation_mid:validation_end]
    selection_labels = labels[validation_mid:validation_end]
    raw = bundle["model"].predict_proba(selection_values)[:, 1]
    probabilities = calibrated_predict(bundle["calibrator"], raw)
    costs = {"false_positive": 100.0, "false_negative": 5000.0, "manual_review": 50.0}
    grid = [
        threshold_row(
            selection_labels,
            probabilities,
            threshold,
            costs["false_positive"],
            costs["false_negative"],
            costs["manual_review"],
        )
        for threshold in np.arange(0.10, 0.91, 0.05)
    ]
    medium = recall_floor_threshold(selection_labels, probabilities, 0.70)
    high = float(report["thresholds"]["capacity_constrained_cost_optimal"])
    balanced = float(report["thresholds"]["f1_optimal"])
    cost_sensitive = float(report["thresholds"]["cost_optimal"])
    risk_config = {
        "schema_version": 1,
        "model_version": model_version,
        "active_profile": "capacity_constrained_cost",
        "low_threshold": round(medium, 6),
        "high_threshold": round(high, 6),
        "review_threshold": round(high, 6),
        "profiles": {
            "balanced_f1": {
                "threshold": round(balanced, 6),
                "objective": "maximum validation F1",
            },
            "cost_sensitive": {
                "threshold": round(cost_sensitive, 6),
                "objective": "minimum illustrative validation business cost",
                "costs_inr": costs,
            },
            "capacity_constrained_cost": {
                "threshold": round(high, 6),
                "objective": (
                    "minimum validation business cost at a 4% operating review rate "
                    "with a 5% hard capacity"
                ),
                "operating_review_rate": 0.04,
                "maximum_review_rate": 0.05,
                "costs_inr": costs,
            },
        },
        "medium_threshold_objective": "highest validation threshold retaining at least 70% recall",
        "automatic_financial_action": False,
    }
    feature_contract = {
        "schema_version": 1,
        "ordered_features": FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "derived_features": DERIVED_FEATURES,
        "transaction_categoricals": TRANSACTION_CATEGORICALS,
        "identity_categoricals": IDENTITY_CATEGORICALS,
        "required_request_fields": [
            "TransactionID",
            "TransactionDT",
            "TransactionAmt",
            "ProductCD",
        ],
        "categorical_encoding": "blake2b_32bit_mod_128; missing_bucket_128",
        "missing_numeric": "IEEE-CIS NaN preserved for tree models",
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle["model"], args.output_dir / "fraud_model.pkl", compress=3)
    joblib.dump(bundle["calibrator"], args.output_dir / "calibrator.pkl", compress=3)
    joblib.dump(
        IEEEPreprocessor(), args.output_dir / "preprocessing_pipeline.pkl", compress=3
    )
    (args.output_dir / "feature_columns.json").write_text(
        json.dumps(feature_contract, indent=2) + "\n"
    )
    (args.output_dir / "risk_config.json").write_text(
        json.dumps(risk_config, indent=2) + "\n"
    )
    (args.output_dir / "threshold_analysis.json").write_text(
        json.dumps(
            {
                "source": "second half of chronological validation window",
                "rows": len(selection_labels),
                "fraud_rows": int(selection_labels.sum()),
                "costs_inr": costs,
                "thresholds": grid,
            },
            indent=2,
        )
        + "\n"
    )
    shutil.copyfile(
        args.bundle_dir / "training_report.json",
        args.output_dir / "training_report.json",
    )
    write_model_card(args.output_dir / "MODEL_CARD.md", report, risk_config)
    artifact_paths = sorted(
        path
        for path in args.output_dir.iterdir()
        if path.is_file() and path.name != "artifact_manifest.json"
    )
    manifest = {
        "schema_version": 1,
        "model_version": model_version,
        "files": {
            path.name: {"sha256": sha256(path), "bytes": path.stat().st_size}
            for path in artifact_paths
        },
    }
    (args.output_dir / "artifact_manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )
    print(json.dumps({"output_dir": str(args.output_dir), **risk_config}, indent=2))


if __name__ == "__main__":
    main()
