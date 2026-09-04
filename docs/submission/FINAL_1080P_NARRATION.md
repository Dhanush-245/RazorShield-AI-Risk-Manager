# RazorShield AI — final native-1080p narration

The narration is AI-generated with the macOS default synthetic voice. Data and
metrics shown in the demo are synthetic and are not production-performance claims.

## 0:00–0:20 · Problem and main dashboard

“A high-value transaction is not automatically fraudulent. Risk needs context. RazorShield gives investigators a clear operational overview of one thousand scored events, including average risk, active cases, fraud signals, chargeback candidates, and potential loss, before they inspect any individual pattern.”

## 0:20–0:25 · Dashboard trend

“Risk intensity clearly shows how scored activity changes over time.”

## 0:25–0:45 · Product and architecture

“Transactions enter through API, batch, or manual assessment. Fraud, anomaly, behavior, velocity, graph, and rules engines fuse trusted features. Evidence and policy support investigation; an authorized human decides; and audit preserves accountability.”

## 0:45–1:45 · Suspicious transaction

“Now I assess a suspicious synthetic transaction. The amount is sixty thousand rupees, versus a customer average of twenty thousand. It uses a new device and location, with elevated velocity across five-minute, fifteen-minute, and hourly windows. The recipient is unknown, unverified, and has no prior customer relationship. The result is ninety-eight out of one hundred: high risk, with manual review recommended. The result panel keeps this decision visible while showing four evidence signals. Fraud probability, anomaly, behavior, velocity, graph context, and deterministic rules contribute to fusion. This is not an amount-only decision. Customer baseline, device recognition, geographic deviation, frequency, and recipient history are evaluated together. The observed values remain available for human review, the case is created for investigation, and no payment action is executed automatically.”

## 1:45–2:00 · Risk evidence and graph

“RazorShield exposes contributing signals and observed values. Its relationship view connects stored customers, devices, and recipients for investigation, without treating unusual patterns as proof of fraud.”

## 2:00–2:35 · Education payment

“Next is a high-value education payment of one lakh twenty thousand rupees. Its amount matches the customer baseline. The recipient is verified, previously used, and categorized as education. Device, location, and velocity remain consistent. The pipeline returns five out of one hundred, low risk, with an allow recommendation. The visible protective evidence explains the outcome: this is a known recipient, on a recognized pattern, without elevated velocity or unusual location. This shows why amount alone cannot determine fraud.”

## 2:35–3:05 · Counterfactual values

“This workbench starts from the stored score of ninety-eight. The table shows each hypothetical result: recipient verified, ninety-seven; device recognized, ninety-three; location recognized, ninety-five; and velocity normal, eighty-two. The velocity scenario creates the largest single reduction shown here. These are sensitivity tests against frozen evidence. They do not overwrite the original assessment or execute a financial action.”

## 3:05–3:40 · AI investigation and policy retrieval

“The investigation assistant organizes stored evidence, identifies what is known and missing, and retrieves the relevant company policy. Recipient, device, location, velocity, and history remain visible. Missing information stays labeled not collected. The visible policy requires manual review for high-risk transactions and preserves human control. The assistant is evidence-bound: it summarizes available facts, but does not invent missing evidence, alter the model score, or execute a payment decision.”

## 3:40–4:00 · Human evidence review

“The reviewer now has time to inspect the evidence, recipient details, policy, recommendation, and ninety-eight risk score together. The final operational decision remains with an authorized human, who records an evidence-based reason before escalating the case. No automated financial action is taken here.”

## 4:00–4:10 · Audit trail

“The audit trail records investigation completion, reviewer assignment, feedback, and escalation, preserving accountability from signal to decision.”

## 4:10–4:25 · ML validation

“Locked synthetic results are: precision thirty-six point two three, recall fifty-two point two two, F one forty-two point seven eight, P R A U C forty-one point one eight, and R O C A U C eighty-one point three five.”

## 4:25–4:45 · Business-impact assumptions

“The business simulator clearly labels its assumptions: review threshold seventy-one, five percent review capacity, one hundred rupees per false positive, five thousand per missed fraud, fifty per review, one hundred thousand daily transactions, and a one point two percent fraud rate. These inputs are assumptions, not observed losses.”

## 4:45–4:55 · Engineering and security

“The application includes authentication, authorization, validation, auditability, health checks, and automated testing.”

## 4:55–5:10 · What broke and how we got out

“Post gres failed when duplicate ownership created the user-role enum twice. I traced migration and initialization, fixed the conflict, and verified both database paths through regression tests and C I. The result is explainable and auditable.”
