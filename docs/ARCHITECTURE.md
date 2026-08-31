# Architecture

React/Vite is the analyst surface. FastAPI is the only trust boundary for authentication, RBAC, merchant isolation, validation, scoring, reviews, and audit. SQLAlchemy targets PostgreSQL in Compose and uses SQLite for zero-setup development. Alembic owns production schema evolution.

Single and batch assessment requests use the same server-side scoring and persistence path. Operational projections power merchant-scoped search, the transaction ledger, review queue, customer 360, case timelines, notifications, fraud-spike intelligence, analytics, and settings without duplicating risk logic in the browser.

Dataset activation is atomic. Each batch receives an immutable dataset ID; only after every row is validated, scored, and persisted does the merchant's active dataset pointer change. All operational queries apply that pointer at the transaction boundary. Previous data remains preserved for traceability, while subsequent real-time assessments join the active dataset.

Inference loads immutable Joblib artifacts at process start-on-demand: balanced logistic fraud probability, Isolation Forest anomaly score, deterministic behavior/velocity/graph/rule evidence, random-forest return risk, and a learned logistic fusion model. No request trains a model. NetworkX derives customer/device components from stored merchant transactions.

High/medium scores create cases. Investigation exposes facts, inferences, missing evidence, provenance, and limitations separately. Policy retrieval ranks only active merchant-owned policy records. The bounded agent has an allowlist of read/recommend tools, persists every call, and cannot execute a payment, refund, block, or external submission. Human decisions are role-gated and audited.

The system is a competition-ready reference architecture, not a certified production fraud control. Production adoption requires real merchant data, recalibration, distributed rate limiting, managed secrets, provider-backed OTP delivery, operational monitoring, and security/compliance review.
