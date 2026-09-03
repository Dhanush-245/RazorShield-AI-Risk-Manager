# What broke — and how we got out

## 01 — PostgreSQL enum created twice

**Problem:** CI failed with `DuplicateObject: type "user_role" already exists`.

**Investigation:** Migration 0002 explicitly created the enum, then its `sa.Enum` table attachment
triggered another CREATE TYPE. This failed even on an empty database; it was not necessarily corrupt history.

**Fix:** Use PostgreSQL `ENUM(..., create_type=False)` for the table reference while preserving the migration's
explicit `create(checkfirst=True)` / `drop(checkfirst=True)` lifecycle. No database enum deletion or blind stamping.

**Evidence:** [Complete migration-chain analysis and PostgreSQL regression results](verification/postgresql-enum-migration-2026-08-31.md).
Tests cover fresh databases, existing migration states, pre-existing model enums, data preservation, upgrade
repeatability, downgrade/re-upgrade and safe refusal when another table depends on the enum.

## 02 — An impressive demo did not mean strong fraud performance

**Problem:** Synthetic held-out performance was insufficient for an unsupported production claim. A separate
IEEE-CIS model had a different feature contract and did not satisfy its promotion conditions.

**Response:** Keep temporal evaluation, disclose precision/recall/F1/PR-AUC/FPR, preserve the candidate-only
boundary, and evaluate cost versus review capacity. Do not replace a deployed metric with another dataset's
better-looking number. This upgrade exposes the measured results and adds explicit cost simulation; it does
**not** retrain models or claim improved precision from a UI change.

**Evidence:** [Evaluation report](EVALUATION.md), [model pipeline](REAL_ML_PIPELINE.md), and the new
workbench regression tests. Production validation is still an open gate, not a solved metric.

## 03 — Grounding must be more than polished prose

**Problem:** A fluent response can sound like evidence or a financial decision even when facts are missing.

**Response:** Keep default orchestration bounded, show retrieved policy/evidence sources and missing details,
require a human decision, and label lexical retrieval accurately. Optional LLM output must remain constrained
by structured evidence. No fabricated delivery confirmations, unsupported SHAP claims or autonomous payments.

**Evidence:** [Agent policy](AGENT_POLICY.md), existing policy-grounding tests and browser investigation flow.
Production embedding retrieval/LLM reliability is not newly established by this work.

## 04 — Replaying an old decision without old inputs

**Problem:** A reconstructed request could mix current history or rule settings into an older decision and
misrepresent a hypothetical change as a proven causal improvement.

**Fix:** Capture enriched inputs, feature vector, rules, model versions and outputs atomically with each new
assessment. Verify the digest on replay, disclose current-model execution, and reject sensitivity analysis for
legacy records without snapshots. Display observations at their assessment time, not invented login timestamps.

**Regression:** Snapshot privacy/integrity, stored-score equality with unchanged models, no-write simulation,
legacy 409 behavior, active-dataset isolation, role restrictions and null-safe business calculations.

## 05 — Reviewer disagreement was not an external truth label

**Fix:** Store reviewer reason/outcome separately as monitoring feedback. Do not overwrite supplied labels,
retrain automatically or infer that every disagreement proves a model error. Require a matching outcome and
decision in the new review workspace. The browser demonstrates escalation rather than claiming a fictional
customer has committed fraud.

## Remaining boundaries

- Real merchant validation, external evidence verification, managed deployment and external audit retention
  still require appropriate data, infrastructure and approval.
- Existing chargeback lookup expects TX-prefixed IDs; arbitrary-ID chargeback routing remains a known issue
  outside this focused operations upgrade.
- Local tests do not prove a remote GitHub Actions run or a cloud deployment passed.
