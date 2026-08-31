from decimal import Decimal

from app.schemas.risk import RiskAssessmentRequest
from app.services.baseline_risk import assess_with_baseline


def test_baseline_is_derived_from_supplied_evidence() -> None:
    result = assess_with_baseline(
        RiskAssessmentRequest(
            transaction_id="TX-1",
            customer_id="CUS-1",
            merchant_id="MER-1",
            amount=Decimal("42000"),
            customer_average_amount=Decimal("3200"),
            transactions_last_5_minutes=8,
            failed_attempts_last_10_minutes=5,
            is_new_device=True,
            is_new_location=True,
        )
    )
    assert result.score == 100
    assert result.level == "HIGH"
    assert result.recommended_action == "MANUAL_REVIEW"
    assert {signal.code for signal in result.signals} >= {
        "AMOUNT_DEVIATION_CRITICAL",
        "VELOCITY_CRITICAL",
        "NEW_DEVICE",
    }


def test_baseline_does_not_claim_risk_without_signals() -> None:
    result = assess_with_baseline(
        RiskAssessmentRequest(
            transaction_id="TX-2",
            customer_id="CUS-2",
            merchant_id="MER-1",
            amount=Decimal("500"),
        )
    )
    assert result.score == 0
    assert result.level == "LOW"
    assert result.signals[0].code == "NO_BASELINE_RULE_TRIGGERED"
