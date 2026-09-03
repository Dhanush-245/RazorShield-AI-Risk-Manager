# Submission validation — 2026-08-31

## Observed results

| Check | Local result |
| --- | --- |
| Backend + ML, PostgreSQL enabled, without shell PYTHONPATH | 70 passed, no skips; 19.84 seconds |
| PostgreSQL migration regressions | 8 real PostgreSQL scenarios plus SQLite compatibility pass within full suite |
| Golden cases | Six risk scenarios plus deterministic replay and novelty sensitivity pass |
| Sender/receiver dataset | Existing 24-row, 48-column round-trip test passes |
| Frozen synthetic artifact replay | All four model reports, thresholds, confusion matrices and fusion costs reproduced |
| Frozen IEEE-CIS v2 replay | 88,581 test rows; all three historical operating-point reports reproduced |
| Browser tests | 2 passed; latest capture run 7.3 seconds |
| Ruff, scoped TypeScript, frontend build | Passed; existing source-map/chunk-size warnings are not build failures |
| Python and production JavaScript dependency audits | No known vulnerabilities found; editable local application excluded from package audit |
| Five-minute narrated walkthrough | 300.02 seconds, 1920×1080 H.264, AAC audio, selectable captions; 6,947,276 bytes |

Tests are evidence of the checked scenarios, not a guarantee the demo cannot fail.
The backend suite still emits dependency deprecation warnings. Public checkouts
without licensed candidate binaries skip two candidate-dependent tests; PostgreSQL
tests require an explicitly configured disposable cluster.

The MP4 is `outputs/submission/razorshield-five-minute-draft.mp4`, with a matching
SRT caption file. It is a disclosed narrated screenshot walkthrough with a system
voice, not a live five-minute screen capture. The separate
`outputs/submission/live-browser-rehearsal.webm` records the actual passing browser
flow. A rendered video frame was inspected; codec/duration checks pass, and the
first 30 seconds contain non-silent audio (peak -5.5 dB). The owner should review
the entire narration and readability before publication. Both videos are ignored
by Git; screenshots and scripts are versionable. No microphone was accessed.

The disposable PostgreSQL server was stopped after verification. The user's
running application servers and dataset were left untouched.

## Reproducibility findings

The documentation previously described a historical 80/20 synthetic split and an
untrained IEEE pipeline. Updated docs now match artifacts: synthetic 60/20/20 and
IEEE 70/7.5/7.5/15. The verifier replays the frozen models and validation selection
without fitting or promoting anything. Source and artifact hashes accompany the
aggregate output; no merchant rows or raw IEEE data are included.

The historical IEEE capacity threshold was evaluated at full precision but
serialized to six decimals. Replaying the exported threshold yields one additional
true positive: `[TN, FP, FN, TP] = [83158, 2340, 1321, 1762]`, versus historical
`[83158, 2340, 1322, 1761]`. Both are recorded in the new aggregate report. This is
not an improvement experiment and no existing model/config artifacts were changed.

## Rehearsal findings

The browser flow produces LOW 6/100 for the normal fixture and HIGH 100/100 for
the suspicious fixture (INR 120,000, amount deviation, novelty and velocity).
These hand-crafted examples are functional demonstrations, not metric estimates.
Both have fabricated party references. Missing verification is not fabricated.
Reviewer escalation and audit events were verified; the agent executed no money
action. Monitoring requires the analyst role, so the rehearsal switches users.

Browser checks now wait for actual audit/model content, not only page headings,
before taking screenshots. Test databases and ports are isolated from the user's
running app. A pre-existing browser tab showed an expired session, motivating the
fresh-login instruction in the recording checklist; no active app data was changed.

## Current remote blocker

The initial read-only GitHub inspection found a private repository. Later on
2026-08-31 the owner changed visibility and a fresh API check confirmed **PUBLIC**.
The latest inspected CI remained failed run
`33377187862` on remote commit `64db0e49e6599f0f3881cf827c802f61217d38ae`.
Its failure was Python test collection (`ModuleNotFoundError: ml`), not the earlier
enum error. Local HEAD was `2e4b526` before these changes. Remote changes were not
merged or overwritten.

Added pytest paths relative to `backend/pyproject.toml` and switched CI to
`python -m pytest`. This removes dependency on shell import-path setup while
leaving application imports unchanged. The exact new invocation passes locally
with PYTHONPATH unset. Remote green requires publication and a new CI run; it is
not claimed here. The prior PostgreSQL migration fix/tests remain intact.

## Commands

```bash
env -u PYTHONPATH RAZORSHIELD_POSTGRES_TEST_URL=postgresql+psycopg://razorshield_migration_test@127.0.0.1:55432/postgres backend/.venv/bin/python -m pytest backend/tests ml/tests
PYTHONPATH=backend:. backend/.venv/bin/python scripts/verify_submission_metrics.py --transactions /authorized/train_transaction.csv --identity /authorized/train_identity.csv --output outputs/submission/metrics.json
RAZORSHIELD_E2E_UI_PORT=5175 RAZORSHIELD_E2E_API_PORT=5003 RAZORSHIELD_E2E_RECORD=1 pnpm --filter @workspace/razorshield-ai e2e
backend/.venv/bin/ruff format --check backend ml scripts/verify_submission_metrics.py
backend/.venv/bin/ruff check backend ml scripts/verify_submission_metrics.py
backend/.venv/bin/python -m pip_audit --skip-editable
pnpm audit --prod --audit-level high
pnpm run typecheck:libs && pnpm --filter @workspace/razorshield-ai typecheck
pnpm --filter @workspace/razorshield-ai build
```

No cloud deployment, visibility change, GitHub push, new model training,
production security approval or application submission is included in these results.
