"""
Database configuration and session management for SHDT.

Reads DATABASE_URL through the SecretsProvider abstraction so that the same
code path resolves config from .env locally, process env in CI, or Azure
Key Vault in production. Pool tuning is overridable via env so a heavier-
load deployment can scale connections without code changes.

Tunables (env vars / Key Vault keys):
    DATABASE_URL            connection string (required)
    DB_POOL_SIZE            default 10
    DB_POOL_MAX_OVERFLOW    default 20
    DB_POOL_RECYCLE_S       default 300 (raise to ~1800 once DB is remote)
    DB_POOL_TIMEOUT_S       default 30
    DB_SQL_ECHO             default False — flip to True for SQL tracing
"""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool

from config import get_secrets

secrets = get_secrets()

DATABASE_URL: str = secrets.get(
    "DATABASE_URL",
    default="postgresql://shdt:shdt_dev_password@localhost:5432/shdt",
)

# Create engine with connection pooling. Tunables are env-driven so the same
# image runs sensibly on a laptop and against Azure Database for PostgreSQL.
engine = create_engine(
    DATABASE_URL,
    echo=secrets.get_bool("DB_SQL_ECHO", default=False),
    pool_pre_ping=True,
    poolclass=QueuePool,
    pool_size=secrets.get_int("DB_POOL_SIZE", default=10) or 10,
    max_overflow=secrets.get_int("DB_POOL_MAX_OVERFLOW", default=20) or 20,
    pool_recycle=secrets.get_int("DB_POOL_RECYCLE_S", default=300) or 300,
    pool_timeout=secrets.get_int("DB_POOL_TIMEOUT_S", default=30) or 30,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_session() -> Session:
    """
    Get a new database session.

    Usage in FastAPI endpoints:
        @app.get("/items")
        def read_items(session: Session = Depends(get_session)):
            ...
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def get_db_connection():
    """
    Get a raw database connection for executing raw SQL.
    Useful for spatial queries and complex operations.
    """
    return engine.raw_connection()
