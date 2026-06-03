# SHDT — Scheduled Enrichment Pipeline

**Date:** 30 April 2026
**Phase:** 4a — Scheduled enrichment (precursor to Phase 4 IoT)
**Outcome:** Enrichment scripts now run automatically on cron schedules in
Azure as Container Apps Jobs, with a full audit trail surfaced on a
new EnrichmentStatusPage. ~£1/month total enrichment cost.

## Architecture

```
                               ┌──────────────────┐
                               │   GitHub Actions │
                               │   (CD pipeline)  │
                               └────────┬─────────┘
                                        │ az deployment
                                        ▼
                              ┌────────────────────┐
                              │   Bicep template   │
                              │   provisions one   │
                              │ Container Apps Job │
                              │   per source on    │
                              │   a cron schedule  │
                              └─────────┬──────────┘
                                        │
                ┌───────────────────────┼───────────────────────┐
                │                       │                       │
                ▼                       ▼                       ▼
     ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
     │ Job: forecast     │   │ Job: crime        │   │ Job: epc          │
     │ Cron: 0 */4 * * * │   │ Cron: 0 3 * * *   │   │ Cron: 0 2 * * *   │
     │                   │   │                   │   │                   │
     │ Same image as     │   │                   │   │                   │
     │ backend; runs:    │   │                   │   │                   │
     │ python -m jobs.cli│   │                   │   │                   │
     │   --source X      │   │                   │   │                   │
     └─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘
               │                       │                       │
               └───────────────────────┴───────────────────────┘
                                       │
                                       ▼
                            ┌──────────────────────┐
                            │  jobs/cli.py         │
                            │  ─ dispatcher        │
                            │                      │
                            │  jobs/runner.py      │
                            │  ─ @run_job decorator│
                            │  ─ Postgres advisory │
                            │    lock              │
                            │  ─ enrichment_runs   │
                            │    audit row         │
                            │  ─ SIGTERM handler   │
                            │  ─ JSON logs to App  │
                            │    Insights          │
                            └──────────┬───────────┘
                                       │
                                       ▼
                          (existing enrich_*.py script)
```

## What landed

### Backend

- **`server/jobs/runner.py`** — `@run_job` decorator that wraps any
  enrichment function with audit-trail row, Postgres advisory lock,
  SIGTERM handling, structured logging and exit-code conventions.
- **`server/jobs/cli.py`** — single CLI entry point
  (`python -m jobs.cli --source <X>`) that dispatches to the right
  legacy enrich script. The existing `python enrich_crime.py` etc.
  invocations continue to work unchanged — this is purely additive.
- **`server/services/enrichment_runs_service.py`** — read-side helpers
  for the new page; per-source latest-run summary, recent runs,
  manual-trigger spawner.
- **`server/routers/enrichment_runs.py`** — `/api/enrichment/status`,
  `/api/enrichment/runs`, `/api/enrichment/trigger`.
- **Alembic migration `20260430_p4_enrichment_runs.py`** — new
  `enrichment_runs` table + `enrichment_latest_runs` view + indexes
  on `(source, started_at DESC)` and `(status, started_at DESC)`.

### Infrastructure

- **`infra/bicep/modules/container-app-job.bicep`** — reusable module
  that takes (name, source, schedule, command) and provisions one
  scheduled Container Apps Job. Uses the same image as the backend,
  same Managed Identity for ACR pull / Key Vault read / Blob access.
- **Seven scheduled jobs in `main.bicep`**:

| Job | Source | Cron (UTC) | Cadence rationale |
|---|---|---|---|
| `job-shdt-prod-uks-forecast` | forecast | `0 */4 * * *` | Open-Meteo updates every 3–6h |
| `job-shdt-prod-uks-crime` | crime | `0 3 * * *` | Police API monthly publication; daily catches edge cases |
| `job-shdt-prod-uks-flood` | flood | `0 4 * * 0` | EA flood zones rarely change |
| `job-shdt-prod-uks-epc` | epc | `0 2 * * *` | EPC register continuously updated |
| `job-shdt-prod-uks-postcodes` | postcodes | `0 5 * * 0` | Postcodes change rarely |
| `job-shdt-prod-uks-broadband` | broadband | `0 6 1 * *` | Ofcom Connected Nations published quarterly |
| `job-shdt-prod-uks-uprn` | uprn | `0 7 1 * *` | OS releases monthly |

- IMD and Census are not scheduled — IMD is annual / on release, Census
  is one-shot (until the Nomis ingestion lands).

### Frontend

- **`client/src/pages/EnrichmentStatusPage.tsx`** at `/enrichment` —
  per-source tiles with last run, 7-day success/failure counts, and a
  "Run now" button that POSTs to `/api/enrichment/trigger`. Recent-runs
  table below filters by source. Auto-refreshes every 30s.
- **Navigation** — new "Data freshness" item under the Data section.

### Documentation
- `PHASE_ENRICHMENT_SUMMARY.md` (this file)

## Running cost

Container Apps Jobs are billed per vCPU-second of execution. With the
schedule above and typical run durations:

| Job | Run time | Runs/mo | Cost/mo |
|---|---|---|---|
| forecast | ~2 min | 180 | ~£0.40 |
| crime | ~10 min | 30 | ~£0.30 |
| flood | ~5 min | 4 | ~£0.05 |
| epc | ~5 min | 30 | ~£0.20 |
| postcodes | ~3 min | 4 | ~£0.05 |
| broadband | ~10 min | 1 | ~£0.05 |
| uprn | ~15 min | 1 | ~£0.05 |
| **Total** |  |  | **~£1.10/mo** |

On top of the ~£30/mo POC config, the full scheduled-enrichment pipeline
adds about £1/mo. Effectively free.

## How a job actually runs in Azure

1. Cron fires at the scheduled time.
2. Container Apps Jobs spawns a fresh container from the backend image.
3. Container starts; entrypoint runs `python -m jobs.cli --source crime`.
4. `jobs/cli.dispatch("crime")` is invoked.
5. `@run_job("crime")` wraps the call:
   - Inserts `enrichment_runs` row with `status='running'`, the run UUID,
     `triggered_by='schedule'`, the container hostname, and the git commit.
   - Acquires `pg_try_advisory_lock` keyed on `hash("crime")` — if another
     run is somehow active the new one exits with code 2 and the row is
     marked failed with reason "lock busy".
   - Configures JSON logging — every log line includes `request_id`,
     `source`, `run_id` and is automatically picked up by App Insights via
     stdout.
   - Installs SIGTERM handler so Container Apps can drain cleanly.
6. `dispatch` calls the legacy `enrich_crime.run_enrichment()` function
   (or whichever one is mapped in `_SOURCE_ENTRY`).
7. Whatever dict that function returns becomes the `summary` column.
8. On success: row updated to `status='success'`, `finished_at=NOW()`,
   `duration_ms=...`. Lock released.
9. On exception: row updated to `status='failed'` with `error` and
   `traceback`. Lock released. Container exits with code 1.
10. Container Apps' `replicaRetryLimit=1` retries the job once if it
    failed, otherwise marks the execution as failed.

## Manual triggers

From the UI: Go to `/enrichment` and click "Run now" on any tile.

From the CLI (locally or from inside any container):

```bash
cd server
source venv/bin/activate
python -m jobs.cli --source crime --triggered-by manual
```

From the API:

```bash
curl -X POST http://localhost:8000/api/enrichment/trigger \
  -H 'Content-Type: application/json' \
  -d '{"source":"crime","limit":50}'
```

In Azure Container Apps Jobs, the more idiomatic path is:

```bash
az containerapp job start \
  --name job-shdt-prod-uks-crime \
  --resource-group rg-shdt-prod-uks
```

This kicks off an out-of-schedule execution. The runner's audit row
appears the same way and the page picks it up on the next refresh.

## Observability

- **Logs** flow into the Log Analytics workspace via Container Apps
  → App Insights → Log Analytics. Filter by `cloud_RoleName == 'shdt-job'`
  in App Insights Logs to see only job logs.
- **Per-run audit** in the `enrichment_runs` table; queryable via the
  `enrichment_latest_runs` view for "what's the most recent run per
  source?" lookups.
- **Live status** at `/enrichment` in the UI; auto-refreshes every 30s.

## Known limitations / Phase 4.1 follow-ups

- **The `trigger_manual` endpoint shells out to `python -m jobs.cli` in a
  subprocess.** That works locally and in the backend Container App, but
  the canonical Azure pattern would be `az containerapp job start` from
  the backend using its Managed Identity. Implementing that is a small
  follow-up that needs the Container App's MI granted
  `Microsoft.App/jobs/start/action` on the job resources.
- **Eight of nine enrichment scripts still use `subprocess+curl`** for
  HTTP calls (postcodes is the migrated reference). Linux/Azure doesn't
  have the LibreSSL issue, so they'll work, but migrating them to
  `http_client.py` is a quality / parallelism win — see
  `server/HTTP_MIGRATION.md` for the pattern.
- **Census enrichment is currently no-op** in the dispatcher because
  the synthetic Census data is generated by the Phase 3 Alembic seed,
  not by an enrichment script. When Nomis ingestion lands, we'll wire
  it up.
- **Failed-run alerting** is not yet built. The page surfaces failures
  visually but there's no email/Slack notification. App Insights
  alerts can be added via Bicep when needed.

## File summary

```
NEW   PHASE_ENRICHMENT_SUMMARY.md                                   (this file)

NEW   server/alembic/versions/20260430_phase4_enrichment_runs.py
NEW   server/jobs/__init__.py
NEW   server/jobs/runner.py
NEW   server/jobs/cli.py
NEW   server/services/enrichment_runs_service.py
NEW   server/routers/enrichment_runs.py

NEW   client/src/pages/EnrichmentStatusPage.tsx

NEW   infra/bicep/modules/container-app-job.bicep

MOD   server/main.py                                                (+1 router)
MOD   client/src/App.tsx                                            (+1 lazy route)
MOD   client/src/components/Navigation.tsx                          (+ Data freshness link)
MOD   infra/bicep/main.bicep                                        (7 scheduled jobs)
```

## Apply locally

```bash
cd server
source venv/bin/activate
alembic upgrade head           # creates enrichment_runs table

# Test the runner without scheduling
python -m jobs.cli --source forecast --triggered-by manual
# A row appears in enrichment_runs; check the UI at /enrichment

# Or trigger via API
curl -X POST http://localhost:8000/api/enrichment/trigger \
  -H 'Content-Type: application/json' \
  -d '{"source":"forecast"}'
```

## Apply in Azure (when you deploy)

The Bicep change is included automatically in the next CD run.
The seven scheduled jobs are created alongside the backend Container
App. Verify with:

```bash
az containerapp job list \
  --resource-group rg-shdt-prod-uks \
  --query "[].{name:name, schedule:properties.configuration.scheduleTriggerConfig.cronExpression}" \
  -o table
```

You should see seven rows. Within hours of deploy, the first scheduled
runs will land — confirm by visiting `/enrichment` on your deployed app.
