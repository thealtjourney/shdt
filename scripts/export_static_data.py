#!/usr/bin/env python3
"""
export_static_data.py
---------------------

Snapshot the live FastAPI backend into the static JSON files that the
Vercel frontend serves to its dashboards.

Workflow:
    1. Bring up Postgres + the backend locally
        $ docker compose up -d
        $ cd server && uvicorn main:app --reload --port 8000
    2. Run your enrichment scripts (postcodes.io, EA flood, EPC, Police UK,
       Census 2021, Open-Meteo, Ofcom, OS Open UPRN). The Makefile target
       `make enrich-all` does the lot.
    3. From the repo root:
        $ python scripts/export_static_data.py
       (or `--api http://localhost:8000` if your backend lives elsewhere)
    4. Commit `client/public/data/*.json` and push. Vercel auto-redeploys.

Every endpoint listed below is one the frontend's fetch-interceptor
(`client/src/utils/staticApi.ts`) routes to a JSON file. If you add a new
endpoint there, add it here too so the export stays in sync.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:
    sys.exit("This script needs `requests`. Install it: pip install requests")


REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "client" / "public" / "data"


# A wide UK bounding box so /properties/bbox returns the whole portfolio.
UK_BBOX = {
    "min_lat": 49.5,
    "max_lat": 60.9,
    "min_lng": -8.6,
    "max_lng": 2.1,
    "page": 1,
    "page_size": 2000,
}


# (filename, path, querystring or None)
ENDPOINTS: list[tuple[str, str, dict | None]] = [
    # Properties — exported in GeoJSON FeatureCollection form
    ("properties.json", "/api/properties/bbox", UK_BBOX),

    # Analytics
    ("analytics-overview.json",   "/api/analytics/overview",          None),
    ("epc-distribution.json",     "/api/analytics/epc-distribution",  {"target_year": 2030}),
    ("flood-summary.json",        "/api/analytics/flood-summary",     None),
    ("region-summary.json",       "/api/analytics/region-summary",    None),
    ("crime-summary.json",        "/api/analytics/crime-summary",     None),
    ("geographic-summary.json",   "/api/analytics/geographic-summary", None),
    ("retrofit-priorities.json",  "/api/analytics/retrofit-priorities", {"page": 1, "page_size": 50}),

    # Flood Intelligence dashboard
    ("flood-map-data.json",       "/api/analytics/flood-map-data",    None),
    ("flood-forecast.json",       "/api/analytics/flood-forecast",    None),
    ("wms-layer-names.json",      "/api/analytics/wms-layer-names",   None),

    # Operational
    ("awaab-kanban.json",         "/api/awaab/kanban",                None),
    ("tsm-measures.json",         "/api/tsm/measures",                None),
    ("compliance-summary.json",   "/api/compliance/summary",          None),
    ("damp-mould-heatmap.json",   "/api/damp-mould/heatmap",          None),
]


def fetch(base: str, path: str, params: dict | None) -> Any:
    url = base.rstrip("/") + path
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    return r.json()


def write_json(target: Path, payload: Any) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://localhost:8000", help="Backend base URL (default: http://localhost:8000)")
    parser.add_argument("--only", help="Comma-separated list of filenames to refresh (skip everything else)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be fetched without writing")
    args = parser.parse_args()

    only = {x.strip() for x in args.only.split(",")} if args.only else None

    print(f"Exporting from {args.api} → {OUT_DIR}")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    failures: list[tuple[str, str]] = []
    successes = 0

    for filename, path, params in ENDPOINTS:
        if only and filename not in only:
            continue
        label = f"  {filename:<30} ← {path}"
        if args.dry_run:
            print(f"{label}  [dry-run]")
            continue
        try:
            payload = fetch(args.api, path, params)
            write_json(OUT_DIR / filename, payload)
            print(f"{label}  ✓")
            successes += 1
        except requests.HTTPError as e:
            failures.append((filename, f"{e.response.status_code} {e.response.reason}"))
            print(f"{label}  ✗ {e.response.status_code}")
        except requests.RequestException as e:
            failures.append((filename, str(e)))
            print(f"{label}  ✗ {e}")

    print()
    print(f"Done: {successes} written, {len(failures)} failed")
    if failures:
        print("Failures:")
        for fn, err in failures:
            print(f"  - {fn}: {err}")
        print()
        print("Hint: the matching static file is left untouched, so the demo still")
        print("renders. Re-run after fixing the backend.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
