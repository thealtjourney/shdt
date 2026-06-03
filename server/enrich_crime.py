"""
Crime Statistics Enrichment via UK Police API.

Fetches crime data for each property's location using data.police.uk
Free API, no key needed. Rate limit: ~15 requests/second.

The API returns crimes within a 1-mile radius of a lat/lng point.
We round coordinates to 2 decimal places for caching (same area = same request).

Uses curl subprocess instead of requests to bypass LibreSSL TLS issues on macOS.

Usage:
    python enrich_crime.py [--limit 1000]
"""

import sys
import os
import json
import time
import subprocess
import logging
from collections import defaultdict
from typing import Dict, List, Optional

from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()
sys.path.insert(0, os.path.dirname(__file__))
from database import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

POLICE_API_BASE = "https://data.police.uk/api"
RATE_LIMIT_DELAY = 0.15  # seconds between requests


def get_unique_locations(limit: Optional[int] = None) -> List[Dict]:
    """
    Get unique rounded lat/lng locations from properties that haven't been enriched.
    Rounds to 2 decimal places (~1.1km accuracy) to batch nearby properties.
    """
    with engine.connect() as conn:
        query = text("""
            SELECT
                ROUND(CAST(latitude AS NUMERIC), 2) as lat_rounded,
                ROUND(CAST(longitude AS NUMERIC), 2) as lng_rounded,
                COUNT(*) as property_count
            FROM properties
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND crime_last_updated IS NULL
            GROUP BY lat_rounded, lng_rounded
            ORDER BY property_count DESC
        """)
        if limit:
            query = text(f"""
                SELECT
                    ROUND(CAST(latitude AS NUMERIC), 2) as lat_rounded,
                    ROUND(CAST(longitude AS NUMERIC), 2) as lng_rounded,
                    COUNT(*) as property_count
                FROM properties
                WHERE latitude IS NOT NULL
                  AND longitude IS NOT NULL
                  AND crime_last_updated IS NULL
                GROUP BY lat_rounded, lng_rounded
                ORDER BY property_count DESC
                LIMIT :limit
            """)

        rows = conn.execute(query, {"limit": limit} if limit else {}).fetchall()
        return [{"lat": float(r[0]), "lng": float(r[1]), "count": r[2]} for r in rows]


def fetch_crimes(lat: float, lng: float) -> Optional[List[Dict]]:
    """Fetch street-level crimes for a lat/lng from the Police API using curl."""
    url = f"{POLICE_API_BASE}/crimes-street/all-crime?lat={lat}&lng={lng}"
    try:
        result = subprocess.run(
            ["curl", "-s", "-w", "\n%{http_code}", "--max-time", "15", url],
            capture_output=True, text=True, timeout=20,
        )
        # curl output: body + "\n" + status_code
        parts = result.stdout.rsplit("\n", 1)
        if len(parts) != 2:
            logger.warning(f"Unexpected curl output for ({lat},{lng})")
            return None

        body, status_code = parts[0], parts[1].strip()

        if status_code == "200":
            return json.loads(body)
        elif status_code == "503":
            logger.warning(f"API overloaded at ({lat},{lng}), will retry later")
            return None
        elif status_code == "404":
            return []
        else:
            logger.warning(f"API returned {status_code} for ({lat},{lng})")
            return None

    except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception) as e:
        logger.warning(f"Request failed for ({lat},{lng}): {e}")
        return None


def aggregate_crimes(crimes: List[Dict]) -> Dict:
    """Aggregate crime data into summary statistics."""
    if not crimes:
        return {
            "crime_total_3months": 0,
            "crime_burglary_3months": 0,
            "crime_antisocial_3months": 0,
            "crime_criminal_damage_3months": 0,
            "crime_violence_3months": 0,
            "crime_robbery_3months": 0,
            "crime_other_3months": 0,
            "crime_risk_score": 0.0,
        }

    # Count by category
    counts = defaultdict(int)
    for crime in crimes:
        category = crime.get("category", "other-crime")
        counts[category] += 1

    total = len(crimes)

    # Map police API categories to our columns
    burglary = counts.get("burglary", 0)
    antisocial = counts.get("anti-social-behaviour", 0)
    criminal_damage = counts.get("criminal-damage-arson", 0)
    violence = counts.get("violent-crime", 0) + counts.get("violence-and-sexual-offences", 0)
    robbery = counts.get("robbery", 0)
    other = total - burglary - antisocial - criminal_damage - violence - robbery

    # Calculate risk score (1-10 scale)
    # National average is roughly 80 crimes per 1000 people per year
    # For a 1-mile radius area, ~200 crimes/quarter is "average"
    risk_score = min(10.0, round((total / 200) * 5, 1))

    return {
        "crime_total_3months": total,
        "crime_burglary_3months": burglary,
        "crime_antisocial_3months": antisocial,
        "crime_criminal_damage_3months": criminal_damage,
        "crime_violence_3months": violence,
        "crime_robbery_3months": robbery,
        "crime_other_3months": other,
        "crime_risk_score": risk_score,
    }


def update_properties(lat: float, lng: float, crime_data: Dict) -> int:
    """Update all properties near this rounded lat/lng with crime data."""
    with engine.begin() as conn:
        result = conn.execute(
            text("""
                UPDATE properties SET
                    crime_total_3months = :crime_total_3months,
                    crime_burglary_3months = :crime_burglary_3months,
                    crime_antisocial_3months = :crime_antisocial_3months,
                    crime_criminal_damage_3months = :crime_criminal_damage_3months,
                    crime_violence_3months = :crime_violence_3months,
                    crime_robbery_3months = :crime_robbery_3months,
                    crime_other_3months = :crime_other_3months,
                    crime_risk_score = :crime_risk_score,
                    crime_last_updated = CURRENT_DATE,
                    last_enriched_at = NOW()
                WHERE ROUND(CAST(latitude AS NUMERIC), 2) = :lat
                  AND ROUND(CAST(longitude AS NUMERIC), 2) = :lng
                  AND crime_last_updated IS NULL
            """),
            {**crime_data, "lat": lat, "lng": lng},
        )
        return result.rowcount


def run_enrichment(limit: Optional[int] = None):
    """Run the full crime enrichment pipeline."""
    locations = get_unique_locations(limit)

    if not locations:
        logger.info("No properties need crime enrichment — all up to date.")
        return

    total_locations = len(locations)
    total_properties = sum(loc["count"] for loc in locations)
    logger.info(f"Enriching {total_locations} unique locations covering {total_properties} properties")

    enriched_locations = 0
    enriched_properties = 0
    failed = 0

    for i, loc in enumerate(locations):
        crimes = fetch_crimes(loc["lat"], loc["lng"])

        if crimes is None:
            failed += 1
            time.sleep(1)  # Back off on failure
            continue

        crime_data = aggregate_crimes(crimes)
        updated = update_properties(loc["lat"], loc["lng"], crime_data)

        enriched_locations += 1
        enriched_properties += updated

        if (i + 1) % 25 == 0 or i == total_locations - 1:
            logger.info(
                f"  Progress: {i + 1}/{total_locations} locations, "
                f"{enriched_properties} properties updated, {failed} failed"
            )

        time.sleep(RATE_LIMIT_DELAY)

    logger.info(f"\nCrime enrichment complete:")
    logger.info(f"  Locations processed: {enriched_locations}/{total_locations}")
    logger.info(f"  Properties updated:  {enriched_properties}")
    logger.info(f"  Failed requests:     {failed}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Enrich properties with crime statistics")
    parser.add_argument("--limit", type=int, default=None, help="Max number of unique locations to process")
    args = parser.parse_args()

    run_enrichment(limit=args.limit)
