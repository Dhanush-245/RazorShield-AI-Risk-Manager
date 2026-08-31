import csv
from pathlib import Path

import pytest

from ml.training.ieee_cis_audit import audit_ieee_cis


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def test_ieee_audit_reports_target_join_missingness_and_temporal_plan(
    tmp_path: Path,
) -> None:
    transactions = tmp_path / "train_transaction.csv"
    identity = tmp_path / "train_identity.csv"
    write_csv(
        transactions,
        [
            {
                "TransactionID": 1,
                "TransactionDT": 100,
                "TransactionAmt": 25,
                "ProductCD": "W",
                "isFraud": 0,
            },
            {
                "TransactionID": 2,
                "TransactionDT": 200,
                "TransactionAmt": 250,
                "ProductCD": "",
                "isFraud": 1,
            },
        ],
    )
    write_csv(identity, [{"TransactionID": 2, "DeviceType": "mobile"}])

    report = audit_ieee_cis(transactions, identity)

    assert report["training_started"] is False
    assert report["target"]["fraud_rate"] == 0.5
    assert report["join"]["transaction_identity_coverage"] == 0.5
    assert report["transactions"]["missing_percent"]["ProductCD"] == 50
    assert (
        report["temporal_split_plan"]["policy"]
        == "past_to_future; final test remains locked"
    )
    assert report["temporal_split_plan"]["source_is_monotonic"] is True
    assert report["temporal_split_plan"]["train_rows"] == 1
    assert report["temporal_split_plan"]["validation_rows"] == 0
    assert report["temporal_split_plan"]["test_rows"] == 1


def test_ieee_audit_requires_the_real_target_and_time_columns(tmp_path: Path) -> None:
    transactions = tmp_path / "train_transaction.csv"
    identity = tmp_path / "train_identity.csv"
    write_csv(transactions, [{"TransactionID": 1, "TransactionAmt": 25}])
    write_csv(identity, [{"TransactionID": 1}])

    with pytest.raises(ValueError, match="TransactionDT, isFraud"):
        audit_ieee_cis(transactions, identity)
