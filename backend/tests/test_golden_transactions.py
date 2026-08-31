import json
from pathlib import Path

import pytest

from app.schemas.risk import RiskAssessmentRequest
from app.services.model_risk import assess_with_models

CASES = json.loads((Path(__file__).parent / "golden_transactions" / "cases.json").read_text())


@pytest.mark.parametrize("case", CASES, ids=[case["id"] for case in CASES])
def test_golden_transaction_properties(case: dict[str, object]) -> None:
    result = assess_with_models(RiskAssessmentRequest(**case["input"]))
    expected = case["expected"]
    assert result.level in expected["levels"]
    assert result.score >= expected.get("minimum_score", 0)
    assert result.score <= expected.get("maximum_score", 100)
    fired = {rule.code for rule in result.rule_results if rule.fired}
    assert fired >= set(expected.get("required_rules", []))


def test_same_transaction_is_deterministic() -> None:
    payload = RiskAssessmentRequest(**CASES[2]["input"])
    first = assess_with_models(payload)
    second = assess_with_models(payload)
    assert first.score == second.score
    assert first.fraud_probability == second.fraud_probability
    assert first.level == second.level
    assert first.signals == second.signals


def test_new_device_and_location_increase_risk_without_forcing_high_risk() -> None:
    known = dict(CASES[4]["input"])
    changed = {
        **known,
        "transaction_id": "GOLDEN-KNOWN-NEW-CONTEXT",
        "is_new_device": True,
        "is_new_location": True,
    }
    baseline = assess_with_models(RiskAssessmentRequest(**known))
    shifted = assess_with_models(RiskAssessmentRequest(**changed))
    assert shifted.score > baseline.score
    assert shifted.level != "HIGH"
