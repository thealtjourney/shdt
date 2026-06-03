"""
Weather Forecast Enrichment — Predictive Flood Risk Scoring.

Combines 7-day rainfall forecasts from Open-Meteo (UK Met Office models)
with existing flood zone data and EA river level monitoring to produce
a dynamic Forecast Risk Score (0-100) per property.

Data sources (all free, no API keys):
- Open-Meteo: Hourly precipitation for 7 days (UKMO UKV 2km model)
- EA Flood Monitoring: Active warnings + nearby river/tide station levels

Unlike other enrichers, this script ALWAYS updates all properties
because forecast data is time-sensitive and expires daily.

Usage:
    python enrich_forecast.py [--limit 100]
"""

import sys
import os
import json
import time
import subprocess
import logging
import argparse
from collections import defaultdict
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta

from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()
sys.path.insert(0, os.path.dirname(__file__))
from database import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast"
EA_FLOOD_API = "https://environment.data.gov.uk/flood-monitoring"
RATE_LIMIT_DELAY = 0.3  # seconds between Open-Meteo requests

# Cache for EA warnings (loaded once at start)
_cached_warnings = None
_cached_warning_areas = None

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def curl_get(url: str) -> Optional[Dict]:
    """Fetch JSON from URL using curl (bypasses LibreSSL TLS issues)."""
    try:
        result = subprocess.run(
            ["curl", "-s", "-w", "\n%{http_code}", "--max-time", "15", url],
            capture_output=True, text=True, timeout=20,
        )
        parts = result.stdout.rsplit("\n", 1)
        if len(parts) != 2:
            return None
        body, status_code = parts[0], parts[1].strip()
        if status_code == "200" and body.strip():
            return json.loads(body)
        if status_code != "200":
            logger.warning(f"HTTP {status_code} for {url[:80]}...")
        return None
    except (subprocess.TimeoutExpired, json.JSONDecodeError) as e:
        logger.warning(f"curl error: {e}")
        return None


def load_ea_warnings():
    """Load all active EA flood warnings (cached globally)."""
    global _cached_warnings, _cached_warning_areas
    if _cached_warnings is not None:
        return

    logger.info("Loading active EA flood warnings...")
    data = curl_get(f"{EA_FLOOD_API}/id/floods")
    if not data or "items" not in data:
        logger.warning("Could not load EA warnings, using empty set")
        _cached_warnings = []
        _cached_warning_areas = []
        return

    _cached_warnings = data["items"]
    logger.info(f"Loaded {len(_cached_warnings)} active flood warnings")

    # Extract warning areas with lat/lng for proximity matching
    _cached_warning_areas = []
    for w in _cached_warnings:
        area = w.get("floodArea", {})
        lat = area.get("lat")
        lng = area.get("long")
        if lat and lng:
            _cached_warning_areas.append({
                "lat": float(lat),
                "lng": float(lng),
                "severity": w.get("severityLevel", 4),
                "message": w.get("message", ""),
            })


def haversine_km(lat1, lng1, lat2, lng2):
    """Approximate distance in km between two lat/lng points."""
    import math
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def count_nearby_warnings(lat: float, lng: float, radius_km: float = 10) -> int:
    """Count active EA warnings within radius_km of a location."""
    load_ea_warnings()
    count = 0
    for w in _cached_warning_areas:
        if haversine_km(lat, lng, w["lat"], w["lng"]) <= radius_km:
            count += 1
    return count


def fetch_forecast(lat: float, lng: float) -> Optional[Dict]:
    """Fetch 7-day hourly precipitation forecast from Open-Meteo."""
    url = (
        f"{OPEN_METEO_BASE}?"
        f"latitude={lat}&longitude={lng}"
        f"&hourly=precipitation,rain,showers"
        f"&forecast_days=7"
        f"&models=ukmo_seamless"
        f"&timezone=Europe/London"
    )
    return curl_get(url)


def parse_forecast(data: Dict) -> Dict[str, Any]:
    """Parse Open-Meteo response into useful summary metrics."""
    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    precip = hourly.get("precipitation", [])
    rain = hourly.get("rain", [])

    if not times or not precip:
        return {"rainfall_48h_mm": 0, "rainfall_7day_mm": 0, "peak_day": None, "peak_rainfall_mm": 0, "daily": []}

    # Parse hourly data into daily buckets
    daily_rainfall = defaultdict(float)
    total_48h = 0.0
    total_7day = 0.0
    now = datetime.now()

    for i, t in enumerate(times):
        p = precip[i] if i < len(precip) and precip[i] is not None else 0
        r = rain[i] if i < len(rain) and rain[i] is not None else 0
        val = max(p, r)  # take the higher of precipitation and rain

        try:
            dt = datetime.fromisoformat(t)
        except (ValueError, TypeError):
            continue

        # Date string for daily grouping
        day_key = dt.strftime("%Y-%m-%d")
        daily_rainfall[day_key] += val
        total_7day += val

        # 48h total
        if (dt - now).total_seconds() < 48 * 3600:
            total_48h += val

    # Find peak day
    peak_day = None
    peak_rainfall = 0.0
    daily_list = []
    for day_str in sorted(daily_rainfall.keys()):
        mm = round(daily_rainfall[day_str], 1)
        try:
            dt = datetime.strptime(day_str, "%Y-%m-%d")
            day_name = DAY_NAMES[dt.weekday()]
        except ValueError:
            day_name = day_str
        daily_list.append({"date": day_str, "day": day_name, "rainfall_mm": mm})
        if mm > peak_rainfall:
            peak_rainfall = mm
            peak_day = day_name

    return {
        "rainfall_48h_mm": round(total_48h, 1),
        "rainfall_7day_mm": round(total_7day, 1),
        "peak_day": peak_day,
        "peak_rainfall_mm": round(peak_rainfall, 1),
        "daily": daily_list,
    }


def calculate_risk_score(
    flood_zone: Optional[str],
    flood_risk_rivers: Optional[str],
    flood_risk_surface: Optional[str],
    rainfall_48h_mm: float,
    active_warnings: int,
) -> tuple:
    """
    Calculate Forecast Risk Score (0-100) combining:
    - Static flood zone (30%)
    - Forecast rainfall 48h (30%)
    - Surface water risk (15%)
    - River/sea risk (15%)
    - Active warnings (10%)

    Returns (score, level).
    """
    score = 0.0

    # Flood zone component (0-30)
    if flood_zone:
        if "3" in flood_zone:
            score += 30
        elif "2" in flood_zone:
            score += 15
        elif "1" in flood_zone:
            score += 5

    # Rainfall component (0-30)
    if rainfall_48h_mm > 40:
        score += 30
    elif rainfall_48h_mm > 20:
        score += 20
    elif rainfall_48h_mm > 10:
        score += 10
    elif rainfall_48h_mm > 5:
        score += 5

    # Surface water risk (0-15)
    if flood_risk_surface:
        r = flood_risk_surface.lower()
        if r == "high":
            score += 15
        elif r == "medium":
            score += 8
        elif r == "low":
            score += 3

    # River/sea risk (0-15)
    if flood_risk_rivers:
        r = flood_risk_rivers.lower()
        if r == "high":
            score += 15
        elif r == "medium":
            score += 8
        elif r == "low":
            score += 3

    # Active warnings (0-10)
    score += min(10, active_warnings * 5)

    score = min(100, round(score, 1))

    # Determine level
    if score >= 70:
        level = "Critical"
    elif score >= 40:
        level = "Elevated"
    elif score >= 15:
        level = "Watch"
    else:
        level = "Normal"

    return score, level


def get_unique_locations(limit: Optional[int] = None) -> List[Dict]:
    """
    Get unique rounded lat/lng locations from ALL properties with coordinates.
    Unlike other enrichers, forecast enrichment updates ALL properties every run.
    """
    with engine.connect() as conn:
        query = """
            SELECT
                ROUND(CAST(latitude AS NUMERIC), 2) as lat_rounded,
                ROUND(CAST(longitude AS NUMERIC), 2) as lng_rounded,
                COUNT(*) as property_count
            FROM properties
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
            GROUP BY lat_rounded, lng_rounded
            ORDER BY property_count DESC
        """
        if limit:
            query += f" LIMIT {limit}"

        rows = conn.execute(text(query)).fetchall()
        locations = []
        for r in rows:
            locations.append({
                "lat": float(r[0]),
                "lng": float(r[1]),
                "count": r[2],
            })
        return locations


def update_properties_at_location(lat: float, lng: float, forecast: Dict, warnings_count: int):
    """Update all properties at the given rounded location with forecast data."""
    with engine.connect() as conn:
        # Get existing flood data for risk scoring
        rows = conn.execute(text("""
            SELECT id, flood_zone, flood_risk_rivers_seas, flood_risk_surface_water
            FROM properties
            WHERE ROUND(CAST(latitude AS NUMERIC), 2) = :lat
              AND ROUND(CAST(longitude AS NUMERIC), 2) = :lng
        """), {"lat": lat, "lng": lng}).fetchall()

        now = datetime.now().isoformat()

        for row in rows:
            prop_id, flood_zone, rivers, surface = row[0], row[1], row[2], row[3]

            score, level = calculate_risk_score(
                flood_zone=flood_zone,
                flood_risk_rivers=rivers,
                flood_risk_surface=surface,
                rainfall_48h_mm=forecast["rainfall_48h_mm"],
                active_warnings=warnings_count,
            )

            # Determine river level status based on warnings
            river_level = "Normal"
            if warnings_count >= 3:
                river_level = "High"
            elif warnings_count >= 1:
                river_level = "Rising"

            conn.execute(text("""
                UPDATE properties SET
                    forecast_risk_score = :score,
                    forecast_risk_level = :level,
                    forecast_rainfall_48h_mm = :rain48,
                    forecast_rainfall_7day_mm = :rain7,
                    forecast_peak_day = :peak_day,
                    forecast_peak_rainfall_mm = :peak_mm,
                    forecast_nearby_river_level = :river,
                    forecast_updated_at = :updated
                WHERE id = :id
            """), {
                "score": score,
                "level": level,
                "rain48": forecast["rainfall_48h_mm"],
                "rain7": forecast["rainfall_7day_mm"],
                "peak_day": forecast["peak_day"],
                "peak_mm": forecast["peak_rainfall_mm"],
                "river": river_level,
                "updated": now,
                "id": prop_id,
            })

        conn.commit()
        return len(rows)


def run_enrichment(limit: Optional[int] = None):
    """Run the full forecast enrichment pipeline."""
    locations = get_unique_locations(limit)
    total_locations = len(locations)
    total_properties = sum(l["count"] for l in locations)

    logger.info(f"Forecast enrichment: {total_locations} unique locations, {total_properties} properties")

    if total_locations == 0:
        logger.info("No properties with coordinates found. Nothing to enrich.")
        return

    # Pre-load EA warnings
    load_ea_warnings()

    enriched = 0
    errors = 0
    start_time = time.time()

    for i, loc in enumerate(locations):
        lat, lng = loc["lat"], loc["lng"]

        try:
            # Fetch weather forecast from Open-Meteo
            forecast_data = fetch_forecast(lat, lng)
            if not forecast_data:
                errors += 1
                continue

            forecast = parse_forecast(forecast_data)

            # Count nearby EA warnings
            warnings = count_nearby_warnings(lat, lng)

            # Update all properties at this location
            count = update_properties_at_location(lat, lng, forecast, warnings)
            enriched += count

            # Progress logging every 20 locations
            if (i + 1) % 20 == 0 or i == total_locations - 1:
                elapsed = time.time() - start_time
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                remaining = (total_locations - i - 1) / rate if rate > 0 else 0
                logger.info(
                    f"  [{i + 1}/{total_locations}] "
                    f"Enriched {enriched} properties, "
                    f"{errors} errors, "
                    f"{rate:.1f} loc/s, "
                    f"~{remaining:.0f}s remaining"
                )

        except Exception as e:
            logger.error(f"Error at ({lat}, {lng}): {e}")
            errors += 1

        time.sleep(RATE_LIMIT_DELAY)

    elapsed = time.time() - start_time
    logger.info(f"\nForecast enrichment complete:")
    logger.info(f"  Properties updated: {enriched}")
    logger.info(f"  Errors: {errors}")
    logger.info(f"  Time: {elapsed:.1f}s")


def main():
    parser = argparse.ArgumentParser(description="Weather forecast flood risk enrichment")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of locations to process")
    args = parser.parse_args()
    run_enrichment(limit=args.limit)


if __name__ == "__main__":
    main()
