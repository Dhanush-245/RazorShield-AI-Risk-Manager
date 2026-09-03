# Risk-operations upgrade verification — 2026-08-31

## Implemented scope

The [technical decision log](../decisions.md) maps the supplied upgrade brief to the implementation.
The seven prioritized capabilities are integrated with the existing application; supporting replay,
behavioral fingerprint, observed relationship patterns, admin property tests and engineering-decision views
are included. Existing ML artifacts, scoring logic and default investigation-provider behavior are unchanged.
No real merchant dataset was uploaded, removed or retrained during this work.

## Automated results

| Check | Result |
| --- | --- |
| Complete backend + ML suite with real PostgreSQL migration opt-in | **81 passed** |
| New workbench regressions (included above) | **11 passed** |
| Full Chromium E2E suite | **3 passed**, 1 older opt-in recording test skipped |
| New operations browser rehearsal | Passed: ingestion, live assessment, parties, investigator, counterfactuals, education context, review, audit, health, costs, patterns, stress lab, mobile overflow check |
| PostgreSQL migrations | Fresh, existing-state, enum reuse, preserved users, repeat upgrade, safe downgrade/re-upgrade covered by the full suite |
| Ruff backend + ML | Lint passed; all 81 files formatted |
| RazorShield frontend typecheck | Passed |
| RazorShield production build | Passed; existing sourcemap notices and bundle-size warning remain |
| Workspace-wide typecheck | **Fails outside RazorShield** in two existing `IndustrialSneakerComparison` templates under `artifacts/mockup-sandbox`; not changed |
| Existing localhost:5001 API health | `{"status":"ok","service":"razorshield-api"}` |
| Remote GitHub CI / deployment | Not run or claimed; changes are local and unpushed |

New backend tests assert no ledger/case/audit writes during simulation, true model outputs, component percentage
units, five counterfactuals, excluded contact data, digest tamper rejection, legacy snapshot unavailability,
active-dataset isolation, cross-merchant 404s, role boundaries, reason/outcome consistency, no truth-label mutation,
cost arithmetic, missing-label behavior, eight property checks, numeric/categorical drift, constant-reference
drift detection, and prior-only behavioral history (excluding already-ingested future events).

Commands run from the repo root:

```sh
RAZORSHIELD_POSTGRES_TEST_URL=postgresql+psycopg://razorshield_migration_test@127.0.0.1:55432/postgres PYTHONPATH=backend:. backend/.venv/bin/python -m pytest backend/tests ml/tests -q --disable-warnings
backend/.venv/bin/ruff format --check backend ml
backend/.venv/bin/ruff check backend ml
pnpm --filter @workspace/razorshield-ai typecheck
pnpm --filter @workspace/razorshield-ai build
RAZORSHIELD_E2E_UI_PORT=5175 RAZORSHIELD_E2E_API_PORT=5003 pnpm --filter @workspace/razorshield-ai exec playwright test --workers=1
```

The tests use disposable SQLite/PostgreSQL databases. The original migration regression fixture creates and
removes only its own UUID-named databases. The recording uses separate ports and a fresh temporary SQLite database.

## Recorded facts, not scripted scores

- Manual suspicious transaction: actual HIGH response from current engines; no financial action.
- Imported `FULL-TX-0002`: stored and recomputed score 100; combined hypothetical changes return 99, still HIGH.
- Fictional education payment: actual score 5, LOW, with fired protective-context explanation.
- Human action: escalate with an evidence-based reason; outcome UNDETERMINED.
- Demo dataset: 24 uploaded fictional records plus one live manual assessment. Drift correctly reports
  INSUFFICIENT_DATA because each reference/recent window requires at least 30 samples.
- Model health reports deployed synthetic precision 36.23%, recall 52.22%, F1 42.78%, PR-AUC 41.18%, FPR 9.95%.
  These results are not newly improved by this interface work and are not real merchant performance.
- Counterfactuals, cost projections and reviewer feedback retain explicit evidence/provenance limitations.

## Media

The new [narration and reproduction guide](../submission/RISK_OPERATIONS_NARRATION.md) covers authentication,
the risk-operations story, actual metrics/limitations, and the Buildathon's debugging question.
The paced recording passed all twelve chapters in one continuous Chromium session (5.0 minutes).
The MP4 was inspected at authentication, manual scoring, evidence, simulation, cost and closing frames;
there is no injected bottom caption band and no subtitle stream. Source video was copied unchanged into
the narrated output (matching encoded video-track SHA-256 before/after audio mux).

- Final file: `outputs/submission/razorshield-risk-operations-demo.mp4`
- Duration: **300.000 seconds**
- Video: H.264, **1440 × 1000**, full viewport; no cropping away application content
- Audio: AAC, **48 kHz mono**, local macOS default synthetic voice, narration disclosed at the beginning
- Size: **26,015,172 bytes**
- SHA-256: `43a467a7e3af84b7b09cfc8f30265d2e2c319145838b0030c208a5ba4ac678a1`
- Silent MP4, original WebM, narration metadata and visual QA frames are preserved beside it.
- Final FFmpeg decode check passed. This file is local and ignored by Git; no video was uploaded externally.

The disposable PostgreSQL cluster was stopped after verification. Existing application ports and data were
left in place. Recording scripts use an isolated test database and never target the user's merchant database.
