from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from app.core.config import get_settings


def _read_json(directory: Path, name: str) -> dict[str, Any]:
    path = directory / name
    if not path.is_file():
        raise RuntimeError(f"Required model governance artifact is missing: {name}")
    return json.loads(path.read_text())


def ieee_cis_promotion_evidence() -> dict[str, Any]:
    """Evaluate immutable evidence; never promotes a model by itself."""

    directory = Path(get_settings().ieee_cis_model_dir).resolve()
    manifest = _read_json(directory, "artifact_manifest.json")
    report = _read_json(directory, "training_report.json")
    contract = _read_json(directory, "feature_columns.json")
    integrity_failures: list[str] = []
    for name, metadata in manifest.get("files", {}).items():
        if name == "artifact_manifest.json":  # accepted for the legacy v1 package
            continue
        path = directory / name
        if not path.is_file():
            integrity_failures.append(f"{name}:missing")
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != metadata.get("sha256") or path.stat().st_size != metadata.get("bytes"):
            integrity_failures.append(f"{name}:checksum_or_size_mismatch")

    locked = report.get("locked_test_f1_threshold", {})
    capacity = report.get("locked_test_capacity_threshold", {})
    acceptance = report.get("locked_test_acceptance", {})
    data_usage = report.get("data_usage", {})
    gates = {
        "artifact_integrity": not integrity_failures,
        "commercial_production_data_license": bool(data_usage.get("commercial_production_authorized", False)),
        "locked_temporal_test": (
            "chronological" in str(report.get("split", "")).lower()
            and int(report.get("locked_test_rows", 0)) >= 50_000
        ),
        "minimum_pr_auc": float(locked.get("pr_auc", 0)) >= 0.40,
        "minimum_roc_auc": float(locked.get("roc_auc", 0)) >= 0.85,
        "maximum_false_positive_rate": float(locked.get("false_positive_rate", 1)) <= 0.05,
        "maximum_review_capacity": float(capacity.get("alert_rate", 1)) <= 0.05,
        "business_acceptance_targets": bool(acceptance.get("all_targets_met", False)),
        "feature_contract": (
            int(report.get("feature_count", 0)) == len(contract.get("ordered_features", []))
            and bool(contract.get("required_request_fields"))
        ),
        "human_action_boundary": _read_json(directory, "risk_config.json").get("automatic_financial_action")
        is False,
    }
    eligible = all(gates.values())
    operator_status = get_settings().ieee_cis_promotion_status.lower()
    return {
        "modelVersion": manifest.get("model_version"),
        "eligibleForSchemaSpecificPromotion": eligible,
        "operatorDecision": operator_status.upper(),
        "servingStatus": "APPROVED" if eligible and operator_status == "approved" else "CANDIDATE",
        "gates": gates,
        "integrityFailures": integrity_failures,
        "lockedTestMetrics": locked,
        "lockedCapacityMetrics": capacity,
        "businessAcceptance": acceptance,
        "dataUsage": {
            "commercialProductionAuthorized": bool(data_usage.get("commercial_production_authorized", False)),
            "allowedPurposes": data_usage.get(
                "allowed_purposes", ["competition", "academic research", "education"]
            ),
            "sourceRules": data_usage.get(
                "source_rules",
                "https://www.kaggle.com/competitions/ieee-fraud-detection/rules",
            ),
        },
        "warning": (
            "Eligibility is not production approval. Commercial data rights, representative merchant "
            "validation, capacity, fairness, drift, and rollback sign-off remain required."
        ),
    }
