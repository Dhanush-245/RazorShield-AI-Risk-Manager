# Five-minute recruiter pitch

Continuous, isolated browser recording with disclosed AI-generated narration using the
preferred macOS default voice. No narration captions are injected into the product.
All transaction and identity data shown is fictional.

## 0:00–0:15 · Problem and product

“A one-lakh-rupee payment is not necessarily fraud, and a one-thousand-rupee payment is not necessarily safe. RazorShield AI combines contextual models, explainable evidence, and human review for better merchant risk decisions.”

## 0:15–0:30 · Architecture and decision boundary

“A transaction passes through feature engineering, fraud, anomaly, behavior, velocity, graph, and rules, then learned risk fusion. Evidence and retrieved policy support investigation. The system recommends; an authorized human decides, and every action is audited.”

## 0:30–1:20 · Suspicious transaction detection

“Here is a deterministic fictional scenario: sixty thousand rupees against a twenty-thousand-rupee customer baseline. The device is new, the recipient is unfamiliar and unverified, the location differs from normal behavior, and five payments reached the same recipient while short-window velocity increased. RazorShield validates the event, derives trusted platform features, runs the fraud and anomaly models, and evaluates behavior, velocity, graph relationships, and configured rules. Learned fusion combines those independent signals. The persisted result is ninety-eight out of one hundred, high risk, with manual review recommended. No single field creates that verdict. This is a risk index, not a probability of guilt; the system does not block or move money.”

## 1:20–1:50 · Explainability and behavior

“Investigators receive more than a score. RazorShield lists velocity, device, recipient, location, historical behavior, configured rule results, and the fusion model's relative local contributions. The important part is that the system isn't relying on transaction amount alone. These are signed model contributions and structured evidence—not causality, guilt, or SHAP for the deployed model.”

## 1:50–2:20 · Legitimate high-value context

“Now the same pipeline evaluates a one-hundred-and-twenty-thousand-rupee education payment. The recipient is a familiar verified institution, the device and location are known, previous payments support the relationship, and velocity remains ordinary. The live simulator returns five out of one hundred, low risk, and exposes protective evidence. The same high-value pattern can be legitimate when behavioral and recipient context support it. High value alone is never treated as fraud.”

## 2:20–2:50 · Simulator and counterfactuals

“The stored decision can be tested without changing the ledger. Normal velocity changes the risk index from ninety-eight to eighty-two, a sixteen-point reduction, and the combined assumptions move it to twenty-two. The simulator lets investigators understand which changes would materially alter the risk assessment. This is sensitivity analysis, not a causal promise; no customer, payment, policy, investigation, audit decision, or financial action is changed.”

## 2:50–3:30 · AI-assisted investigation and policy retrieval

“Why was this transaction flagged, and what evidence supports the assessment? The investigation copilot gathers only permitted evidence: the transaction, prior behavior, recent activity, observed device and recipient relationships, missing information, and applicable merchant policy. Its trace shows each allowlisted retrieval step and the exact policy source used in the recommendation. Evidence that was never supplied remains visibly unavailable. This local version uses deterministic orchestration and lexical retrieval, not a production LLM service. The AI assists the investigator; it doesn't independently execute a financial action.”

## 3:30–4:00 · Human review and audit

“The reviewer compares the assessment with its evidence, supplies a reason, and escalates because the recipient remains unverified. That human assertion stays separate from supplied outcome labels and cannot rewrite training truth. It triggers no automatic retraining or financial action. The audit records the decision, actor, timestamp, case, and prior steps, making the process reviewable and accountable rather than merely predictive.”

## 4:00–4:30 · Held-out metrics and business cost

“Model health reports frozen synthetic fusion on twelve thousand locked temporal test rows: thirty-six point two three percent precision, fifty-two point two two percent recall, forty-two point seven eight percent F-one, forty-one point one eight percent P-R A-U-C, eighty-one point three five percent R-O-C A-U-C, and nine point nine five percent false-positive rate. The confusion matrix is shown here. Thresholds are selected on validation data, not the locked test. These are reproducible diagnostics—not production results or confirmed savings.”

## 4:30–4:45 · Security and reliability

“Security includes merchant-scoped authentication, role-based access, validation, rate limiting, rotating refresh sessions, audit logging, and a defense-only agent. GitHub verification passes migrations, security audits, browser tests, and container builds.”

## 4:45–5:00 · What broke and how it was fixed

“PostgreSQL failed when the user-role enum was created twice. I traced the migration and schema-initialization paths, assigned creation one owner, and added fresh, existing-state, downgrade, and CI verification. The goal wasn't just to build a fraud model, but to build an explainable and auditable risk workflow around it.”
