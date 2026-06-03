# Deploy

This repo is configured for a **frontend-only Vercel demo**. The Python
backend (`server/`) and Postgres+PostGIS database are intentionally
not deployed — the React client reads from static JSON in
`client/public/data/` via a fetch interceptor (`client/src/utils/staticApi.ts`).

## 1. Push to GitHub

Run from your Mac terminal:

```bash
cd ~/Documents/dt/shdt

# Clear any stale git lock from the prep session (safe if it doesn't exist)
rm -f .git/index.lock

git add .
git commit -m "Initial commit: SHDT demo with static data + Vercel config"
git branch -M main
git remote add origin https://github.com/<your-user>/shdt.git
git push -u origin main
```

## 2. Connect on Vercel

1. Vercel → Add New → Project → import the GitHub repo.
2. Vercel will read `vercel.json` from the repo root:
   - Build command: `cd client && npm install && npm run build`
   - Output directory: `client/dist`
   - SPA rewrites: all unknown paths → `/index.html`
3. No environment variables required for the demo build.
4. Deploy.

That's it — first build takes ~2 minutes.

## 3. Local preview

```bash
cd client
npm install
npm run build
npm run preview     # serves the production build at http://localhost:4173
```

Or run in dev mode:

```bash
cd client
npm run dev         # http://localhost:5173, static data served from /data/
```

## How the demo works

- All `fetch()` and `axios` calls to `/api/*` are intercepted in
  `client/src/main.tsx` via `installStaticApi()`.
- The interceptor routes each known endpoint to a JSON file in
  `client/public/data/` (see `staticApi.ts` for the routing table).
- Unknown `/api/*` GETs return `{ status: "success", data: null }`.
- POST/PUT/PATCH/DELETE return `{ status: "success", data: {} }`.

## Re-enabling the live backend

Set `VITE_USE_LIVE_API=true` at build time and point the Vite proxy
(or your reverse proxy) at the FastAPI server. See `server/` for the
backend; deployment is out of scope for the Vercel target.

## Refreshing the demo data from your local enrichment runs

The Vercel demo is a snapshot, not a live API. The refresh loop:

```bash
# 1. Bring up the local stack
docker compose up -d
cd server && uvicorn main:app --reload --port 8000 &

# 2. Run enrichment (postcodes.io, EA flood, EPC, Police UK, Census,
#    Open-Meteo, Ofcom, OS Open UPRN). Either the Makefile target...
make import          # ingest properties from your CSV
./server/enrich_data.sh    # or run individual enrich_*.py scripts

# 3. Snapshot the populated backend → static JSON for Vercel
make export-static
# or directly:
python3 scripts/export_static_data.py --api http://localhost:8000

# 4. Commit and push — Vercel auto-redeploys
git add client/public/data/
git commit -m "Refresh demo data"
git push
```

`scripts/export_static_data.py` hits every endpoint the frontend reads
(properties, analytics, flood map+forecast, AWAAB kanban, TSM, compliance,
damp+mould heatmap) and writes the response straight into
`client/public/data/`. Re-run it any time the underlying database changes.

If only some endpoints have moved, refresh a subset:

```bash
python3 scripts/export_static_data.py --only flood-map-data.json,flood-forecast.json
```

## Properties bundled in the demo

9 UK properties total — 2 specified by the operator, 2 in
Leicestershire flood-prone wards (Sileby, Loughborough), and 5 in
nationally significant flood-risk areas (Hull, Boston, Tewkesbury,
York, Hebden Bridge). All have real postcodes geocoded via
postcodes.io. See `client/public/data/properties.json`.
