# Database migrations

These SQL files are applied in alphabetical order by `start.sh` against the
local Postgres container. CI applies them in the same order against a
service-container Postgres before running tests.

## Going forward

The plan is to migrate to **Alembic** (`server/alembic/`) so that schema
changes are versioned with proper up/down semantics. Existing files here
will remain as the historical baseline; new schema changes should be
authored as Alembic revisions.

## File naming

`NNN_<description>.sql` — applied in numeric order.

`_archived__*.sql.bak` — files that were superseded but kept for reference.
The `*.bak` extension means `start.sh`'s `*.sql` glob skips them.

## History

- 002 — Extended property fields
- 003 — Authentication tables
- 004 — Enrichment infrastructure (originally split across two files; the
  superseded version was archived during the foundations refactor)
- 005 — Notifications
- 006 — Digital twin component lifecycle
- 007 — Reconciliation
- 008 — Deduplicate constraint
- 009 — Forecast columns
- 010 — Census 2021 + UPRN coordinates + broadband/utilities
- 011 — Performance indexes
