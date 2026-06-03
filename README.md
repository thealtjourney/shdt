# SHDT — Social Housing Digital Twin

A full-stack platform that combines a UK social housing portfolio with
ten live open-data sources (postcodes.io, IoD 2025, EA flood, UK Police,
Ofcom, Census 2021, EPC register, OS Open UPRN, Open-Meteo) into an
interactive map, analytics dashboard, 3D digital-twin viewer, and a
ten-card Strategic Insights engine that cross-correlates everything.

> **Status:** Active development. Phase 1 (foundations) complete.
> Phase 2 (Azure deployment) artefacts in place. See
> `SHDT_Build_Order.docx` for the full roadmap.

## What's in the box

| Layer | Tech |
|---|---|
| Database | PostgreSQL 16 + PostGIS 3.4 (Azure Flexible Server in prod) |
| Backend | Python 3.11, FastAPI, SQLAlchemy, gunicorn + uvicorn |
| Frontend | React 19, TypeScript, Vite, Leaflet, Three.js, Recharts |
| Infrastructure | Bicep, Container Apps, Static Web Apps, Key Vault, Blob Storage |
| Observability | Structured JSON logs, /healthz + /readyz, Application Insights |
| Testing | pytest (backend), Vitest + RTL (frontend), GitHub Actions CI |

## Repository layout

```
shdt/
├── client/                   React frontend (Vite, port 5173 in dev)
│   ├── src/
│   │   ├── App.tsx           Routing + Insights tabs
│   │   ├── pages/            Page-level components
│   │   │   └── insights/     Extracted Insights tab components
│   │   ├── components/       Reusable components
│   │   └── test/             Vitest harness setup
│   ├── Dockerfile            Production image (nginx + Vite build)
│   ├── nginx.conf            SPA routing + static-asset caching
│   └── docker-entrypoint.sh  Runtime config injection
│
├── server/                   FastAPI backend (port 8000 in dev)
│   ├── main.py               App entry: middleware, routers, health
│   ├── observability/        JSON logging, request_id, /healthz, /readyz
│   ├── config/               SecretsProvider (Dotenv / Env / Key Vault)
│   ├── storage/              Storage abstraction (Local FS / Azure Blob)
│   ├── http_client.py        HTTP helper (httpx + curl fallback)
│   ├── routers/              FastAPI routers (one per domain)
│   ├── services/
│   │   ├── insights/         10 Strategic Insights, one file each
│   │   └── ...
│   ├── alembic/              DB migrations (Alembic)
│   ├── tests/                pytest tests
│   └── Dockerfile            Production image
│
├── infra/
│   ├── bicep/
│   │   ├── main.bicep        Subscription-scope entry point
│   │   ├── modules/          One file per Azure resource type
│   │   └── parameters/
│   │       └── prod.bicepparam
│   └── scripts/
│       ├── bootstrap.sh      One-time Azure subscription setup
│       └── deploy-local.sh   Convenience wrapper for local Bicep apply
│
├── database/
│   ├── init.sql              Initial schema
│   └── migrations/           Versioned SQL files (legacy; Alembic going forward)
│
├── .github/workflows/
│   ├── ci.yml                Build + test on PR
│   └── cd-prod.yml           Build + deploy to Azure
│
├── docker-compose.yml        Local dev stack (Postgres + pgAdmin)
├── docker-compose.prod.yml   Local prod-mirror stack
├── start.sh                  One-command dev startup
│
├── ARCHITECTURE.md           Target Azure architecture + ADRs
├── AZURE_DEPLOYMENT.md       Step-by-step deploy guide
├── CONTRIBUTING.md           Branch / PR / commit conventions
├── FOUNDATIONS_SUMMARY.md    What changed in the Phase 1 foundations pass
├── SHDT_Build_Order.docx     14-week build plan
└── SHDT_Project_Review.docx  Independent review of the codebase
```

## Quick start (local dev)

```bash
# 1. Bring up Postgres+PostGIS via Docker
docker-compose up -d

# 2. Backend
cd server
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env       # then edit
uvicorn main:app --reload --port 8000

# 3. Frontend (in another terminal)
cd client
npm install
npm run dev
```

Or use the convenience script:

```bash
./start.sh                  # dev stack: db + backend + frontend
./start.sh --setup          # first-time: dedupe + all enrichments
./start.sh --refresh        # re-run live data enrichments
./start.sh --stop           # stop everything
```

Frontend at http://localhost:5173, backend at http://localhost:8000,
docs at http://localhost:8000/docs.

## Local prod-mirror stack

```bash
# Mirrors the Azure target architecture as closely as docker-compose can
cp .env.production.example .env
# Edit DB_PASSWORD, SECRET_KEY at minimum
docker compose -f docker-compose.prod.yml up --build
```

Backend at http://localhost:8000, frontend at http://localhost:8080.

## Tests

```bash
# Backend
cd server
pytest                          # 32 tests
pytest -m "not db"              # unit tests only
pytest --cov                    # with coverage

# Frontend
cd client
npm test                        # Vitest
npm run typecheck
```

## Deploying to Azure

See **`AZURE_DEPLOYMENT.md`** for the full walkthrough. The shape:

1. `./infra/scripts/bootstrap.sh --github-repo <user>/shdt --subscription <sub>`
2. Add the printed secrets to GitHub
3. Run the **CD — Production** workflow with `deploy_infra=true`
4. Apply the database schema (one-time)
5. Smoke-test `/healthz`, `/readyz`, `/version`

Cost at low load: ~£45–£60/month in UK South.

## Documentation index

- **`AZURE_DEPLOYMENT.md`** — how to deploy
- **`ARCHITECTURE.md`** — what gets deployed and why
- **`FOUNDATIONS_SUMMARY.md`** — what landed in the Phase 1 refactor
- **`CONTRIBUTING.md`** — branch / commit / PR conventions
- **`SHDT_Build_Order.docx`** — 14-week sequenced build plan
- **`SHDT_Project_Review.docx`** — third-party review of the codebase
- **`server/services/insights/MIGRATION.md`** — pattern for adding new Strategic Insights
- **`server/HTTP_MIGRATION.md`** — pattern for migrating off subprocess+curl
- **`client/src/pages/insights/REFACTOR_PATTERN.md`** — pattern for splitting App.tsx tabs

## License

Proprietary. Not yet licensed for redistribution.
