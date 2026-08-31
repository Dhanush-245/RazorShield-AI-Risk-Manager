"""Build a reproducible RazorShield pipeline-test sample from OpenML 42397.

The source is anonymized and exposes only Time, Amount, PCA components, and
Class. PCA components are used solely to create deterministic pseudonymous
customer/device/location buckets. The source Class is used for stratified
sampling and provenance, never as an input to RazorShield scoring.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from pathlib import Path

HEADERS = [
    "transaction_id",
    "customer_id",
    "amount",
    "currency",
    "device_id",
    "location",
    "payment_method",
    "timestamp",
    "transactions_last_5_minutes",
    "transactions_last_hour",
    "failed_attempts_last_10_minutes",
    "customer_average_amount",
    "is_new_device",
    "is_new_location",
    "shared_device_accounts",
    "historical_return_rate",
]


def reservoir_add(items: list[dict], item: dict, seen: int, limit: int, rng: random.Random) -> None:
    if len(items) < limit:
        items.append(item)
        return
    replacement = rng.randrange(seen)
    if replacement < limit:
        items[replacement] = item


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_csv", type=Path)
    parser.add_argument("output_provenance", type=Path)
    args = parser.parse_args()

    rng = random.Random(42397)
    start = datetime(2013, 9, 1, tzinfo=UTC)
    five_minute_times: dict[str, deque[float]] = defaultdict(deque)
    hour_times: dict[str, deque[float]] = defaultdict(deque)
    customer_amount_sum: dict[str, float] = defaultdict(float)
    customer_amount_count: dict[str, int] = defaultdict(int)
    customer_devices: dict[str, set[str]] = defaultdict(set)
    customer_locations: dict[str, set[str]] = defaultdict(set)
    device_customers: dict[str, set[str]] = defaultdict(set)

    fraud_by_band: dict[str, list[dict]] = defaultdict(list)
    normal_by_band: dict[str, list[dict]] = defaultdict(list)
    normal_seen: dict[str, int] = defaultdict(int)
    complete_rows = 0
    fraud_rows = 0
    in_data = False

    with args.source.open("r", encoding="utf-8", newline="") as source_file:
        for line in source_file:
            stripped = line.strip()
            if not in_data:
                if stripped.upper() == "@DATA":
                    in_data = True
                continue
            if not stripped or stripped.startswith("%"):
                continue
            values = next(csv.reader([stripped]))
            if len(values) != 31:
                continue
            try:
                numbers = [float(value) for value in values[:30]]
            except ValueError:
                continue

            complete_rows += 1
            source_label = int(values[30].strip().lower() in {"true", "1"})
            fraud_rows += source_label
            elapsed = numbers[0]
            amount = max(numbers[29], 0.01)
            customer = f"ULB-CUS-{int(abs(numbers[1] * 997 + numbers[2] * 313)) % 1000:04d}"
            device = f"ULB-DEV-{int(abs(numbers[3] * 613 + numbers[4] * 271)) % 500:04d}"
            location = f"EU-REGION-{int(abs(numbers[5] * 127 + numbers[6] * 337)) % 20:02d}"

            times_5m = five_minute_times[customer]
            times_1h = hour_times[customer]
            while times_5m and elapsed - times_5m[0] > 300:
                times_5m.popleft()
            while times_1h and elapsed - times_1h[0] > 3600:
                times_1h.popleft()
            transactions_5m = len(times_5m)
            transactions_1h = len(times_1h)
            prior_count = customer_amount_count[customer]
            average_amount = customer_amount_sum[customer] / prior_count if prior_count else amount
            is_new_device = device not in customer_devices[customer]
            is_new_location = location not in customer_locations[customer]
            device_customers[device].add(customer)
            proxy_shared_accounts = len(device_customers[device])

            # OpenML 42397 has no device/cardholder identity fields. The
            # PCA-derived device bucket is useful for a deterministic demo ID,
            # but collisions are not evidence that a real device is shared.
            shared_accounts = 0

            ratio = amount / max(average_amount, 0.01)
            rules = sum(
                [
                    ratio >= 3,
                    transactions_5m >= 5,
                    proxy_shared_accounts >= 4,
                    is_new_device and ratio >= 2,
                    is_new_location and ratio >= 2,
                ]
            )
            if amount >= 500 or rules >= 2 or ratio >= 5 or proxy_shared_accounts >= 4:
                proxy_band = "high"
            elif (
                amount >= 100
                or rules == 1
                or ratio >= 1.8
                or transactions_5m >= 2
                or proxy_shared_accounts >= 2
            ):
                proxy_band = "medium"
            else:
                proxy_band = "low"

            record = {
                "source_index": complete_rows,
                "source_label": source_label,
                "proxy_band": proxy_band,
                "transaction_id": f"OPENML-42397-{complete_rows:06d}",
                "customer_id": customer,
                "amount": f"{amount:.2f}",
                "currency": "EUR",
                "device_id": device,
                "location": location,
                "payment_method": "Credit card",
                "timestamp": (start + timedelta(seconds=elapsed)).isoformat(),
                "transactions_last_5_minutes": transactions_5m,
                "transactions_last_hour": transactions_1h,
                "failed_attempts_last_10_minutes": 0,
                "customer_average_amount": f"{max(average_amount, 0.01):.2f}",
                "is_new_device": str(is_new_device).lower(),
                "is_new_location": str(is_new_location).lower(),
                "shared_device_accounts": shared_accounts,
                "historical_return_rate": "0.0",
            }

            if source_label:
                fraud_by_band[proxy_band].append(record)
            else:
                normal_seen[proxy_band] += 1
                reservoir_add(
                    normal_by_band[proxy_band],
                    record,
                    normal_seen[proxy_band],
                    160,
                    rng,
                )

            times_5m.append(elapsed)
            times_1h.append(elapsed)
            customer_amount_sum[customer] += amount
            customer_amount_count[customer] += 1
            customer_devices[customer].add(device)
            customer_locations[customer].add(location)

    selected: list[dict] = []
    for band in ("high", "medium", "low"):
        band_frauds = fraud_by_band[band]
        rng.shuffle(band_frauds)
        fraud_selection = band_frauds[:20]
        normal_needed = 80 - len(fraud_selection)
        if len(normal_by_band[band]) < normal_needed:
            raise RuntimeError(
                f"Not enough {band} rows: {len(band_frauds)} fraud and "
                f"{len(normal_by_band[band])} sampled legitimate candidates"
            )
        selected.extend(fraud_selection)
        selected.extend(normal_by_band[band][:normal_needed])
    rng.shuffle(selected)

    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.output_csv.open("w", encoding="utf-8", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows({key: row[key] for key in HEADERS} for row in selected)

    csv_hash = hashlib.sha256(args.output_csv.read_bytes()).hexdigest()
    provenance = {
        "dataset": "OpenML 42397 CreditCardFraudDetection v2",
        "openml_page": "https://www.openml.org/d/42397",
        "metadata_api": "https://www.openml.org/api/v1/json/data/42397",
        "source_download": "https://openml.org/data/v1/download/21829702/CreditCardFraudDetection.arff",
        "citation": (
            "Andrea Dal Pozzolo, Olivier Caelen, Reid A. Johnson and Gianluca "
            "Bontempi. Calibrating Probability with Undersampling for Unbalanced "
            "Classification. IEEE CIDM, 2015."
        ),
        "complete_source_rows_processed": complete_rows,
        "source_fraud_rows_seen": fraud_rows,
        "sample_rows": len(selected),
        "sample_source_labels": {
            "fraud": sum(row["source_label"] for row in selected),
            "legitimate": sum(1 - row["source_label"] for row in selected),
        },
        "adapter_proxy_bands": {
            band: sum(row["proxy_band"] == band for row in selected) for band in ("high", "medium", "low")
        },
        "class_label_used_for_scoring": False,
        "adapter": (
            "Time and Amount are retained. PCA values only create deterministic pseudonymous "
            "customer/device/location buckets; rolling velocity, customer average and novelty "
            "are derived from those buckets. Shared-device risk is set to zero because bucket "
            "collisions are not real identity links. Missing failed-attempt and return-outcome "
            "fields are also set to zero. Source Class is used only to stratify the sample."
        ),
        "limitation": (
            "This is an end-to-end pipeline stress test, not a model-accuracy evaluation. "
            "Pseudonymous entity buckets are adapter constructs, not original cardholder identities."
        ),
        "csv_sha256": csv_hash,
        "generated_at": datetime.now(UTC).isoformat(),
    }
    args.output_provenance.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(provenance, indent=2))


if __name__ == "__main__":
    main()
