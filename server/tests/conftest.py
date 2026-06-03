"""
Shared pytest fixtures for the SHDT backend.

Two flavours of test are supported:

* **Unit / smoke** — no DB needed; fast (milliseconds). Use the `client`
  fixture; it patches the database to avoid real connections.

* **DB / integration** — marked `@pytest.mark.db`. They expect a real
  Postgres+PostGIS reachable at TEST_DATABASE_URL (default:
  postgresql://shdt:shdt_dev_password@localhost:5432/shdt_test).

The CI workflow stands up a Postgres service container, applies the
schema and runs the `db` tests. Locally, `pytest -m "not db"` skips them.
"""
from __future__ import annotations

import os
import sys
from typing import Iterator

import pytest

# Make sure the server directory is importable as a package root
HERE = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.dirname(HERE)
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)


@pytest.fixture(scope="session")
def test_database_url() -> str:
    return os.environ.get(
        "TEST_DATABASE_URL",
        "postgresql://shdt:shdt_dev_password@localhost:5432/shdt_test",
    )


@pytest.fixture
def app(monkeypatch):
    """
    Provide the FastAPI app with observability initialised.

    For unit tests we deliberately do *not* require a working database — the
    tests under `tests/unit/` should not touch one, and `/readyz` will simply
    return 503 in that case (which is the behaviour we want to assert).
    """
    # Ensure logging is configured so we don't see stale handlers
    from observability import configure_logging
    configure_logging(level="WARNING")

    # Import lazily so tests that mock the DB can do so before importing main
    from main import app  # type: ignore
    return app


@pytest.fixture
def client(app) -> Iterator:
    """A TestClient bound to the FastAPI app."""
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c


# --- DB-bound fixtures (used only by tests marked @pytest.mark.db) ---


@pytest.fixture
def db_engine(test_database_url):
    """SQLAlchemy engine pointed at the test DB. DB-bound."""
    pytest.importorskip("sqlalchemy")
    from sqlalchemy import create_engine
    engine = create_engine(test_database_url, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(db_engine):
    """A transactional session that rolls back at the end of each test."""
    from sqlalchemy.orm import Session
    with Session(db_engine) as session:
        session.begin()
        try:
            yield session
        finally:
            session.rollback()
