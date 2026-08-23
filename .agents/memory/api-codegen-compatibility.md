---
name: API codegen compatibility
description: OpenAPI numeric schema compatibility with the workspace's generated Zod validators
---

When extending the OpenAPI contract, prefer numeric schemas for count-like values unless the generated Zod toolchain is confirmed to support OpenAPI integer output.

**Why:** The workspace currently generates `zod.int()` for OpenAPI integer fields, but its installed Zod runtime is on the older API that does not expose that helper; codegen succeeds but the library typecheck fails.

**How to apply:** After every OpenAPI change, run codegen and the workspace typecheck before building consumers. If integer semantics matter, enforce them at the route/domain boundary rather than relying on the generated validator until the toolchain is upgraded.