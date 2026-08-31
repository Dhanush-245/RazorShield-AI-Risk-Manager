# MLOps

`ml/training/train_models.py` owns deterministic data generation, chronological splitting, training, threshold selection, evaluation, and artifact registration. Production inference only reads versioned artifacts and the manifest. Re-training produces a new manifest timestamp; promotion should instead use immutable version names, model-registry approval, checksum verification, and shadow/canary evaluation.

The monitoring API exposes artifact versions, evaluation provenance, timed inference requests,
model-execution latency, and process-local API error/latency telemetry. Drift intentionally reports
`INSUFFICIENT_LIVE_LABELS` until an adequate live window exists. Production should export telemetry
to a shared observability backend, persist feature distributions, compute PSI/KS with minimum sample
safeguards, instrument delayed outcomes, alert on defined thresholds, and support rollback.

Threshold governance separates three decisions: the HIGH threshold maximizes validation F1, the
MEDIUM threshold prioritizes validation F2, and an independently reported cost threshold minimizes
configured false-positive, false-negative, and manual-review cost. All three are evaluated on the
locked test split without retuning. The always-allow cost baseline makes the business tradeoff
explicit. These INR costs are illustrative until approved by the merchant's risk and finance owners.

Merchant-triggered training now preserves chronological order with a temporal 60/20/20 split and
expanding-window stacking. Training is rejected when any temporal split lacks both outcome classes.

The IEEE-CIS detector is schema-specific and guarded by immutable artifact checks, a locked
chronological test, minimum PR-AUC/ROC-AUC and maximum false-positive-rate gates, a feature
contract, and a human-action boundary. Passing these gates means *eligible for operator review*,
not automatically promoted. Set `RAZORSHIELD_IEEE_CIS_PROMOTION_STATUS=approved` only after
representative merchant validation, capacity, fairness, drift, rollback and owner sign-off.

The live API load probe is `scripts/load_test.py`; it runs authenticated 10, 100 and 1,000 request
levels and fails when the configured maximum error rate is exceeded.
