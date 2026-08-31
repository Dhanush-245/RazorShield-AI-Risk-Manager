import numpy as np

from ml.training.train_ieee_cis import capacity_constrained_cost_threshold
from ml.training.train_models import business_cost_report, cost_optimal_threshold


def test_business_cost_report_counts_reviews_and_error_costs() -> None:
    labels = np.asarray([0, 0, 1, 1])
    probabilities = np.asarray([0.1, 0.8, 0.2, 0.9])

    report = business_cost_report(
        labels,
        probabilities,
        threshold=0.5,
        costs={"false_positive": 100, "false_negative": 5_000, "manual_review": 50},
    )

    assert report == {
        "threshold": 0.5,
        "true_negative": 1,
        "false_positive": 1,
        "false_negative": 1,
        "true_positive": 1,
        "manual_reviews": 2,
        "total_cost_inr": 5_200.0,
        "cost_per_transaction_inr": 1_300.0,
    }


def test_cost_threshold_is_selected_only_from_supplied_evaluation_window() -> None:
    labels = np.asarray([0, 0, 0, 1, 1])
    probabilities = np.asarray([0.05, 0.10, 0.70, 0.20, 0.80])

    threshold = cost_optimal_threshold(
        labels,
        probabilities,
        costs={"false_positive": 100, "false_negative": 5_000, "manual_review": 50},
    )
    report = business_cost_report(labels, probabilities, threshold)

    assert 0.10 < threshold <= 0.20
    assert report["false_negative"] == 0


def test_capacity_threshold_never_splits_ties_or_exceeds_capacity() -> None:
    labels = np.asarray([1, 0, 1, 0, 0, 0, 0, 0, 0, 0])
    probabilities = np.asarray([0.9, 0.8, 0.8, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2])

    threshold, _ = capacity_constrained_cost_threshold(
        labels, probabilities, max_review_rate=0.30
    )
    predictions = probabilities >= threshold

    assert predictions.mean() <= 0.30
    assert predictions.sum() == 1
