# Risk trust boundary and replay evidence

RazorShield is advisory: the model ranks risk, the human reviewer decides, and
no model, rule, or agent executes a financial action.

## Feature provenance tiers

- `T0_PLATFORM_OBSERVED`: transaction facts observed at ingestion, such as the
  amount and event timestamp.
- `T1_PLATFORM_DERIVED`: prior-only, merchant- and dataset-scoped history such
  as velocity, customer baseline, device sharing, recipient degree, and prior
  customer-recipient use.
- `T2_MERCHANT_ASSERTED`: submitted context that is retained as evidence but
  can only raise risk when used for scoring. Protective assertions cannot lower
  the score without a separate authenticated source.
- `T3_THIRD_PARTY`: reserved for future independently authenticated enrichment;
  availability and freshness must be recorded before it is used.

Every new persisted assessment stores submitted, derived, and effective values,
the resolution rule, availability, history row count, and as-of timestamp in
the digested decision snapshot. Existing legacy assessments remain readable
but are explicitly marked as having no provenance snapshot.

The graph context is constructed from observed customer-device and
customer-recipient edges before the event plus the current event. Connectivity
is evidence for review, not proof of coordination or fraud.

## Evaluation evidence

The Risk Operations page now exposes:

- active-dataset fraud-probability reliability bins, Brier score, and expected
  calibration error;
- amount, payment-method, and tenure slices, with metrics withheld below ten
  labeled rows;
- label-maturity visibility using event age as a conservative proxy, clearly
  marked as diagnostic rather than an enforced training gate;
- chronological current-artifact replay over frozen enriched inputs;
- review queue age, 24-hour SLA status, backlog/capacity estimates, and explicit
  case claiming by an Admin or Reviewer.

Reliability and slice results use merchant-supplied active-dataset labels. They
are not the locked temporal test or a dedicated calibration split. Historical
replay does not reconstruct unavailable historical binaries and never rewrites
stored decisions.

## Remaining production gates

- Persist outcome-observation timestamps and enforce a label-maturity window in
  training admission instead of using event age as a proxy.
- Integrate an authenticated third-party enrichment provider before allowing
  protective recipient verification to affect scoring.
- Compare champion and challenger artifacts on the same compatible replay
  window before promotion.
- Store decision snapshots in external append-only/WORM storage for tamper-
  resistant retention; the local SHA-256 digest only detects inconsistent
  content.
- Validate calibration and slices on a dedicated mature-label production-like
  dataset. Small-sample active-dataset diagnostics are not production approval.
