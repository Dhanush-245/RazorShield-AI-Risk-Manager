# Model card

The bundled `v3` artifacts are a reproducible demonstration trained on 60,000 deterministic
**synthetic** chronological rows (seed 245). The earliest 60% trains the component models, the
next 20% selects thresholds, and the latest 20% remains locked for final reporting. Fusion uses
expanding-window temporal stacking so each training prediction is produced only from earlier data.

- Fraud: standardized logistic-regression probability model; the operating threshold is selected on validation data.
- Anomaly: Isolation Forest fitted only to fraud-negative training rows. Held-out fraud-label metrics are diagnostic only; anomaly remains supporting evidence and is never confirmed fraud.
- Returns: standardized logistic-regression probability model. Return risk remains separate from fraud.
- Fusion: logistic regression over leakage-controlled fraud, anomaly, behavior, velocity, graph, and contextual-rule signals.

The manifest reports precision, recall, F1, PR-AUC, ROC-AUC, calibration error rates, confusion
matrices, age slices, anomaly diagnostics, and business-cost comparisons. The cost threshold is
selected on validation data and compared on the locked test window against both the F1 threshold
and an always-allow baseline. Cost inputs are illustrative configuration—not claimed prevented loss.

Exact values are stored in `ml/artifacts/manifest.json` and served by `/monitoring/models`.
Current limitations remain material: synthetic deployment artifacts, no merchant production
calibration study, no adequate live labeled drift window, and no approved promotion of the
IEEE-CIS candidate. Do not use these artifacts for autonomous financial decisions.
