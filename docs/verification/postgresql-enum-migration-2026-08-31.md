# PostgreSQL enum migration verification — 2026-08-31

## Root cause and ownership

Inspected the complete, linear Alembic chain:

| Revision | Responsibility | `user_role` ownership |
| --- | --- | --- |
| 20260823_0001 | Transactions, assessments, signals, audit | None |
| 20260823_0002 | Merchants, users, password reset challenges | Creates type, uses it on `users.role`, drops it on downgrade |
| 20260823_0003 | Model scores/provenance | None |
| 20260823_0004 | Human-review cases | None; references users |
| 20260823_0005 | Policies and agent audit | None; references users |
| 20260823_0006 | Inference latency | None |
| 20260824_0007 | Dataset scope | None |
| 20260824_0008 | Configurable rules | None |
| 20260826_0009 | Transaction/recipient context | None |
| 20260827_0010 | Outcome labels and training snapshots | None |
| 20260829_0011 | Sender/recipient details (head) | None |

Revision 0002 explicitly called `user_role.create(bind, checkfirst=True)`.
Its generic `sa.Enum` was also attached to `users.role`. Alembic's table-create
hook then attempted another `CREATE TYPE user_role`, this time without the
existence check. This fails even on an initially empty PostgreSQL database.

Other creation paths were checked:

- `backend/app/models/auth.py` defines the same four labels through `Enum(UserRole, name="user_role")`.
- Development startup in `backend/app/main.py` can call `Base.metadata.create_all`.
- Auth and policy-retrieval test initialization calls metadata creation on SQLite.
- Alembic's `env.py` imports model definitions for target metadata, not application startup; it does not call `create_all`.
- CI runs PostgreSQL migrations before starting the application or running tests.

Therefore the reported CI failure is duplicate DDL within 0002, not an earlier
migration creating the type or a required Alembic-history repair.

## Minimal fix

Only revision 0002's enum declaration changes:

```python
from sqlalchemy.dialects.postgresql import ENUM

user_role = ENUM(
    "ADMIN", "RISK_ANALYST", "REVIEWER", "VIEWER",
    name="user_role", create_type=False,
)
```

The existing explicit `create(checkfirst=True)` and `drop(checkfirst=True)` stay
in place. `create_type=False` prevents implicit table-triggered enum DDL but
allows the explicit lifecycle calls. See the
[SQLAlchemy PostgreSQL ENUM documentation](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html#sqlalchemy.dialects.postgresql.ENUM).

The original revision is corrected because a later revision cannot repair a
fresh installation that fails before reaching it. Revision IDs, labels, column
types, constraints, and application behavior remain unchanged. An already-applied
0002 is not replayed. No application database type was deleted or history stamped.

On downgrade the enum is explicitly dropped after the users table. No CASCADE is
used. If another table still depends on it, PostgreSQL rejects the drop and rolls
back the revision, preserving that table and application data. Such an external
dependency needs explicit reconciliation before retrying the downgrade.

This does not claim to repair arbitrary schema drift (for example, all tables
created outside Alembic with missing migration history, or incompatible enum
labels). Those conditions require inspection, not blind stamping or deletion.

## Regression coverage and results

Executed against an isolated PostgreSQL **16.15** cluster on localhost:55432,
using Python **3.14.6**, SQLAlchemy **2.0.52**, and psycopg **3.3.4**.
CI uses PostgreSQL 16 and Python 3.12; the remote CI run is not claimed as executed.
No application data or running application database was used.

Before the fix, three selected regression cases (fresh database and pre-existing
model enum at base/0001) reproduced the exact `DuplicateObject: type "user_role"
already exists` error.

After the fix, **9/9 regression cases passed** (8 PostgreSQL, 1 SQLite):

- Empty PostgreSQL database → all 11 migrations → head.
- Existing 0002, 0010, and head → upgrade head twice; original enum OID and users
  covering all four roles preserved.
- Model-created enum already present at base and at 0001 → head, reusing its OID.
- Head → downgrade base → repeated downgrade → upgrade head; enum removed and recreated correctly.
- External enum consumer → downgrade safely refused; migration version, users,
  and external row preserved; succeeds after test-owned dependency is removed.
- SQLite upgrade, repeat upgrade, downgrade to base, and re-upgrade remain compatible.

The regression fixture creates UUID-named disposable databases and removes only
those databases. `RAZORSHIELD_POSTGRES_TEST_URL` is an explicit opt-in and requires
a test-cluster role with CREATEDB; never point it at production. Without it the
eight PostgreSQL cases skip. The new dedicated CI step supplies it, so CI actually
executes these cases rather than silently relying on SQLite.

Commands run from the repository root:

```sh
RAZORSHIELD_POSTGRES_TEST_URL=postgresql+psycopg://razorshield_migration_test@127.0.0.1:55432/postgres PYTHONPATH=backend:. backend/.venv/bin/python -m pytest backend/tests/test_postgresql_migrations.py -v --tb=short
RAZORSHIELD_POSTGRES_TEST_URL=postgresql+psycopg://razorshield_migration_test@127.0.0.1:55432/postgres PYTHONPATH=backend:. backend/.venv/bin/python -m pytest backend/tests ml/tests
backend/.venv/bin/ruff format --check backend ml
backend/.venv/bin/ruff check backend ml
pnpm run typecheck:libs && pnpm --filter @workspace/razorshield-ai typecheck
git diff --check
```

| Check | Result |
| --- | --- |
| Dedicated migration regression suite | 9 passed, no skips (10.44 seconds) |
| Complete backend + ML suite, including PostgreSQL | 68 passed, no skips (19.55 seconds) |
| Ruff formatting | 77 files already formatted |
| Ruff lint | Passed |
| CI-configured library/application TypeScript checks | Passed |
| Whitespace/diff validation | Passed |

The full suite emitted 8,677 dependency deprecation warnings (Starlette/httpx,
NumPy/joblib, and the older HTTP 422 constant). These were not test failures;
dependency/application changes are outside this migration fix.

Also ran the **exact CI command**, `alembic upgrade head`, from `backend` with
the virtual environment on PATH and `RAZORSHIELD_DATABASE_URL` pointing to a
separate empty test database (`razorshield_ci_enum_20260831`). It passed all 11
revisions. Ran the same command again against that now-current database: passed
as a no-op. A direct SQL check confirmed revision `20260829_0011` and the four
intended enum labels in order.

## Files changed

- `backend/migrations/versions/20260823_0002_auth_foundation.py`: explicit-only enum lifecycle.
- `backend/tests/test_postgresql_migrations.py`: isolated PostgreSQL lifecycle regressions and SQLite compatibility.
- `.github/workflows/ci.yml`: execute the PostgreSQL regression suite using the existing service.
- This verification report.

No frontend, ML models, risk scoring, RAG, LLM, or other application code changed.
