from __future__ import annotations

from dataclasses import dataclass
from threading import Lock


@dataclass(frozen=True)
class MetricsSnapshot:
    requests: int
    errors: int
    average_latency_ms: float | None

    @property
    def error_rate(self) -> float | None:
        return self.errors / self.requests if self.requests else None


class OperationalMetrics:
    """Process-local telemetry; production exporters can consume the same snapshot."""

    def __init__(self) -> None:
        self._lock = Lock()
        self.reset()

    def record(self, status_code: int, latency_ms: float) -> None:
        with self._lock:
            self._requests += 1
            self._errors += int(status_code >= 500)
            self._total_latency_ms += max(latency_ms, 0.0)

    def snapshot(self) -> MetricsSnapshot:
        with self._lock:
            return MetricsSnapshot(
                requests=self._requests,
                errors=self._errors,
                average_latency_ms=(self._total_latency_ms / self._requests if self._requests else None),
            )

    def reset(self) -> None:
        with getattr(self, "_lock", Lock()):
            self._requests = 0
            self._errors = 0
            self._total_latency_ms = 0.0


operational_metrics = OperationalMetrics()
