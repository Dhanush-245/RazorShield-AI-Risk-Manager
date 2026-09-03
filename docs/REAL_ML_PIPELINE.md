# RazorShield real-data ML pipeline

## Status

The IEEE-CIS v2 pipeline has been trained and evaluated. Five candidates were
compared on validation, and XGBoost was selected. The chronological split is
70% training, 7.5% calibration, 7.5% selection and 15% locked test (88,581 rows).
The candidate remains rejected by governance: it does not meet the requested
precision/recall targets and is not the ordinary merchant API model. The 1,000-row
application-test CSV remains excluded from training. Frozen reports were replayed
successfully on 2026-08-31; see [evaluation](EVALUATION.md).

Authorized reproduction commands from the repository root:

```bash
PYTHONPATH=. backend/.venv/bin/python -m ml.training.ieee_cis_audit --help
PYTHONPATH=. backend/.venv/bin/python -m ml.training.train_ieee_cis --transactions /authorized/train_transaction.csv --identity /authorized/train_identity.csv --output-dir outputs/ieee-reproduction
PYTHONPATH=backend:. backend/.venv/bin/python scripts/verify_submission_metrics.py --transactions /authorized/train_transaction.csv --identity /authorized/train_identity.csv --output outputs/submission/metrics.json
```

The last command requires the locally packaged trusted candidate binaries. They
are intentionally excluded from GitHub, as are competition CSVs. Do not retrain
or retune using the held-out replay results; a materially new selection process
needs a new evaluation plan.

## Dataset roles

| Role | Data | Use |
|---|---|---|
| Supervised fraud | IEEE-CIS transaction outcomes | Fraud probability candidates |
| Identity/device | IEEE-CIS identity table | Device and identity context available at transaction time |
| Anomaly | Legitimate rows from the chronological training window | Isolation Forest normal-behavior model |
| Behavioral/velocity | Strictly prior events | Customer amount, frequency, device and time deviations |
| Graph | Prior customer/device/recipient relationships where available | Relationship features; no future edges |
| Application test | RazorShield 1,000-row CSV | UI and integration testing only |

## Mandatory gates

1. **Audit:** schema, target balance, missingness, duplicates, join coverage, time range and leakage.
2. **Feature contract:** every feature has an availability-at-prediction-time declaration.
3. **Temporal split:** earliest 70% train, next 15% validation, latest 15% locked test.
4. **Candidates:** class-weighted Logistic Regression, Random Forest and XGBoost.
5. **Calibration:** fit only after base-model training, without using the final test window.
6. **Threshold:** optimize on validation for precision, recall, F1, FPR, review volume and configured
   false-positive/false-negative/review costs.
7. **Freeze:** select the model, preprocessing contract and thresholds before opening the test result.
8. **Final evaluation:** precision, recall, F1, PR-AUC, ROC-AUC, Brier score, calibration, confusion
   matrix, false-positive rate, false-negative rate and business cost.
9. **Artifact promotion:** version model, preprocessing, calibrator, threshold configuration, feature
   contract, audit report and model card together; never overwrite the synthetic demo artifacts.
10. **API integration:** promote only after the backend verifies schema/version compatibility and keeps
    human review as the financial-action boundary.

## Business-cost contract

Costs must be configurable and recorded with every threshold study:

```text
total_cost = false_positives * fp_cost
           + false_negatives * fn_cost
           + reviewed_transactions * review_cost
           + declined_legitimate_transactions * decline_cost
```

Default illustrative assumptions are not production facts and must never be presented as realized
savings or losses.
