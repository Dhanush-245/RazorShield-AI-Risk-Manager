from app.services.operational_metrics import OperationalMetrics


def test_operational_metrics_records_latency_and_server_errors() -> None:
    metrics = OperationalMetrics()
    metrics.record(201, 10)
    metrics.record(422, 20)
    metrics.record(503, 30)
    snapshot = metrics.snapshot()
    assert snapshot.requests == 3
    assert snapshot.errors == 1
    assert snapshot.error_rate == 1 / 3
    assert snapshot.average_latency_ms == 20
