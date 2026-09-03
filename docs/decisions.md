# Technical decision log

## 2026-08-31 — Evidence-first risk operations

The professional-upgrade brief prioritizes seven capabilities, not sixteen unrelated features.
We extend the current modular application; no new model, microservice, or autonomous payment agent is introduced.

| Requested capability | Implementation | Boundary |
| --- | --- | --- |
| Investigation copilot | Existing investigation/policy/evidence orchestration, linked to the new workbench | Default is deterministic orchestration and lexical retrieval; optional LLM configuration is not proof of production RAG |
| Risk simulator | `/simulator`, POST `/api/v1/workbench/simulate` | Same loaded model/rules, no ledger or case writes; inputs are hypothetical, not fetched customer history |
| Counterfactual analysis | Investigation → What would change? | Five sensitivity comparisons, using stored enriched inputs/rules with currently loaded models; not causal or guaranteed reductions |
| Human review workspace | Investigation → Human vs model | Required reason + consistent outcome; admin/reviewer only; explicit assertions retained separately from dataset labels |
| Investigation timeline | Investigation → Timeline | Actual receipt/assessment/agent/review events; device/location flags are observations, not fabricated login timestamps |
| Health and drift | `/operations` → Model health | Recorded fusion metrics; numeric PSI and categorical total variation with sample/window disclosure |
| Business impact | `/operations` → Business impact | In-sample dataset cost sweep and hypothetical daily projection; never called realized fraud prevention |
| Behavioral fingerprint | Timeline's prior-only customer history | Active dataset, strictly earlier event timestamps, latest 500 records; absence is shown |
| Data → decision transparency | Input, feature, rule, output and human-decision panels | New assessments have snapshots; legacy snapshots are not invented |
| Shared-recipient attack patterns | Operations → Connected patterns; existing `/network` | Only observed customer/recipient links; not evidence of collusion, IP address or intermediary accounts |
| Adversarial lab | Admin-only Operations → Stress lab | Eight actual property checks, not a detection-rate benchmark |
| Champion/challenger | Existing `/evaluation`, `/monitoring/ieee-cis` API | Separate IEEE-CIS candidate remains gated; different datasets cannot establish head-to-head superiority |
| Why not fraud? | Simulator's protective evidence; existing investigation context | Only fired protective rules are shown. Large legitimate education payments are explicit scenarios |
| Fusion breakdown | Simulator bars plus existing assessment pipeline | Component values converted from 0–1 to 0–100 for display; final score is a threshold-mapped index, not calibrated guilt probability |
| Audit | Existing append-only action APIs + new evidence snapshot digest | NOT privileged-user-proof or externally immutable WORM storage |

### Snapshot ownership and privacy

Each new assessment writes `DECISION_SNAPSHOT_RECORDED` in the same transaction as the assessment.
Its versioned envelope contains canonical, enriched risk inputs, numerical feature vector, rule settings,
model versions, outputs and structured explanations. Direct contact/bank/account fields and ground-truth
labels are omitted from this extra audit copy. Original party evidence remains in the scoped transaction view.
SHA-256 detects inconsistent snapshot content. Someone able to rewrite both content and digest is outside
this protection; independent signatures/retention storage would be required for tamper-resistant archival.

Counterfactual execution validates the digest and uses historical rules with the **current** model artifacts.
It reports stored/recomputed scores and whether model versions match; version names alone are not a binary
artifact hash guarantee. Legacy records return 409 for sensitivity analysis instead of guessing missing inputs.

### Human feedback is not a fraud label

With the new optional `outcome`, the review API requires a nonblank reason and matching decision:
approve → LEGITIMATE; reject → CONFIRMED_FRAUD; escalate/request_evidence → UNDETERMINED.
`REVIEW_FEEDBACK_RECORDED` and `MODEL_FEEDBACK_MONITORING` retain the reviewer identity, reason, score,
version and outcome. These are explicitly reviewer assertions. They never update `fraud_label`, auto-retrain,
send refunds, reject payments or release money. Legacy clients without `outcome` retain their existing contract.

### Drift is not model accuracy

Compare the older and newer halves of at most 500 active-dataset assessments in event-time order.
Require 30 usable samples in **each** window. Numeric features use reference-quantile bins, 0.5 count
smoothing and PSI; categorical features use total-variation distance. Values of 0.10/0.25 are heuristic
warning boundaries. Small datasets show INSUFFICIENT_DATA. No fabricated validation date or live accuracy.

### Cost and capacity

For supplied non-null dataset labels only, scan score thresholds 0…101. Cost is:

`FP × false-positive cost + FN × missed-fraud cost + (TP + FP) × review cost`.

The recommendation minimizes observed labeled-row cost subject to the assumed review fraction.
101 means no alerts. Missing labels are excluded; this is exploratory in-sample selection, not a new held-out
performance claim or deployed policy. Daily projections combine observed TPR/FPR with user-assumed volume,
fraud prevalence and costs, assuming successful prevention of reviewed positives. They may exceed capacity
or show negative savings. Missing positive/negative classes suppress projections.

## Related engineering evidence

- [Architecture](ARCHITECTURE.md)
- [Model evaluation and cost tradeoffs](EVALUATION.md)
- [Security](SECURITY.md)
- [Failures and fixes](failures-and-fixes.md)
- [New demo narration](submission/RISK_OPERATIONS_NARRATION.md)
