# RazorShield AI — Five-Minute Video Production Audit and Plan

Prepared from the repository state on 2026-09-03. This is a recording plan and technical audit, not a production-readiness certification. No application feature was changed while preparing it.

## 1. Executive Video Strategy

### The one-sentence story

RazorShield AI turns a payment event into a contextual, evidence-backed risk recommendation, gives an investigator safe tools to test and investigate that recommendation, keeps the consequential decision with a human, and records the chain for audit.

### Editorial position

The application—not source code and not a slide deck—is the hero. The story is:

`Detect → Explain → Contrast → Simulate → Investigate → Decide → Audit → Validate`

Use six proof points:

1. A suspicious transaction produces a real server-side multi-engine score.
2. The explanation names observable conditions and model contributions.
3. A legitimate high-value education payment remains low risk.
4. A non-persisting simulator and stored-snapshot counterfactual show sensitivity.
5. A bounded investigator retrieves policy and evidence, while a human decides.
6. Frozen held-out metrics and a real PostgreSQL failure show evaluation and engineering discipline.

### Mandatory truth labels

- Keep **Competition demo / Synthetic data** visible whenever possible.
- Say **structured evidence and signed linear contributions**, not SHAP, for the deployed synthetic fusion model.
- Say **deterministic orchestration with merchant-scoped lexical policy retrieval**, not production LLM/vector RAG.
- Say **risk index**, not probability of guilt.
- Say **illustrative modeled cost**, not prevented loss or savings.
- Say **advisory system**, not autonomous fraud blocker.

### Recruiter and judge optimization

| Viewer | What they need to see | Likely challenge | Best proof | Avoid |
| --- | --- | --- | --- | --- |
| ML engineer | Real artifacts, temporal splits, threshold discipline, calibration | “Were metrics tuned on test?” | 60/20/20 chronological split; validation-selected threshold; locked 12,000-row test | Leading with the higher IEEE number without its candidate boundary |
| AI/LLM engineer | Grounding, citations, bounded tools, uncertainty | “Why use an LLM at all?” | Policy source, missing evidence, tool trace, no action permission | Calling lexical retrieval semantic/vector RAG or pretending an external LLM ran |
| Backend engineer | Trust boundary, RBAC, persistence, migrations, tests | “Is the UI backed by APIs?” | Live assessment → case → review → audit plus PostgreSQL regression story | Long code walkthroughs |
| Fintech/risk engineer | Context, capacity, human accountability, false-positive cost | “Is high amount the whole rule?” | Suspicious-versus-education contrast and business-cost screen | Calling anomaly fraud or reviewer opinion ground truth |
| Razorpay judge | Working detector plus measured precision/recall | “Is it real and honestly evaluated?” | Live API response, held-out metrics, visible limitations | Production claims based on synthetic data |

### Recommended delivery

- Target duration: exactly 05:00; acceptable exported duration is 04:58–05:00.
- Narration: approximately 650–700 words, calm pace, no bottom captions.
- Use the Admin demo profile for a single uninterrupted journey. Do not show or speak the password.
- Use clean cuts between pages; do not wait through loading states in the final edit.
- The existing architecture insert is a verified presentation graphic, not an application route. Treat it as a 20-second explanatory insert and return immediately to the product.

## 2. Repository Findings

### Implementation audit

| Area | Status | Repository evidence | Recording decision |
| --- | --- | --- | --- |
| React/Vite analyst UI and routes | IMPLEMENTED | Dashboard, transactions, datasets, assess, simulator, operations, investigations, reviews, network, chargebacks, returns, audit, evaluation, analytics, monitoring, settings | Hero surface |
| FastAPI API and validation | IMPLEMENTED | Authenticated `/api/v1` routes, Pydantic request models, shared single/batch scoring path | Show through live actions, not Swagger |
| Fraud model | IMPLEMENTED | Versioned Joblib logistic model, loaded for inference; frozen evaluation in manifest | Show component and metrics |
| Anomaly model | IMPLEMENTED WITH LIMITATION | Isolation Forest trained on fraud-negative training rows | Call supporting evidence, never “anomaly accuracy” or proof of fraud |
| Behavior engine | IMPLEMENTED | Prior-only customer history plus amount/device/location context | Show behavioral evidence |
| Velocity engine | IMPLEMENTED | Five-minute, fifteen-minute, hourly, same-recipient and failure features | Show in suspicious case |
| Graph engine | IMPLEMENTED WITH LIMITATION | NetworkX derives stored customer/device components; score remains evidence, not proof of a ring | Do not make abuse-ring detection the hero |
| Configurable rules | IMPLEMENTED | Server-side thresholds and stored rule configuration | Briefly show fired rules |
| Learned fusion | IMPLEMENTED | `fusion-v3.joblib` combines component signals; thresholds loaded from manifest | Primary risk result |
| Feature provenance | IMPLEMENTED | T0 observed, T1 derived, T2 merchant asserted, T3 reserved; raise-only handling for assertions | Mention “trusted server-derived context” once |
| Sender/receiver evidence | IMPLEMENTED | Stored party fields and funds-flow view; synthetic 48-column example dataset | Optional backup, not required in five minutes |
| Dataset adapter/upload | IMPLEMENTED | CSV/JSON aliases, canonical adaptation, atomic active-dataset switch, limits | Skip in main video |
| One-time merchant training | IMPLEMENTED BUT NOT HERO-READY | Guarded per active dataset with temporal split; real merchant validation remains absent | Do not trigger training on camera |
| Risk explanation | IMPLEMENTED | Rules, evidence statements and signed local fusion contributions | Hero feature |
| SHAP | PARTIAL / CANDIDATE-ONLY | Permutation SHAP exists for the IEEE-CIS candidate and has an additivity test; not the deployed synthetic model | Do not open or call deployed explanations SHAP |
| Risk simulator | IMPLEMENTED | Calls the same loaded scoring pipeline and writes nothing | Hero feature |
| Counterfactual analysis | IMPLEMENTED WITH PRESENTATION RISK | Replays frozen enriched inputs and historical rules with current model artifacts; sensitivity, not causality | Use the unsaturated golden case below |
| Bounded investigator | IMPLEMENTED | Allowlisted evidence/policy/recommendation tools; stored tool trace; `executedFinancialAction: false` | Hero feature |
| RAG | PARTIALLY IMPLEMENTED | Merchant-scoped active policies; token/IDF-style lexical overlap; top three; source name/version/excerpt/relevance | Demonstrate accurately as local retrieval |
| External LLM | NOT IMPLEMENTED IN THE DEMO PATH | Gemini environment fields and production guard exist, but the ordinary investigator is deterministic | Never claim a live Gemini/LLM response |
| Vector embeddings/store | NOT IMPLEMENTED | No embedding model or vector database in retrieval path | Do not mention embeddings/vector search |
| Human review | IMPLEMENTED | Role-gated reason plus legitimate/fraud/evidence/escalate outcomes | Hero feature; use Escalate |
| Audit trail | IMPLEMENTED WITH LIMITATION | Merchant-scoped database events plus decision-snapshot SHA-256 | Show; do not call WORM or privileged-user-proof |
| Model monitoring | IMPLEMENTED WITH DATA-SUFFICIENCY GUARDS | Frozen metrics, latency, PSI/TV drift, reliability bins, maturity status and slices | Show metrics; accept INSUFFICIENT_DATA when sample is small |
| Fraud-spike detection | IMPLEMENTED | Event-time 15-minute window versus preceding 24-hour baseline with minimum support | Optional; skip main video |
| Business-cost simulator | IMPLEMENTED WITH ILLUSTRATIVE INPUTS | FP/FN/review formula, capacity constraint and operating-point comparison | Show for 10–12 seconds |
| Authentication | IMPLEMENTED | Argon2, short-lived JWT, rotating HttpOnly/SameSite refresh session, logout/revocation | Login at start; never expose password |
| Authorization/isolation | IMPLEMENTED | API-side RBAC and merchant-scoped queries | Mention, do not switch accounts during five minutes |
| Rate limiting | IMPLEMENTED BY MODE | Memory limiter locally; Redis sliding window in Compose/production configuration | Do not say Redis is active unless Compose health passes |
| OTP delivery | PARTIAL | Development-console provider; Twilio provider configuration exists | Do not demo password reset/OTP |
| Database | IMPLEMENTED | SQLite for zero-setup development; PostgreSQL 16 in Compose/CI; Alembic owns schema | Mention PostgreSQL CI, not local SQLite as production |
| Redis/cache | CONFIGURED, OPTIONAL IN DIRECT LOCAL MODE | Compose Redis for distributed rate limiting | Health-check only when using Compose |
| Security headers/CORS/request limits | IMPLEMENTED | CSP, nosniff, frame denial, referrer/permissions policy, explicit CORS, request-size controls | Mention briefly |
| Docker | IMPLEMENTED FOR LOCAL DEVELOPMENT | PostgreSQL, Redis, backend, frontend Compose services | Do not call it production deployment |
| CI/CD | IMPLEMENTED FOR VERIFICATION, NOT DEPLOYMENT | Ruff, pytest, real PostgreSQL migration tests, pnpm audit/typecheck/build, Playwright, Compose config and container checks | Say CI verification, not continuous deployment |
| Browser E2E | IMPLEMENTED | Three ordinary flows; opt-in paced recording flows | Supporting evidence |
| Architecture graphic in recording | MOCKED PRESENTATION INSERT | Existing recorder injects a static `page.setContent` system map | Accept as labeled explanatory insert; never imply it is an app page |
| Frontend maintainability | PARTIALLY IMPLEMENTED | Main `App.tsx` remains very large despite extracted workbench components | Do not discuss in pitch unless asked |
| Production deployment | NOT IMPLEMENTED / NOT APPROVED | Managed secrets, domains, external provider credentials, backup/restore, shadow validation and approvals are open gates | Explicitly say competition-ready local reference application |

### Metric origin audit

| Screen value | Origin | Classification |
| --- | --- | --- |
| Per-transaction fraud/anomaly/behavior/velocity/graph/rules/fusion | Calculated by the loaded artifacts and deterministic engines for the submitted request | Actual demo inference |
| Deployed fusion precision/recall/F1/PR-AUC/ROC-AUC/FPR/FNR/confusion matrix | Loaded from `ml/artifacts/manifest.json`, reproducible by frozen-artifact replay | Real evaluation artifact on synthetic data |
| IEEE-CIS metrics | Loaded from candidate training report and guarded artifacts | Real benchmark evaluation, candidate-only and non-commercial |
| Dashboard counts/trends | Queries over the active merchant dataset | Actual current demo database values; data itself is synthetic |
| Business cost | Computed from confusion counts and configurable illustrative costs | Modeled result, not realized loss prevention |
| Drift | Computed on older/newer active-dataset windows when each has at least 30 samples | Real calculation or explicit INSUFFICIENT_DATA |
| Investigator narrative | Deterministic template over stored evidence | Not a live LLM answer |
| Demo identities and transactions | Seeded or manually submitted fictional data | Synthetic/demo data |

### Current verification state

- Backend/ML regression suite: 83 passed locally; eight PostgreSQL-only cases are intentionally skipped without an explicit disposable PostgreSQL URL. A fresh audit rerun completed successfully with those skips.
- Ruff: passed in the current audit.
- Latest recorded repository verification: TypeScript, production build, Playwright, dependency audits, PostgreSQL 16 migration tests, Docker verification and GitHub Actions run `33718111412` passed.
- Existing recruiter recording: 300.000 seconds, H.264 1440×1000, AAC audio, no subtitle stream, full decode passed.
- Current local process health at audit time: frontend and backend ports were not listening. This is an environment/startup condition and must be cleared before recording.
- The current workspace contains uncommitted documentation, recording, governance and dependency files. Do not clean, reset or overwrite them during recording preparation.

## 3. Recommended Demo Flow

Use this seven-part narrative:

1. **Identity and contract:** log in, show the synthetic-data label, state the human decision boundary.
2. **Contextual detection:** submit `DEMO-RISK-0001`, a deterministic 98/HIGH persisted case with multiple independent signals.
3. **Explanation:** show rules, evidence and contributions; state that anomaly is not fraud and the deployed explanation is not SHAP.
4. **Contrast:** use the built-in Education payment preset: ₹120,000, known verified institution, ordinary behavior, 5/LOW.
5. **Sensitivity:** submit the documented `2026-01-01 13:00 UTC` event, open the stored suspicious case, and run counterfactuals; show the 98→82 velocity change and 98→22 combined change.
6. **Investigation and accountability:** show policy source, missing information, tool trace, no financial action; escalate with a reason; show audit.
7. **Validation and engineering:** show locked synthetic metrics, illustrative cost, security boundary and the fixed PostgreSQL enum migration.

Do not include dataset upload, chargebacks, returns, network visualization, model retraining, OTP, role switching, or code. They are useful product features but dilute the five-minute proof.

## 4. Exact 5-Minute Timeline

| Time | Duration | Segment | Required result |
| --- | ---: | --- | --- |
| 00:00–00:15 | 15s | Hook and dashboard | Problem, product and synthetic label understood |
| 00:15–00:35 | 20s | Architecture insert | Multi-engine pipeline and human boundary understood |
| 00:35–01:25 | 50s | Suspicious transaction | `DEMO-RISK-0001` returns 98/HIGH and MANUAL REVIEW |
| 01:25–01:55 | 30s | Explainability | Evidence, rules and contributions visible |
| 01:55–02:25 | 30s | Legitimate high-value contrast | Education preset returns 5/LOW |
| 02:25–02:55 | 30s | Simulator/counterfactual | Meaningful 95→74 and 95→14 changes visible |
| 02:55–03:30 | 35s | Copilot and policy retrieval | Policy source, missing data, trace, no action visible |
| 03:30–04:00 | 30s | Human review and audit | Reasoned escalation and matching audit event visible |
| 04:00–04:30 | 30s | ML validation and business cost | Locked-test metrics and cost assumptions visible |
| 04:30–04:45 | 15s | Security/reliability | Auth, RBAC, isolation, sessions and CI summarized |
| 04:45–05:00 | 15s | What broke | Genuine enum failure, root cause, fix and verification |
| **Total** | **300s** |  | **Exactly 05:00** |

## 5. Detailed Shot-by-Shot Instructions

### 00:00–00:15 — Hook / product

**Screen:** `http://localhost:5173/`, login page for the first two seconds, then dashboard.

**Action:** Select Admin, fill the local demo identifier and password before recording if possible; start the take with the fields masked, click **Login** at 00:02. Keep the **Competition demo / Synthetic data** label visible before the cut.

**Highlight:** RazorShield AI identity, Risk overview, human-control language.

**Recruiter takeaway:** This is a working authenticated merchant application with an honest data boundary.

**Technical concept:** Product contract and authentication.

**Do not:** Show the password, browser password manager, personal bookmarks, notifications or developer tools.

**Transition:** Clean cut from dashboard journey rail to the architecture insert.

### 00:15–00:35 — Product architecture

**Screen:** The existing “Evidence to an auditable decision” architecture insert.

**Action:** Slowly move the cursor left to right: Transaction → Features → Risk engines → Fusion → Explanation → Bounded copilot → Human review → Audit.

**Highlight:** React/TypeScript, FastAPI/SQLAlchemy, PostgreSQL, scikit-learn, Docker and GitHub Actions in the footer.

**Recruiter takeaway:** The system separates scoring, assistance and authority.

**Technical concept:** Trust boundary and modular pipeline.

**Do not:** Call the insert a live application page or imply the LLM scores fraud.

**Transition:** Hard cut to `/assess` with fields already filled except the final click.

### 00:35–01:25 — Suspicious transaction

**Screen:** `/assess`, heading **Risk assessment**.

**Action and exact data:**

- Transaction ID: `DEMO-RISK-0001`
- Customer ID: `DEMO-CUSTOMER-001`
- Amount: `60000`
- Customer average: `20000`
- Device ID: `DEMO-NEW-DEVICE-01`
- Location: `Delhi`
- Transactions / 5 min: `5`
- Transactions / 15 min: `7`
- Transactions / hour: `15`
- Same recipient / 15 min: `5`
- Failed attempts / 10 min: `1`
- Shared device accounts: `1`
- Expand **Customer, recipient, and transaction context**.
- Recipient ID: `DEMO-RECIPIENT-NEW`
- Recipient category: `UNKNOWN`
- Recipient risk: `0.20`
- Verified recipient: unchecked
- Recipient used before: unchecked
- New device: checked
- New location: checked
- Click **Submit transaction** once.

**Expected result:** 98/100, HIGH, MANUAL REVIEW through the persisted API path. The pure evaluator returns 95 before trusted server-side context resolution; the recording deliberately shows the persisted result. Do not record unless the dry run reproduces 98 and the counterfactuals below.

**Highlight:** Five fired conditions: 3× amount deviation, velocity at the configured boundary, new device plus elevated amount, unusual location plus elevated amount, same-recipient burst.

**Recruiter takeaway:** Multiple contextual signals—not amount alone—drive the result.

**Technical concept:** Validation, feature provenance, component engines and learned fusion.

**Do not:** Say “this person is a fraudster,” “95% fraud probability,” or “the payment was blocked.”

**Transition:** Scroll directly to **Why is this transaction risky?** and expand **Advanced model evidence · read only**.

### 01:25–01:55 — Explanation

**Screen:** Same assessment result, risk evidence, rules and **Signal contribution**.

**Action:** Keep the score and top evidence visible for five seconds; scroll once to the contribution list.

**Highlight:** Fraud, velocity, behavior, rules, graph and anomaly contributions; point out that evidence is preserved with the decision.

**Recruiter takeaway:** The model output is inspectable and reviewable.

**Technical concept:** Local linear contribution, structured evidence and epistemic limits.

**Do not:** Use the word SHAP for this screen; claim causality; equate anomaly with fraud.

**Transition:** Click **Risk simulator** in the side navigation.

### 01:55–02:25 — Legitimate high-value transaction

**Screen:** `/simulator`, heading **Risk simulator**.

**Action:** Click **Education payment**, then **Simulate risk**, then expand **Protective evidence — why not automatically fraud?**

**Expected result:** ₹120,000 scenario, 5/100, LOW. Known verified education recipient, established relationship, known device/location and ordinary velocity.

**Highlight:** Same order-of-magnitude amount as a risky payment, opposite contextual result.

**Recruiter takeaway:** The application avoids a simplistic high-amount rule.

**Technical concept:** Contextual rules and friction management.

**Do not:** Call the result proof of legitimacy or imply verification happened inside the simulator; it is an explicit assumption.

**Transition:** Cut back to `/investigations/DEMO-RISK-0001`.

### 02:25–02:55 — Counterfactual sensitivity

**Screen:** Investigation **Evidence review**, **Investigation workbench**.

**Action:** Click **What would change?**, then **Run counterfactual analysis**.

**Expected result:** With event timestamp `2026-01-01 13:00 UTC`, stored and recomputed baseline are 98. Snapshot replay produces: recipient verified 97 (-1), device recognized 93 (-5), location recognized 95 (-3), velocity normal 82 (-16), all four 22/LOW (-76).

**Highlight:** Velocity and combined evidence; “Persisted: false” and “Financial action executed: false” if visible.

**Recruiter takeaway:** The same scoring pipeline supports safe what-if analysis without mutating the case.

**Technical concept:** Snapshot replay, integrity digest and sensitivity analysis.

**Do not:** Call it causal, guaranteed, or advice to manipulate a score. If the panel is flat, abort the take and repair the demo data—not the metric.

**Transition:** Reload the same investigation and scroll to policy/evidence.

### 02:55–03:30 — Bounded investigator and RAG

**Screen:** Investigation report around **Retrieved company policy · RAG**, missing information and **Agent orchestration trace**.

**Action:** Open the existing investigation. Do not type a free-form question; the current UI runs a bounded investigation rather than a chat interface. Point to the retrieved policy name/version/excerpt, missing information, tool trace and **Financial action executed: no**.

**Supported question to frame in narration:** “What evidence supports this assessment, which policy applies, and what information is still missing?”

**Expected result:** A grounded summary, active merchant policy source, missing delivery confirmation or unavailable fields, recommendation and completed allowlisted trace.

**Recruiter takeaway:** Generative-style assistance is downstream of the risk engine and constrained by evidence and policy.

**Technical concept:** Merchant-scoped top-3 lexical retrieval, grounding, tool allowlist and action boundary.

**Do not:** Say embeddings, vector database, semantic search, autonomous agent, Gemini response or production LLM.

**Transition:** Scroll to the Investigation workbench and click **Human vs model**.

### 03:30–04:00 — Human review and audit

**Screen:** **Human vs model** panel, then `/audit`.

**Action:** Enter `Recipient relationship and verification evidence require a second reviewer.` Click **Escalate case**. Wait for **Case: ESCALATED**, then click **Audit trail** and filter visually to `DEMO-RISK-0001`.

**Highlight:** Model assessment versus human judgment; reviewer reason; actor, time and event.

**Recruiter takeaway:** AI assists; an authorized human owns the consequential decision and the action is traceable.

**Technical concept:** RBAC, reasoned review, separation from truth labels and audit logging.

**Do not:** Click Confirm fraud, because the fictional scenario has no independently verified fraud outcome. Do not say the database audit is immutable WORM storage.

**Transition:** Click **Risk operations**.

### 04:00–04:30 — Real ML validation

**Screen:** `/operations`, **Model health**, then **Business impact**.

**Action:** Pause on **Deployed fusion — held-out evaluation** long enough for precision/recall/F1 to be readable. Click **Business impact**, retain the default illustrative costs, click **Evaluate policy**, and show **Operating-point comparison**.

**Highlight:** 12,000 locked temporal rows; threshold chosen on validation; precision 36.23%, recall 52.22%, F1 42.78%, PR-AUC 41.18%, ROC-AUC 81.35%, FPR 9.95%; explicitly synthetic.

**Recruiter takeaway:** The author knows ranking, threshold selection, false positives, capacity and cost are different questions.

**Technical concept:** Chronological evaluation, locked test, confusion matrix and decision-cost tradeoff.

**Do not:** Hide weak metrics, switch to IEEE without explaining the dataset, or call modeled cost realized savings.

**Transition:** Click **Settings**.

### 04:30–04:45 — Security and reliability

**Screen:** `/settings`, **Agent safety** and **Authenticated profile**.

**Action:** Keep both panels in frame. Use a short zoom/pan only if needed.

**Highlight:** Merchant scope, RBAC, rotating sessions, request validation/rate limiting and defense-only permissions.

**Recruiter takeaway:** Security is enforced server-side and production gaps are understood.

**Technical concept:** Authentication, authorization, isolation and least authority.

**Do not:** Show environment files, API keys, tokens, cookies or terminal output.

**Transition:** Cut to `/operations` → **Engineering decisions**.

### 04:45–05:00 — What broke and recovery

**Screen:** **PostgreSQL enum ownership** decision card.

**Action:** Keep the root-cause and test evidence visible; no scrolling.

**Highlight:** Duplicate `user_role`, single migration owner, fresh/existing/downgrade coverage.

**Recruiter takeaway:** The developer can diagnose a schema failure rather than patching symptoms.

**Technical concept:** Alembic/PostgreSQL enum lifecycle and regression testing.

**Do not:** Claim arbitrary schema drift repair or say the enum was simply deleted.

**End frame:** RazorShield AI logo plus `Evidence-led. Human-controlled. Auditable.` Cut exactly at 05:00.

## 6. Complete Narration Script

### 00:00–00:15

“A high-value payment is not necessarily fraud, and a small payment is not necessarily safe. RazorShield AI combines contextual risk models, explainable evidence, and human review to help merchants make better risk decisions. This demonstration uses clearly labeled synthetic data.”

### 00:15–00:35

“A transaction moves through validation and trusted feature engineering, then fraud, anomaly, behavior, velocity, graph, and configurable-rule engines. Learned fusion produces a risk index. Evidence and merchant policy support investigation; an authorized human decides, and every important step is audited.”

### 00:35–01:25

“This fictional transaction is sixty thousand rupees against a twenty-thousand-rupee baseline. The device and location are new, the recipient is unfamiliar and unverified, and five payments reached the same recipient within fifteen minutes while short-window velocity increased. RazorShield validates the event, derives permitted platform context, runs the trained fraud and anomaly artifacts, evaluates behavior, velocity, relationship evidence, and rules, then combines them through learned fusion. The persisted result is a ninety-eight risk index, high risk, with manual review recommended. It is not a ninety-eight-percent probability of guilt, and no payment is blocked or moved. The recommendation comes from the combination of evidence, not from amount alone.”

### 01:25–01:55

“Investigators receive more than a label. The record preserves each fired condition, behavioral deviation, and the fusion model’s signed local contributions. These show which signals increased or reduced this model output. They are structured evidence and linear contributions—not causality, a fraud verdict, or SHAP for the deployed model. Anomaly also remains supporting evidence, not proof of fraud.”

### 01:55–02:25

“Now the same pipeline evaluates a one-hundred-and-twenty-thousand-rupee education payment. The institution is familiar and verified, the relationship has prior history, device and location are known, and velocity is ordinary. The live result is five out of one hundred, low risk, with protective context shown explicitly. High value alone never defines fraud, and the simulator labels verification as an assumption rather than pretending it performed that check.”

### 02:25–02:55

“The stored decision can be tested without changing the ledger. Recognizing the device lowers this case by five points, normal velocity lowers it by sixteen, and the combined assumptions move the risk index from ninety-eight to twenty-two. The comparison uses the frozen enriched input snapshot and current loaded artifacts. It is sensitivity analysis, not a causal promise; nothing is saved, verified, retrained, or financially executed.”

### 02:55–03:30

“The investigation assistant answers a bounded question: what evidence supports the assessment, which policy applies, and what remains unknown? It gathers the stored transaction, prior behavior, recent activity, observed relationships, risk evidence, and active merchant policy. The report exposes the policy source, missing information, and every allowlisted tool step. This local version uses deterministic orchestration with lexical policy retrieval, not a production language-model or vector-search service. It summarizes downstream of the risk engine and cannot invent evidence or execute a financial action.”

### 03:30–04:00

“The reviewer compares model output with available evidence, records a reason, and escalates because recipient verification requires a second reviewer. That assertion remains separate from supplied outcome labels; it does not rewrite training truth or trigger automatic retraining. The audit then records the case, actor, timestamp, assessment, investigation, and review event, making the decision process reviewable and accountable.”

### 04:00–04:30

“Model health reports frozen synthetic fusion on twelve thousand locked temporal test rows: thirty-six point two three percent precision, fifty-two point two two percent recall, forty-two point seven eight percent F-one, forty-one point one eight percent precision-recall area, and nine point nine five percent false-positive rate. Thresholds were selected on validation data, never tuned on the locked test. Cost analysis makes missed-fraud, false-alert, review-cost, and analyst-capacity assumptions explicit. These are reproducible diagnostics, not production results or confirmed savings.”

### 04:30–04:45

“Security includes Argon2 credentials, merchant-scoped role enforcement, rotating refresh sessions, validation, rate limiting, security headers, audit events, and a defense-only agent. CI verifies migrations, tests, dependency audits, browser flows, and containers; managed production controls remain explicit gates.”

### 04:45–05:00

“One real failure was PostgreSQL creating the `user_role` enum twice. I traced the Alembic chain, assigned enum creation to one migration owner, preserved existing schemas, and added fresh, existing-state, downgrade, and re-upgrade tests. RazorShield stays evidence-led, human-controlled, and auditable.”

## 7. Golden Demo Transactions

All rows below are fictional and deterministic. The first three are built-in simulator presets. The remaining cases were replayed through the actual loaded evaluator during this audit. Only use a persisted case in the hero after the 30-minute dry run confirms the same result through the full API path.

| Scenario | ID/preset | Key context | Verified evaluator result | Use |
| --- | --- | --- | ---: | --- |
| 1. Normal transaction | `Normal payment` | ₹2,000 vs ₹2,500; verified known utility; known device/location; 1 in 5m | 6 LOW | Backup |
| 2. Suspicious contextual transaction | `DEMO-RISK-0001` | ₹60,000 vs ₹20,000; new device/location; unfamiliar recipient; 5 in 5m; same-recipient burst | 98 HIGH persisted; 95 pure evaluator | Primary hero |
| 3. Legitimate high-value | `Education payment` | ₹120,000 vs ₹100,000; verified known university; prior relationship; normal behavior | 5 LOW | Primary contrast |
| 4. New device only | `SIM-NEW-DEVICE` | Normal payment plus new device | 9 LOW | Shows one weak signal is insufficient |
| 5. New recipient | `SIM-NEW-RECIPIENT` | Unverified, unused, unknown recipient; risk input 0.70 | 13 LOW | Shows one input is not a verdict |
| 6. High velocity | `SIM-HIGH-VELOCITY` | Normal amount; 8 in 5m, 12 in 15m, 24/hour, 4 failures | 75 HIGH | Strong backup scenario |
| 7. Known customer normal behavior | `SIM-KNOWN-NORMAL` | ₹2,000 baseline, known utility, 12 prior relationship events, mature account | 6 LOW | Behavioral-context backup |
| 8. Counterfactual | Stored `DEMO-RISK-0001` | Verify recipient, recognize device/location, normalize velocity | 98→22 LOW combined | Primary sensitivity proof |

For `DEMO-RISK-0001`, the deterministic direct replay produced these comparisons:

| Change | Score | Delta |
| --- | ---: | ---: |
| Recipient verified | 97 HIGH | -1 |
| Device recognized | 93 HIGH | -5 |
| Location recognized | 95 HIGH | -3 |
| Velocity normal | 82 HIGH | -16 |
| All four assumptions | 22 LOW | -76 |

The built-in `Suspicious transfer` preset returns 100 HIGH but is unsuitable for the counterfactual hero: individual changes remain saturated at 100 and the combined row is 99. Keep it as a detection smoke test, not the sensitivity scene.

## 8. ML Metrics Presentation

### Exact deployed synthetic fusion metrics

| Item | Value |
| --- | ---: |
| Data | Deterministic synthetic, seed 245 |
| Total rows | 60,000 |
| Train | 36,000, earliest 60% |
| Validation | 12,000, next 20% |
| Locked test | 12,000, latest 20% |
| Fusion training | 30,000 prior-only expanding-window stacked rows |
| Precision | 36.23% |
| Recall | 52.22% |
| F1 | 42.78% |
| PR-AUC / average precision | 41.18% |
| ROC-AUC | 81.35% |
| False-positive rate | 9.95% |
| False-negative rate | 47.78% |
| Brier score | 0.0719 |
| Confusion matrix | TN 9,751; FP 1,077; FN 560; TP 612 |
| Review rate at F1 threshold | 1,689 / 12,000 = 14.08% |
| HIGH probability threshold | 0.149218, selected by validation F1 |
| MEDIUM probability threshold | 0.1017, selected by validation F2 |

### Leakage assessment

- Chronological 60/20/20 split: implemented.
- Locked test not used for threshold selection: confirmed.
- Fusion stacking uses models trained only on earlier rows: confirmed.
- Behavior/relationship history uses prior event times: confirmed.
- Label maturity window: enforced in training/evaluation code, but merchant outcome provenance is still asserted and not independently verified.
- Selection bias: autonomous blocking is disabled, reducing but not eliminating real-world intervention bias; production validation still needs shadow/advisory replay.
- Synthetic-label risk: material. The generator and labels share assumptions, so these metrics cannot establish merchant production performance.

### Business-cost display

The default formula is:

`FP × ₹100 + FN × ₹5,000 + reviewed alerts × ₹50`

At the locked synthetic F1 threshold: 1,689 reviews and ₹2,992,150 illustrative total cost. At the validation-selected cost threshold: 8,072 reviews and ₹1,440,400 illustrative cost. Always allow: ₹5,860,000. The cost threshold is operationally unrealistic without capacity approval because it reviews 67.27% of test rows. Say this if asked.

### Optional candidate, not the headline

IEEE-CIS v2 has 88,581 locked future rows and stronger F1-profile metrics: 50.38% precision, 52.22% recall, 51.28% F1, 53.62% PR-AUC, 90.90% ROC-AUC and 1.86% FPR. It remains **candidate-only**, uses a different schema/population, and lacks commercial production authorization. Do not substitute it for the deployed model’s number.

### Exact 30-second metrics screen

Keep **Deployed fusion — held-out evaluation** visible for 18 seconds. Circle precision, recall and F1 with the cursor; then show PR-AUC, ROC-AUC, FPR/FNR and the confusion matrix. Spend the final 12 seconds on **Business impact**, showing the cost assumptions and operating-point comparison. The narration in section 6 is the approved claim boundary.

## 9. RAG/LLM Demonstration

### What actually exists

- Indexed material: active merchant-owned `Policy` rows seeded or published through the API, including risk/review/escalation/chargeback-style policy text.
- Retrieval: lowercased alphanumeric tokenization, terms longer than two characters, IDF-like weighted lexical overlap.
- Scope: active policies for the authenticated merchant only.
- Top-k: maximum three results by default.
- Sources: policy name, category, version, excerpt and relevance score are returned.
- Grounding: the deterministic report uses stored transaction, signals, history, observed relationships and retrieved policies.
- Missing-data behavior: missing information is listed; no evidence is fabricated.
- Tooling: nine allowlisted steps are persisted, including transaction/history/activity/relationships/signals/explanation/policy/investigation/recommendation.
- Fallback: if no policy matches, the report states that the recommendation relies on stored evidence only.
- Embeddings/vector store/external LLM: absent from the normal demo path.

### Best supported prompt

The UI is not a free-form chat, so frame this as the investigator’s task rather than typing it:

> What evidence supports this risk assessment, which merchant policy applies, and what information is still missing?

Show the policy source, missing-information list, tool trace and `Financial action executed: no`. The message is: risk engine first, grounded assistance second, human authority last.

## 10. Human Review Demonstration

1. Open `/investigations/DEMO-RISK-0001` as Admin.
2. Scroll to **Investigation workbench**.
3. Click **Human vs model**.
4. Keep 95/HIGH and “A risk signal, not a verdict” visible.
5. Enter: `Recipient relationship and verification evidence require a second reviewer.`
6. Click **Escalate case**.
7. Confirm **Case: ESCALATED**.
8. State that reviewer assertions are monitoring feedback, not automatic truth labels, model updates or financial actions.

Do not use **Confirm fraud** in the submission; the scenario is fictional and has no external outcome evidence. The escalation is responsible and demonstrates workflow without inventing ground truth.

## 11. Audit Trail Demonstration

The assessment transaction writes a decision snapshot and audit events for trained risk assessment, model ensemble execution, score generation and investigation creation. The bounded investigator writes its completion event and tool calls. Review writes reviewer feedback and case-decision events.

In the video, show only 15 seconds of the audit page:

1. Open `/audit` immediately after escalation.
2. Locate `DEMO-RISK-0001`.
3. Point to timestamp, actor/event type, case/transaction reference and review action.
4. Say: “Important risk actions are traceable.”

Do not say “tamper-proof.” The local SHA-256 detects inconsistent snapshot contents, but a privileged database writer could replace both content and digest. External signed/WORM retention remains a production gate.

## 12. “What Broke and How I Got Out”

### Approved 15-second story

**What broke:** GitHub Actions failed during PostgreSQL migrations with `DuplicateObject: type "user_role" already exists`.

**Root cause:** Migration 0002 explicitly created the enum and then the table-bound SQLAlchemy enum attempted to create it again. It failed even on a fresh database; deleting production state was not the answer.

**Fix:** The migration remains the single lifecycle owner. The PostgreSQL table reference uses `ENUM(..., create_type=False)`, while explicit `create(checkfirst=True)` and `drop(checkfirst=True)` preserve the intended schema.

**Validation:** Tests cover a fresh PostgreSQL database, existing 0002/later/head states, a pre-existing metadata-created enum, repeated head upgrades, downgrade/re-upgrade, data preservation and safe failure when an external table depends on the enum.

### Spoken version

“PostgreSQL failed because the role enum had two creation owners. I traced the full Alembic chain, made the migration the single owner, preserved existing schemas, and added fresh, existing-state, downgrade, and re-upgrade tests. The fix addressed lifecycle ownership instead of deleting the enum.”

## 13. Recording Environment Setup

### Browser and desktop

- Chromium or Chrome, one clean profile/window.
- Viewport/capture canvas: 1440×1000; browser zoom 90–100%, fixed for the whole take.
- Keep only the application tab open. Close email, GitHub settings, cloud consoles, password managers and personal tabs.
- Hide bookmarks bar, downloads, extensions, desktop icons and notification banners.
- Keep cursor visible; use deliberate single movements, never circles or frantic highlighting.

### Application startup: direct local mode

From the repository root:

```bash
cp .env.example backend/.env                 # only if backend/.env does not already exist
cd backend
.venv/bin/python -m alembic upgrade head
.venv/bin/python -m uvicorn app.main:app --reload --port 5001
```

In a second terminal from the root:

```bash
pnpm --filter @workspace/razorshield-ai dev
```

Direct mode uses SQLite and the in-memory limiter. Redis is therefore not part of the claim.

### Application startup: full local Compose mode

```bash
docker compose up --build
docker compose ps
```

Compose uses PostgreSQL 16 and Redis, serves the frontend on `http://localhost:5173`, and exposes the API on `http://localhost:8000`. Its credentials are local development values, not production secrets.

### Health URLs

- Direct backend: `http://127.0.0.1:5001/api/v1/health`
- Direct readiness: `http://127.0.0.1:5001/api/v1/ready`
- Compose backend: `http://127.0.0.1:8000/api/v1/health`
- Compose readiness: `http://127.0.0.1:8000/api/v1/ready`
- Frontend: `http://127.0.0.1:5173/`

### Data and credentials

- Use only public local-demo accounts documented in README.
- Pre-fill credentials off-camera; do not show the password.
- Use `DEMO-RISK-0001` only once per database. Reset by using a new deterministic suffix such as `DEMO-RISK-0002`; do not delete or reset the database during a take.
- Keep **Synthetic demo data** visible and use only fictional party details.

### Audio/video

- Capture 1440×1000 or 1920×1080, 25 or 30 fps, H.264 and AAC 48 kHz.
- Disable automatic microphone switching and system notification sounds.
- Record a 15-second audio test; target clean speech around -16 LUFS with peaks below -1 dBFS.
- AI-generated narration is acceptable because the user approved it; keep it natural, disclose it if the form/platform requires disclosure, and use no bottom sentence strip.
- Record one silent browser take and one narration backup. Keep source recordings outside Git.

## 14. Pre-Recording Health Checklist

### DO NOT RECORD UNTIL THIS PASSES

- [ ] Frontend loads at `http://127.0.0.1:5173/`.
- [ ] `curl -fsS http://127.0.0.1:5001/api/v1/health` returns `status: ok` in direct mode.
- [ ] `curl -fsS http://127.0.0.1:5001/api/v1/ready` returns database reachable.
- [ ] If using Compose, `docker compose ps` shows PostgreSQL and Redis healthy and backend/frontend running.
- [ ] The login page visibly labels Competition demo / Synthetic data.
- [ ] Admin authentication succeeds and no password appears in the capture.
- [ ] `/operations` loads model version `fraud-v3/anomaly-v3/fusion-v3/return-v3` and frozen metrics.
- [ ] A disposable `DEMO-RISK-DRYRUN` returns the intended HIGH result.
- [ ] The explanation contains fired rules and **Signal contribution**.
- [ ] Education payment returns 5/LOW with protective evidence.
- [ ] The chosen stored case has a decision snapshot and counterfactuals produce meaningful deltas.
- [ ] The investigator shows at least one policy source, missing information and `Financial action executed: no`.
- [ ] No external LLM is claimed. If an external provider is intentionally enabled, verify it separately and disclose the provider; otherwise mark LLM health N/A.
- [ ] Human escalation requires a reason and changes the case to ESCALATED.
- [ ] The matching audit event appears.
- [ ] Metrics page shows synthetic provenance and the exact numbers in section 8.
- [ ] Business-cost page labels assumptions and does not claim realized savings.
- [ ] Settings shows Agent safety and Authenticated profile.
- [ ] Browser console contains no new errors and backend logs contain no exception traceback.
- [ ] No broken link, hanging loading state, exposed token, API key, environment file or personal information is visible.
- [ ] Backend/ML tests and lint pass:

```bash
backend/.venv/bin/ruff format --check backend ml
backend/.venv/bin/ruff check backend ml
PYTHONPATH=backend:. backend/.venv/bin/python -m pytest backend/tests ml/tests
```

- [ ] Frozen metrics replay passes without fitting or promotion:

```bash
PYTHONPATH=backend:. backend/.venv/bin/python scripts/verify_submission_metrics.py \
  --output outputs/submission/metrics.json
```

- [ ] Frontend and browser checks pass:

```bash
pnpm run typecheck:libs
pnpm --filter @workspace/razorshield-ai typecheck
pnpm --filter @workspace/razorshield-ai build
RAZORSHIELD_E2E_UI_PORT=5175 RAZORSHIELD_E2E_API_PORT=5003 \
  pnpm --filter @workspace/razorshield-ai e2e
```

- [ ] PostgreSQL migrations pass on an explicitly disposable cluster when available:

```bash
RAZORSHIELD_POSTGRES_TEST_URL='postgresql+psycopg://USER:PASSWORD@HOST/postgres' \
  PYTHONPATH=backend:. backend/.venv/bin/python -m pytest \
  backend/tests/test_postgresql_migrations.py
```

Never paste real credentials into a recorded terminal. Run the PostgreSQL command before recording and show only the public CI result if needed.

## 15. One-Page Recording Cheat Sheet

| Time | Screen | Action | Say/idea | Expected result |
| --- | --- | --- | --- | --- |
| 00:00 | Login → Dashboard | Click Login | High value is not automatically fraud; synthetic demo | Risk overview |
| 00:15 | Architecture insert | Trace pipeline | Models recommend; human decides; audit follows | Human boundary clear |
| 00:35 | Assess | Submit `DEMO-RISK-0001` | Multiple contextual signals | 98 HIGH, manual review |
| 01:25 | Explanation | Open advanced evidence | Structured contributions, not SHAP or guilt | Rules + contribution list |
| 01:55 | Simulator | Education payment → Simulate | Context protects legitimate high value | 5 LOW |
| 02:25 | Investigation | What would change? → Run | Safe sensitivity, no write | 98→82 velocity; 98→22 combined |
| 02:55 | Investigation | Show policy/trace/missing | Lexical grounded assistance, not production LLM | Policy + no action |
| 03:30 | Human vs model | Reason → Escalate | Human owns decision | ESCALATED |
| 03:45 | Audit | Open Audit trail | Actor/time/event traceability | Matching event |
| 04:00 | Operations | Model health | Locked synthetic test, validation threshold | Exact metrics |
| 04:18 | Business impact | Evaluate policy | Costs and capacity are assumptions | Operating-point table |
| 04:30 | Settings | Agent safety/profile | Auth, RBAC, isolation, sessions, CI | Safety boundary |
| 04:45 | Engineering decisions | Enum ownership | Diagnose, fix, regress | Genuine failure story |
| 05:00 | End card | Cut | Evidence-led, human-controlled, auditable | End exactly |

## 16. Recruiter Attention Map

| Timestamp | What recruiter sees | Why it matters | Technical signal | Question answered |
| --- | --- | --- | --- | --- |
| 00:00 | Authenticated product and synthetic label | Immediate credibility | Product ownership, honest provenance | “What problem did they solve?” |
| 00:15 | Risk-to-decision architecture | Establishes system thinking | Trust boundaries, service architecture | “Do they understand the system?” |
| 00:35 | Live 95/HIGH case | Proves working detector | API, features, artifacts, fusion | “Is it actually working?” |
| 01:25 | Evidence and contributions | Makes output inspectable | Explainability discipline | “Why this decision?” |
| 01:55 | ₹120k education case at 5/LOW | Defeats amount-rule criticism | Contextual modeling, protective rules | “Is this more than a threshold?” |
| 02:25 | Meaningful what-if deltas | Shows operational judgment | Non-persisting replay, snapshot integrity | “Can investigators test uncertainty?” |
| 02:55 | Policy source and tool trace | Gives AI a justified role | Grounding and least authority | “Why use GenAI; does it decide?” |
| 03:30 | Reasoned escalation | Demonstrates governance | RBAC, human-in-loop | “Can a human override?” |
| 03:45 | Audit event | Shows accountability | Persisted event trail | “Is it auditable?” |
| 04:00 | Honest weak metrics | Signals ML maturity | Temporal split, threshold, calibration/cost | “Are metrics real and understood?” |
| 04:30 | Safety settings | Shows production awareness | Auth, isolation, rate limits, sessions | “Can they build securely?” |
| 04:45 | Enum failure and regression | Shows debugging ability | PostgreSQL/Alembic lifecycle | “Can they diagnose failure?” |

Collectively the video answers: this person can build an end-to-end system, evaluate rather than decorate ML, use AI downstream of deterministic risk evidence, preserve human authority, and debug infrastructure failures.

## 17. Common Mistakes to Avoid

1. Do not call 95/100 a 95% probability of fraud.
2. Do not call the deployed explanation SHAP.
3. Do not call lexical overlap a vector database or semantic RAG.
4. Do not imply Gemini or another external LLM produced the local report.
5. Do not call anomaly accuracy; anomaly and fraud labels answer different questions.
6. Do not present IEEE-CIS candidate metrics as the deployed API result.
7. Do not hide 36.23% precision or claim production readiness.
8. Do not say modeled cost equals money saved.
9. Do not confirm fictional fraud; escalate or request evidence.
10. Do not claim automatic blocking, refunds, chargeback submission or account action.
11. Do not record the saturated 100-point preset for counterfactuals.
12. Do not retrain, upload a large dataset, reset the database or edit rules during the take.
13. Do not expose credentials, tokens, `.env`, cookies, personal tabs or private data.
14. Do not show source code for more than zero seconds; the application and evidence are stronger.
15. Do not linger on loading states or scroll rapidly.
16. Do not call the architecture insert a live route.
17. Do not say the audit is tamper-proof or production WORM storage.
18. Do not say passing CI means production deployment passed.
19. Do not add bottom narration sentences; they compete with the interface.
20. Do not exceed five minutes.

## 18. Final Video Readiness Score

| Dimension | Score / 100 | Rationale |
| --- | ---: | --- |
| Product readiness | 84 | Broad working workflow; still a competition reference system |
| ML validation | 66 | Good temporal discipline and reproducibility; synthetic performance is weak and not production-valid |
| Demo reliability | 82 | Existing exact five-minute automation passed; current local servers must be restarted and the new golden case rehearsed |
| AI/RAG demonstration | 58 | Grounded and bounded, but lexical/deterministic rather than production LLM/vector RAG |
| Explainability | 78 | Strong structured evidence; deployed path is not SHAP |
| Security | 82 | Meaningful controls and green checks; managed production controls remain open |
| Human-in-loop | 92 | Clear reasoned review boundary and no financial execution |
| Auditability | 87 | Strong trace and snapshot digest; external immutable retention absent |
| Storytelling | 91 | Excellent suspicious-versus-legitimate contrast and failure story |
| Recruiter appeal | 88 | Demonstrates full-stack, ML, AI governance and debugging skill |
| **Overall video readiness** | **81 / 100** | **Ready after the critical rehearsal gates below; not a production-readiness score** |

## 19. Critical Fixes Before Recording

### CRITICAL — must complete

1. Start the frontend/backend (or Compose) and make both health endpoints pass. They were not listening during this audit.
2. Dry-run the full persisted `DEMO-RISK-0001` path. Record only if it returns 98/HIGH and the snapshot replay returns 82 for normal velocity and 22/LOW for all four assumptions. The old 100-point preset is not acceptable for that scene.
3. Keep the synthetic/demo label visible and use the exact claim boundaries for explanations and RAG.
4. Confirm the metrics page matches the frozen manifest values exactly.
5. Confirm no secret, password, token or personal browser content appears in any frame.

### HIGH — strongly recommended

1. Use a prefilled assessment form and a fresh deterministic transaction ID to eliminate typing time and duplicate-ID failures.
2. Preload the investigation once so policy retrieval and the trace are cached/ready.
3. Verify the audit event appears immediately after escalation.
4. Run the ordinary E2E suite and metrics replay on the recording machine.
5. Replace the current recording’s saturated counterfactual scene with the unsaturated persisted 98→22 case.

### MEDIUM — optional

1. Add a small unobtrusive editor title to the architecture insert: “Verified architecture overview,” so viewers know it is explanatory.
2. Use the complete sender/receiver dataset as backup material for Q&A, not the five-minute main flow.
3. Prepare one backup take using `SIM-HIGH-VELOCITY` if manual assessment context changes unexpectedly.

### SKIP — do not spend time

- Do not integrate a new LLM/vector database just for the submission video.
- Do not retrain until metrics look prettier.
- Do not deploy to cloud solely for the video.
- Do not redesign the UI.
- Do not add more charts, animations, feature pages or code footage.
- Do not publish large model binaries inside the video workflow.

## 20. Final 30-Minute Dry Run Procedure

### Minute 00–05 — Clean environment

1. Enable Do Not Disturb.
2. Close all applications except the recorder and one clean browser window.
3. Confirm 1440×1000 capture, fixed zoom, visible cursor and selected microphone/voice.
4. Confirm at least 2 GB free recording space.
5. Start backend/frontend or Compose; keep terminals off the recorded desktop.

### Minute 05–10 — Health and identity

1. Open `/api/v1/health` and `/api/v1/ready` outside the capture window; both must pass.
2. If Compose is used, confirm PostgreSQL and Redis healthy with `docker compose ps`.
3. Open the frontend, confirm the synthetic label, login, logout, then login again.
4. Confirm no browser console error after dashboard load.

### Minute 10–15 — Golden detection and contrast

1. Submit `DEMO-RISK-DRYRUN` with the exact `DEMO-RISK-0001` fields.
2. Confirm HIGH/manual review, fired evidence and contribution panel.
3. Open Risk simulator → Education payment → Simulate.
4. Confirm 5/LOW and protective evidence.
5. If any result differs materially, stop. Do not improvise narration or change metrics.

### Minute 15–20 — Sensitivity, investigator and review

1. Open the dry-run investigation.
2. Run counterfactuals. Confirm device/velocity/combined rows visibly change; target 98→93, 98→82 and 98→22.
3. Confirm policy name/version/excerpt, missing information, tool trace and no financial action.
4. Enter a rehearsal reason and choose **Request evidence**, not Escalate, if you need to preserve the hero action for the final transaction ID.
5. Confirm the audit event appears.

### Minute 20–25 — Metrics, safety and ending

1. Open Operations and compare every displayed metric with section 8.
2. Run Business impact and confirm assumptions are labeled.
3. Open Settings and frame Agent safety plus Authenticated profile.
4. Open Engineering decisions and frame PostgreSQL enum ownership without scrolling.
5. Verify the architecture insert contains no unsupported claim.

### Minute 25–28 — Timed silent pass

Perform the actions from section 15 without narration. Hit every transition within ±2 seconds. If typing or scrolling causes delay, prefill or tighten the edit; never speed-read the metrics.

### Minute 28–30 — Capture gate

1. Record and play back a 15-second audio sample.
2. Confirm no notification, password, personal data or bottom narration strip.
3. Choose a fresh hero ID, normally `DEMO-RISK-0001`.
4. Start the final recording only when every CRITICAL item is green.
5. After export, verify duration, streams and decode:

```bash
ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 OUTPUT.mp4
ffprobe -v error -show_streams OUTPUT.mp4
ffmpeg -v error -i OUTPUT.mp4 -f null -
shasum -a 256 OUTPUT.mp4
```

The current verified reference export is `outputs/submission/razorshield-recruiter-pitch-final-v2.mp4`, exactly 300.000 seconds, with no subtitle stream. Preserve it as a backup; record a new version only after the meaningful-counterfactual dry run passes.
