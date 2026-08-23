# RazorShield AI

Defense-only merchant risk intelligence for detecting suspicious transactions, investigating evidence, approving bounded actions, and auditing every decision.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/razorshield-ai/src/App.tsx` — dashboard routes and analyst workflow
- `artifacts/razorshield-ai/src/index.css` — application theme and interaction tokens
- `artifacts/api-server/src/routes/risk.ts` — demo risk, investigation, network, review, and audit API
- `lib/api-spec/openapi.yaml` — source of truth for the API contract
- `docs/PHASE_0_PROJECT_DEFINITION.md` — product scope, safety boundaries, and roadmap

## Architecture decisions

- The first working slice uses a typed OpenAPI contract and a deterministic, clearly labeled demo dataset so the complete workflow is demonstrable before connecting a production model.
- The LLM/investigator surface is evidence-grounded and separates facts, inferences, and recommendations; missing evidence is explicit.
- Review actions are bounded to analyst decisions and are recorded in the audit stream; no payment execution or control-bypass capability exists.
- Supporting modules are presented as risk signals, not as proof of fraud, and evaluation language distinguishes scored-set snapshots from held-out model experiments.

## Product

- Overview of merchant risk posture, spike status, and recent activity
- Transaction investigation queue with evidence, model signals, and human review decisions
- Entity network view for shared-device and relationship risk
- Chargeback evidence and return-risk supporting views
- Audit center and transparent evaluation/business impact surfaces

## User preferences

The user asked for the full RazorShield AI project, built phase-by-phase from the attached specification.

## Gotchas

- Keep API changes in `lib/api-spec/openapi.yaml`, then run `pnpm --filter @workspace/api-spec run codegen`.
- Artifact build commands need workflow-provided `PORT` and `BASE_PATH`; use the managed web workflow for the preview.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
