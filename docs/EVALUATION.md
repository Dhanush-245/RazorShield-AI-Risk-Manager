# Evaluation

The bundled synthetic v3 models use 60,000 chronological rows: 36,000 training,
12,000 validation, and 12,000 locked test rows. HIGH maximizes validation F1;
MEDIUM uses validation F2. The final test is not used to select thresholds.
Fusion training uses prior-only expanding-window predictions. The independently
trained IEEE-CIS v2 candidate uses 413,378 training, 44,290 calibration, 44,291
selection, and 88,581 locked test rows. It is not the ordinary merchant API model.

## Verified frozen-artifact replay (2026-08-31)

| Metric | Synthetic fusion v3 | IEEE-CIS v2, F1 profile |
| --- | ---: | ---: |
| Precision | 36.23% | 50.38% |
| Recall | 52.22% | 52.22% |
| F1 | 42.78% | 51.28% |
| PR-AUC (average precision) | 41.18% | 53.62% |
| ROC-AUC | 81.35% | 90.90% |
| False-positive rate | 9.95% | 1.86% |
| False-negative rate | 47.78% | 47.78% |
| TN / FP / FN / TP | 9,751 / 1,077 / 560 / 612 | 83,912 / 1,586 / 1,473 / 1,610 |

These are estimator holdout results, not measured performance of every API
enrichment, rule override, dataset, or institution. IEEE and synthetic results
are not comparable head-to-head because the populations and schemas differ.
Neither meets the requested 80% precision and 85% recall production targets.

Illustrative costs: INR 100 per false alert, INR 5,000 per missed fraud, and INR
50 per reviewed alert. Total = FP × 100 + FN × 5,000 + (TP + FP) × 50.

| Locked-test policy | Reviews | Illustrative cost (INR) |
| --- | ---: | ---: |
| Synthetic, F1 threshold | 1,689 / 12,000 | 2,992,150 |
| Synthetic, cost threshold | 8,072 / 12,000 | 1,440,400 |
| Synthetic, always allow | 0 / 12,000 | 5,860,000 |
| IEEE, F1 threshold | 3,196 / 88,581 | 7,683,400 |
| IEEE, capacity threshold | 4,101 / 88,581 | 7,049,050 |
| IEEE, cost threshold | 18,643 / 88,581 | 4,859,650 |
| IEEE, always allow | 0 / 88,581 | 15,415,000 |

Lower modeled cost can mean unsustainable workload: IEEE's cost profile alerts
on 21.05% of rows, exceeding the 5% review limit. Its capacity profile alerts on
4.63% but has only 42.94% precision and 57.12% recall. Do not claim an operational
benefit without validated merchant costs and capacity.

Replay without training or changing artifacts:

```bash
PYTHONPATH=backend:. backend/.venv/bin/python scripts/verify_submission_metrics.py --output outputs/submission/metrics.json
# Optional: add --transactions /authorized/train_transaction.csv --identity /authorized/train_identity.csv
```

The script checks all four synthetic models, validation-selected thresholds,
confusion matrices, costs and optional IEEE artifact checksums. It writes aggregate
results and hashes only. It does not fit or promote models. Replaying a previously
evaluated locked test is a reproducibility check, not a new unseen experiment.

See [the aggregate replay evidence](verification/submission-metrics-2026-08-31.json).
Historical IEEE metrics use full-precision validation thresholds; the exported
six-decimal capacity threshold changes one positive decision (TP 1,762 instead
of 1,761; FN 1,321 instead of 1,322). Both versions are reported explicitly;
no model/config artifact was altered to hide this rounding effect.

No realized prevented-loss claim is made. Flagged transaction value is exposure,
not money saved. Before production, validate on a new merchant-specific temporal
holdout, calibrate probabilities, approve costs, evaluate relevant segments, and
monitor delayed outcomes. Anomaly scores are supporting evidence, not proof of
fraud; contextual explanations are structured contributions, not SHAP. Verified
permutation SHAP belongs to the optional IEEE candidate only.
