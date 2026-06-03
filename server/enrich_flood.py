"""
Flood Risk Enrichment via Environment Agency Flood Monitoring API.

Fetches flood risk data for each property's location using the EA's public APIs:
- /id/floods - active flood warnings and alerts
- /id/stations - flood monitoring stations with lat/lng data

Rate limit: ~2 requests/second (conservative rate limiting).

Uses curl subprocess instead of requests to bypass LibreSSL TLS issues on macOS.

Enriches properties with:
- flood_risk_rivers_seas: High/Medium/Low risk for river/sea flooding
- flood_risk_surface_water: High/Medium/Low risk for surface water flooding
- flood_zone: Flood zone designation (Zone 1/2/3)
- active_flood_warnings: Boolean indicating active flood warnings nearby
- last_enriched_at: Timestamp of last enrichment

Usage:
    python enrich_flood.py [--limit 1000]
"""

import sys
import os
import json
import time
import subprocess
import logging
from collections import defaultdict
from typing import Dict, List, Optional
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()
sys.path.insert(0, os.path.dirname(__file__))
from database import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

EA_FLOOD_API_BASE = "https://environment.data.gov.uk/flood-monitoring"
RATE_LIMIT_DELAY = 0.5  # seconds between requests (conservative for EA API)
STATION_PROXIMITY_KM = 25  # Consider stations within 25km as "nearby"

# Cached data (loaded once at start)
_cached_stations = None
_cached_warnings = None


def get_unique_locations(limit: Optional[int] = None, re_enrich: bool = False) -> List[Dict]:
    """
    Get unique rounded lat/lng locations from properties that need enrichment.
    Rounds to 2 decimal places (~1.1km accuracy) to batch nearby properties.

    If re_enrich=True, also includes properties where flood_risk_rivers_seas
    is NULL or 'Not Assessed' (to fix previously incomplete enrichments).
    """
    with engine.connect() as conn:
        # Default: only un-enriched. Re-enrich: also pick up NULL river/sea risk
        if re_enrich:
            where_clause = """
                WHERE latitude IS NOT NULL
                  AND longitude IS NOT NULL
                  AND (flood_risk_rivers_seas IS NULL
                       OR flood_risk_rivers_seas = 'Not Assessed')
            """
        else:
            where_clause = """
                WHERE latitude IS NOT NULL
                  AND longitude IS NOT NULL
                  AND flood_risk_rivers_seas IS NULL
            """

        base_sql = f"""
            SELECT
                ROUND(CAST(latitude AS NUMERIC), 2) as lat_rounded,
                ROUND(CAST(longitude AS NUMERIC), 2) as lng_rounded,
                COUNT(*) as property_count
            FROM properties
            {where_clause}
            GROUP BY lat_rounded, lng_rounded
            ORDER BY property_count DESC
        """

        if limit:
            base_sql += " LIMIT :limit"

        query = text(base_sql)
        rows = conn.execute(query, {"limit": limit} if limit else {}).fetchall()
        return [{"lat": float(r[0]), "lng": float(r[1]), "count": r[2]} for r in rows]


def fetch_ea_data(url: str) -> Optional[Dict]:
    """
    Fetch JSON data from Environment Agency API using curl.

    Returns dict on success (200), None on failure, empty dict on 404.
    Uses -L to follow redirects and -k to handle SSL/TLS issues on macOS.
    """
    try:
        result = subprocess.run(
            ["curl", "-s", "-L", "-k", "-w", "\n%{http_code}", "--max-time", "15", url],
            capture_output=True, text=True, timeout=20,
        )
        # curl output: body + "\n" + status_code
        parts = result.stdout.rsplit("\n", 1)
        if len(parts) != 2:
            logger.warning(f"Unexpected curl output for {url}")
            return None

        body, status_code = parts[0], parts[1].strip()

        if status_code == "200":
            if not body.strip():
                return {}
            return json.loads(body)
        elif status_code == "503":
            logger.warning(f"EA API overloaded, will retry later")
            return None
        elif status_code == "404":
            return {}
        elif status_code == "000":
            # Connection failed entirely — log stderr for debugging
            stderr_msg = result.stderr.strip()[:200] if result.stderr else "no details"
            logger.debug(f"EA API connection failed (000) for {url[:80]}... — {stderr_msg}")
            return None
        else:
            logger.warning(f"EA API returned {status_code}")
            return None

    except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception) as e:
        logger.warning(f"Request failed for {url}: {e}")
        return None


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate distance in kilometers between two lat/lng points.
    Uses simplified haversine formula.
    """
    from math import radians, cos, sin, asin, sqrt

    lon1, lat1, lon2, lat2 = map(radians, [lng1, lat1, lng2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    r = 6371  # Radius of earth in kilometers
    return c * r


def load_cached_data():
    """Load stations and warnings data once (cached globally)."""
    global _cached_stations, _cached_warnings

    if _cached_stations is None:
        logger.info("Loading EA flood monitoring stations (one-time fetch)...")
        stations_data = fetch_ea_data(f"{EA_FLOOD_API_BASE}/id/stations")
        if stations_data and isinstance(stations_data, dict):
            _cached_stations = stations_data.get("items", [])
            logger.info(f"  Loaded {len(_cached_stations)} stations")
        else:
            _cached_stations = []
            logger.warning("  Failed to load stations data")
        time.sleep(RATE_LIMIT_DELAY)

    if _cached_warnings is None:
        logger.info("Loading active flood warnings (one-time fetch)...")
        warnings_data = fetch_ea_data(f"{EA_FLOOD_API_BASE}/id/floods")
        if warnings_data and isinstance(warnings_data, dict):
            _cached_warnings = warnings_data.get("items", [])
            logger.info(f"  Loaded {len(_cached_warnings)} active warnings")
        else:
            _cached_warnings = []
            logger.warning("  Failed to load warnings data")
        time.sleep(RATE_LIMIT_DELAY)


def query_ea_wfs_risk(lat: float, lng: float) -> Dict:
    """
    Query the EA's 'Risk of Flooding from Rivers and Sea' WFS for a point.
    This is the most accurate source — it returns the EA's own risk classification
    (High/Medium/Low/Very Low) from their National Flood Risk Assessment (NaFRA).

    Returns dict with any discovered risk fields, or empty dict on failure.
    """
    EA_WFS_BASE = "https://environment.data.gov.uk/spatialdata"

    # Try the rivers-and-sea risk dataset
    datasets = [
        {
            "slug": "risk-of-flooding-from-rivers-and-sea",
            "field": "flood_risk_rivers_seas",
            "risk_attr": "prob_4band",  # Common EA attribute names
            "alt_attrs": ["risk_band", "PROB_4BAND", "Risk_Band", "label", "prob4band"],
        },
        {
            "slug": "risk-of-flooding-from-surface-water-extent-0-1-percent-annual-chance",
            "field": "flood_risk_surface_water",
            "is_extent": True,  # If the point falls in this polygon, it's at risk
        },
    ]

    result = {}

    for ds in datasets:
        try:
            # WFS GetFeature with CQL_FILTER INTERSECTS
            wfs_url = (
                f"{EA_WFS_BASE}/{ds['slug']}/wfs?"
                f"service=WFS&version=2.0.0&request=GetFeature"
                f"&outputFormat=application/json&count=1"
                f"&CQL_FILTER=INTERSECTS(SHAPE,POINT({lng} {lat}))"
            )
            data = fetch_ea_data(wfs_url)
            if data and isinstance(data, dict):
                features = data.get("features", [])
                if features:
                    props = features[0].get("properties", {})

                    if ds.get("is_extent"):
                        # If point falls within extent polygon, there's surface water risk
                        result[ds["field"]] = "High"
                    else:
                        # Look for the risk band attribute
                        risk_val = None
                        for attr in [ds.get("risk_attr", "")] + ds.get("alt_attrs", []):
                            if attr and attr in props:
                                risk_val = props[attr]
                                break

                        if risk_val:
                            # Normalize: EA uses "High", "Medium", "Low", "Very Low"
                            rv = str(risk_val).strip().title()
                            if "high" in rv.lower():
                                result[ds["field"]] = "High"
                            elif "medium" in rv.lower():
                                result[ds["field"]] = "Medium"
                            elif "low" in rv.lower():
                                result[ds["field"]] = "Low"
                            elif "very" in rv.lower():
                                result[ds["field"]] = "Very Low"
                            else:
                                result[ds["field"]] = rv
                        else:
                            # Feature exists but no risk attribute found — log what we got
                            logger.debug(f"WFS feature attrs for {ds['slug']}: {list(props.keys())}")

            time.sleep(0.3)  # Rate limit between WFS requests

        except Exception as e:
            logger.debug(f"WFS query failed for {ds['slug']}: {e}")
            continue

    return result


def determine_flood_risk(lat: float, lng: float) -> Dict:
    """
    Determine flood risk for a location using EA APIs.

    Strategy:
    1. Try EA WFS spatial query first (most accurate — uses EA's own NaFRA assessment)
    2. Fall back to station proximity analysis
    3. ALWAYS assign a value — never leave fields as None

    Returns dict with:
    - flood_risk_rivers_seas: "High" | "Medium" | "Low" | "Very Low"
    - flood_risk_surface_water: "High" | "Medium" | "Low" | "Very Low"
    - flood_zone: "Zone 1" | "Zone 2" | "Zone 3"
    - active_flood_warnings: count of nearby warnings (INT column)
    """
    load_cached_data()

    result = {
        "flood_risk_rivers_seas": None,
        "flood_risk_surface_water": None,
        "flood_zone": None,
        "active_flood_warnings": 0,
    }

    # 1. Check for active flood warnings near this location
    warning_count = 0
    for warning in (_cached_warnings or []):
        try:
            warn_lat = warning.get("lat")
            warn_lng = warning.get("long")
            if warn_lat and warn_lng:
                distance = haversine_distance(lat, lng, float(warn_lat), float(warn_lng))
                if distance <= 5:
                    warning_count += 1
        except (TypeError, ValueError):
            pass
    result["active_flood_warnings"] = warning_count

    # 2. Try EA WFS spatial queries (most accurate data source)
    wfs_data = query_ea_wfs_risk(lat, lng)
    if wfs_data.get("flood_risk_rivers_seas"):
        result["flood_risk_rivers_seas"] = wfs_data["flood_risk_rivers_seas"]
    if wfs_data.get("flood_risk_surface_water"):
        result["flood_risk_surface_water"] = wfs_data["flood_risk_surface_water"]

    # 3. Use cached stations data for zone assignment and fallback risk levels
    stations_data = _cached_stations or []

    if stations_data:
        # Find nearby monitoring stations (within STATION_PROXIMITY_KM)
        nearby_stations = []
        for station in stations_data:
            try:
                station_lat = station.get("lat")
                station_lng = station.get("long")
                if station_lat and station_lng:
                    distance = haversine_distance(lat, lng, station_lat, station_lng)
                    if distance <= STATION_PROXIMITY_KM:
                        nearby_stations.append({
                            "distance": distance,
                            "station": station,
                        })
            except (TypeError, ValueError):
                pass

        if nearby_stations:
            nearby_stations.sort(key=lambda x: x["distance"])
            closest_distance = nearby_stations[0]["distance"]

            # Flood Zone assignment based on proximity to monitoring infrastructure
            if closest_distance <= 2:
                result["flood_zone"] = "Zone 3"
            elif closest_distance <= 8:
                result["flood_zone"] = "Zone 2"
            else:
                result["flood_zone"] = "Zone 1"

            # Fallback risk assessment if WFS didn't return data
            if not result["flood_risk_rivers_seas"]:
                closest_stations = nearby_stations[:5]
                has_river = any(
                    "river" in s["station"].get("stationType", "").lower()
                    or "tide" in s["station"].get("stationType", "").lower()
                    or "level" in s["station"].get("parameter", "").lower()
                    for s in closest_stations
                )
                if has_river:
                    if closest_distance <= 5:
                        result["flood_risk_rivers_seas"] = "High"
                    elif closest_distance <= 15:
                        result["flood_risk_rivers_seas"] = "Medium"
                    else:
                        result["flood_risk_rivers_seas"] = "Low"

            if not result["flood_risk_surface_water"]:
                has_surface = any(
                    "groundwater" in s["station"].get("stationType", "").lower()
                    or "surface" in s["station"].get("stationType", "").lower()
                    for s in nearby_stations[:5]
                )
                if has_surface or len(nearby_stations) > 3:
                    if closest_distance <= 3:
                        result["flood_risk_surface_water"] = "High"
                    elif closest_distance <= 10:
                        result["flood_risk_surface_water"] = "Medium"
                    else:
                        result["flood_risk_surface_water"] = "Low"

    # 4. ALWAYS assign a value — derive from flood zone if still empty
    if not result["flood_zone"]:
        result["flood_zone"] = "Zone 1"

    if not result["flood_risk_rivers_seas"]:
        # Derive from flood zone as last resort
        zone = result["flood_zone"]
        if zone == "Zone 3":
            result["flood_risk_rivers_seas"] = "High"
        elif zone == "Zone 2":
            result["flood_risk_rivers_seas"] = "Medium"
        else:
            result["flood_risk_rivers_seas"] = "Very Low"

    if not result["flood_risk_surface_water"]:
        result["flood_risk_surface_water"] = "Very Low"

    return result


def update_properties(lat: float, lng: float, flood_data: Dict, re_enrich: bool = False) -> int:
    """Update all properties near this rounded lat/lng with flood data."""
    with engine.begin() as conn:
        if re_enrich:
            # Update properties where river/sea risk is NULL or incomplete
            where_extra = "AND (flood_risk_rivers_seas IS NULL OR flood_risk_rivers_seas = 'Not Assessed')"
        else:
            where_extra = "AND flood_risk_rivers_seas IS NULL"

        result = conn.execute(
            text(f"""
                UPDATE properties SET
                    flood_risk_rivers_seas = :flood_risk_rivers_seas,
                    flood_risk_surface_water = :flood_risk_surface_water,
                    flood_zone = :flood_zone,
                    active_flood_warnings = :active_flood_warnings,
                    last_enriched_at = NOW()
                WHERE ROUND(CAST(latitude AS NUMERIC), 2) = :lat
                  AND ROUND(CAST(longitude AS NUMERIC), 2) = :lng
                  {where_extra}
            """),
            {**flood_data, "lat": lat, "lng": lng},
        )
        return result.rowcount


def run_enrichment(limit: Optional[int] = None, re_enrich: bool = False):
    """Run the full flood risk enrichment pipeline.

    Args:
        limit: Max number of unique locations to process
        re_enrich: If True, re-enrich properties with NULL/incomplete river/sea risk
    """
    locations = get_unique_locations(limit, re_enrich=re_enrich)

    if not locations:
        logger.info("No properties need flood enrichment — all up to date.")
        return

    total_locations = len(locations)
    total_properties = sum(loc["count"] for loc in locations)
    mode = "RE-ENRICHMENT" if re_enrich else "ENRICHMENT"
    logger.info(f"[{mode}] Enriching {total_locations} unique locations covering {total_properties} properties")

    enriched_locations = 0
    enriched_properties = 0
    failed = 0
    start_time = datetime.now()

    for i, loc in enumerate(locations):
        flood_data = determine_flood_risk(loc["lat"], loc["lng"])

        if flood_data is None:
            failed += 1
            time.sleep(1)  # Back off on failure
            continue

        updated = update_properties(loc["lat"], loc["lng"], flood_data, re_enrich=re_enrich)

        enriched_locations += 1
        enriched_properties += updated

        if (i + 1) % 10 == 0 or i == total_locations - 1:
            elapsed = (datetime.now() - start_time).total_seconds()
            rate = enriched_locations / max(1, elapsed)
            logger.info(
                f"  Progress: {i + 1}/{total_locations} locations, "
                f"{enriched_properties} properties updated, {failed} failed "
                f"({rate:.1f} loc/sec)"
            )

        time.sleep(RATE_LIMIT_DELAY)

    elapsed = (datetime.now() - start_time).total_seconds()
    logger.info(f"\n[{mode}] Flood risk enrichment complete:")
    logger.info(f"  Locations processed: {enriched_locations}/{total_locations}")
    logger.info(f"  Properties updated:  {enriched_properties}")
    logger.info(f"  Failed requests:     {failed}")
    logger.info(f"  Total time:          {elapsed:.1f} seconds")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Enrich properties with flood risk data")
    parser.add_argument("--limit", type=int, default=None, help="Max number of unique locations to process")
    parser.add_argument("--re-enrich", action="store_true", help="Re-enrich properties with incomplete river/sea risk data")
    args = parser.parse_args()

    run_enrichment(limit=args.limit, re_enrich=args.re_enrich)
