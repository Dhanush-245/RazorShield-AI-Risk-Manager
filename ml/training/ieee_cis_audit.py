from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REQUIRED_TRANSACTION_COLUMNS = {
    "TransactionID",
    "TransactionDT",
    "TransactionAmt",
    "isFraud",
}
REQUIRED_IDENTITY_COLUMNS = {"TransactionID"}
KNOWN_POST_OUTCOME_COLUMNS = {
    "chargeback_status",
    "chargeback_date",
    "dispute_outcome",
    "fraud_review_result",
    "manual_review_decision",
    "refund_status",
}


@dataclass
class CsvAudit:
    path: str
    rows: int = 0
    columns: list[str] = field(default_factory=list)
    missing_counts: Counter[str] = field(default_factory=Counter)
    duplicate_transaction_ids: int = 0
    transaction_ids: set[str] = field(default_factory=set, repr=False)
    numeric_columns: set[str] = field(default_factory=set)
    categorical_columns: set[str] = field(default_factory=set)
    target_counts: Counter[str] = field(default_factory=Counter)
    minimum_transaction_dt: float | None = None
    maximum_transaction_dt: float | None = None
    transaction_dt_non_monotonic_rows: int = 0
    transaction_dts: list[float] = field(default_factory=list, repr=False)

    def as_dict(self) -> dict[str, Any]:
        missing_percent = {
            name: round(100 * self.missing_counts[name] / max(self.rows, 1), 4)
            for name in self.columns
        }
        return {
            "path": self.path,
            "rows": self.rows,
            "columns": self.columns,
            "column_count": len(self.columns),
            "missing_percent": missing_percent,
            "missingness_bands": {
                "complete_columns": sum(
                    value == 0 for value in missing_percent.values()
                ),
                "columns_at_least_50_percent_missing": sum(
                    value >= 50 for value in missing_percent.values()
                ),
                "columns_at_least_80_percent_missing": sum(
                    value >= 80 for value in missing_percent.values()
                ),
                "columns_at_least_90_percent_missing": sum(
                    value >= 90 for value in missing_percent.values()
                ),
            },
            "duplicate_transaction_ids": self.duplicate_transaction_ids,
            "numeric_columns": sorted(self.numeric_columns),
            "categorical_columns": sorted(self.categorical_columns),
            "target_counts": dict(sorted(self.target_counts.items())),
            "minimum_transaction_dt": self.minimum_transaction_dt,
            "maximum_transaction_dt": self.maximum_transaction_dt,
            "transaction_dt_non_monotonic_rows": self.transaction_dt_non_monotonic_rows,
        }


def _require_columns(path: Path, columns: list[str], required: set[str]) -> None:
    missing = sorted(required - set(columns))
    if missing:
        raise ValueError(
            f"{path.name} is missing required columns: {', '.join(missing)}"
        )


def audit_csv(path: Path, required: set[str]) -> CsvAudit:
    if not path.is_file():
        raise FileNotFoundError(
            f"Required IEEE-CIS file is missing: {path}. Download it from the Kaggle competition "
            "after accepting the competition rules; do not substitute the RazorShield demo dataset."
        )
    audit = CsvAudit(path=str(path.resolve()))
    numeric_possible: dict[str, bool] = {}
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"{path.name} has no CSV header")
        audit.columns = [item.strip() for item in reader.fieldnames]
        _require_columns(path, audit.columns, required)
        numeric_possible = {name: True for name in audit.columns}
        previous_transaction_dt: float | None = None
        for row in reader:
            audit.rows += 1
            transaction_id = (row.get("TransactionID") or "").strip()
            if transaction_id:
                if transaction_id in audit.transaction_ids:
                    audit.duplicate_transaction_ids += 1
                audit.transaction_ids.add(transaction_id)
            if "isFraud" in row:
                label = (row.get("isFraud") or "").strip()
                if label:
                    audit.target_counts[label] += 1
            transaction_dt = (row.get("TransactionDT") or "").strip()
            if transaction_dt:
                try:
                    value = float(transaction_dt)
                except ValueError:
                    numeric_possible["TransactionDT"] = False
                else:
                    if (
                        previous_transaction_dt is not None
                        and value < previous_transaction_dt
                    ):
                        audit.transaction_dt_non_monotonic_rows += 1
                    previous_transaction_dt = value
                    audit.transaction_dts.append(value)
                    audit.minimum_transaction_dt = (
                        value
                        if audit.minimum_transaction_dt is None
                        else min(audit.minimum_transaction_dt, value)
                    )
                    audit.maximum_transaction_dt = (
                        value
                        if audit.maximum_transaction_dt is None
                        else max(audit.maximum_transaction_dt, value)
                    )
            for name in audit.columns:
                raw = (row.get(name) or "").strip()
                if not raw:
                    audit.missing_counts[name] += 1
                    continue
                if numeric_possible[name]:
                    try:
                        float(raw)
                    except ValueError:
                        numeric_possible[name] = False
    audit.numeric_columns = {
        name for name, possible in numeric_possible.items() if possible
    }
    audit.categorical_columns = set(audit.columns) - audit.numeric_columns
    return audit


def leakage_review(columns: set[str]) -> dict[str, Any]:
    normalized = {name.lower(): name for name in columns}
    detected = [
        normalized[name]
        for name in sorted(KNOWN_POST_OUTCOME_COLUMNS & set(normalized))
    ]
    return {
        "target_excluded_from_features": "isFraud" in columns,
        "known_post_outcome_columns_detected": detected,
        "required_controls": [
            "Sort by TransactionDT before every split and historical aggregation.",
            "Build customer/device/velocity features with strict prior-row state only.",
            "Fit imputers and categorical encoders on the training window only.",
            "Use validation data for model choice and threshold optimization.",
            "Keep the final temporal test window locked until selection is frozen.",
            "Never use chargeback, dispute, review, refund, or other post-outcome fields at inference.",
        ],
    }


def audit_ieee_cis(transaction_path: Path, identity_path: Path) -> dict[str, Any]:
    transactions = audit_csv(transaction_path, REQUIRED_TRANSACTION_COLUMNS)
    identity = audit_csv(identity_path, REQUIRED_IDENTITY_COLUMNS)
    joined_identity_rows = len(transactions.transaction_ids & identity.transaction_ids)
    target_total = sum(transactions.target_counts.values())
    fraud_rows = transactions.target_counts.get("1", 0)
    train_end = int(transactions.rows * 0.70)
    validation_end = int(transactions.rows * 0.85)
    transaction_dts = transactions.transaction_dts

    def time_range(start: int, end: int) -> list[float] | None:
        return (
            [transaction_dts[start], transaction_dts[end - 1]] if start < end else None
        )

    return {
        "schema_version": 1,
        "created_at": datetime.now(UTC).isoformat(),
        "dataset": "IEEE-CIS Fraud Detection",
        "training_started": False,
        "transactions": transactions.as_dict(),
        "identity": identity.as_dict(),
        "join": {
            "identity_transaction_matches": joined_identity_rows,
            "transaction_identity_coverage": round(
                joined_identity_rows / max(len(transactions.transaction_ids), 1), 6
            ),
            "join_key": "TransactionID",
            "join_type": "left",
        },
        "target": {
            "column": "isFraud",
            "fraud_rows": fraud_rows,
            "legitimate_rows": transactions.target_counts.get("0", 0),
            "fraud_rate": round(fraud_rows / max(target_total, 1), 6),
        },
        "temporal_split_plan": {
            "ordering_column": "TransactionDT",
            "train_fraction": 0.70,
            "validation_fraction": 0.15,
            "test_fraction": 0.15,
            "policy": "past_to_future; final test remains locked",
            "source_is_monotonic": transactions.transaction_dt_non_monotonic_rows == 0,
            "train_rows": train_end,
            "validation_rows": validation_end - train_end,
            "test_rows": transactions.rows - validation_end,
            "train_transaction_dt": time_range(0, train_end),
            "validation_transaction_dt": time_range(train_end, validation_end),
            "test_transaction_dt": time_range(validation_end, transactions.rows),
        },
        "leakage_review": leakage_review(
            set(transactions.columns) | set(identity.columns)
        ),
        "next_step": (
            "Review and approve this audit before feature engineering or model training. "
            "The RazorShield 1,000-row demonstration dataset is excluded."
        ),
    }


def markdown_report(report: dict[str, Any]) -> str:
    transactions = report["transactions"]
    identity = report["identity"]
    target = report["target"]
    missing = sorted(
        transactions["missing_percent"].items(), key=lambda item: item[1], reverse=True
    )[:30]
    missing_lines = "\n".join(f"| `{name}` | {value:.2f}% |" for name, value in missing)
    return (
        f"""# IEEE-CIS data audit

Training has **not** started. This report is the mandatory data and leakage review.

## Dataset summary

| Measure | Value |
|---|---:|
| Transaction rows | {transactions["rows"]:,} |
| Transaction columns | {transactions["column_count"]:,} |
| Identity rows | {identity["rows"]:,} |
| Identity columns | {identity["column_count"]:,} |
| Duplicate transaction IDs | {transactions["duplicate_transaction_ids"]:,} |
| Fraud rows | {target["fraud_rows"]:,} |
| Legitimate rows | {target["legitimate_rows"]:,} |
| Fraud rate | {target["fraud_rate"]:.2%} |
| Identity join coverage | {report["join"]["transaction_identity_coverage"]:.2%} |

## Highest missingness

| Column | Missing |
|---|---:|
{missing_lines}

## Leakage controls

"""
        + "\n".join(
            f"- {item}" for item in report["leakage_review"]["required_controls"]
        )
        + "\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit IEEE-CIS before RazorShield model training"
    )
    parser.add_argument(
        "--transactions",
        type=Path,
        default=Path("ml/data/raw/train_transaction.csv"),
    )
    parser.add_argument(
        "--identity",
        type=Path,
        default=Path("ml/data/raw/train_identity.csv"),
    )
    parser.add_argument("--output-dir", type=Path, default=Path("ml/reports/ieee_cis"))
    args = parser.parse_args()
    try:
        report = audit_ieee_cis(args.transactions, args.identity)
    except (FileNotFoundError, ValueError) as exc:
        parser.error(str(exc))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "data_audit.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    (args.output_dir / "data_audit.md").write_text(markdown_report(report))
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
