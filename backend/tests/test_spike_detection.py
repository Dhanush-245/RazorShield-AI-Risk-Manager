"""Regression tests for event-time spike detection."""

from datetime import UTC, datetime, timedelta

from app.services.spike_detection import detect_spike


def test_spike_uses_time_windows_and_requires_support():
    anchor = datetime(2026, 9, 1, 12, tzinfo=UTC)
    baseline = [(anchor - timedelta(hours=1, minutes=index), 10) for index in range(20)]
    current = [(anchor - timedelta(minutes=index), 90) for index in range(5)]
    result = detect_spike(current + baseline)
    assert result.status == "SPIKE_DETECTED"
    assert result.flag is True
    assert result.current_samples == 5
    assert result.baseline_samples == 20
    assert result.current_rate == 1
    assert result.baseline_rate == 0


def test_spike_does_not_claim_nominal_when_samples_are_missing():
    anchor = datetime(2026, 9, 1, 12, tzinfo=UTC)
    result = detect_spike([(anchor - timedelta(minutes=index), 90) for index in range(4)])
    assert result.status == "INSUFFICIENT_DATA"
    assert result.flag is False
    assert result.current_rate == 1


def test_events_outside_baseline_do_not_change_rate():
    anchor = datetime(2026, 9, 1, 12, tzinfo=UTC)
    current = [(anchor - timedelta(minutes=index), 10) for index in range(5)]
    baseline = [(anchor - timedelta(hours=1, minutes=index), 10) for index in range(20)]
    old_high_risk = [(anchor - timedelta(days=2, minutes=index), 100) for index in range(50)]
    result = detect_spike(old_high_risk + baseline + current)
    assert result.status == "NOMINAL"
    assert result.baseline_rate == 0
    assert result.current_rate == 0
