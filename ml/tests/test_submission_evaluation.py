import pytest

from scripts.verify_submission_metrics import require_match


def test_submission_verifier_rejects_incorrect_metrics() -> None:
    with pytest.raises(ValueError, match="did not reproduce"):
        require_match({"precision": 0.5}, {"precision": 0.9}, "test")


def test_submission_verifier_requires_every_recorded_field() -> None:
    with pytest.raises(ValueError, match="did not reproduce"):
        require_match({"precision": 0.5}, {"precision": 0.5, "recall": 0.2}, "test")
    require_match({"precision": 0.5}, {"precision": 0.5}, "test")
