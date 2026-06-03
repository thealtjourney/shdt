"""
Analytics API router for SHDT dashboard.

Provides endpoints for portfolio analytics including overview metrics,
EPC distribution, retrofit priorities, and geographic summaries.
"""

from fastapi import APIRouter, Query, Depends, HTTPException, Response, Request
from fastapi.responses import JSONResponse
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import subprocess
import re
import hashlib
import os
import time
import xml.etree.ElementTree as ET

from database import SessionLocal
from services.analytics_service import AnalyticsService
from services.operational_analytics_service import OperationalAnalyticsService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analytics"])


def get_session():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get(
    "/analytics/overview",
    response_model=dict,
    summary="Get analytics overview",
    description="Returns key metrics for dashboard including total properties, EPC distribution, "
    "property types, heating types, average condition, retrofit candidates, and age brackets",
)
async def get_analytics_overview(session: Session = Depends(get_session)):
    """
    Get dashboard overview with key metrics.

    Returns aggregated statistics about the property portfolio including:
    - Total number of properties
    - Distribution across EPC bands (A-G)
    - Property type breakdown
    - Heating type breakdown
    - Average condition score
    - Number of retrofit candidates (EPC D or below)
    - Properties grouped by age brackets
    """
    try:
        overview = AnalyticsService.get_overview(session)
        return {
            "status": "success",
            "data": overview,
        }
    except Exception as e:
        logger.error(f"Error getting analytics overview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/analytics/epc-distribution",
    response_model=dict,
    summary="Get EPC distribution",
    description="Returns EPC band distribution with counts and percentages for charting, "
    "optionally includes progress toward target EPC rating",
)
async def get_epc_distribution(
    target_year: Optional[int] = Query(
        None, description="Optional year for target progress (e.g., 2030)"
    ),
    session: Session = Depends(get_session),
):
    """
    Get EPC distribution for dashboard charting.

    Returns the distribution of properties across EPC bands with count and percentage.
    Optionally calculates progress toward a target (EPC C or above) for a specified year.
    """
    try:
        distribution = AnalyticsService.get_epc_distribution(session, target_year)
        return {
            "status": "success",
            "data": distribution,
        }
    except Exception as e:
        logger.error(f"Error getting EPC distribution: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/analytics/retrofit-priorities",
    response_model=dict,
    summary="Get retrofit priorities",
    description="Returns prioritized list of properties for retrofit based on EPC rating, age, "
    "heating type, and condition score",
)
async def get_retrofit_priorities(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(
        50, ge=1, le=50, description="Results per page (max 50)"
    ),
    epc_filter: Optional[str] = Query(
        None, description="Filter by EPC rating (D, E, F, G)"
    ),
    property_type_filter: Optional[str] = Query(
        None, description="Filter by property type"
    ),
    heating_type_filter: Optional[str] = Query(
        None, description="Filter by heating type"
    ),
    sort_by: str = Query(
        "priority_score",
        description="Sort field: priority_score, epc, year_built, condition_score",
    ),
    session: Session = Depends(get_session),
):
    """
    Get prioritized list of properties for retrofit.

    Returns properties with EPC D or below, scored by:
    - EPC rating (highest weight)
    - Property age (older = higher priority)
    - Heating type (gas/oil/electric = higher priority)
    - Condition score (lower = higher priority)

    Results are paginated (max 50 per page) and can be filtered and sorted.
    """
    try:
        properties, total = AnalyticsService.get_retrofit_priorities(
            session,
            page=page,
            page_size=page_size,
            epc_filter=epc_filter,
            property_type_filter=property_type_filter,
            heating_type_filter=heating_type_filter,
            sort_by=sort_by,
        )

        return {
            "status": "success",
            "data": {
                "properties": properties,
                "total": total,
                "page": page,
                "page_size": page_size,
                "pages": (total + page_size - 1) // page_size,
            },
        }
    except Exception as e:
        logger.error(f"Error getting retrofit priorities: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/analytics/geographic-summary",
    response_model=dict,
    summary="Get geographic summary",
    description="Returns aggregated statistics grouped by postcode district including count, "
    "average EPC, average condition, and retrofit needs percentage",
)
async def get_geographic_summary(session: Session = Depends(get_session)):
    try:
        summary = AnalyticsService.get_geographic_summary(session)
        return {"status": "success", "data": summary}
    except Exception as e:
        logger.error(f"Error getting geographic summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/enrichment-summary", summary="Get enrichment coverage summary")
async def get_enrichment_summary(session: Session = Depends(get_session)):
    try:
        data = AnalyticsService.get_enrichment_summary(session)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error getting enrichment summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/crime-summary", summary="Get crime statistics summary")
async def get_crime_summary(session: Session = Depends(get_session)):
    try:
        data = AnalyticsService.get_crime_summary(session)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error getting crime summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/flood-summary", summary="Get flood risk summary")
async def get_flood_summary(session: Session = Depends(get_session)):
    try:
        data = AnalyticsService.get_flood_summary(session)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error getting flood summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/region-summary", summary="Get region/authority breakdown")
async def get_region_summary(session: Session = Depends(get_session)):
    try:
        data = AnalyticsService.get_region_summary(session)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error getting region summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/area-risk-heatmap", summary="Composite area risk scores")
async def get_area_risk_heatmap(session: Session = Depends(get_session)):
    """Combined crime + flood + deprivation risk score per ward area."""
    try:
        data = AnalyticsService.get_area_risk_heatmap(session)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error getting area risk heatmap: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/fuel-poverty", summary="Fuel poverty risk indicators")
async def get_fuel_poverty(session: Session = Depends(get_session)):
    """Fuel poverty risk analysis combining EPC and IMD deprivation data."""
    try:
        data = AnalyticsService.get_fuel_poverty_indicators(session)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error getting fuel poverty data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/flood-map-data", summary="Get flood map data for all properties")
async def get_flood_map_data(session: Session = Depends(get_session)):
    """Get all properties with flood risk data and coordinates for map plotting."""
    try:
        data = AnalyticsService.get_flood_map_data(session)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error getting flood map data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/flood-forecast", summary="Get predictive flood forecast data")
async def get_flood_forecast(session: Session = Depends(get_session)):
    """Get forecast-enriched flood data with risk scores, summary, and daily timeline."""
    try:
        data = AnalyticsService.get_flood_forecast_data(session)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error getting flood forecast data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/census-debug", summary="Debug census enrichment prerequisites")
async def census_debug(session: Session = Depends(get_session)):
    """Check why census enrichment might not be working."""
    try:
        total = session.execute(text("SELECT COUNT(*) FROM properties")).scalar()
        has_lsoa = session.execute(text("SELECT COUNT(*) FROM properties WHERE lsoa_code IS NOT NULL")).scalar()
        has_imd = session.execute(text("SELECT COUNT(*) FROM properties WHERE imd_decile IS NOT NULL")).scalar()
        has_both = session.execute(text("SELECT COUNT(*) FROM properties WHERE lsoa_code IS NOT NULL AND imd_decile IS NOT NULL")).scalar()
        has_census_enriched = session.execute(text("SELECT COUNT(*) FROM properties WHERE census_enriched_at IS NOT NULL")).scalar()
        has_pop_density = session.execute(text("SELECT COUNT(*) FROM properties WHERE census_population_density IS NOT NULL")).scalar()
        has_age_pct = session.execute(text("SELECT COUNT(*) FROM properties WHERE census_age_0_15_pct IS NOT NULL")).scalar()
        needs_enrichment = session.execute(text("SELECT COUNT(*) FROM properties WHERE lsoa_code IS NOT NULL AND imd_decile IS NOT NULL AND census_enriched_at IS NULL")).scalar()
        sample_lsoa = session.execute(text("SELECT lsoa_code, imd_decile, region, census_enriched_at, census_population_density, census_age_0_15_pct FROM properties WHERE lsoa_code IS NOT NULL LIMIT 3")).fetchall()
        return {
            "total": total,
            "has_lsoa_code": has_lsoa,
            "has_imd_decile": has_imd,
            "has_both_prerequisites": has_both,
            "has_census_enriched_at": has_census_enriched,
            "has_census_population_density": has_pop_density,
            "has_census_age_0_15_pct": has_age_pct,
            "needs_enrichment": needs_enrichment,
            "sample_rows": [{"lsoa": r[0], "imd_decile": r[1], "region": r[2], "census_enriched_at": str(r[3]), "pop_density": r[4], "age_0_15_pct": r[5]} for r in sample_lsoa],
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/analytics/census-demographics", summary="Census 2021 demographic summary")
async def get_census_demographics(session: Session = Depends(get_session)):
    """Census 2021 data: age profiles, household composition, vulnerability indicators."""
    try:
        data = AnalyticsService.get_census_demographics(session)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error getting census demographics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/broadband-utilities", summary="Broadband speeds and utility providers")
async def get_broadband_utilities(session: Session = Depends(get_session)):
    """Broadband coverage, speeds, and electricity/gas distribution network operators."""
    try:
        data = AnalyticsService.get_broadband_utilities(session)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error getting broadband utilities: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/wms-layer-names", summary="Discover EA WMS layer names (CORS proxy)")
async def get_wms_layer_names():
    """
    Server-side proxy for EA WMS GetCapabilities.
    The EA WMS servers don't send CORS headers, so the browser can't fetch
    GetCapabilities directly. This endpoint does it server-side and returns
    the discovered layer names.
    """
    EA_BASE = "https://environment.data.gov.uk/spatialdata"

    # Only these specific EA datasets are allowed (security: not an open proxy)
    # Updated Jan 2025: EA moved to NaFRA2 URLs for surface water + rivers/sea
    DATASETS = {
        "fz_combined": "flood-map-for-planning-flood-zones",
        "surface_water": "nafra2-risk-of-flooding-from-surface-water",
        "rivers_sea": "nafra2-risk-of-flooding-from-rivers-and-sea",
        "reservoir": "reservoir-flood-extents-wet-day",
        "historic": "historic-flood-map",
    }

    results = {}

    for layer_id, dataset_slug in DATASETS.items():
        wms_url = f"{EA_BASE}/{dataset_slug}/wms?service=WMS&request=GetCapabilities&version=1.1.1"
        try:
            result = subprocess.run(
                ["curl", "-s", "--max-time", "10", wms_url],
                capture_output=True, text=True, timeout=15,
            )
            xml_text = result.stdout
            if not xml_text or "<" not in xml_text:
                logger.warning(f"WMS GetCapabilities empty for {layer_id}")
                # Fallback: derive from slug convention
                results[layer_id] = _slug_to_layer_name(dataset_slug)
                continue

            # Parse XML to find queryable layer name
            layer_name = _parse_layer_name(xml_text)
            if layer_name:
                results[layer_id] = layer_name
                logger.info(f"Discovered WMS layer {layer_id}: {layer_name}")
            else:
                # Fallback: derive from slug
                results[layer_id] = _slug_to_layer_name(dataset_slug)
                logger.info(f"WMS layer {layer_id} fallback: {results[layer_id]}")

        except Exception as e:
            logger.warning(f"WMS discovery failed for {layer_id}: {e}")
            results[layer_id] = _slug_to_layer_name(dataset_slug)

    return {"status": "success", "data": results}


def _parse_layer_name(xml_text: str) -> Optional[str]:
    """Extract the first queryable layer name from WMS GetCapabilities XML."""
    try:
        # Try regex first (more robust against namespace issues)
        matches = re.findall(r'<Layer\s+queryable="1"[^>]*>\s*<Name>([^<]+)</Name>', xml_text)
        if matches:
            return matches[0]

        # Fallback: find any <Name> that looks like a layer name (has underscores)
        all_names = re.findall(r'<Name>([^<]+)</Name>', xml_text)
        for name in all_names:
            if '_' in name and len(name) > 10:
                return name

        return None
    except Exception:
        return None


def _slug_to_layer_name(slug: str) -> str:
    """Convert EA dataset slug to likely WMS layer name using naming convention.
    E.g. 'flood-map-for-planning-rivers-and-sea-flood-zone-3'
      -> 'Flood_Map_for_Planning_Rivers_and_Sea_Flood_Zone_3'
    """
    LOWERCASE_WORDS = {'of', 'from', 'for', 'and', 'the', 'in', 'at', 'to', 'a'}
    parts = slug.split('-')
    result = []
    for i, part in enumerate(parts):
        if i == 0:
            result.append(part.capitalize())
        elif part in LOWERCASE_WORDS:
            result.append(part)
        else:
            result.append(part.capitalize())
    return '_'.join(result)


@router.get("/analytics/wms-debug", summary="Debug EA WMS endpoints")
async def debug_wms_endpoints():
    """
    Test each EA WMS endpoint and report what's happening.
    Helps diagnose why layers aren't rendering.
    """
    EA_BASE = "https://environment.data.gov.uk/spatialdata"

    # All datasets to test — old URLs and new NaFRA2 URLs
    DATASETS = {
        # OLD URLs (may be deprecated)
        "old_fz3": "flood-map-for-planning-rivers-and-sea-flood-zone-3",
        "old_fz2": "flood-map-for-planning-rivers-and-sea-flood-zone-2",
        "old_sw30": "risk-of-flooding-from-surface-water-extent-3-3-percent-annual-chance",
        "old_sw100": "risk-of-flooding-from-surface-water-extent-1-percent-annual-chance",
        "old_reservoir": "risk-of-flooding-from-reservoirs-maximum-extent",
        # NEW URLs (NaFRA2 + corrected slugs)
        "new_fz_combined": "flood-map-for-planning-flood-zones",
        "new_surface_water": "nafra2-risk-of-flooding-from-surface-water",
        "new_rivers_sea": "nafra2-risk-of-flooding-from-rivers-and-sea",
        "new_reservoir_v1": "risk-of-flooding-from-reservoirs-maximum-flood-extent",
        "new_reservoir_v2": "reservoir-flood-extents-wet-day",
        "historic": "historic-flood-map",
    }

    results = {}

    for test_id, dataset_slug in DATASETS.items():
        wms_url = f"{EA_BASE}/{dataset_slug}/wms?service=WMS&request=GetCapabilities&version=1.1.1"
        try:
            result = subprocess.run(
                ["curl", "-s", "-L", "-k", "-w", "\n%{http_code}", "--max-time", "10", wms_url],
                capture_output=True, text=True, timeout=15,
            )
            parts = result.stdout.rsplit("\n", 1)
            status = parts[1].strip() if len(parts) == 2 else "parse_error"
            body = parts[0] if len(parts) == 2 else result.stdout
            stderr_msg = result.stderr.strip()[:200] if result.stderr else ""

            layer_name = None
            all_layer_names = []
            if status == "200" and "<" in body:
                # Extract all layer names
                all_layer_names = re.findall(r'<Name>([^<]+)</Name>', body)
                # Find queryable ones
                queryable = re.findall(r'<Layer\s+queryable="1"[^>]*>\s*<Name>([^<]+)</Name>', body)
                layer_name = queryable[0] if queryable else None

            results[test_id] = {
                "dataset_slug": dataset_slug,
                "http_status": status,
                "has_xml": "<WMS_Capabilities" in body or "<WMT_MS_Capabilities" in body,
                "body_length": len(body),
                "discovered_layer": layer_name,
                "all_names": all_layer_names[:5],
                "curl_stderr": stderr_msg,
            }
        except Exception as e:
            results[test_id] = {
                "dataset_slug": dataset_slug,
                "error": str(e),
            }

    return {"status": "success", "data": results}


# ─── WMS Tile Cache Proxy ───
# Caches EA WMS tiles locally so repeated views are instant.
# Tiles are cached for 24 hours (EA data updates infrequently).

TILE_CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".tile_cache")
TILE_CACHE_TTL = 86400  # 24 hours

# Allowed WMS base URLs (security: prevent use as open proxy)
ALLOWED_WMS_BASES = {
    "https://environment.data.gov.uk/spatialdata/flood-map-for-planning-flood-zones/wms",
    "https://environment.data.gov.uk/spatialdata/nafra2-risk-of-flooding-from-surface-water/wms",
    "https://environment.data.gov.uk/spatialdata/nafra2-risk-of-flooding-from-rivers-and-sea/wms",
    "https://environment.data.gov.uk/spatialdata/reservoir-flood-extents-wet-day/wms",
    "https://environment.data.gov.uk/spatialdata/historic-flood-map/wms",
}


@router.get("/tiles/wms-proxy", summary="Cached WMS tile proxy for EA flood layers")
async def wms_tile_proxy(request: Request, url: str = Query(..., description="EA WMS base URL")):
    """
    Proxy and cache WMS tile requests to the EA.
    Leaflet sends WMS parameters as query strings (layers, bbox, width, etc.).
    We pass them all through to the EA, cache the response tile on disk for 24h.
    """

    # Security: only proxy known EA WMS endpoints
    if url not in ALLOWED_WMS_BASES:
        raise HTTPException(status_code=403, detail="URL not in allowlist")

    # Collect all query params except our 'url' and forward them to EA
    params = []
    for key, value in request.query_params.items():
        if key == "url":
            continue
        params.append(f"{key}={value}")
    query_string = "&".join(params)

    full_url = f"{url}?{query_string}" if query_string else url

    # Cache key based on full URL (deterministic)
    cache_key = hashlib.md5(full_url.encode()).hexdigest()
    os.makedirs(TILE_CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(TILE_CACHE_DIR, f"{cache_key}.png")

    # Serve from cache if fresh
    if os.path.exists(cache_path):
        age = time.time() - os.path.getmtime(cache_path)
        if age < TILE_CACHE_TTL:
            with open(cache_path, "rb") as f:
                return Response(
                    content=f.read(),
                    media_type="image/png",
                    headers={"X-Tile-Cache": "HIT", "Cache-Control": "public, max-age=3600"},
                )

    # Fetch from EA
    try:
        result = subprocess.run(
            ["curl", "-s", "-L", "-k", "--max-time", "15", "-o", cache_path, full_url],
            capture_output=True, text=True, timeout=20,
        )
        if os.path.exists(cache_path) and os.path.getsize(cache_path) > 0:
            with open(cache_path, "rb") as f:
                return Response(
                    content=f.read(),
                    media_type="image/png",
                    headers={"X-Tile-Cache": "MISS", "Cache-Control": "public, max-age=3600"},
                )
        else:
            raise HTTPException(status_code=502, detail="Failed to fetch tile from EA")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="EA WMS timeout")
    except Exception as e:
        logger.warning(f"Tile proxy error: {e}")
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/analytics/complaints-summary", summary="Complaints analytics from Excel data")
async def get_complaints_summary():
    """Analyse complaints data from uploaded Excel file."""
    try:
        result = OperationalAnalyticsService.get_complaints_summary()
        if result.get("status") == "error":
            raise HTTPException(status_code=404, detail=result.get("message"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting complaints summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/repairs-summary", summary="Repairs & contractor analytics from Excel data")
async def get_repairs_summary():
    """Analyse repairs and contractor performance data from uploaded Excel file."""
    try:
        result = OperationalAnalyticsService.get_repairs_summary()
        if result.get("status") == "error":
            raise HTTPException(status_code=404, detail=result.get("message"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting repairs summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/property-operations/{property_id}", summary="Repairs & complaints for a single property")
async def get_property_operations(property_id: str, db: Session = Depends(get_session)):
    """Return repair and complaint counts for a specific property."""
    try:
        # Look up the property's UPRN, postcode, and address from DB
        row = db.execute(text(
            "SELECT uprn, postcode, address FROM properties WHERE id = :pid"
        ), {"pid": property_id}).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Property not found")

        uprn = str(row.uprn) if row.uprn else ""
        postcode = str(row.postcode) if row.postcode else ""
        address = str(row.address) if row.address else ""

        result = OperationalAnalyticsService.get_property_operations(uprn, postcode, address)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting property operations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/strategic-insights", summary="Cross-correlated strategic insights from all data sources")
async def get_strategic_insights(db: Session = Depends(get_session)):
    """Generate top strategic insights by cross-correlating IoD 2025 deprivation, flood risk, census demographics, broadband, complaints, and repairs data."""
    try:
        data = AnalyticsService.get_strategic_insights(db)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error getting strategic insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/postcode-hotspots", summary="Repairs & complaints aggregated by postcode")
async def get_postcode_hotspots(db: Session = Depends(get_session)):
    """Return postcode-level aggregation of repairs and complaints for the hotspot map."""
    try:
        result = OperationalAnalyticsService.get_postcode_hotspots(db)
        return result
    except Exception as e:
        logger.error(f"Error getting postcode hotspots: {e}")
        raise HTTPException(status_code=500, detail=str(e))
