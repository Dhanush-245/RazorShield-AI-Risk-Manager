# Production-readiness verification — 2026-09-03

## Decision

RazorShield is a verified deployment candidate and buildathon demonstration, not an approved
commercial fraud control. The application fails closed where production evidence is absent.

## Dataset decision

- IEEE-CIS remains the card-not-present benchmark: 590,540 labeled transactions, audited before
  replay, with 88,581 rows in the locked chronological test.
- The frozen `ieee-cis-xgboost-v2` artifacts reproduced all F1, cost, and capacity operating points.
- IEEE-CIS competition data is restricted to the uses in the competition rules. It is not treated
  as commercially deployable merchant training data.
- Elliptic++ is appropriate for a separate cryptocurrency graph/ring benchmark, but not as a
  substitute for card-payment or merchant outcome validation.
- Commercial promotion requires an authorized merchant dataset with matured outcomes and explicit
  data-use rights.

## Verified results

| Check | Result |
| --- | --- |
| IEEE source audit | PASS: 590,540 rows, 394 transaction columns, no duplicate transaction IDs |
| Frozen IEEE replay | PASS: 88,581 locked future rows and all three thresholds reproduced |
| IEEE F1 profile | Precision 50.38%, recall 52.22%, F1 51.28%, PR-AUC 53.62%, ROC-AUC 90.90% |
| IEEE capacity profile | Precision 42.94%, recall 57.12%, 4.63% review rate |
| Backend and ML | 83 passed locally; 8 PostgreSQL-only scenarios covered by green CI |
| Browser E2E | 3 passed; 2 opt-in recording flows skipped by design |
| Python formatting/lint | PASS |
| TypeScript type checks | PASS |
| Frontend production build | PASS; non-blocking source-map and chunk-size warnings remain |
| Python dependency audit | No known vulnerabilities |
| JavaScript production audit | No known vulnerabilities after forcing patched `qs` 6.16.0 |
| GitHub Actions | Latest `main` run 33718111412 completed successfully |

## Enforced blockers

Model promotion remains blocked by commercial data rights and unmet business acceptance targets.
Actual production deployment additionally requires managed PostgreSQL and Redis, managed secrets,
provider credentials, production domains, backup/restore evidence, live shadow evaluation,
representative mature merchant labels, and named security/compliance approval. These values cannot
be manufactured from a public benchmark or a local test run.
