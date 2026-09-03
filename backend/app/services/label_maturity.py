"""Outcome-label observation and maturity rules shared by training and evaluation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta


def aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def observed_at(
    label: bool | None, supplied: datetime | None, now: datetime | None = None
) -> datetime | None:
    """Record when a supplied outcome entered RazorShield; never invent an outcome."""

    if label is None:
        return None
    return aware(supplied) if supplied else now or datetime.now(UTC)


def is_mature_label(
    occurred_at: datetime,
    label_observed_at: datetime | None,
    *,
    maturity_days: int,
    as_of: datetime | None = None,
) -> bool:
    """Require a complete observation horizon before using an outcome in metrics or training."""

    if label_observed_at is None:
        return False
    occurred = aware(occurred_at)
    observed = aware(label_observed_at)
    current = as_of or datetime.now(UTC)
    return observed <= current and observed >= occurred + timedelta(days=maturity_days)
