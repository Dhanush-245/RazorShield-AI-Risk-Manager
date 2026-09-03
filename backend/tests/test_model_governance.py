from app.services.model_governance import ieee_cis_promotion_evidence


def test_ieee_candidate_is_blocked_when_business_targets_are_not_met() -> None:
    evidence = ieee_cis_promotion_evidence()
    assert evidence["eligibleForSchemaSpecificPromotion"] is False
    assert evidence["gates"]["commercial_production_data_license"] is False
    assert evidence["gates"]["maximum_review_capacity"] is True
    assert evidence["gates"]["business_acceptance_targets"] is False
    assert evidence["servingStatus"] == "CANDIDATE"
    assert evidence["lockedTestMetrics"]["pr_auc"] == 0.536191
    assert evidence["dataUsage"]["commercialProductionAuthorized"] is False
