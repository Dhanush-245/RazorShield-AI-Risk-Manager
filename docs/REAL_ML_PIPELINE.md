# RazorShield real-data ML pipeline

## Status

The production-candidate pipeline is at the **data audit gate**. No IEEE-CIS model has been trained,
no final-test labels have been inspected for model selection, and the 1,000-row RazorShield demo
dataset is excluded from training.

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
