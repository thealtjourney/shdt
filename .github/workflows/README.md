# GitHub Actions workflows

## ci.yml

Runs on every push to `main` and on every PR targeting `main`. Two parallel
jobs:

- **backend** — Python lint + type-check + pytest with a real Postgres+PostGIS
  service container. Schema is applied from `database/init.sql` plus any
  `database/migrations/*.sql`. Will pick up Alembic when migration is complete.
- **frontend** — Node lint + type-check + Vitest + production build. Build
  artefact is uploaded for inspection.

Lint and type-check are configured with `continue-on-error: true` initially so
that the CI is green from day one even with existing lint debt; flip these to
hard failures once the lint suite is clean.

## Future workflows

- `cd-staging.yml` — push to `main` → build images → deploy to Azure Container
  Apps staging revision.
- `cd-prod.yml` — manual dispatch / tag-based release → promote staging
  revision to prod.
- `nightly-enrichment.yml` — scheduled run of the enrichment pipeline against
  staging data, surfacing any drift in upstream data sources.
