# Complete-party dataset verification — 2026-08-31

## Scope

Local development UI at localhost:5173 and FastAPI at localhost:5001. The test file is `examples/complete-party-details.csv`: 24 synthetic transactions, 48 columns, 8 customer identities, 4 recipient entities, six fabricated fraud labels and six return labels. It contains no real customer banking credentials. No model training or financial action was performed.

## Verified results

- Browser upload: **24/24 converted, scored and stored; 48 columns mapped; no unmapped columns**.
- API regression: all 24 investigations return exact sender/receiver names, IDs, contacts, accounts, banks and IFSCs from the file; amounts/currency match. Dashboard and analytics show 24 transactions and six supplied fraud labels, with complete label coverage.
- Browser investigation `FULL-TX-0002`: Diya Patel, `CUST-002`, `SYNTH-SEND-0002`, ICICI Bank → Rapid Digital Exchange, `REC-UNKNOWN-02`, `SYNTH-RECV-1002`, Unknown Digital Bank; INR 66,700. Both parties' contacts and IFSCs are visible. Delivery confirmation remains missing, not fabricated.
- The investigation has source evidence, risk signals, case timeline, bounded-agent output and the human-review boundary. It states that no financial action was executed.
- A discovered history bug included future customer/device events when constructing the investigation. Queries now restrict to the same merchant, same dataset and strictly earlier event timestamps. Regression checks assert no prior history for `FULL-TX-0002`, and exactly one prior transaction averaging INR 66,700 for `FULL-TX-0010`.
- Policy retrieval scores are rankings and can exceed 1; the UI now labels them as relevance scores instead of misleading percentages.

## Scoring limitations (not a production benchmark)

The observed local configuration returned 12 high-, six medium-, and six low-risk rows, average risk 66.3/100. All six fabricated fraud-labelled rows were high risk; all six education rows were also high risk despite false fraud labels. With HIGH as the positive decision, this is TP=6, FP=6, TN=12, FN=0: precision 50%, recall 100%, false-positive rate 33.3%, accuracy 75% on this tiny hand-crafted dataset only. Medium-risk rows still request verification, so operational review workload is higher than the HIGH-only count.

The fixture includes shared recipients, repeated customer histories and large relationship counts; some context is outside the synthetic training distribution. These outcomes warrant a separate false-positive investigation and representative merchant validation. They do **not** justify tuning thresholds to this fixture, retraining on 24 rows, claiming perfect results, or promoting the IEEE-CIS candidate.

Upload measured average inference was 5.61 ms locally (model timing, not full request latency and not a load-test SLO). Model versions, persisted rule configuration and prior-only history can affect results; a fresh checkout need not reproduce these exact risk scores.

## Reproduce the functional checks

Local suite: 59 tests passed with the optional candidate artifacts present. A clean export of the staged repository also passed: 57 tests, with two explicit candidate-binary-dependent skips. The complete fresh SQLite migration chain passed through `20260829_0011`. Shared-library and application typechecking, production frontend build, and Python lint passed. A common credential-pattern scan found no matches in files selected for publishing; this is not a complete security audit. Docker/PostgreSQL and external provider checks are not claimed as verified by this local run.

```bash
PYTHONPATH=backend:. backend/.venv/bin/python -m pytest backend/tests/test_auth_api.py -k complete_party -q
PYTHONPATH=backend:. backend/.venv/bin/python -m pytest backend/tests ml/tests
backend/.venv/bin/ruff format --check backend ml
backend/.venv/bin/ruff check backend ml
pnpm run typecheck:libs
pnpm --filter @workspace/razorshield-ai typecheck
pnpm --filter @workspace/razorshield-ai build
```

The browser test is a functional check, not security certification or real-world ML evaluation. PostgreSQL/container/provider verification remains a distinct deployment gate.
