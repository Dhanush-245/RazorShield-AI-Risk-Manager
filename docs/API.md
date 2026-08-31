# API

The canonical prefix is `/api/v1`; `/api` is retained for the generated React client. Bearer authentication is required except for health and authentication routes.

- `POST /auth/login`, `/auth/password/forgot`, `/auth/password/verify-otp`, `/auth/password/reset`
- `POST /risk/assess` — validated real-time model inference and case creation
- `POST /risk/assess/batch` — atomically score 1–250 transactions and activate that uploaded dataset
- `GET /datasets/active` — current dataset name, ID, activation time, source, and scoped row count
- `GET /risk/overview`, `/risk/transactions`, `/risk/transactions/{id}`, `/risk/network`
- `GET /investigations/{transaction_id}` — evidence-grounded report
- `POST /agent/investigate/{transaction_id}` — persisted bounded investigation run
- `POST /risk/reviews/{case_or_transaction}/decision` — approve, reject, escalate, or request evidence
- `GET /risk/audit`, `/fraud/spike`, `/returns`, `/chargebacks`, `/monitoring/models`
- `GET /reviews`, `/search`, `/entities/customers/{id}`, `/cases/{id}/timeline`
- `GET /notifications`, `/fraud/intelligence`, `/analytics`, `/settings/profile`
- `GET /health`, `/ready`, `/healthz`

Interactive OpenAPI is available at `/docs` outside production. Authentication routes are rate limited. Validation failures use a structured error envelope and every response carries `X-Request-ID`.

Once a batch is activated, every merchant operational route is scoped to its dataset ID. Earlier uploads and bundled demo rows remain stored but are not mixed into current dashboards or investigations. Subsequent single assessments automatically join the active dataset.
