# Disabled module — `monitor.py.disabled`

This file (`monitor.py.disabled`) was the planned **Quality Monitor** for
enrichment data — completeness, freshness, accuracy, alert thresholds.

It is **disabled** because it imports from `app.models` and `app.database`,
which do not exist in this codebase (the rest of SHDT uses raw SQL via
SQLAlchemy `text()` and direct connections to `database.engine`).

## To re-enable

Two paths:

1. **Rewrite to use the existing patterns.** Replace the imports with:
   ```python
   from sqlalchemy import text
   from database import engine, get_session
   ```
   ...and adapt the queries to raw SQL or to ORM models you introduce.

2. **Stand up an `app/` package** with SQLAlchemy ORM models for Property,
   EnrichmentData, EnrichmentLog and QualityAlert. This is more invasive and
   requires the rest of the project to migrate to ORM patterns.

For now this module is a placeholder — the quality-monitoring concept is
sound and worth implementing later, but it cannot be imported as-is.
