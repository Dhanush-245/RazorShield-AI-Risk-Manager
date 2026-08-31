# RazorShield deployment readiness — 2026-08-29

This report separates locally verified evidence, CI-enforced checks, and external production
sign-off. A candidate or local pass is not represented as production approval.

| # | Area | Verified result | Remaining production gate |
|---|---|---|---|
| 1 | ML performance | Five candidates were compared with calibration and cost/capacity-aware selection. XGBoost won. Locked temporal F1 operating point: precision 50.38%, recall 52.22%, F1 51.28%, PR-AUC 53.62%, ROC-AUC 90.90%, FPR 1.86%. At the capacity profile: precision 42.94%, recall 57.12%, F1 49.03%, review rate 4.63%. | The requested 85% recall and 80% precision are **not met**. Governance rejects promotion until representative merchant data and materially stronger features/modeling pass these targets. |
| 2 | Unseen test data | IEEE-CIS uses a locked chronological 15% test containing 88,581 rows; thresholds were selected before locked-test evaluation. | Run a merchant-specific out-of-time validation before promotion. |
| 3 | Fraud scenarios | A versioned golden suite covers normal, verified education, suspicious high-value, recipient burst, known-customer behavior, deterministic replay, one-feature sensitivity and adversarial out-of-distribution inputs. | Add scenarios whenever a new incident pattern is confirmed. |
| 4 | Complete risk pipeline | Fraud, anomaly, behavior, velocity, graph, rules, fusion, investigation, decision and audit are integration-tested. | Shadow-test with production event contracts. |
| 5 | Explainability | IEEE-CIS now uses permutation SHAP on the calibrated final probability. An automated additivity test verifies that base value plus contributions reconstructs the prediction. Contextual fusion is explicitly labeled structured contributions, not SHAP. | Establish explanation latency SLOs; permutation SHAP is intentionally slower. |
| 6 | RAG and LLM | Policy retrieval now ranks grounded matches, excludes zero-overlap content, active/inactive records and other merchants correctly, and the deterministic agent cannot execute financial actions or invent missing evidence. | Connect an approved embedding/LLM service only with evaluation, prompt-injection defenses, monitoring and a data-processing agreement. |
| 7 | Database integrity | SQLite migrations and 58 local Python/ML tests pass. CI provisions PostgreSQL 16 and runs the complete Alembic chain against it. Conflict-safe rule initialization supports SQLite and PostgreSQL. | A live Supabase PostgreSQL integration run and production backup/restore drill must pass. |
| 8 | Security | Argon2, scoped tokens, RBAC, tenant boundaries, validation, security headers, exact provider/CORS production guards, Redis atomic distributed throttling and fail-closed outage behavior are present. Twilio Verify send/check is implemented and outage-tested. Current Python/JS audits report no known vulnerabilities. | Supply live Twilio, Google Cloud Secret Manager and Upstash credentials; complete DAST and infrastructure review. |
| 9 | Performance/failures | Authenticated 10/100/1,000 load stages ran. After fixing a concurrent rule-configuration race: 0%, 0%, and 0.1% error rates; 1,000-stage throughput 115.28 tx/s, p50 79.51 ms, p95 617.34 ms. Model-outage and Redis-outage paths fail closed. | Repeat on production-equivalent PostgreSQL/Redis infrastructure, define latency/error SLOs, and inject database/network/worker outages. |
| 10 | End-to-end flow | 58 Python/ML tests, Chromium merchant-journey E2E, RazorShield frontend typecheck/build, SQLite migrations, API E2E, dependency audits and lint pass locally. CI adds PostgreSQL migration, browser E2E, Docker configuration/build and report upload gates. | Docker is unavailable on this workstation, so container and PostgreSQL results must be obtained from CI/staging before release. |

## Promotion decision

`ieee-cis-xgboost-v2` is **CANDIDATE_REJECTED_BY_GOVERNANCE**. It improves locked PR-AUC from
47.63% to 53.62% and keeps the capacity profile below the 5% hard review limit, but it does not meet
the requested recall/precision acceptance targets. Setting
`RAZORSHIELD_IEEE_CIS_PROMOTION_STATUS=approved` cannot bypass immutable evidence gates. The model
may be used only for authenticated, non-persisting schema-specific shadow evaluation until better
merchant labels/features, fairness, drift, rollback and named-owner sign-off are available.

## Evidence commands

```bash
PYTHONPATH=backend:. backend/.venv/bin/python -m pytest backend/tests ml/tests
backend/.venv/bin/ruff format --check backend ml scripts/load_test.py
backend/.venv/bin/ruff check backend ml scripts/load_test.py
pnpm --filter @workspace/razorshield-ai typecheck
pnpm --filter @workspace/razorshield-ai build
pnpm --filter @workspace/razorshield-ai e2e
backend/.venv/bin/python -m pip_audit --skip-editable
pnpm audit --prod --audit-level high
```

Measured load output is stored in `docs/verification/load-test-2026-08-28.json`.
