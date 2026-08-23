# RazorShield AI — Phase 0 Project Definition

**Buildathon track:** Razorpay Buildathon — Track 02: AI Risk Manager  
**Primary product promise:** Help merchants prevent fraud-related loss with an explainable, evidence-grounded, human-supervised risk workflow.

## 1. Final problem statement

Merchants need to identify suspicious payment behavior early enough to prevent loss without unnecessarily blocking legitimate customers. RazorShield AI detects individual fraud risk and abnormal merchant-level activity, combines behavioral, temporal, and relationship signals, explains the evidence, recommends a bounded defensive action, and records the complete decision trail.

The primary measurable deliverable is a **fraud-spike and transaction-risk detector** evaluated on a strictly held-out test set. Return risk, abuse-ring intelligence, and chargeback evidence support the same investigation workflow but will only be claimed where the available data supports them.

## 2. Target users

- **Merchant risk analyst:** investigates high-risk transactions and approves or rejects recommendations.
- **Merchant operations/fraud team:** monitors spikes, queues cases, and reviews recurring patterns.
- **Merchant manager:** understands prevented loss, false-positive cost, and operational workload.
- **Buildathon judge:** verifies the model, held-out evaluation, explanations, safety boundaries, and end-to-end demo.

## 3. Primary and secondary loss classes

### Primary loss class

**Fraudulent payment transactions and fraud-related spikes.**

The core success metric is high-quality identification of fraudulent or suspicious activity, emphasizing precision, recall, PR-AUC, false-positive rate, false-negative rate, and business cost.

### Secondary loss signals

- **Abnormal transaction volume or fraud-rate changes:** merchant/time-window spike detection.
- **Connected suspicious entities:** shared devices, IPs, customers, merchants, and orders where those fields exist.
- **Return loss:** elevated order/customer return risk, explicitly kept separate from payment fraud.
- **Chargeback operations:** evidence retrieval and response drafting from verified records only.

## 4. Project objectives

1. Establish a reproducible, leakage-resistant fraud-risk baseline.
2. Detect suspicious transactions and abnormal temporal spikes.
3. Combine supervised, unsupervised, behavioral, velocity, rule, and graph signals into an interpretable 0–100 risk score.
4. Produce evidence-backed explanations separating facts, inferences, and recommendations.
5. Provide a bounded investigation workflow with human approval for high-impact actions.
6. Measure model quality and estimated business impact honestly on held-out data.
7. Demonstrate an end-to-end merchant workflow through a usable dashboard and API.

## 5. Functional requirements

- Import and validate transaction data against a canonical schema.
- Generate a data-quality report covering missingness, duplicates, invalid values, leakage risks, and target distribution.
- Create time-aware transaction, behavioral, velocity, device, merchant, and location features where supported.
- Train and compare appropriate baseline models, beginning with logistic regression, decision tree, and random forest.
- Address imbalance using class weights, threshold tuning, and validation-only resampling where justified.
- Generate fraud probability, anomaly score, behavioral deviation, velocity, graph, return-risk, and rule signals.
- Detect suspicious transactions and merchant/time-window spikes.
- Build an entity relationship graph where identifiers permit it.
- Fuse signals into a calibrated, interpretable risk score.
- Show top risk drivers and their supporting evidence.
- Create evidence packs for chargeback cases without inventing unavailable facts.
- Generate an evidence-grounded investigation report.
- Recommend allow, verification, review, temporary hold, escalation, or evidence generation.
- Require human approval for sensitive actions and store the decision.
- Maintain versioned audit records.
- Expose scoring, investigation, review, network, and audit API endpoints.
- Provide Overview, Investigation, Network, Chargeback, Return Risk, Audit, and Evaluation views.

## 6. Non-functional requirements

- Defense-only behavior; no evasion, abuse enablement, or unrestricted financial operations.
- Reproducible runs with pinned dependencies, seeds, configuration, and version metadata.
- Strict chronological train/validation/test separation wherever timestamps permit.
- PII minimization, masking, input validation, authorization, rate limiting, and secure secrets handling.
- Explainable outputs suitable for analyst review.
- Clear labeling of real public data versus synthetic supporting data.
- Graceful degradation when optional fields or models are unavailable.
- Observable inference latency, prediction distributions, drift indicators, and failures.
- No fabricated metrics, evidence, or claims of real-world performance.

## 7. Dataset requirements

The primary dataset should contain as many of these as possible:

- Fraud label and transaction identifier.
- Event timestamp with meaningful ordering.
- Amount and currency.
- Customer, merchant, order, device, IP/network, or location identifiers.
- Transaction status and failure information.
- Enough observations and positive labels for a meaningful held-out evaluation.

The dataset-selection gate will document license, provenance, row count, columns, label definition, class balance, temporal coverage, missing fields, and leakage risks. Supporting return, chargeback, or graph data may be synthetic, but it must be visibly labeled as synthetic and must not be used to imply real-world performance.

## 8. Required canonical schema

| Field | Type | Required | Notes |
|---|---|---:|---|
| transaction_id | string | Yes | Unique transaction key |
| timestamp | datetime | Yes | Event time used for chronological features/splits |
| amount | float | Yes | Non-negative transaction amount |
| currency | string | Recommended | ISO-like currency code |
| customer_id | string | Recommended | Enables customer history |
| merchant_id | string | Recommended | Enables merchant aggregation |
| order_id | string | Optional | Enables order/chargeback linkage |
| device_id | string | Optional | Enables device-sharing signals |
| ip_id | string | Optional | Prefer tokenized/network-safe identifier |
| location | string/object | Optional | Only use when semantics and quality are valid |
| payment_method | string | Optional | Categorical payment method |
| transaction_status | string | Recommended | Success/failure/pending/etc. |
| failure_reason | string | Optional | Failure analysis |
| fraud_label | 0/1 | Yes for training | Target; never use post-event leakage |
| return_status | string | Optional | Return-risk supporting data |
| chargeback_status | string | Optional | Chargeback supporting data |

All optional fields must be feature-gated. Missing fields must produce a documented limitation rather than fabricated substitutes.

## 9. System architecture

```text
Data ingestion
    ↓
Schema validation + data-quality report
    ↓
Leakage-safe feature pipeline
    ↓
Risk signal layer
  ├─ supervised fraud model
  ├─ anomaly detector
  ├─ behavioral and velocity engines
  ├─ rules
  ├─ fraud-spike detector
  ├─ graph/abuse-ring intelligence
  └─ optional return-risk model
    ↓
Risk fusion + calibration + threshold policy
    ↓
Explanations + evidence pack
    ↓
Evidence-grounded investigator
    ↓
Bounded defensive recommendation
    ↓
Human approval for sensitive action
    ↓
Audit trail + dashboard/API
```

## 10. ML architecture

### Primary path

1. Chronologically split the labeled data into train, validation, and untouched held-out test sets.
2. Build a leakage-safe feature pipeline using only information available before each prediction.
3. Compare logistic regression, decision tree, and random forest; add gradient boosting only if justified.
4. Optimize the decision threshold on validation data using precision/recall and explicit false-positive/false-negative costs.
5. Calibrate probabilities when validation evidence supports it.
6. Evaluate once on the held-out test set and report precision, recall, F1, PR-AUC, ROC-AUC, confusion matrix, FPR, FNR, and business-cost estimates.

### Supporting path

- Isolation Forest or another suitable unsupervised detector for anomaly score.
- Rolling counts, amounts, fraud rates, and change detection for spikes.
- Historical customer/merchant deviation and velocity features.
- NetworkX graph features for shared entities and suspicious connected components.
- Return-risk model only if return labels and sufficient history exist.

### Fusion

Start with a transparent fusion baseline. If out-of-fold validation data is sufficient, compare it with a logistic meta-model and calibrate the final probability. Weights and thresholds must be learned or justified from validation data, never chosen to make demo numbers look better.

## 11. AI/LLM architecture

The LLM is not the fraud classifier. It receives a structured evidence pack containing source references, model outputs, explanations, policy snippets, and explicit missing fields.

It may:

- Summarize verified facts.
- Explain model signals in plain language.
- Identify missing information.
- Draft a structured investigation or chargeback response.
- Recommend human review.

It must:

- Distinguish **FACT**, **INFERENCE**, and **RECOMMENDATION**.
- Say **“Evidence unavailable.”** when a required fact is absent.
- Never create evidence, alter scores, or authorize sensitive actions.
- Treat retrieved policies as policy context, not proof of transaction facts.

## 12. Agent architecture

The defensive agent follows:

```text
OBSERVE → INVESTIGATE → ASSESS → RECOMMEND → REQUEST APPROVAL → EXECUTE ALLOWED ACTION → LOG
```

Allowed tools are read-heavy and narrowly scoped: retrieve transaction/history, calculate risk, retrieve evidence, generate investigation, create review case, and generate chargeback evidence. There is no unrestricted payment, refund, account, or control-bypass capability. High-risk actions remain pending until a human reviewer approves, rejects, escalates, or requests more evidence.

## 13. Evaluation strategy

- Use chronological splitting where timestamps are valid.
- Keep the final test set untouched until the final evaluation.
- Report positive-class precision, recall, F1, PR-AUC, ROC-AUC, FPR, FNR, confusion matrix, and calibration/Brier score where applicable.
- Evaluate spike detection at a declared aggregation/window level, with event labeling defined before testing.
- Evaluate high-risk precision and operational review volume.
- Quantify false-positive cost as legitimate friction/operational cost and false-negative cost as estimated fraud loss using declared assumptions.
- Perform failure analysis on false positives, false negatives, borderline cases, model disagreements, anomaly-only detections, graph-only detections, and unsupported AI claims.
- Stress-test rare legitimate behavior, travel, family-shared devices, promotions, new customers, and legitimate high-value purchases.
- Never report a metric until it comes from an actual reproducible run.

## 14. Safety constraints

- Defense-only scope.
- No instructions for evading detection or abusing payment systems.
- Human approval for holds, escalations, or other high-impact decisions.
- Least-privilege tool permissions and authenticated/authorized API access.
- PII masking and minimal retention.
- Prompt-injection defenses around retrieved evidence and policies.
- Immutable or append-only audit semantics for decisions.
- Explicit uncertainty, limitations, missing evidence, and synthetic-data labels.
- No automatic action based solely on an LLM output.

## 15. Technology stack

- **Backend/data/ML:** Python, FastAPI, Pandas or Polars, NumPy, scikit-learn.
- **Graph:** NetworkX initially.
- **Explainability:** native feature importance first; SHAP if dependency/runtime cost is justified.
- **LLM:** provider selected after the core deterministic workflow works; structured JSON output and evidence-grounded prompting.
- **Frontend:** Streamlit for the first working demo; separate frontend only if it materially improves the judging/demo experience.
- **Persistence:** SQLite for a self-contained prototype, with a clean repository layer that can move to PostgreSQL.
- **Tracking:** versioned JSON/CSV experiment records initially.
- **Deployment:** Replit deployment first; containerization only when useful.

The UI/UX Pro Max skill is deliberately deferred until the dashboard phase, after the data and risk workflows are real.

## 16. Development roadmap

1. **Phase 0:** definition and acceptance criteria — this document.
2. **Phase 1:** inspect and select a legitimate dataset.
3. **Phases 2–4:** data understanding, quality, and EDA.
4. **Phases 5–8:** features, baseline/advanced models, imbalance, thresholds.
5. **Phases 9–13:** anomaly, spike, behavioral, graph, and return-risk signals.
6. **Phases 14–15:** fusion, calibration, and explainability.
7. **Phases 16–20:** chargeback evidence, investigator, bounded agent, human review, audit.
8. **Phases 21–23:** evaluation, failure analysis, stress testing.
9. **Phases 24–26:** API, dashboard, deployment.
10. **Phase 27:** final demo and judging package.

The next gate is dataset selection. No production architecture or dashboard polish should outrun evidence that the primary dataset can support the claimed evaluation.

## 17. Final demo plan

1. Open the merchant risk overview.
2. Select a real held-out transaction or a clearly labeled demo record.
3. Show fraud probability, anomaly, behavior, velocity, graph, and final risk signals.
4. Open the explanation with top factors and source evidence.
5. Open the investigator report and show FACT/INFERENCE/RECOMMENDATION separation.
6. Show the bounded recommendation and human approval step.
7. Record the final action in the audit center.
8. Show held-out metrics, confusion matrix, calibration/cost view, and failure analysis.
9. End with the business impact and known limitations.

## 18. Buildathon judging strategy

The strongest story is not “many AI components.” It is:

> A merchant can move from a suspicious event to an explainable, evidence-backed, human-approved defensive decision, and the core detector has honest held-out metrics.

Judging emphasis:

- **Working primary detector:** measurable fraud/spike detection.
- **Technical credibility:** leakage control, imbalance handling, calibration, and failure analysis.
- **Product coherence:** one risk workflow instead of disconnected demos.
- **Explainability:** evidence and model factors visible to an analyst.
- **Responsible AI:** bounded agent, human approval, defensive-only behavior.
- **Business value:** prevented-loss estimate balanced against false-positive cost.
- **Demo quality:** fast path from alert to investigation to audit.

## 19. Definition of Done

RazorShield AI is done when:

- A reproducible fraud-risk model runs on real data.
- Final precision and recall come from an untouched held-out test set.
- Fraud-spike detection has a declared evaluation protocol.
- Supporting signals work only where the data supports them.
- Risk fusion is interpretable and threshold decisions are justified.
- Investigation outputs are grounded in cited/traceable evidence.
- The defensive agent is bounded and high-impact actions require approval.
- Every decision and action is auditable.
- Failure analysis and stress testing are complete.
- A working API and usable dashboard demonstrate the complete loop.
- Documentation clearly separates facts, assumptions, synthetic data, limitations, and future work.
