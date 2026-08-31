# RazorShield application security checklist — 2026-08-29

This is a code-and-test review, not a penetration-test certificate. `PASS` means the control is
verified locally. `PARTIAL` means a useful control exists but an external or production control is
still required.

| Area | Status | Verified evidence | Remaining gate |
|---|---|---|---|
| Broken authentication | PASS locally | Argon2id password hashing, generic login failures, active-user lookup, short access-token lifetime and authentication throttling. | Live identity/incident monitoring and credential-stuffing testing. |
| IDOR / broken access control | PASS locally | Every protected route derives merchant and role from the authenticated database user; transaction/case/policy queries include merchant scope. Cross-merchant assessment and role-denial tests pass. | External API authorization fuzzing. |
| Exposed API keys and secrets | PASS repository / PARTIAL deployment | Secret values use environment settings; Pydantic `SecretStr` protects provider tokens from representation; production rejects development secrets. | Load live values from Google Cloud Secret Manager and run a repository-history secret scan. |
| SQL injection | PASS locally | SQLAlchemy expressions and bound parameters are used. The only raw health statement is the constant `SELECT 1`. | DAST against the deployed PostgreSQL API. |
| XSS | PARTIAL | React escapes transaction and investigation content; bundled demo passwords were removed; production Nginx now sends CSP. The chart style injection is generated from application-owned chart configuration. | Browser DAST and removal of `unsafe-inline` styles through CSP nonces/hashes. |
| CSRF | PASS for current architecture | Authentication uses an explicit `Authorization: Bearer` header rather than ambient authentication cookies; browsers cannot attach it cross-origin automatically. CORS is explicit. | Add CSRF tokens if authentication is migrated to cookies. |
| Insecure CORS | PASS configuration | Allowed origins are explicit and production startup rejects wildcards and localhost origins. Allowed methods and headers are limited. | Validate the final deployed origin list. |
| Insecure file uploads | PASS for current text ingestion | The browser accepts CSV/JSON only; files are parsed as text and sent as validated JSON, never executed or stored as server files. Batch rows are capped at 5,000 and request bodies at 10 MiB. | Production gateway must enforce the same 10 MiB limit. |
| JWT / session security | PARTIAL | Signed HS256 tokens contain expiry, type and random `jti`; token users are reloaded from the database; access tokens expire after 15 minutes. Browser persistence was reduced from `localStorage` to tab-scoped `sessionStorage`. | Managed signing-key rotation and emergency token revocation/deny-list. HttpOnly cookies would require a separate CSRF design. |
| Weak OTP / password reset | PASS implementation / PARTIAL deployment | Generic recovery response, hashed development OTP, expiry, attempt limit, typed short-lived reset token and single-use reset challenge. Twilio Verify send/check and fail-closed outage paths are tested. | Live Twilio Verify integration and delivery-abuse monitoring. |
| Sensitive data exposure | PASS locally | Authentication responses are `no-store`; API errors are structured; provider secrets are not returned; logs record path/status/request ID rather than bodies or credentials. | TLS termination, database encryption, log-retention and data-classification review. |
| Missing rate limiting | PARTIAL | Atomic distributed Redis sliding-window protection covers all authentication routes and fails closed when Redis is unavailable. | Add per-merchant quotas to high-cost assessment, batch, training and AI routes. |
| Hardcoded credentials | PASS production boundary / development exception | Browser-bundled passwords were removed. Demo seed credentials exist only for local competition data, and production startup rejects `AUTO_SEED_DEMO=true`. | Replace demo seed passwords with developer-supplied values if repository policy prohibits any test credential. |
| Vulnerable dependencies | PASS at review time | Python and production JavaScript audits returned no known vulnerabilities on 2026-08-29. | Keep CI audits blocking and enable automated dependency updates. |
| Missing security headers | PASS | API and production Nginx set CSP, `nosniff`, frame denial, no-referrer and restrictive permissions policy; production API adds HSTS. | Validate headers at the final TLS edge/CDN. |

## Release decision

Do not call the deployment security-complete yet. The main remaining security gates are production
secret loading, live Twilio/Upstash/Supabase integration, endpoint-wide quotas, signing-key rotation,
repository-history secret scanning and authenticated DAST against the deployed environment.
