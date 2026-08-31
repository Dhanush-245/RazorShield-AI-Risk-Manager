# Data dictionary

Core persisted records are merchants, users, password reset challenges, transactions, risk assessments, risk signals, cases, policies, bounded agent runs/tool calls, and audit events. IDs are opaque UUIDs internally; merchant-facing transaction and case references are stored separately.

`merchants.active_dataset_id` identifies the dataset currently driving merchant operations, with its display name and activation timestamp. `transactions.dataset_id` and `audit_events.dataset_id` preserve dataset lineage. Null dataset IDs identify the bundled demonstration baseline.

`risk_assessments` stores the 0–100 fusion score, LOW/MEDIUM/HIGH band, fraud probability, anomaly, behavior, velocity, graph, rules, return-risk scores, measured inference latency in milliseconds, engine versions, and explicit model provenance. `risk_signals` stores evidence text and contribution scores. Demo data uses INR and synthetic customer/device/location histories. Passwords and OTPs are Argon2 hashes; raw passwords and OTPs are never persisted.
