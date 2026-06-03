# SHDT Project Status — Social Housing Digital Twin

**Last updated:** 17 March 2026 (evening)
**Status:** 7 working pages (Map, Dashboard, Insights, Search, Scenarios, Upload, Export), 5 rebuilt backend routers, 3 enrichments complete, ~48K properties loaded

---

## How to Start the App

```bash
# 1. Start the database
cd shdt
docker compose up -d

# 2. Start the backend
cd server
source venv/bin/activate
python -m uvicorn main:app --reload --port 8000

# 3. Start the frontend (separate terminal)
cd client
npm run dev
```

Frontend runs on http://localhost:5173, proxies /api to backend on port 8000.

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Leaflet + inline styles (Tailwind CSS v4 is broken — do NOT use Tailwind classes)
- **Backend:** Python 3.9 + FastAPI + SQLAlchemy (raw SQL via `text()`)
- **Database:** PostgreSQL 16 + PostGIS 3.4 via Docker (user: shdt, pass: shdt_dev_password, db: shdt)
- **Important:** Use `import type { X }` not `import { X }` for TypeScript interfaces (Vite HMR requirement)
- **Important:** Python 3.9 on macOS uses LibreSSL 2.8.3 — use `subprocess` + `curl` for external API calls, NOT the `requests` library (SSL/TLS handshake fails)

---

## What's WORKING (Tested & Functional)

### Core Map View (`/`)
- Interactive Leaflet map with property markers colour-coded by EPC rating
- Clustered view at low zoom, individual markers at zoom 14+
- Filter sidebar: EPC rating, property type, bedrooms, year built, heating type
- EPC colour legend
- Property detail panel (click a marker → slide-out panel with details)
- Backend GeoJSON API with bbox queries and clustering

### Dashboard (`/dashboard`)
- Portfolio overview: total properties, average EPC, retrofit candidates, condition score
- EPC distribution bar chart
- Property age distribution chart
- Heating type horizontal bars
- Property types horizontal bars
- Retrofit priorities table (top 10, sorted by priority score)
- Geographic summary by postcode district
- **Enrichment coverage** progress bars (postcodes, crime, flood, EPC)
- **Crime risk overview** with risk distribution chart
- **Flood risk overview** with flood zone and river/sea risk charts
- **Local authority summary** table with cross-enrichment data
- **Region summary** table

### Insights Page (`/insights`) — NEW
- **Area Risk Heatmap** — Composite risk score (0-100) per ward combining crime (30%), flood (30%), and IMD deprivation (40%). Ranks areas by combined risk level (Critical/High/Medium/Low). Shows component breakdowns with visual progress bars.
- **Fuel Poverty Indicators** — Cross-references EPC ratings with IMD deprivation to identify tenants most at risk. Shows high-risk/at-risk counts, EPC vs Deprivation cross-tabulation matrix, and hotspot area rankings. Includes explanation of fuel poverty for staff.

### Global Search (`/search`)
- Search bar in top navigation with keyboard shortcut (Cmd+K / Ctrl+K)
- Autocomplete dropdown with live suggestions as you type
- Searches by address, postcode, ward, LSOA, local authority, region
- Smart query detection: full postcodes, partial postcodes, text search
- Search results page with property cards, pagination, match type badges
- Click any result to view on map
- Backend: `services/search_service.py` (raw SQL), `routers/search.py`

### CSV Data Upload (`/upload`)
- Drag-and-drop CSV upload with file preview (headers + first 5 rows)
- Column mapping UI: map CSV headers to database fields with auto-detection
- Import modes: Add (append) or Replace (truncate + import)
- Automatic postcode extraction from addresses, batch geocoding via postcodes.io
- Download CSV template
- Shows import results: rows imported, failed, error details
- Backend: `routers/datahub.py` (upload → preview → import pipeline)

### Data Export (`/export`)
- Export filtered properties as CSV (all fields), GeoJSON (with coordinates), or Retrofit Plan (priority list with cost estimates)
- Filter by: EPC rating, property type, ward, local authority, bedrooms, year built
- Generate on-screen Portfolio Report with: total properties, EPC distribution, property type breakdown, geographic summary by local authority, retrofit investment estimate
- EPC distribution visualized as proportional colour bar
- Downloads as timestamped files
- Backend: `routers/exports.py` (real DB queries, CSV/GeoJSON streaming)

### Scenario Planner (`/scenarios`)
- Model retrofit interventions across your property portfolio
- Filter properties by: current EPC rating, ward, local authority, property type
- Set target EPC rating (A-D) and select interventions (insulation, heating, windows, solar)
- Calculates: total cost, cost per property, CO₂ savings, energy bill savings, payback period
- Shows before/after EPC distribution with visual bars
- Cost breakdown by intervention type
- Top areas ranked by investment needed
- Realistic UK retrofit cost model varying by property type and size
- Backend: `routers/scenarios.py` (on-the-fly calculation, no DB storage needed)

### Property Detail Panel (click marker on map)
- Collapsible sections: Property Info, Location & Geography, Crime Statistics, Flood Risk, Energy Performance
- Quick badges: EPC rating, crime risk score, flood zone, region
- Full enrichment data display with colour-coded risk indicators

### Data Import
- `import_property_data.py` — imports PropertyData.csv (48,134 properties loaded)
- Postcode extraction via regex, batch geocoding via postcodes.io
- PostGIS geometry creation

### Data Enrichment (CLI scripts in `server/`)
- `enrich_postcodes.py` — Postcodes.io: LSOA, MSOA, ward, parish, constituency, local authority, region (**DONE**)
- `enrich_crime.py` — Police Crime API: crime counts by category, risk score 1-10 (**DONE**)
- `enrich_flood.py` — EA Flood Monitoring: flood zone, river/sea risk, surface water risk, active warnings (**DONE**)
- `enrich_imd.py` — IMD 2019 deprivation data: rank, decile, score + 7 domain scores. Downloads CSV from gov.uk automatically (**NOT YET RUN**)
- `enrich_epc.py` — EPC Open Data Communities: detailed energy data, floor area, heating, CO2 (**NOT YET RUN — needs API key registration at https://epc.opendatacommunities.org**)
- `enrich_all.py` — Master runner: `python enrich_all.py [--only X] [--skip X] [--limit N]`
- `deduplicate.py` — Find and remove duplicate properties: `python deduplicate.py` (dry run) / `python deduplicate.py --execute`

### Database
- `init.sql` — Core properties table with spatial indexes
- `004_enrichment_fixed.sql` — Adds 90+ enrichment columns (crime, flood, EPC, postcodes, IMD, census, land registry)
- Migrations 002-007 exist but may need validation

### Backend API Endpoints (Working)
- `GET /api/properties/bbox` — Properties in bounding box
- `GET /api/properties/cluster` — Clustered properties
- `GET /api/properties/{id}` — Single property detail
- `GET /api/analytics/overview` — Portfolio metrics
- `GET /api/analytics/epc-distribution` — EPC band breakdown
- `GET /api/analytics/geographic-summary` — By postcode district
- `GET /api/analytics/retrofit-priorities` — Paginated, filterable
- `GET /api/analytics/enrichment-summary` — Coverage per provider
- `GET /api/analytics/crime-summary` — Crime stats aggregate
- `GET /api/analytics/flood-summary` — Flood risk aggregate
- `GET /api/analytics/region-summary` — By local authority
- `GET /api/search?q=` — Full property search (address, postcode, ward, LSOA, LA, region)
- `GET /api/search/autocomplete?q=` — Fast autocomplete suggestions for search bar
- `POST /api/data-hub/upload` — Upload CSV file for preview
- `GET /api/data-hub/preview/{upload_id}` — Preview uploaded CSV headers + rows
- `POST /api/data-hub/import` — Import uploaded CSV into properties table
- `GET /api/data-hub/template` — Download CSV template
- `POST /api/scenarios/run` — Run retrofit scenario with filters and interventions
- `GET /api/scenarios/options` — Get filter options (wards, LAs, property types, interventions)
- `GET /api/scenarios/epc-upgrade-costs` — View the cost model being used
- `GET /api/exports/properties/csv` — Export filtered properties as CSV download
- `GET /api/exports/properties/geojson` — Export filtered properties as GeoJSON download
- `POST /api/exports/report` — Generate portfolio summary report (JSON)
- `GET /api/exports/retrofit-plan` — Export retrofit priority list as CSV

---

## What's SCAFFOLDED (Files Exist, Not Wired Up / Not Working)

These files were generated from the original 28-prompt spec but need actual implementation, testing, and integration into the working App.tsx.

### Frontend Pages (in `client/src/pages/`)
- `Dashboard.tsx` — Original dashboard (replaced by AnalyticsDashboard in App.tsx, uses Tailwind — broken)
- `EnrichmentDashboard.tsx` — Enrichment monitoring UI
- `Login.tsx` — Auth login page
- `HowItWorks.tsx` — Onboarding/help page
- `NotificationCentre.tsx` — Alert notifications
- `TenantManagement.tsx` — Tenant data management
- `AlertRules.tsx` — Configure alert thresholds
- `DigitalTwin.tsx` — Component-level digital twin view
- `ScenarioPlanner.tsx` — What-if retrofit scenarios
- `DataHub.tsx` — Data import/reconciliation UI
- `SearchResults.tsx` — OLD search results (replaced by SearchResultsPage in App.tsx)
- `MyProperties.tsx` — Favourites/watchlist
- `ReportView.tsx` — Report generation

### Frontend Components (in `client/src/components/`)
- `Navigation.tsx` — Full nav (App.tsx has a simpler inline one)
- `GlobalSearch.tsx` — OLD search bar (replaced by SearchBar in App.tsx)
- `DataUploadModal.tsx` — CSV upload UI
- `MatchingReview.tsx` — Data reconciliation review
- `SetupWizard.tsx` — First-run setup
- `PropertyTwinView.tsx` — Digital twin component view
- `DiffReview.tsx` — Data change review
- `ExportButton.tsx` / `ExportMenu.tsx` — Data export
- `EmailPreview.tsx` — Notification email preview
- `NotificationBadge.tsx` — Notification count badge
- `RoleGate.tsx` — Role-based access control
- `MapControls.tsx` — Additional map tools

### Backend Services (in `server/services/`)
- `enrichment/orchestrator.py` — Automated enrichment orchestration
- `enrichment/scheduler.py` — Scheduled enrichment runs
- `enrichment/monitor.py` — Enrichment health monitoring
- `enrichment/*_provider.py` — Class-based enrichment providers (7 files: epc, postcode, flood, crime, imd, census, land_registry)
- `digital_twin/` — Component lifecycle, maintenance, prediction, scenarios (5 files)
- `notifications/` — Email alerts, monitoring, orchestration (4 files)
- `reconciliation/engine.py` — Data reconciliation
- `search/search_service.py` — Full-text search

### Backend Routers (in `server/routers/`)
- `auth.py` — JWT authentication
- `admin.py` — Admin panel
- `enrichment.py` — Enrichment API endpoints
- `scheduler.py` — Enrichment scheduling
- `notifications.py` — Notification endpoints
- `components.py` — Digital twin components
- `maintenance.py` — Maintenance records
- `scenarios.py` — ✅ REBUILT (working Scenario Planner with retrofit cost model)
- `datahub.py` — ✅ REBUILT (working CSV upload + import pipeline)
- `reconciliation.py` — Data reconciliation
- `search.py` — ✅ REBUILT (working property search + autocomplete)
- `favourites.py` — Property favourites
- `layers.py` — Map layer management
- `exports.py` — ✅ REBUILT (real DB queries, CSV/GeoJSON/Retrofit Plan exports)

### Database Migrations (may need validation)
- `002_extended_fields.sql` — Additional property fields
- `003_auth.sql` — Users, roles, sessions tables
- `005_notifications.sql` — Notification tables
- `006_digital_twin.sql` — Component tracking tables
- `007_reconciliation.sql` — Data reconciliation tables

---

## Outstanding Work (Priority Order)

### High Priority
1. **EPC enrichment** — Register at https://epc.opendatacommunities.org, add EPC_EMAIL and EPC_API_KEY to `.env`, then run `python enrich_epc.py`
2. ~~**CSV Upload UI**~~ — ✅ DONE (DataUploadPage in App.tsx + datahub.py API)
3. **Property detail panel enrichment data** — Show crime risk score, flood zone, LSOA, EPC details in the property slide-out panel
4. ~~**Search functionality**~~ — ✅ DONE (SearchBar + SearchResultsPage in App.tsx, search API endpoints)
5. **Run deduplication** — `python deduplicate.py` then `python deduplicate.py --execute`

### Medium Priority
6. ~~**Additional nav pages**~~ — ✅ DONE (Nav now has: Map, Dashboard, Insights, Scenarios, Upload, Export + Search bar)
7. **IMD enrichment** — Index of Multiple Deprivation data (provider scaffolded at `services/enrichment/imd_provider.py`)
8. **Census enrichment** — Population/demographics (provider scaffolded)
9. **Land Registry enrichment** — Property values/sales (provider scaffolded)
10. ~~**Export functionality**~~ — ✅ DONE (ExportPage in App.tsx + rebuilt exports.py with real DB queries)
11. ~~**Report generation**~~ — ✅ DONE (Portfolio report via /api/exports/report, displayed in ExportPage)

### Lower Priority
12. **Authentication** — Login/JWT (scaffolded in `routers/auth.py`, `pages/Login.tsx`)
13. **Digital Twin** — Component-level tracking, maintenance prediction, lifecycle management
14. ~~**Scenario Planner**~~ — ✅ DONE (ScenarioPage in App.tsx + scenarios.py API with retrofit cost model)
15. **Notifications** — Email alerts for flood warnings, EPC expiry, maintenance due
16. **Data Reconciliation** — Detect and resolve conflicts when re-importing data
17. **Tenant Management** — Tenant data linked to properties
18. **Favourites/Watchlist** — Save properties to personal lists

---

## Known Issues / Technical Debt

- **Tailwind CSS v4 is broken** — All styling must use inline styles. The scaffolded page components (Dashboard.tsx, Login.tsx, etc.) use Tailwind classes and will NOT render correctly. They need rewriting with inline styles before use.
- **Python 3.9 SSL limitation** — LibreSSL 2.8.3 can't connect to some APIs. All enrichment scripts use `subprocess` + `curl` as a workaround. Consider upgrading Python to 3.11+ to fix properly.
- **Scaffolded routers may have broken imports** — Many routers import from `app.models` which doesn't exist. They use `from app.models import Property` but the working pattern is `from database import engine` with raw SQL via `text()`.
- **`python-multipart` required** — Must be installed (`pip install python-multipart`) for the CSV upload endpoint (`UploadFile` in datahub.py). FastAPI will crash on startup without it.
- **No tests** — No unit or integration tests exist yet
- **No CI/CD** — No deployment pipeline

---

## Key File Locations

```
shdt/
├── client/
│   ├── src/
│   │   ├── App.tsx                  ← Main working UI (map + dashboard)
│   │   ├── types/property.ts        ← Property TypeScript interface
│   │   ├── context/FilterContext.tsx ← Filter state management
│   │   └── pages/                   ← Scaffolded pages (need Tailwind→inline rewrite)
│   └── vite.config.ts               ← Proxy config (/api → localhost:8000)
├── server/
│   ├── main.py                      ← FastAPI app entry point
│   ├── database.py                  ← DB connection (engine, SessionLocal)
│   ├── .env                         ← DB credentials, API keys
│   ├── services/
│   │   ├── property_service.py      ← Property CRUD + spatial queries
│   │   ├── analytics_service.py     ← Dashboard analytics queries
│   │   └── search_service.py        ← Property search + autocomplete
│   ├── routers/
│   │   ├── properties.py            ← Property API endpoints
│   │   ├── analytics.py             ← Analytics API endpoints
│   │   ├── search.py                ← Search + autocomplete endpoints
│   │   ├── datahub.py               ← CSV upload + import pipeline
│   │   ├── scenarios.py             ← Retrofit scenario modelling
│   │   ├── exports.py               ← CSV/GeoJSON/Report exports
│   │   └── layers.py                ← Map layer management
│   ├── enrich_crime.py              ← Crime enrichment (curl-based)
│   ├── enrich_flood.py              ← Flood enrichment (curl-based)
│   ├── enrich_postcodes.py          ← Postcodes.io enrichment (curl-based)
│   ├── enrich_epc.py                ← EPC enrichment (needs API key)
│   ├── enrich_all.py                ← Master enrichment runner
│   ├── import_property_data.py      ← CSV import script
│   └── deduplicate.py               ← Duplicate detection/removal
├── database/
│   ├── init.sql                     ← Core schema
│   └── migrations/                  ← Schema migrations (002-007)
└── docker-compose.yml               ← PostgreSQL + PostGIS
```
