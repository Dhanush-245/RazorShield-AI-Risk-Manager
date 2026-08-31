# Security

Controls implemented: Argon2 password/OTP hashing, short-lived signed JWTs, generic account-recovery responses, expiring single-use reset tokens, attempt limits, auth route throttling, server-side RBAC, merchant-scoped queries, Pydantic validation, restricted CORS, environment secrets, request IDs, and audit events. Production refuses the bundled JWT secret.

The in-memory limiter protects a single demo process; use a shared Redis/API-gateway limiter when horizontally scaled. Connect a trusted email/SMS provider for OTP delivery, terminate TLS at the edge, rotate secrets, encrypt backups, minimize PII, run dependency/container scans, add CSP/security headers, and obtain a security review before live payment data is handled.
