"""Real PostgreSQL migration regressions; never reset the supplied database.

RAZORSHIELD_POSTGRES_TEST_URL must point to a test PostgreSQL cluster and a role
with CREATEDB. Each test creates and removes only its own UUID-named database.
Without that explicit opt-in, PostgreSQL cases skip; SQLite compatibility runs.
"""

import os
import subprocess
import sys
import uuid
from collections.abc import Generator
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy.engine import Engine, make_url

from app.models.auth import User

BACKEND = Path(__file__).resolve().parents[1]
HEAD = "20260901_0013"
AUTH_REVISION = "20260823_0002"
ROLES = ["ADMIN", "RISK_ANALYST", "REVIEWER", "VIEWER"]


def migrate(url: str, direction: str = "upgrade", revision: str = "head") -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "alembic", direction, revision],
        cwd=BACKEND,
        env={
            **os.environ,
            "RAZORSHIELD_DATABASE_URL": url,
            "RAZORSHIELD_ENVIRONMENT": "test",
            "RAZORSHIELD_AUTO_SEED_DEMO": "false",
        },
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def assert_migrated(url: str, direction: str = "upgrade", revision: str = "head") -> None:
    result = migrate(url, direction, revision)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.fixture
def postgres_database() -> Generator[Engine, None, None]:
    configured_url = os.environ.get("RAZORSHIELD_POSTGRES_TEST_URL")
    if not configured_url:
        pytest.skip("Set RAZORSHIELD_POSTGRES_TEST_URL to run real PostgreSQL migration tests")
    url = make_url(configured_url)
    if url.get_backend_name() != "postgresql":
        pytest.fail("RAZORSHIELD_POSTGRES_TEST_URL must use PostgreSQL")
    database_name = f"razorshield_migrations_{uuid.uuid4().hex}"
    admin = sa.create_engine(url, isolation_level="AUTOCOMMIT")
    quoted_name = admin.dialect.identifier_preparer.quote_identifier(database_name)
    database = sa.create_engine(url.set(database=database_name))
    created = False
    try:
        with admin.connect() as connection:
            connection.exec_driver_sql(f"CREATE DATABASE {quoted_name}")
        created = True
        yield database
    finally:
        database.dispose()
        if created:
            # Only the exact random database created above; no CASCADE/FORCE or shared DB resets.
            with admin.connect() as connection:
                connection.exec_driver_sql(f"DROP DATABASE {quoted_name}")
        admin.dispose()


def database_url(database: Engine) -> str:
    return database.url.render_as_string(hide_password=False)


def enum_oid(database: Engine) -> int | None:
    with database.connect() as connection:
        return connection.scalar(sa.text("SELECT to_regtype('public.user_role')::oid"))


def assert_schema(database: Engine, revision: str = HEAD) -> None:
    with database.connect() as connection:
        assert connection.scalar(sa.text("SELECT version_num FROM alembic_version")) == revision
        assert (
            list(
                connection.scalars(
                    sa.text(
                        "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
                        "JOIN pg_namespace n ON n.oid = t.typnamespace "
                        "WHERE n.nspname = 'public' AND t.typname = 'user_role' ORDER BY e.enumsortorder"
                    )
                )
            )
            == ROLES
        )
        assert (
            connection.scalar(
                sa.text(
                    "SELECT udt_name FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'"
                )
            )
            == "user_role"
        )
        if revision == HEAD:
            assert (
                connection.scalar(
                    sa.text(
                        "SELECT COUNT(*) FROM information_schema.tables "
                        "WHERE table_schema = 'public' AND table_name = 'refresh_sessions'"
                    )
                )
                == 1
            )
            transaction_columns = set(
                connection.scalars(
                    sa.text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_schema = 'public' AND table_name = 'transactions'"
                    )
                )
            )
            assert {
                "fraud_label_observed_at",
                "return_label_observed_at",
                "label_provenance",
            } <= transaction_columns


def insert_users(database: Engine) -> None:
    with database.begin() as connection:
        connection.execute(
            sa.text(
                "INSERT INTO merchants (id, external_id, name, is_active) "
                "VALUES ('migration-merchant', 'MIGRATION-TEST', 'Synthetic migration fixture', true)"
            )
        )
        for role in ROLES:
            connection.execute(
                sa.text(
                    "INSERT INTO users (id, merchant_id, password_hash, display_name, role, is_active) "
                    "VALUES (:id, 'migration-merchant', 'not-a-login-credential', 'Test user', :role, true)"
                ),
                {"id": f"user-{role}", "role": role},
            )


def assert_users_preserved(database: Engine) -> None:
    with database.connect() as connection:
        assert list(connection.scalars(sa.text("SELECT role::text FROM users ORDER BY users.role"))) == ROLES


def test_fresh_postgresql_upgrade_creates_enum_once(postgres_database: Engine) -> None:
    assert enum_oid(postgres_database) is None
    assert_migrated(database_url(postgres_database))
    assert_schema(postgres_database)
    insert_users(postgres_database)
    assert_users_preserved(postgres_database)


@pytest.mark.parametrize("revision", [AUTH_REVISION, "20260827_0010", HEAD])
def test_existing_revision_upgrade_preserves_enum_and_rows(postgres_database: Engine, revision: str) -> None:
    url = database_url(postgres_database)
    assert_migrated(url, revision=revision)
    original_oid = enum_oid(postgres_database)
    insert_users(postgres_database)
    assert_migrated(url)
    assert_migrated(url)  # An already-current database is a no-op, not a DDL replay.
    assert_schema(postgres_database)
    assert enum_oid(postgres_database) == original_oid
    assert_users_preserved(postgres_database)


@pytest.mark.parametrize("revision", ["base", "20260823_0001"])
def test_preexisting_model_enum_is_reused(postgres_database: Engine, revision: str) -> None:
    url = database_url(postgres_database)
    assert_migrated(url, revision=revision)
    # Reproduce a type provisioned by model metadata, without creating migration-owned tables.
    with postgres_database.begin() as connection:
        User.__table__.c.role.type.create(connection, checkfirst=True)
    original_oid = enum_oid(postgres_database)
    assert original_oid is not None
    assert_migrated(url)
    assert_schema(postgres_database)
    assert enum_oid(postgres_database) == original_oid


def test_full_downgrade_removes_enum_then_upgrade_recreates_it(postgres_database: Engine) -> None:
    url = database_url(postgres_database)
    assert_migrated(url)
    assert_migrated(url, "downgrade", "base")
    assert enum_oid(postgres_database) is None
    assert sa.inspect(postgres_database).get_table_names() == ["alembic_version"]
    assert_migrated(url, "downgrade", "base")
    assert_migrated(url)
    assert_schema(postgres_database)


def test_downgrade_does_not_cascade_into_external_enum_consumers(postgres_database: Engine) -> None:
    url = database_url(postgres_database)
    assert_migrated(url, revision=AUTH_REVISION)
    insert_users(postgres_database)
    with postgres_database.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE external_enum_consumer (role public.user_role)")
        connection.exec_driver_sql("INSERT INTO external_enum_consumer VALUES ('VIEWER')")
    result = migrate(url, "downgrade", "20260823_0001")
    assert result.returncode != 0
    assert "DependentObjectsStillExist" in result.stderr
    # PostgreSQL rolls back the whole revision; neither application nor external rows are lost.
    assert_schema(postgres_database, AUTH_REVISION)
    assert_users_preserved(postgres_database)
    with postgres_database.begin() as connection:
        assert connection.scalar(sa.text("SELECT role::text FROM external_enum_consumer")) == "VIEWER"
        connection.exec_driver_sql("DROP TABLE external_enum_consumer")
    assert_migrated(url, "downgrade", "20260823_0001")
    assert enum_oid(postgres_database) is None


def test_enum_change_preserves_sqlite_migration_compatibility(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'migration-test.db'}"
    assert_migrated(url)
    assert_migrated(url)
    assert_migrated(url, "downgrade", "base")
    assert_migrated(url)
