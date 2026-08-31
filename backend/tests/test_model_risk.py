from datetime import UTC, datetime
from decimal import Decimal

from app.schemas.risk import RiskAssessmentRequest
from app.services.model_risk import (
    MAX_TRAINED_SHARED_DEVICE_ACCOUNTS,
    assess_with_models,
    calibrated_risk_index,
    feature_vector,
)


def test_trained_models_return_bounded_explainable_scores() -> None:
    result = assess_with_models(
        RiskAssessmentRequest(
            transaction_id="TX-MODEL-1",
            customer_id="CUS-1",
            merchant_id="MER-1",
            amount=Decimal("42000"),
            customer_average_amount=Decimal("3200"),
            transactions_last_5_minutes=8,
            transactions_last_hour=21,
            failed_attempts_last_10_minutes=5,
            is_new_device=True,
            is_new_location=True,
            shared_device_accounts=6,
            historical_return_rate=0.61,
        )
    )
    assert 0 <= result.score <= 100
    assert 0 <= result.fraud_probability <= 1
    assert 0 <= result.anomaly_score <= 1
    assert result.provenance == "SYNTHETIC"
    assert result.signals


def test_out_of_distribution_shared_device_count_is_clipped_to_training_support() -> None:
    payload = RiskAssessmentRequest(
        transaction_id="TX-OOD-GRAPH",
        customer_id="CUS-1",
        merchant_id="MER-1",
        amount=Decimal("4.80"),
        customer_average_amount=Decimal("87.03"),
        shared_device_accounts=404,
    )

    values = feature_vector(payload)

    assert values[0, 9] == MAX_TRAINED_SHARED_DEVICE_ACCOUNTS


def test_calibrated_risk_index_preserves_operating_threshold_bands() -> None:
    medium_threshold = 0.05
    high_threshold = 0.20

    assert calibrated_risk_index(0.0, medium_threshold, high_threshold) == 0
    assert calibrated_risk_index(medium_threshold, medium_threshold, high_threshold) == 31
    assert calibrated_risk_index(high_threshold, medium_threshold, high_threshold) == 71
    assert calibrated_risk_index(1.0, medium_threshold, high_threshold) == 100


def test_v3_model_sanity_scenarios_cover_all_risk_bands() -> None:
    common = {
        "customer_id": "CUS-SANITY",
        "merchant_id": "MER-SANITY",
        "timestamp": datetime(2026, 1, 1, 12, tzinfo=UTC),
    }
    low = assess_with_models(
        RiskAssessmentRequest(
            transaction_id="TX-SANITY-LOW",
            amount=Decimal("100"),
            customer_average_amount=Decimal("100"),
            transactions_last_hour=1,
            **common,
        )
    )
    medium = assess_with_models(
        RiskAssessmentRequest(
            transaction_id="TX-SANITY-MEDIUM",
            amount=Decimal("300"),
            customer_average_amount=Decimal("100"),
            transactions_last_5_minutes=3,
            transactions_last_hour=9,
            failed_attempts_last_10_minutes=1,
            is_new_device=True,
            shared_device_accounts=1,
            historical_return_rate=0.1,
            recipient_verified=True,
            recipient_used_before=True,
            recipient_risk_score=0.3,
            account_age_days=365,
            **common,
        )
    )
    high = assess_with_models(
        RiskAssessmentRequest(
            transaction_id="TX-SANITY-HIGH",
            amount=Decimal("42000"),
            customer_average_amount=Decimal("3200"),
            transactions_last_5_minutes=8,
            transactions_last_hour=21,
            failed_attempts_last_10_minutes=5,
            is_new_device=True,
            is_new_location=True,
            shared_device_accounts=6,
            historical_return_rate=0.61,
            **common,
        )
    )

    assert (low.level, medium.level, high.level) == ("LOW", "MEDIUM", "HIGH")
    assert high.versions == "fraud-v3/anomaly-v3/fusion-v3/return-v3"


def test_verified_education_context_is_safer_than_unknown_recipient() -> None:
    common = {
        "customer_id": "CUS-STUDENT",
        "merchant_id": "MER-CONTEXT",
        "amount": Decimal("120000"),
        "customer_average_amount": Decimal("100000"),
        "customer_age": 21,
        "account_age_days": 1095,
        "timestamp": datetime(2026, 8, 26, 11, tzinfo=UTC),
    }
    education = assess_with_models(
        RiskAssessmentRequest(
            transaction_id="TX-EDUCATION",
            recipient_id="ABC-UNIVERSITY",
            recipient_category="EDUCATION",
            transaction_intent="EDUCATION",
            recipient_verified=True,
            recipient_used_before=True,
            customer_recipient_transactions=3,
            recipient_risk_score=0.08,
            transactions_last_5_minutes=1,
            **common,
        )
    )
    unknown = assess_with_models(
        RiskAssessmentRequest(
            transaction_id="TX-UNKNOWN",
            recipient_id="UNKNOWN-991",
            recipient_category="UNKNOWN",
            transaction_intent="UNKNOWN",
            recipient_verified=False,
            recipient_used_before=False,
            recipient_risk_score=0.82,
            transactions_last_5_minutes=8,
            transactions_last_15_minutes=8,
            transactions_to_same_recipient_last_15_minutes=8,
            is_new_device=True,
            is_new_location=True,
            **common,
        )
    )

    assert education.contextual_adjustment < 0
    assert unknown.contextual_adjustment > 0
    assert education.score < unknown.score
    assert any(rule.code == "VERIFIED_EDUCATION_CONTEXT" and rule.fired for rule in education.rule_results)
    assert any(rule.code == "UNKNOWN_RECIPIENT_HIGH_AMOUNT" and rule.fired for rule in unknown.rule_results)


def test_age_alone_does_not_change_contextual_rules() -> None:
    common = {
        "customer_id": "CUS-AGE-CHECK",
        "merchant_id": "MER-CONTEXT",
        "amount": Decimal("5000"),
        "customer_average_amount": Decimal("5000"),
        "recipient_category": "UTILITY",
        "recipient_verified": True,
    }
    younger = assess_with_models(RiskAssessmentRequest(transaction_id="TX-AGE-17", customer_age=17, **common))
    older = assess_with_models(RiskAssessmentRequest(transaction_id="TX-AGE-45", customer_age=45, **common))

    assert younger.contextual_adjustment == older.contextual_adjustment
    assert abs(younger.score - older.score) <= 3
