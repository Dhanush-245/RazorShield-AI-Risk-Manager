from pathlib import Path

import numpy as np
import pytest

from app.core.config import get_settings
from app.services.ieee_cis_risk import (
    FEATURES,
    IEEEPreprocessor,
    load_ieee_bundle,
    predict_ieee_transaction,
)


def minimal_transaction() -> dict[str, object]:
    return {
        "TransactionID": "TEST-IEEE-1",
        "TransactionDT": 13_200_000,
        "TransactionAmt": 125.50,
        "ProductCD": "W",
        "card1": 12_345,
        "card4": "visa",
        "card6": "debit",
    }


def test_ieee_preprocessor_enforces_contract_and_shape() -> None:
    preprocessor = IEEEPreprocessor()
    values = preprocessor.transform(minimal_transaction())
    assert values.shape == (1, len(FEATURES))
    with pytest.raises(ValueError, match="ProductCD"):
        preprocessor.transform({"TransactionID": "X", "TransactionDT": 1, "TransactionAmt": 1})


@pytest.mark.skipif(
    not (Path(get_settings().ieee_cis_model_dir) / "fraud_model.pkl").is_file(),
    reason="Optional licensed-data candidate binaries are not bundled in the public demo",
)
def test_packaged_ieee_candidate_reloads_and_scores() -> None:
    load_ieee_bundle.cache_clear()
    prediction = predict_ieee_transaction(minimal_transaction())
    assert 0 <= prediction.fraud_probability <= 1
    assert 0 <= prediction.risk_score <= 100
    assert prediction.risk_level in {"LOW", "MEDIUM", "HIGH"}
    assert prediction.model_version == "ieee-cis-xgboost-v2"
    assert prediction.explanation_method.startswith("Permutation SHAP on calibrated probability")
    assert len(prediction.contributions) == 8
    assert all(item["feature"] in FEATURES for item in prediction.contributions)


@pytest.mark.skipif(
    not (Path(get_settings().ieee_cis_model_dir) / "fraud_model.pkl").is_file(),
    reason="Optional licensed-data candidate binaries are not bundled in the public demo",
)
def test_permutation_shap_reconstructs_the_calibrated_probability() -> None:
    bundle = load_ieee_bundle()
    values = bundle.preprocessor.transform(minimal_transaction())
    explanation = bundle.explainer(values, max_evals=2 * len(FEATURES) + 1)
    reconstructed_probability = float(
        np.asarray(explanation.base_values).reshape(-1)[0] + np.asarray(explanation.values).sum()
    )
    prediction = predict_ieee_transaction(minimal_transaction())
    assert reconstructed_probability == pytest.approx(prediction.fraud_probability, abs=1e-8)
