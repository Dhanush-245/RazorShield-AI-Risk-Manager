"""Re-score frozen local artifacts; never fit models, promote, or overwrite training reports.

Only load trusted project artifacts. Optional IEEE inputs must be licensed locally.
JSON output contains aggregate metrics/hashes, never source rows or personal data.
"""

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import joblib
import numpy as np

from ml.training import train_ieee_cis as ieee
from ml.training import train_models as synthetic

ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def require_match(actual: dict, expected: dict, label: str) -> None:
    differences = {
        key: {"actual": actual.get(key), "expected": value}
        for key, value in expected.items()
        if actual.get(key) != value
    }
    if differences:
        raise ValueError(f"{label} did not reproduce: {differences}")


def verify_synthetic() -> dict:
    directory = ROOT / "ml/artifacts"
    manifest = json.loads((directory / "manifest.json").read_text())
    dataset = manifest["dataset"]
    if (
        dataset["split"] != "temporal_60_20_20"
        or manifest["features"] != synthetic.FEATURES
    ):
        raise ValueError("Unsupported synthetic split or feature contract")
    rows = synthetic.generate_dataset(dataset["rows"], dataset["generator_seed"])
    train_end = dataset["train_rows"]
    test_start = train_end + dataset["validation_rows"]
    validation, test = rows[train_end:test_start], rows[test_start:]
    if len(test) != dataset["held_out_rows"]:
        raise ValueError("Held-out row count differs from manifest")
    x_validation, x_test = synthetic.matrix(validation), synthetic.matrix(test)
    y_validation = np.asarray([int(row["fraud"]) for row in validation])
    y_test = np.asarray([int(row["fraud"]) for row in test])
    models = {
        name: joblib.load(directory / manifest[name]["artifact"])
        for name in ("fraud", "anomaly", "fusion", "return")
    }
    fraud_validation = models["fraud"].predict_proba(x_validation)[:, 1]
    fraud_test = models["fraud"].predict_proba(x_test)[:, 1]
    fusion_validation = models["fusion"].predict_proba(
        synthetic.supporting_components(
            x_validation, fraud_validation, models["anomaly"]
        )
    )[:, 1]
    fusion_test = models["fusion"].predict_proba(
        synthetic.supporting_components(x_test, fraud_test, models["anomaly"])
    )[:, 1]
    # Reproduce the recorded validation selection, never optimize using test labels.
    fraud_threshold = synthetic.best_threshold(y_validation, fraud_validation)
    fusion_threshold = synthetic.best_threshold(y_validation, fusion_validation)
    medium_threshold = synthetic.medium_threshold(
        y_validation, fusion_validation, fusion_threshold
    )
    costs = manifest["fusion"]["business_cost_analysis"]["illustrative_costs"]
    cost_threshold = synthetic.cost_optimal_threshold(
        y_validation, fusion_validation, costs
    )
    return_threshold = synthetic.best_threshold(
        np.asarray([int(row["returned"]) for row in validation]),
        models["return"].predict_proba(x_validation)[:, 1],
    )
    for actual, expected in (
        (fraud_threshold, manifest["fraud"]["threshold"]),
        (fusion_threshold, manifest["fusion"]["high_threshold"]),
        (medium_threshold, manifest["fusion"]["medium_threshold"]),
        (return_threshold, manifest["return"]["threshold"]),
    ):
        if round(actual, 4) != expected:
            raise ValueError("Validation threshold differs from frozen manifest")
    results = {
        "fraud": synthetic.metrics(y_test, fraud_test, fraud_threshold),
        "anomaly": synthetic.metrics(
            y_test,
            1 / (1 + np.exp(6 * models["anomaly"].decision_function(x_test))),
            0.5,
        ),
        "fusion": synthetic.metrics(y_test, fusion_test, fusion_threshold),
        "return": synthetic.metrics(
            np.asarray([int(row["returned"]) for row in test]),
            models["return"].predict_proba(x_test)[:, 1],
            return_threshold,
        ),
    }
    for name, result in results.items():
        require_match(result, manifest[name]["metrics"], name)
    require_match(
        synthetic.metrics(y_test, fusion_test, medium_threshold),
        manifest["fusion"]["medium_metrics"],
        "fusion medium",
    )
    cost_results = {
        "validation_at_cost_threshold": synthetic.business_cost_report(
            y_validation, fusion_validation, cost_threshold, costs
        ),
        "locked_test_at_f1_threshold": synthetic.business_cost_report(
            y_test, fusion_test, fusion_threshold, costs
        ),
        "locked_test_at_cost_threshold": synthetic.business_cost_report(
            y_test, fusion_test, cost_threshold, costs
        ),
        "locked_test_always_allow_baseline": synthetic.business_cost_report(
            y_test, np.zeros_like(fusion_test), 0.5, costs
        ),
    }
    for name, result in cost_results.items():
        require_match(result, manifest["fusion"]["business_cost_analysis"][name], name)
    return {
        "status": "PASS",
        "provenance": "SYNTHETIC",
        "dataset": dataset,
        "metrics": results,
        "illustrative_costs_inr": costs,
        "business_cost": cost_results,
        "runtime_rounded_high_threshold": manifest["fusion"]["high_threshold"],
        "runtime_rounded_threshold_model_metrics": synthetic.metrics(
            y_test, fusion_test, manifest["fusion"]["high_threshold"]
        ),
        "sha256": {
            path.name: digest(path)
            for path in [
                directory / "manifest.json",
                *[directory / manifest[name]["artifact"] for name in models],
            ]
        },
        "limitation": "Frozen estimator evaluation, not full API enrichment/rule-overlay performance; synthetic only.",
    }


def verify_ieee(transactions: Path, identity: Path) -> dict:
    directory = ROOT / "ml/artifacts/ieee_cis_v2"
    manifest = json.loads((directory / "artifact_manifest.json").read_text())
    for name, metadata in manifest["files"].items():
        if digest(directory / name) != metadata["sha256"]:
            raise ValueError(f"IEEE artifact checksum mismatch: {name}")
    report = json.loads((directory / "training_report.json").read_text())
    model = joblib.load(directory / "fraud_model.pkl")
    calibrator = joblib.load(directory / "calibrator.pkl")
    x, y = ieee.load_transactions(transactions, ieee.load_identity(identity))
    total = sum(
        report[key]
        for key in (
            "training_rows",
            "calibration_rows",
            "selection_rows",
            "locked_test_rows",
        )
    )
    if len(y) != total:
        raise ValueError("IEEE source row count differs from frozen report")
    start = total - report["locked_test_rows"]
    probabilities = ieee.calibrated_predict(
        calibrator, model.predict_proba(x[start:])[:, 1]
    )
    selection_start = report["training_rows"] + report["calibration_rows"]
    selection_y = y[selection_start:start]
    selection_p = ieee.calibrated_predict(
        calibrator, model.predict_proba(x[selection_start:start])[:, 1]
    )
    # Reconstruct validation-selected full precision; report exported rounding separately.
    thresholds = {
        "f1": ieee.f1_threshold(selection_y, selection_p),
        "cost": ieee.cost_threshold(selection_y, selection_p)[0],
        "capacity": ieee.capacity_constrained_cost_threshold(
            selection_y,
            selection_p,
            max_review_rate=report["thresholds"]["operating_review_rate"],
        )[0],
    }
    profiles = {}
    exported_profiles = {}
    costs = report["thresholds"]["illustrative_costs_inr"]
    for profile in ("f1", "cost", "capacity"):
        saved = report[f"locked_test_{profile}_threshold"]
        if round(thresholds[profile], 6) != saved["threshold"]:
            raise ValueError(f"IEEE {profile} validation threshold differs from report")
        actual = ieee.metric_report(y[start:], probabilities, thresholds[profile])
        require_match(actual, saved, f"IEEE {profile}")
        exported_profiles[profile] = ieee.metric_report(
            y[start:], probabilities, saved["threshold"]
        )
        _tn, fp, fn, tp = actual["confusion_matrix_tn_fp_fn_tp"]
        profiles[profile] = {
            **actual,
            "business_cost_inr": fp * costs["false_positive"]
            + fn * costs["false_negative"]
            + (fp + tp) * costs["review"],
        }
    return {
        "status": "PASS",
        "model": manifest["model_version"],
        "split": report["split"],
        "locked_test_rows": report["locked_test_rows"],
        "profiles": profiles,
        "exported_six_decimal_threshold_profiles": exported_profiles,
        "threshold_precision_note": "Historical metrics use full-precision validation thresholds; exported six-decimal thresholds can change boundary decisions. Neither model nor threshold artifacts were modified.",
        "illustrative_costs_inr": costs,
        "always_allow_cost_inr": int(y[start:].sum()) * costs["false_negative"],
        "sha256": {
            "train_transaction.csv": digest(transactions),
            "train_identity.csv": digest(identity),
            "artifact_manifest.json": digest(directory / "artifact_manifest.json"),
        },
        "promotion": report["promotion_status"],
        "acceptance": report["locked_test_acceptance"],
        "limitation": "Previously evaluated locked holdout replay, not a new unseen test or merchant production result. Costs are illustrative, not actual savings.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transactions", type=Path)
    parser.add_argument("--identity", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if bool(args.transactions) != bool(args.identity):
        parser.error("Supply both IEEE source files, or neither")
    report = {
        "checked_at": datetime.now(UTC).isoformat(),
        "synthetic": verify_synthetic(),
    }
    report["ieee"] = (
        verify_ieee(args.transactions, args.identity)
        if args.transactions
        else {"status": "NOT_RUN", "reason": "Licensed IEEE inputs not supplied"}
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Synthetic: PASS; IEEE: {report['ieee']['status']}. Aggregate report: {args.output}"
    )


if __name__ == "__main__":
    main()
