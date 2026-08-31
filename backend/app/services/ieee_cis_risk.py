from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import shap

from app.core.config import get_settings
from app.services.model_governance import ieee_cis_promotion_evidence

CATEGORY_BUCKETS = 128
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
FEATURES = [*NUMERIC_FEATURES, *DERIVED_FEATURES, *TRANSACTION_CATEGORICALS, *IDENTITY_CATEGORICALS]
CATEGORICAL_START = len(NUMERIC_FEATURES) + len(DERIVED_FEATURES)


def _numeric(value: object) -> float:
    if value in (None, ""):
        return math.nan
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return math.nan


def _stable_category(value: object) -> float:
    if value in (None, ""):
        return float(CATEGORY_BUCKETS)
    digest = hashlib.blake2b(str(value).encode("utf-8"), digest_size=4).digest()
    return float(int.from_bytes(digest, "little") % CATEGORY_BUCKETS)


@dataclass(frozen=True)
class IEEEPreprocessor:
    """Versioned transformation used by both offline training and online inference."""

    schema_version: int = 1
    category_buckets: int = CATEGORY_BUCKETS

    def transform(
        self,
        transaction: dict[str, Any],
        identity: dict[str, Any] | None = None,
    ) -> np.ndarray:
        required = {"TransactionID", "TransactionDT", "TransactionAmt", "ProductCD"}
        missing = sorted(name for name in required if transaction.get(name) in (None, ""))
        if missing:
            raise ValueError(f"Missing required IEEE-CIS fields: {missing}")
        transaction_dt = _numeric(transaction["TransactionDT"])
        amount = _numeric(transaction["TransactionAmt"])
        identity_values = identity or {}
        derived = [
            float((int(transaction_dt) // 3600) % 24),
            float(int(transaction_dt) // 86400),
            math.log1p(max(amount, 0.0)),
            float(identity is not None),
        ]
        row = (
            [_numeric(transaction.get(name)) for name in NUMERIC_FEATURES]
            + derived
            + [_stable_category(transaction.get(name)) for name in TRANSACTION_CATEGORICALS]
            + [_stable_category(identity_values.get(name)) for name in IDENTITY_CATEGORICALS]
        )
        return np.asarray([row], dtype=np.float32)


@dataclass(frozen=True)
class IEEEPrediction:
    transaction_id: str
    fraud_probability: float
    risk_score: int
    risk_level: str
    recommendation: str
    model_version: str
    threshold_profile: str
    explanation_method: str
    contributions: list[dict[str, float | str | None]]


@dataclass(frozen=True)
class IEEEBundle:
    model: object
    calibrator: object
    preprocessor: IEEEPreprocessor
    risk_config: dict[str, Any]
    feature_columns: dict[str, Any]
    explainer: object


def _calibrated_probability(calibrator: object, raw_probability: np.ndarray) -> np.ndarray:
    clipped = np.clip(raw_probability, 1e-6, 1 - 1e-6)
    logits = np.log(clipped / (1 - clipped)).reshape(-1, 1)
    return calibrator.predict_proba(logits)[:, 1]  # type: ignore[attr-defined, no-any-return]


@lru_cache
def load_ieee_bundle() -> IEEEBundle:
    governance = ieee_cis_promotion_evidence()
    if not governance["gates"]["artifact_integrity"]:
        raise RuntimeError("IEEE-CIS artifact integrity verification failed")
    artifact_dir = Path(get_settings().ieee_cis_model_dir).resolve()
    required = {
        "fraud_model": artifact_dir / "fraud_model.pkl",
        "calibrator": artifact_dir / "calibrator.pkl",
        "preprocessor": artifact_dir / "preprocessing_pipeline.pkl",
        "risk_config": artifact_dir / "risk_config.json",
        "feature_columns": artifact_dir / "feature_columns.json",
    }
    missing = [path.name for path in required.values() if not path.is_file()]
    if missing:
        raise RuntimeError(f"IEEE-CIS candidate artifacts are unavailable: {', '.join(missing)}")
    preprocessor = joblib.load(required["preprocessor"])
    if not isinstance(preprocessor, IEEEPreprocessor):
        raise RuntimeError("IEEE-CIS preprocessing artifact has an incompatible type")
    feature_columns = json.loads(required["feature_columns"].read_text())
    if feature_columns.get("ordered_features") != FEATURES:
        raise RuntimeError("IEEE-CIS feature contract does not match the inference service")
    model = joblib.load(required["fraud_model"])
    calibrator = joblib.load(required["calibrator"])
    baseline = np.zeros((1, len(FEATURES)), dtype=np.float32)
    baseline[:, :CATEGORICAL_START] = np.nan
    baseline[:, CATEGORICAL_START:] = CATEGORY_BUCKETS

    def calibrated_model(values: np.ndarray) -> np.ndarray:
        raw = model.predict_proba(values)[:, 1]
        return _calibrated_probability(calibrator, raw)

    return IEEEBundle(
        model=model,
        calibrator=calibrator,
        preprocessor=preprocessor,
        risk_config=json.loads(required["risk_config"].read_text()),
        feature_columns=feature_columns,
        explainer=shap.Explainer(calibrated_model, baseline, algorithm="permutation"),
    )


def predict_ieee_transaction(
    transaction: dict[str, Any],
    identity: dict[str, Any] | None = None,
) -> IEEEPrediction:
    bundle = load_ieee_bundle()
    values = bundle.preprocessor.transform(transaction, identity)
    raw = bundle.model.predict_proba(values)[:, 1]  # type: ignore[attr-defined]
    probability = float(_calibrated_probability(bundle.calibrator, raw)[0])
    low = float(bundle.risk_config["low_threshold"])
    high = float(bundle.risk_config["high_threshold"])
    if probability >= high:
        risk_level, recommendation = "HIGH", "MANUAL_REVIEW"
    elif probability >= low:
        risk_level, recommendation = "MEDIUM", "REQUEST_VERIFICATION"
    else:
        risk_level, recommendation = "LOW", "ALLOW"
    explanation = bundle.explainer(  # type: ignore[operator]
        values,
        max_evals=2 * len(FEATURES) + 1,
    )
    shap_values = np.asarray(explanation.values)[0]
    top_indices = np.argsort(np.abs(shap_values))[::-1][:8]
    contributions = [
        {
            "feature": FEATURES[int(index)],
            "shap_value": round(float(shap_values[index]), 6),
            "direction": "increases_risk" if shap_values[index] >= 0 else "decreases_risk",
            "raw_value": (None if math.isnan(float(values[0, index])) else round(float(values[0, index]), 6)),
        }
        for index in top_indices
    ]
    return IEEEPrediction(
        transaction_id=str(transaction["TransactionID"]),
        fraud_probability=probability,
        risk_score=round(probability * 100),
        risk_level=risk_level,
        recommendation=recommendation,
        model_version=str(bundle.risk_config["model_version"]),
        threshold_profile=str(bundle.risk_config["active_profile"]),
        explanation_method=(
            "Permutation SHAP on calibrated probability relative to documented missing-input baseline"
        ),
        contributions=contributions,
    )
