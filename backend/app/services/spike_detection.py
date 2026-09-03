"""Event-time fraud-rate change detection with explicit sample sufficiency."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


def aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


@dataclass(frozen=True)
class SpikeWindow:
    status: str
    flag: bool
    current_rate: float
    baseline_rate: float
    score: int
    current_samples: int
    baseline_samples: int
    current_start: datetime | None
    current_end: datetime | None
    baseline_start: datetime | None
    baseline_end: datetime | None
    current_indexes: tuple[int, ...]

    def as_dict(self) -> dict[str, object]:
        return {
            "status": self.status,
            "flag": self.flag,
            "currentRate": self.current_rate,
            "baselineRate": self.baseline_rate,
            "score": self.score,
            "currentSamples": self.current_samples,
            "baselineSamples": self.baseline_samples,
            "currentWindow": [self.current_start.isoformat(), self.current_end.isoformat()]
            if self.current_start and self.current_end
            else None,
            "baselineWindow": [self.baseline_start.isoformat(), self.baseline_end.isoformat()]
            if self.baseline_start and self.baseline_end
            else None,
        }


def detect_spike(
    events: list[tuple[datetime, int]],
    *,
    current_minutes: int = 15,
    baseline_hours: int = 24,
    minimum_current: int = 5,
    minimum_baseline: int = 20,
    minimum_rate_increase: float = 0.25,
) -> SpikeWindow:
    """Compare the latest event-time window with its immediately preceding baseline."""

    if not events:
        return SpikeWindow("INSUFFICIENT_DATA", False, 0, 0, 0, 0, 0, None, None, None, None, ())
    normalized = [(aware(occurred_at), score, index) for index, (occurred_at, score) in enumerate(events)]
    anchor = max(occurred_at for occurred_at, _score, _index in normalized)
    current_start = anchor - timedelta(minutes=current_minutes)
    baseline_start = anchor - timedelta(hours=baseline_hours)
    current = [item for item in normalized if current_start < item[0] <= anchor]
    baseline = [item for item in normalized if baseline_start < item[0] <= current_start]
    current_rate = sum(score >= 71 for _time, score, _index in current) / max(len(current), 1)
    baseline_rate = sum(score >= 71 for _time, score, _index in baseline) / max(len(baseline), 1)
    sufficient = len(current) >= minimum_current and len(baseline) >= minimum_baseline
    increase = current_rate - baseline_rate
    flag = sufficient and increase > minimum_rate_increase
    return SpikeWindow(
        "SPIKE_DETECTED" if flag else "NOMINAL" if sufficient else "INSUFFICIENT_DATA",
        flag,
        current_rate,
        baseline_rate,
        round(max(0, increase) * 100),
        len(current),
        len(baseline),
        current_start,
        anchor,
        baseline_start,
        current_start,
        tuple(index for _time, _score, index in current),
    )
