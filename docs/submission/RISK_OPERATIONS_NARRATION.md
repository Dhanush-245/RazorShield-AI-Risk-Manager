# Five-minute risk-operations demo

Continuous isolated browser recording; local AI-generated narration using the original system voice.
No bottom captions or narration sentences are injected into the application. All names/accounts/data are
fictional. This is a workflow demonstration, not model validation. The 25-record demo is too small for
the 30-per-window drift requirement; the screen must show insufficient data, not invented drift.

## 0:00–0:20 · Merchant access and the problem

“This is an AI-narrated demo of RazorShield AI, Track Two: AI Risk Manager. Merchants need more than a fraud score. They need evidence, an investigation, and a defensible decision. We start with authenticated merchant access. Admins, analysts, reviewers, and viewers have different permissions.”

## 0:20–0:45 · Dataset ingestion

“I am uploading twenty-four fictional transactions, with customer names, sender and receiver account references, banks, and behavioral context. The application converts the file and runs its risk pipeline. The dashboard summarizes that active dataset. These are demonstration records, not real customers, confirmed fraud, or money saved. Uploaded labels are separate from reviewer opinions.”

## 0:45–1:15 · Live suspicious transaction

“Now I enter a new transaction: one hundred and twenty thousand rupees, compared with a five-thousand-rupee customer baseline. There is elevated activity, failed attempts, a new device, and an unusual location. The current models and rules calculate the result live. Fraud, anomaly, behavior, velocity, graph, and contextual rules feed fusion. The result recommends manual review. It does not block a payment or prove fraud. An unusual transaction is not automatically a fraudulent one.”

## 1:15–1:42 · Parties and timeline

“Let's inspect Diya Patel's imported payment to Rapid Digital Exchange. Both parties' account references and contact details are available for review. These are submitted details, not independent bank verification. The timeline separates recorded actions from feature observations. It does not invent login events or additive risk points. The customer fingerprint uses only prior records.”

## 1:42–2:05 · Bounded investigation

“The investigator gathers evidence and policy to organize a review recommendation. The trace exposes its steps, and missing information stays missing. This is bounded local orchestration with lexical retrieval, not a production language-model service. It cannot fabricate evidence or execute financial actions. A human makes the final decision.”

## 2:05–2:33 · Counterfactual sensitivity

“What would change the assessment? We recompute verification, device, location, and velocity assumptions, separately and together. Stored enriched inputs and historical rules are used with currently loaded models. The combined score falls only to ninety-nine: other strong signals remain. This is sensitivity analysis, not a causal guarantee. No recipient is actually verified, and nothing is saved or paid.”

## 2:33–2:58 · Why not automatically fraud?

“The sandbox tests assumptions without creating transactions. This high-value education payment has a familiar verified recipient and ordinary activity. The same pipeline returns five out of a hundred: low risk. Protective evidence explains why amount alone is not a verdict. Age is not an optimization control. The score is an index, not a probability of guilt.”

## 2:58–3:26 · Human review

“The reviewer compares the model assessment with human judgment. An evidence-based reason is required. I escalate because the recipient relationship and delivery evidence need another reviewer. The case records that decision. Reviewers can also request evidence, mark legitimate, or record a fraud judgment. Their assertions remain separate from ground-truth labels. No automatic retraining or financial action follows.”

## 3:26–3:45 · Audit and replay

“The audit trail records the escalation. Data-to-decision replay exposes the stored inputs, engineered features, rules, model outputs, and human decision. New snapshots include an integrity digest. This is not immutable external storage. Older records without snapshots are explicitly unavailable rather than reconstructed with invented evidence.”

## 3:45–4:10 · Measured model health

“Model health shows recorded precision, recall, F-one, precision-recall area, and false-positive rate. These synthetic results still need improvement. The real-data candidate remains behind promotion gates. Drift compares older and newer feature distributions. This small demonstration correctly shows insufficient data. Distribution change is not a fraud label, and these screens do not establish production readiness.”

## 4:10–4:35 · Business cost and capacity

“A useful model must fit review capacity. This simulator compares thresholds against supplied labels, balancing missed fraud, false positives, and review costs. Daily projections use explicit volume and prevalence assumptions. This is exploratory analysis, not held-out validation or confirmed savings. Unlabeled records are excluded, policy stays unchanged, and projected workload can exceed capacity.”

## 4:35–5:00 · What broke and how we got out

“What broke? Postgres created the role enum twice. We gave its migration one explicit owner and tested fresh databases, existing users, and safe downgrades. Model quality and grounding taught us to separate evidence from optimistic claims. The decision log documents those choices. RazorShield connects detection, simulation, human review, and audit: a measured prototype, with people in control.”

## Reproduce

```sh
RAZORSHIELD_E2E_UI_PORT=5175 RAZORSHIELD_E2E_API_PORT=5003 RAZORSHIELD_RECORD_OPERATIONS_DEMO=1 RAZORSHIELD_E2E_RECORD=1 pnpm --filter @workspace/razorshield-ai exec playwright test e2e/risk-operations-demo.spec.ts --workers=1
```

Omit both recording flags for a quick regression rehearsal. No existing merchant database is used.
Generated files live under ignored `outputs/submission/`; do not commit video or browser traces containing tokens.
The public repository, track, problem, architecture, measured limitations and debugging story are covered;
personal form answers, a resume and the externally hosted video URL still require the applicant.
