"""Outcome labels must finish their observation horizon before model use."""

from datetime import UTC, datetime

from app.services.label_maturity import is_mature_label, observed_at


def test_maturity_requires_observation_after_full_window():
    occurred = datetime(2026, 1, 1, tzinfo=UTC)
    assert not is_mature_label(
        occurred,
        datetime(2026, 2, 14, tzinfo=UTC),
        maturity_days=45,
        as_of=datetime(2026, 5, 1, tzinfo=UTC),
    )
    assert is_mature_label(
        occurred,
        datetime(2026, 2, 15, tzinfo=UTC),
        maturity_days=45,
        as_of=datetime(2026, 5, 1, tzinfo=UTC),
    )


def test_future_or_missing_observations_are_never_mature():
    occurred = datetime(2026, 1, 1, tzinfo=UTC)
    assert not is_mature_label(occurred, None, maturity_days=45)
    assert not is_mature_label(
        occurred,
        datetime(2027, 1, 1, tzinfo=UTC),
        maturity_days=45,
        as_of=datetime(2026, 5, 1, tzinfo=UTC),
    )
    assert observed_at(None, None) is None
