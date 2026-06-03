"""
Property data export endpoints for SHDT.

Provides:
1. GET /exports/properties/csv - Export filtered properties as CSV
2. GET /exports/properties/geojson - Export filtered properties as GeoJSON
3. POST /exports/report - Generate portfolio summary report JSON
4. GET /exports/retrofit-plan - Export retrofit priority list as CSV

All endpoints query the real database, support filtering by EPC, property type,
ward, local authority, bedrooms, and year built.
"""

import csv
import json
import io
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text

from database import engine

logger = logging.getLogger(__name__)

router = APIRouter(tags=["exports"])


class PortfolioReport(BaseModel):
    """Portfolio summary report"""
    generated_at: str
    total_properties: int
    average_epc: Optional[str]
    epc_distribution: Dict[str, int]
    properties_needing_retrofit: int
    estimated_total_investment: float
    property_type_breakdown: Dict[str, int]
    geographic_summary: List[Dict[str, Any]]
    heating_type_breakdown: Dict[str, int]


def _build_where_clause(
    epc_filter: Optional[str] = None,
    property_type: Optional[str] = None,
    ward: Optional[str] = None,
    local_authority: Optional[str] = None,
    bedrooms_min: Optional[int] = None,
    bedrooms_max: Optional[int] = None,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
) -> tuple:
    """Build WHERE clause and params from filter options."""
    conditions = []
    params: Dict[str, Any] = {}

    if epc_filter:
        # Support comma-separated ratings like "D,E,F,G"
        ratings = [r.strip().upper() for r in epc_filter.split(",")]
        placeholders = [f":epc_{i}" for i in range(len(ratings))]
        conditions.append(f"epc_rating IN ({', '.join(placeholders)})")
        for i, r in enumerate(ratings):
            params[f"epc_{i}"] = r

    if property_type:
        conditions.append("property_type ILIKE :property_type")
        params["property_type"] = f"%{property_type}%"

    if ward:
        conditions.append("ward_name ILIKE :ward")
        params["ward"] = f"%{ward}%"

    if local_authority:
        conditions.append("local_authority_name ILIKE :la")
        params["la"] = f"%{local_authority}%"

    if bedrooms_min is not None:
        conditions.append("bedrooms >= :bed_min")
        params["bed_min"] = bedrooms_min

    if bedrooms_max is not None:
        conditions.append("bedrooms <= :bed_max")
        params["bed_max"] = bedrooms_max

    if year_from is not None:
        conditions.append("year_built >= :year_from")
        params["year_from"] = year_from

    if year_to is not None:
        conditions.append("year_built <= :year_to")
        params["year_to"] = year_to

    where = " AND ".join(conditions) if conditions else "1=1"
    return where, params


@router.get("/exports/properties/csv")
async def export_properties_csv(
    epc_filter: Optional[str] = Query(None, description="Filter by EPC rating(s), comma-separated (e.g. D,E,F)"),
    property_type: Optional[str] = Query(None, description="Filter by property type"),
    ward: Optional[str] = Query(None, description="Filter by ward name"),
    local_authority: Optional[str] = Query(None, description="Filter by local authority"),
    bedrooms_min: Optional[int] = Query(None, description="Minimum bedrooms"),
    bedrooms_max: Optional[int] = Query(None, description="Maximum bedrooms"),
    year_from: Optional[int] = Query(None, description="Built from year"),
    year_to: Optional[int] = Query(None, description="Built to year"),
    limit: int = Query(10000, description="Max rows to export"),
):
    """Export filtered properties as CSV download."""
    where, params = _build_where_clause(
        epc_filter, property_type, ward, local_authority,
        bedrooms_min, bedrooms_max, year_from, year_to,
    )
    params["limit"] = limit

    try:
        with engine.connect() as conn:
            rows = conn.execute(text(f"""
                SELECT address, postcode, property_type, bedrooms, year_built,
                       heating_type, epc_rating, floor_area_m2, tenure_type,
                       local_authority_name, ward_name, region,
                       construction_type, wall_insulation, roof_type,
                       latitude, longitude,
                       crime_risk_score, flood_zone, imd_decile
                FROM properties
                WHERE {where}
                ORDER BY address
                LIMIT :limit
            """), params).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail="No properties match the filter criteria")

        # Build CSV
        output = io.StringIO()
        fieldnames = [
            "Address", "Postcode", "Property Type", "Bedrooms", "Year Built",
            "Heating Type", "EPC Rating", "Floor Area (m²)", "Tenure",
            "Local Authority", "Ward", "Region",
            "Construction", "Wall Insulation", "Roof Type",
            "Latitude", "Longitude",
            "Crime Risk Score", "Flood Zone", "IMD Decile",
        ]
        writer = csv.writer(output)
        writer.writerow(fieldnames)

        for row in rows:
            writer.writerow([v if v is not None else "" for v in row])

        output.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=properties_export_{timestamp}.csv"},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CSV export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.get("/exports/properties/geojson")
async def export_properties_geojson(
    epc_filter: Optional[str] = Query(None, description="Filter by EPC rating(s)"),
    property_type: Optional[str] = Query(None, description="Filter by property type"),
    ward: Optional[str] = Query(None, description="Filter by ward"),
    local_authority: Optional[str] = Query(None, description="Filter by local authority"),
    limit: int = Query(5000, description="Max features"),
):
    """Export filtered properties as GeoJSON download."""
    where, params = _build_where_clause(epc_filter, property_type, ward=ward, local_authority=local_authority)
    params["limit"] = limit

    try:
        with engine.connect() as conn:
            rows = conn.execute(text(f"""
                SELECT id, address, postcode, property_type, epc_rating, bedrooms,
                       ward_name, local_authority_name, region,
                       ST_Y(geometry) as lat, ST_X(geometry) as lng
                FROM properties
                WHERE {where} AND geometry IS NOT NULL
                ORDER BY address
                LIMIT :limit
            """), params).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail="No properties match the filter criteria")

        features = []
        for row in rows:
            features.append({
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(row[10]), float(row[9])],
                },
                "properties": {
                    "id": str(row[0]),
                    "address": row[1],
                    "postcode": row[2],
                    "property_type": row[3],
                    "epc_rating": row[4],
                    "bedrooms": row[5],
                    "ward_name": row[6],
                    "local_authority_name": row[7],
                    "region": row[8],
                },
            })

        geojson = {"type": "FeatureCollection", "features": features}
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")

        return StreamingResponse(
            iter([json.dumps(geojson, indent=2)]),
            media_type="application/geo+json",
            headers={"Content-Disposition": f"attachment; filename=properties_{timestamp}.geojson"},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"GeoJSON export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.post("/exports/report")
async def generate_report(
    epc_filter: Optional[str] = Query(None),
    property_type: Optional[str] = Query(None),
    ward: Optional[str] = Query(None),
    local_authority: Optional[str] = Query(None),
) -> PortfolioReport:
    """Generate portfolio summary report with statistics."""
    where, params = _build_where_clause(epc_filter, property_type, ward=ward, local_authority=local_authority)

    try:
        with engine.connect() as conn:
            # Total count
            total = conn.execute(text(f"SELECT COUNT(*) FROM properties WHERE {where}"), params).scalar() or 0

            # EPC distribution
            epc_rows = conn.execute(text(f"""
                SELECT epc_rating, COUNT(*) as cnt
                FROM properties
                WHERE {where} AND epc_rating IS NOT NULL
                GROUP BY epc_rating
                ORDER BY epc_rating
            """), params).fetchall()
            epc_dist = {row[0]: row[1] for row in epc_rows}

            # Properties needing retrofit (E, F, G)
            retrofit_count = sum(epc_dist.get(r, 0) for r in ["E", "F", "G"])

            # Average EPC (mode)
            avg_epc = max(epc_dist, key=epc_dist.get) if epc_dist else None

            # Property type breakdown
            pt_rows = conn.execute(text(f"""
                SELECT COALESCE(property_type, 'Unknown'), COUNT(*)
                FROM properties WHERE {where}
                GROUP BY property_type ORDER BY COUNT(*) DESC
            """), params).fetchall()
            pt_breakdown = {row[0]: row[1] for row in pt_rows}

            # Heating type breakdown
            ht_rows = conn.execute(text(f"""
                SELECT COALESCE(heating_type, 'Unknown'), COUNT(*)
                FROM properties WHERE {where}
                GROUP BY heating_type ORDER BY COUNT(*) DESC
            """), params).fetchall()
            ht_breakdown = {row[0]: row[1] for row in ht_rows}

            # Geographic summary (top 15 local authorities)
            geo_rows = conn.execute(text(f"""
                SELECT COALESCE(local_authority_name, 'Unknown') as la,
                       COUNT(*) as cnt,
                       COUNT(CASE WHEN epc_rating IN ('E','F','G') THEN 1 END) as retrofit_cnt
                FROM properties WHERE {where}
                GROUP BY local_authority_name
                ORDER BY cnt DESC
                LIMIT 15
            """), params).fetchall()
            geo_summary = [
                {"local_authority": row[0], "count": row[1], "retrofit_needed": row[2]}
                for row in geo_rows
            ]

        # Estimated investment: average £35k per retrofit property
        est_investment = retrofit_count * 35000.0

        return PortfolioReport(
            generated_at=datetime.now().isoformat(),
            total_properties=total,
            average_epc=avg_epc,
            epc_distribution=epc_dist,
            properties_needing_retrofit=retrofit_count,
            estimated_total_investment=est_investment,
            property_type_breakdown=pt_breakdown,
            geographic_summary=geo_summary,
            heating_type_breakdown=ht_breakdown,
        )

    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Report failed: {str(e)}")


@router.get("/exports/retrofit-plan")
async def export_retrofit_plan(
    epc_filter: Optional[str] = Query("D,E,F,G", description="EPC ratings to include"),
    local_authority: Optional[str] = Query(None, description="Filter by local authority"),
    ward: Optional[str] = Query(None, description="Filter by ward"),
    limit: int = Query(500, description="Max properties"),
):
    """Export retrofit priority list as CSV, sorted by worst EPC first."""
    where, params = _build_where_clause(epc_filter=epc_filter, local_authority=local_authority, ward=ward)
    params["limit"] = limit

    try:
        with engine.connect() as conn:
            rows = conn.execute(text(f"""
                SELECT address, postcode, property_type, epc_rating, bedrooms,
                       floor_area_m2, heating_type, year_built,
                       ward_name, local_authority_name
                FROM properties
                WHERE {where} AND epc_rating IS NOT NULL
                ORDER BY
                    CASE epc_rating
                        WHEN 'G' THEN 1 WHEN 'F' THEN 2 WHEN 'E' THEN 3
                        WHEN 'D' THEN 4 WHEN 'C' THEN 5 WHEN 'B' THEN 6
                        WHEN 'A' THEN 7 ELSE 8
                    END,
                    address
                LIMIT :limit
            """), params).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail="No properties match the filter criteria")

        # Rough retrofit cost estimates by current EPC
        COST_ESTIMATES = {
            "G": "£45,000 - £65,000", "F": "£35,000 - £55,000",
            "E": "£25,000 - £45,000", "D": "£15,000 - £30,000",
            "C": "£8,000 - £20,000", "B": "£3,000 - £10,000",
            "A": "Already efficient",
        }
        TARGET_EPC = {
            "G": "C", "F": "C", "E": "C", "D": "B", "C": "B", "B": "A", "A": "A",
        }

        output = io.StringIO()
        fieldnames = [
            "Address", "Postcode", "Property Type", "Current EPC", "Target EPC",
            "Bedrooms", "Floor Area (m²)", "Heating Type", "Year Built",
            "Ward", "Local Authority", "Estimated Cost Range",
        ]
        writer = csv.writer(output)
        writer.writerow(fieldnames)

        for row in rows:
            epc = row[3] or "Unknown"
            writer.writerow([
                row[0],  # address
                row[1],  # postcode
                row[2],  # property_type
                epc,
                TARGET_EPC.get(epc, "B"),
                row[4] if row[4] else "",  # bedrooms
                row[5] if row[5] else "",  # floor_area
                row[6] if row[6] else "",  # heating_type
                row[7] if row[7] else "",  # year_built
                row[8],  # ward
                row[9],  # la
                COST_ESTIMATES.get(epc, "Unknown"),
            ])

        output.seek(0)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=retrofit_plan_{timestamp}.csv"},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Retrofit plan export failed: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")
