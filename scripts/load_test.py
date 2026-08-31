#!/usr/bin/env python3
"""Authenticated 10/100/1,000 transaction load probe for a running RazorShield API."""

from __future__ import annotations

import argparse
import json
import statistics
import time
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass

import httpx


@dataclass(frozen=True)
class LoadResult:
    transactions: int
    concurrency: int
    duration_seconds: float
    throughput_per_second: float
    latency_p50_ms: float
    latency_p95_ms: float
    latency_p99_ms: float
    errors: int
    error_rate: float
    status_counts: dict[str, int]


def percentile(values: list[float], quantile: float) -> float:
    ordered = sorted(values)
    index = min(round((len(ordered) - 1) * quantile), len(ordered) - 1)
    return ordered[index]


def login(base_url: str, identifier: str, password: str) -> tuple[str, str]:
    response = httpx.post(
        f"{base_url}/api/v1/auth/login",
        json={"identifier": identifier, "password": password},
        timeout=20,
    )
    response.raise_for_status()
    body = response.json()
    return body["access_token"], body["user"]["merchant_id"]


def run_level(
    base_url: str, token: str, merchant_id: str, total: int, concurrency: int
) -> LoadResult:
    headers = {"Authorization": f"Bearer {token}"}

    def send(index: int) -> tuple[int, float]:
        payload = {
            "transaction_id": f"LOAD-{total}-{index}-{uuid.uuid4().hex[:10]}",
            "customer_id": f"LOAD-CUSTOMER-{index % 100}",
            "merchant_id": merchant_id,
            "amount": str(100 + (index % 20) * 275),
            "device_id": f"LOAD-DEVICE-{index % 80}",
            "location": "Hyderabad" if index % 5 else "Remote",
            "transactions_last_5m": index % 8,
            "failed_transactions_last_10m": index % 3,
            "is_new_device": index % 7 == 0,
            "is_new_location": index % 11 == 0,
        }
        started = time.perf_counter()
        try:
            response = httpx.post(
                f"{base_url}/api/v1/risk/assess",
                headers=headers,
                json=payload,
                timeout=30,
            )
            return response.status_code, (time.perf_counter() - started) * 1000
        except httpx.HTTPError:
            return 599, (time.perf_counter() - started) * 1000

    started = time.perf_counter()
    outcomes: list[tuple[int, float]] = []
    with ThreadPoolExecutor(max_workers=min(concurrency, total)) as executor:
        futures = [executor.submit(send, index) for index in range(total)]
        outcomes.extend(future.result() for future in as_completed(futures))
    duration = time.perf_counter() - started
    latencies = [latency for _, latency in outcomes]
    errors = sum(status < 200 or status >= 300 for status, _ in outcomes)
    status_counts = Counter(str(status) for status, _ in outcomes)
    return LoadResult(
        transactions=total,
        concurrency=min(concurrency, total),
        duration_seconds=round(duration, 3),
        throughput_per_second=round(total / max(duration, 1e-9), 2),
        latency_p50_ms=round(percentile(latencies, 0.50), 3),
        latency_p95_ms=round(percentile(latencies, 0.95), 3),
        latency_p99_ms=round(percentile(latencies, 0.99), 3),
        errors=errors,
        error_rate=round(errors / total, 6),
        status_counts=dict(sorted(status_counts.items())),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:5001")
    parser.add_argument("--identifier", default="analyst@razorshield.demo")
    parser.add_argument("--password", required=True)
    parser.add_argument("--concurrency", type=int, default=20)
    parser.add_argument("--levels", type=int, nargs="+", default=[10, 100, 1000])
    parser.add_argument("--max-error-rate", type=float, default=0.01)
    args = parser.parse_args()
    token, merchant_id = login(
        args.base_url.rstrip("/"), args.identifier, args.password
    )
    results = [
        run_level(
            args.base_url.rstrip("/"), token, merchant_id, total, args.concurrency
        )
        for total in args.levels
    ]
    output = {
        "results": [asdict(result) for result in results],
        "latencyP95MsMedianAcrossLevels": round(
            statistics.median(result.latency_p95_ms for result in results), 3
        ),
        "passed": all(result.error_rate <= args.max_error_rate for result in results),
    }
    print(json.dumps(output, indent=2))
    if not output["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
