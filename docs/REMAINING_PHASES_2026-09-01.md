# Remaining phases — local implementation checkpoint

This checkpoint records evidence, not a production-readiness claim. No commit,
push, release, or deployment was performed.

## Closed in this checkpoint

- Short-lived access tokens now have rotating, opaque refresh sessions stored as
  SHA-256 digests. The browser receives the refresh token only as an HttpOnly,
  SameSite=Strict cookie. Logout and password reset revoke sessions. Reuse of a
  rotated token revokes its replacement chain.
- Fraud-spike detection uses event time: the latest configurable 15-minute
  window is compared with the preceding configurable 24 hours. It requires at
  least 5 current and 20 baseline events and reports `INSUFFICIENT_DATA` rather
  than a false nominal result.
- Main model monitoring computes PSI for amount and total-variation distance for
  device, location, and high-risk-rate distributions over chronological older
  and newer windows. Metrics are withheld below 30 records per half.
- Historical replay now includes an explicit champion/challenger comparison on
  identical frozen enriched inputs. No automatic model promotion is performed.
- Outcome labels now store their observation timestamps and T2 merchant-asserted
  provenance. A configurable 45-day maturity horizon is enforced in training,
  calibration, slices, temporal replay metrics, and policy-cost analysis.
- The model-health API now reads and exposes the active manifest's cost-based
  operating policy. Viewing it does not mutate the policy.

## Verification evidence

- Python formatting and lint: pass.
- Backend and ML: 80 passed, 8 PostgreSQL-only skipped.
- Frontend type check and production build: pass.
- Browser E2E: 3 passed, 1 intentionally skipped recording tour.
- Refresh-token browser regression: pass after replacing the short-lived token
  in browser session storage with an expired value.
- Python and production JavaScript vulnerability audits: no known
  vulnerabilities reported.
- SQLite migration from zero to `20260901_0013`: pass. Re-running `upgrade head`
  on the existing migrated database: pass.

## Honest remaining release gates

- PostgreSQL is not running on this workstation, so PostgreSQL 16 migration
  lifecycle tests were skipped here. CI must run them against its real service.
- Docker is not installed on this workstation. Container builds and the
  PostgreSQL-backed Docker flow remain CI gates.
- IEEE-CIS pickle artifacts and verified SHAP execution exist locally, but the
  pickle files are intentionally gitignored. A clean public checkout cannot
  reproduce that candidate until an artifact distribution decision is made.
- The current platform-derived relationship features and graph evidence are
  real, but the fusion model has not been retrained with an explicit cycle/ring
  feature. Connectivity must not be presented as proof of collusion.
- The bounded investigator remains deterministic and grounded. It is not a
  production external LLM/RAG service and must not be described as one.
- `App.tsx` remains oversized. Component extraction is maintainability work, not
  evidence of better risk-model performance or security.
