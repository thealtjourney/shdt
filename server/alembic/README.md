# Alembic migrations

Alembic now manages SHDT's database schema. The historic SQL files in
`database/migrations/` remain in the repo as reference, but going forward
all schema changes should be authored as Alembic revisions.

## Workflow

```bash
cd server
source venv/bin/activate

# Apply all pending migrations
alembic upgrade head

# Roll back one migration
alembic downgrade -1

# Show current revision
alembic current

# Full revision history
alembic history

# Create a new migration (write upgrade()/downgrade() by hand for raw SQL)
alembic revision -m "add iot tables"

# Auto-generate from ORM model diffs (only useful when SQLAlchemy models exist)
alembic revision --autogenerate -m "add iot tables"
```

## Baseline

When migrating an existing SHDT database to Alembic, run once:

```bash
alembic stamp head
```

This marks the current schema as up-to-date without re-running migrations.

## Conventions

- One feature per revision; small focused changes are easier to roll back.
- Prefer raw SQL via `op.execute()` over `op.create_table()` for tables that
  use PostGIS or other extensions not modelled in SQLAlchemy.
- Always implement a working `downgrade()` — even if it's a destructive
  drop. Migrations that cannot be rolled back are a liability.
- Never edit a migration that has been applied to staging or production.
  Create a new one instead.
