"""
Alembic environment.

Reads DATABASE_URL from the SecretsProvider so that local, CI and Azure all
work without changing this file.

This project does not use SQLAlchemy ORM models for the property tables
(raw SQL via text()) so autogenerate is intentionally limited — new
migrations are typically written by hand. We still register MetaData so
autogenerate works for any future ORM-defined tables.
"""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make sure the server/ directory is on sys.path so 'config' resolves
HERE = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.dirname(HERE)
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Resolve database URL through SecretsProvider so env-driven config wins
try:
    from config import get_secrets

    db_url = get_secrets().get(
        "DATABASE_URL",
        default="postgresql://shdt:shdt_dev_password@localhost:5432/shdt",
    )
except Exception:
    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://shdt:shdt_dev_password@localhost:5432/shdt",
    )

config.set_main_option("sqlalchemy.url", db_url)


# When ORM models are introduced, set target_metadata to that MetaData.
target_metadata = None


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (emit SQL without DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode against a live DB connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
