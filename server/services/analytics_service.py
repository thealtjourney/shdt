"""
Enhanced analytics service with retrofit prioritization, fuel poverty analysis,
portfolio insights, and investment scenario modeling.
"""
import logging
from typing import Dict, List, Any, Tuple, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import SessionLocal

logger = logging.getLogger(__name__)


class AnalyticsService:
    """Main analytics service providing all analysis endpoints."""

    @staticmethod
    def get_overview(db: Session) -> Dict[str, Any]:
        """
        Get dashboard overview with key metrics.
        Consolidated into a single query for performance.
        """
        try:
            # Single aggregation query for all top-level stats
            row = db.execute(text("""
                SELECT
                    COUNT(*) as total,
                    AVG(stock_condition_score) FILTER (WHERE stock_condition_score IS NOT NULL) as avg_condition,
                    COUNT(*) FILTER (WHERE epc_rating IN ('D', 'E', 'F', 'G')) as retrofit_count
                FROM properties
            """)).fetchone()

            total = row[0] or 0
            avg_condition = row[1]
            retrofit_count = row[2] or 0

            # EPC + property type + heating in one pass using UNION ALL
            breakdown_rows = db.execute(text("""
                SELECT 'epc' as category, epc_rating as key, COUNT(*) as cnt
                FROM properties WHERE epc_rating IS NOT NULL
                GROUP BY epc_rating
                UNION ALL
                SELECT 'type', property_type, COUNT(*)
                FROM properties WHERE property_type IS NOT NULL
                GROUP BY property_type
                UNION ALL
                SELECT 'heating', heating_type, COUNT(*)
                FROM properties WHERE heating_type IS NOT NULL
                GROUP BY heating_type
                UNION ALL
                SELECT 'age',
                    CASE
                        WHEN year_built < 1900 THEN 'Pre-1900'
                        WHEN year_built < 1945 THEN '1900-1944'
                        WHEN year_built < 1965 THEN '1945-1964'
                        WHEN year_built < 1980 THEN '1965-1979'
                        WHEN year_built < 2000 THEN '1980-1999'
                        WHEN year_built >= 2000 THEN '2000+'
                        ELSE 'Unknown'
                    END,
                    COUNT(*)
                FROM properties GROUP BY 2
            """)).fetchall()

            epc_distribution = {}
            property_types = {}
            heating_types = {}
            age_brackets = {}
            for r in breakdown_rows:
                if r[0] == 'epc':
                    epc_distribution[r[1]] = r[2]
                elif r[0] == 'type':
                    property_types[r[1]] = r[2]
                elif r[0] == 'heating':
                    heating_types[r[1]] = r[2]
                elif r[0] == 'age':
                    age_brackets[r[1]] = r[2]

            return {
                "total_properties": total,
                "epc_distribution": epc_distribution,
                "property_types": property_types,
                "heating_types": heating_types,
                "average_condition_score": round(float(avg_condition), 2) if avg_condition else None,
                "retrofit_candidates": retrofit_count,
                "age_brackets": age_brackets,
            }
        except Exception as e:
            logger.error(f"Error in get_overview: {e}")
            return {
                "total_properties": 0,
                "epc_distribution": {},
                "property_types": {},
                "heating_types": {},
                "average_condition_score": None,
                "retrofit_candidates": 0,
                "age_brackets": {},
            }

    @staticmethod
    def get_epc_distribution(db: Session, target_year: Optional[int] = None) -> Dict[str, Any]:
        """
        Get EPC distribution for dashboard charting.
        Returns distribution of properties across EPC bands with count and percentage.
        """
        try:
            total = db.execute(text("SELECT COUNT(*) FROM properties")).scalar() or 1

            epc_rows = db.execute(text(
                "SELECT epc_rating, COUNT(*) as cnt FROM properties "
                "WHERE epc_rating IS NOT NULL GROUP BY epc_rating ORDER BY epc_rating"
            )).fetchall()

            bands = []
            for row in epc_rows:
                bands.append({
                    "rating": row[0],
                    "count": row[1],
                    "percentage": round(row[1] / total * 100, 1),
                })

            result = {
                "bands": bands,
                "total": total,
            }

            # Progress toward EPC C target
            if target_year:
                at_c_or_above = db.execute(text(
                    "SELECT COUNT(*) FROM properties WHERE epc_rating IN ('A', 'B', 'C')"
                )).scalar() or 0
                result["target"] = {
                    "target_year": target_year,
                    "target_rating": "C",
                    "properties_at_target": at_c_or_above,
                    "percentage_at_target": round(at_c_or_above / total * 100, 1),
                    "properties_below_target": total - at_c_or_above,
                }

            return result
        except Exception as e:
            logger.error(f"Error in get_epc_distribution: {e}")
            return {"bands": [], "total": 0}

    @staticmethod
    def get_retrofit_priorities(
        db: Session,
        page: int = 1,
        page_size: int = 50,
        epc_filter: Optional[str] = None,
        property_type_filter: Optional[str] = None,
        heating_type_filter: Optional[str] = None,
        sort_by: str = "priority_score",
    ) -> Tuple[List[Dict], int]:
        """
        Get prioritized list of properties for retrofit.
        Returns properties with EPC D or below, scored by multiple factors.
        """
        try:
            # Build WHERE clauses
            conditions = ["epc_rating IN ('D', 'E', 'F', 'G')"]
            params = {}

            if epc_filter:
                conditions.append("epc_rating = :epc_filter")
                params["epc_filter"] = epc_filter.upper()
            if property_type_filter:
                conditions.append("property_type = :prop_type")
                params["prop_type"] = property_type_filter
            if heating_type_filter:
                conditions.append("heating_type = :heat_type")
                params["heat_type"] = heating_type_filter

            where_clause = " AND ".join(conditions)

            # Get total count
            count_sql = f"SELECT COUNT(*) FROM properties WHERE {where_clause}"
            total = db.execute(text(count_sql), params).scalar() or 0

            # Calculate priority score in SQL
            sort_map = {
                "priority_score": """
                    CASE epc_rating
                        WHEN 'G' THEN 7 WHEN 'F' THEN 6 WHEN 'E' THEN 5
                        WHEN 'D' THEN 4 ELSE 0
                    END DESC
                """,
                "epc": "epc_rating DESC",
                "year_built": "year_built ASC NULLS LAST",
                "condition_score": "stock_condition_score ASC NULLS LAST",
            }
            order_clause = sort_map.get(sort_by, sort_map["priority_score"])

            offset = (page - 1) * page_size
            params["limit"] = page_size
            params["offset"] = offset

            query = f"""
                SELECT id, address, postcode, latitude, longitude,
                       epc_rating, property_type, heating_type, year_built,
                       stock_condition_score, bedrooms,
                       CASE epc_rating
                           WHEN 'G' THEN 100 WHEN 'F' THEN 85 WHEN 'E' THEN 70
                           WHEN 'D' THEN 40 ELSE 0
                       END as priority_score
                FROM properties
                WHERE {where_clause}
                ORDER BY {order_clause}
                LIMIT :limit OFFSET :offset
            """

            rows = db.execute(text(query), params).fetchall()

            properties = []
            for row in rows:
                properties.append({
                    "id": row[0],
                    "address": row[1],
                    "postcode": row[2],
                    "latitude": float(row[3]) if row[3] else None,
                    "longitude": float(row[4]) if row[4] else None,
                    "epc_rating": row[5],
                    "property_type": row[6],
                    "heating_type": row[7],
                    "year_built": row[8],
                    "condition_score": float(row[9]) if row[9] else None,
                    "bedrooms": row[10],
                    "priority_score": row[11],
                })

            return properties, total
        except Exception as e:
            logger.error(f"Error in get_retrofit_priorities: {e}")
            return [], 0

    @staticmethod
    def get_geographic_summary(db: Session) -> List[Dict[str, Any]]:
        """
        Get geographic summary statistics grouped by postcode district.
        """
        try:
            rows = db.execute(text("""
                SELECT
                    SUBSTRING(postcode FROM 1 FOR POSITION(' ' IN postcode)) as district,
                    COUNT(*) as property_count,
                    AVG(CASE epc_rating
                        WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3
                        WHEN 'D' THEN 4 WHEN 'E' THEN 5 WHEN 'F' THEN 6
                        WHEN 'G' THEN 7 ELSE NULL
                    END) as avg_epc_numeric,
                    AVG(stock_condition_score) as avg_condition,
                    COUNT(CASE WHEN epc_rating IN ('D', 'E', 'F', 'G') THEN 1 END) * 100.0 /
                        NULLIF(COUNT(*), 0) as retrofit_pct
                FROM properties
                WHERE postcode IS NOT NULL
                GROUP BY district
                HAVING COUNT(*) >= 1
                ORDER BY property_count DESC
            """)).fetchall()

            summary = []
            for row in rows:
                summary.append({
                    "district": (row[0] or "").strip(),
                    "property_count": row[1],
                    "avg_epc_numeric": round(float(row[2]), 1) if row[2] else None,
                    "avg_condition_score": round(float(row[3]), 2) if row[3] else None,
                    "retrofit_percentage": round(float(row[4]), 1) if row[4] else 0,
                })

            return summary
        except Exception as e:
            logger.error(f"Error in get_geographic_summary: {e}")
            return []


    @staticmethod
    def get_enrichment_summary(db: Session) -> Dict[str, Any]:
        """Get summary of enrichment coverage across all providers — single query."""
        try:
            row = db.execute(text("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE crime_last_updated IS NOT NULL) as crime_count,
                    AVG(crime_risk_score) FILTER (WHERE crime_risk_score IS NOT NULL) as avg_crime_risk,
                    COUNT(*) FILTER (WHERE flood_risk_rivers_seas IS NOT NULL) as flood_count,
                    COUNT(*) FILTER (WHERE epc_score IS NOT NULL) as epc_enriched,
                    COUNT(*) FILTER (WHERE lsoa_code IS NOT NULL) as postcode_enriched,
                    COUNT(*) FILTER (WHERE census_enriched_at IS NOT NULL) as census_enriched,
                    COUNT(*) FILTER (WHERE utilities_enriched_at IS NOT NULL) as broadband_enriched
                FROM properties
            """)).fetchone()

            total = row[0] or 1
            crime_count = row[1] or 0
            avg_crime_risk = row[2]
            flood_count = row[3] or 0
            epc_enriched = row[4] or 0
            postcode_enriched = row[5] or 0
            census_enriched = row[6] or 0
            broadband_enriched = row[7] or 0

            return {
                "total_properties": total,
                "crime": {
                    "enriched": crime_count,
                    "coverage_pct": round(crime_count / total * 100, 1),
                    "avg_risk_score": round(float(avg_crime_risk), 1) if avg_crime_risk else None,
                },
                "flood": {
                    "enriched": flood_count,
                    "coverage_pct": round(flood_count / total * 100, 1),
                },
                "epc": {
                    "enriched": epc_enriched,
                    "coverage_pct": round(epc_enriched / total * 100, 1),
                },
                "postcode": {
                    "enriched": postcode_enriched,
                    "coverage_pct": round(postcode_enriched / total * 100, 1),
                },
                "census": {
                    "enriched": census_enriched,
                    "coverage_pct": round(census_enriched / total * 100, 1),
                },
                "broadband": {
                    "enriched": broadband_enriched,
                    "coverage_pct": round(broadband_enriched / total * 100, 1),
                },
            }
        except Exception as e:
            logger.error(f"Error in get_enrichment_summary: {e}")
            return {"total_properties": 0, "crime": {}, "flood": {}, "epc": {}, "postcode": {}}

    @staticmethod
    def get_crime_summary(db: Session) -> Dict[str, Any]:
        """Get crime statistics summary across the portfolio."""
        try:
            rows = db.execute(text("""
                SELECT
                    COUNT(*) as enriched_count,
                    AVG(crime_total_3months) as avg_total,
                    AVG(crime_burglary_3months) as avg_burglary,
                    AVG(crime_antisocial_3months) as avg_antisocial,
                    AVG(crime_violence_3months) as avg_violence,
                    AVG(crime_risk_score) as avg_risk,
                    MIN(crime_risk_score) as min_risk,
                    MAX(crime_risk_score) as max_risk
                FROM properties
                WHERE crime_last_updated IS NOT NULL
            """)).fetchone()

            # Risk score distribution
            risk_dist = db.execute(text("""
                SELECT
                    CASE
                        WHEN crime_risk_score <= 2 THEN 'Low (0-2)'
                        WHEN crime_risk_score <= 5 THEN 'Medium (2-5)'
                        WHEN crime_risk_score <= 8 THEN 'High (5-8)'
                        ELSE 'Very High (8-10)'
                    END as risk_band,
                    COUNT(*) as cnt
                FROM properties
                WHERE crime_risk_score IS NOT NULL
                GROUP BY risk_band
                ORDER BY risk_band
            """)).fetchall()

            return {
                "enriched_count": rows[0] if rows else 0,
                "avg_total_crimes": round(float(rows[1]), 1) if rows and rows[1] else 0,
                "avg_burglary": round(float(rows[2]), 1) if rows and rows[2] else 0,
                "avg_antisocial": round(float(rows[3]), 1) if rows and rows[3] else 0,
                "avg_violence": round(float(rows[4]), 1) if rows and rows[4] else 0,
                "avg_risk_score": round(float(rows[5]), 1) if rows and rows[5] else 0,
                "min_risk_score": round(float(rows[6]), 1) if rows and rows[6] else 0,
                "max_risk_score": round(float(rows[7]), 1) if rows and rows[7] else 0,
                "risk_distribution": [{"band": r[0], "count": r[1]} for r in risk_dist],
            }
        except Exception as e:
            logger.error(f"Error in get_crime_summary: {e}")
            return {}

    @staticmethod
    def get_flood_summary(db: Session) -> Dict[str, Any]:
        """Get flood risk summary across the portfolio — single query."""
        try:
            rows = db.execute(text("""
                SELECT 'zone' as category, flood_zone as key, COUNT(*) as cnt
                FROM properties WHERE flood_zone IS NOT NULL
                GROUP BY flood_zone
                UNION ALL
                SELECT 'river', flood_risk_rivers_seas, COUNT(*)
                FROM properties WHERE flood_risk_rivers_seas IS NOT NULL
                GROUP BY flood_risk_rivers_seas
                UNION ALL
                SELECT 'warnings', 'total', COALESCE(SUM(active_flood_warnings), 0)
                FROM properties WHERE active_flood_warnings > 0
            """)).fetchall()

            flood_zones = []
            river_sea_risk = []
            warnings = 0
            for r in rows:
                if r[0] == 'zone':
                    flood_zones.append({"zone": r[1], "count": r[2]})
                elif r[0] == 'river':
                    river_sea_risk.append({"level": r[1], "count": r[2]})
                elif r[0] == 'warnings':
                    warnings = int(r[2])

            return {
                "flood_zones": flood_zones,
                "river_sea_risk": river_sea_risk,
                "properties_with_warnings": warnings,
            }
        except Exception as e:
            logger.error(f"Error in get_flood_summary: {e}")
            return {}

    @staticmethod
    def get_region_summary(db: Session) -> List[Dict[str, Any]]:
        """Get summary by region/local authority from postcode enrichment."""
        try:
            rows = db.execute(text("""
                SELECT
                    local_authority_name,
                    region,
                    COUNT(*) as property_count,
                    AVG(crime_risk_score) as avg_crime_risk,
                    COUNT(CASE WHEN flood_zone = 'Zone 3' THEN 1 END) as high_flood_count,
                    AVG(epc_score) as avg_epc_score
                FROM properties
                WHERE local_authority_name IS NOT NULL
                GROUP BY local_authority_name, region
                ORDER BY property_count DESC
                LIMIT 50
            """)).fetchall()

            return [
                {
                    "local_authority": row[0],
                    "region": row[1],
                    "property_count": row[2],
                    "avg_crime_risk": round(float(row[3]), 1) if row[3] else None,
                    "high_flood_risk_count": row[4],
                    "avg_epc_score": round(float(row[5]), 1) if row[5] else None,
                }
                for row in rows
            ]
        except Exception as e:
            logger.error(f"Error in get_region_summary: {e}")
            return []


    @staticmethod
    def get_area_risk_heatmap(db: Session) -> List[Dict[str, Any]]:
        """
        Composite Area Risk Heatmap — combines crime, flood, deprivation
        into a single area-level risk score per ward/LSOA.

        Risk score formula (0-100):
          - Crime risk:      crime_risk_score / 10 * 30  (30% weight)
          - Flood risk:      flood zone mapped to 0-30   (30% weight)
          - IMD deprivation: (32844 - imd_rank) / 32844 * 40  (40% weight)

        Higher score = higher combined risk = more attention needed.
        """
        try:
            rows = db.execute(text("""
                SELECT
                    COALESCE(ward_name, 'Unknown Ward') as area_name,
                    COALESCE(local_authority_name, '') as la_name,
                    COUNT(*) as property_count,

                    -- Crime component (0-30)
                    ROUND((AVG(COALESCE(crime_risk_score, 0)) / 10.0 * 30)::numeric, 1) as crime_component,

                    -- Flood component (0-30): Zone 3=30, Zone 2=15, Zone 1=5, null=0
                    ROUND(AVG(CASE
                        WHEN flood_zone = 'Zone 3' THEN 30
                        WHEN flood_zone = 'Zone 2' THEN 15
                        WHEN flood_zone = 'Zone 1' THEN 5
                        ELSE 0
                    END)::numeric, 1) as flood_component,

                    -- IMD component (0-40): lower rank = more deprived = higher score
                    ROUND(AVG(CASE
                        WHEN imd_rank IS NOT NULL
                        THEN (32844.0 - imd_rank) / 32844.0 * 40
                        ELSE NULL
                    END)::numeric, 1) as imd_component,

                    -- Raw averages for detail display
                    ROUND(AVG(crime_risk_score)::numeric, 1) as avg_crime_risk,
                    ROUND(AVG(imd_score)::numeric, 1) as avg_imd_score,
                    ROUND(AVG(imd_decile)::numeric, 1) as avg_imd_decile,

                    -- Flood counts
                    COUNT(CASE WHEN flood_zone = 'Zone 3' THEN 1 END) as flood_zone3_count,
                    COUNT(CASE WHEN flood_zone IN ('Zone 2', 'Zone 3') THEN 1 END) as flood_high_count

                FROM properties
                WHERE ward_name IS NOT NULL
                GROUP BY ward_name, local_authority_name
                HAVING COUNT(*) >= 3
                ORDER BY (
                    COALESCE(AVG(COALESCE(crime_risk_score, 0)) / 10.0 * 30, 0) +
                    AVG(CASE WHEN flood_zone = 'Zone 3' THEN 30 WHEN flood_zone = 'Zone 2' THEN 15 WHEN flood_zone = 'Zone 1' THEN 5 ELSE 0 END) +
                    COALESCE(AVG(CASE WHEN imd_rank IS NOT NULL THEN (32844.0 - imd_rank) / 32844.0 * 40 ELSE NULL END), 0)
                ) DESC
                LIMIT 100
            """)).fetchall()

            results = []
            for r in rows:
                crime_c = float(r[3]) if r[3] else 0
                flood_c = float(r[4]) if r[4] else 0
                imd_c = float(r[5]) if r[5] else 0
                composite = round(crime_c + flood_c + imd_c, 1)

                results.append({
                    "area_name": r[0],
                    "local_authority": r[1],
                    "property_count": r[2],
                    "composite_risk_score": composite,
                    "crime_component": crime_c,
                    "flood_component": flood_c,
                    "imd_component": imd_c,
                    "avg_crime_risk": float(r[6]) if r[6] else None,
                    "avg_imd_score": float(r[7]) if r[7] else None,
                    "avg_imd_decile": float(r[8]) if r[8] else None,
                    "flood_zone3_count": r[9],
                    "flood_high_count": r[10],
                    # Risk level label
                    "risk_level": (
                        "Critical" if composite >= 60 else
                        "High" if composite >= 40 else
                        "Medium" if composite >= 20 else
                        "Low"
                    ),
                })

            return results
        except Exception as e:
            logger.error(f"Error in get_area_risk_heatmap: {e}")
            return []

    @staticmethod
    def get_fuel_poverty_indicators(db: Session) -> Dict[str, Any]:
        """
        Fuel Poverty Indicators — identifies properties/areas where tenants
        are most likely to be in fuel poverty.

        Fuel poverty risk factors:
          - Low EPC rating (D, E, F, G)
          - High IMD deprivation (decile 1-3)
          - Old property (pre-1965)
          - Poor heating (non-gas, older systems)

        Returns area-level aggregates plus a list of highest-risk properties.
        """
        try:
            # Overall fuel poverty stats
            stats = db.execute(text("""
                SELECT
                    COUNT(*) as total,
                    COUNT(CASE WHEN epc_rating IN ('E', 'F', 'G') AND imd_decile <= 3 THEN 1 END) as high_risk,
                    COUNT(CASE WHEN epc_rating IN ('D', 'E', 'F', 'G') AND imd_decile <= 5 THEN 1 END) as at_risk,
                    COUNT(CASE WHEN epc_rating IN ('E', 'F', 'G') THEN 1 END) as poor_epc,
                    COUNT(CASE WHEN imd_decile IS NOT NULL AND imd_decile <= 3 THEN 1 END) as high_deprivation,
                    COUNT(CASE WHEN imd_decile IS NOT NULL THEN 1 END) as has_imd
                FROM properties
            """)).fetchone()

            total = stats[0] or 1

            # Area breakdown
            area_rows = db.execute(text("""
                SELECT
                    COALESCE(ward_name, COALESCE(lsoa_name, 'Unknown')) as area,
                    local_authority_name,
                    COUNT(*) as properties,
                    COUNT(CASE WHEN epc_rating IN ('E', 'F', 'G') AND imd_decile <= 3 THEN 1 END) as high_risk_count,
                    COUNT(CASE WHEN epc_rating IN ('D', 'E', 'F', 'G') AND imd_decile <= 5 THEN 1 END) as at_risk_count,
                    ROUND(AVG(imd_decile)::numeric, 1) as avg_imd_decile,
                    ROUND(AVG(CASE epc_rating
                        WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3
                        WHEN 'D' THEN 4 WHEN 'E' THEN 5 WHEN 'F' THEN 6
                        WHEN 'G' THEN 7 ELSE NULL
                    END)::numeric, 1) as avg_epc_numeric,
                    ROUND(AVG(imd_score)::numeric, 1) as avg_imd_score
                FROM properties
                WHERE ward_name IS NOT NULL OR lsoa_name IS NOT NULL
                GROUP BY area, local_authority_name
                HAVING COUNT(CASE WHEN epc_rating IN ('E', 'F', 'G') AND imd_decile <= 3 THEN 1 END) > 0
                ORDER BY high_risk_count DESC
                LIMIT 30
            """)).fetchall()

            # EPC vs IMD cross-tabulation
            cross_tab = db.execute(text("""
                SELECT
                    epc_rating,
                    CASE
                        WHEN imd_decile <= 3 THEN 'Most Deprived (1-3)'
                        WHEN imd_decile <= 6 THEN 'Mid Deprivation (4-6)'
                        WHEN imd_decile <= 10 THEN 'Least Deprived (7-10)'
                        ELSE 'Unknown'
                    END as deprivation_band,
                    COUNT(*) as count
                FROM properties
                WHERE epc_rating IS NOT NULL AND imd_decile IS NOT NULL
                GROUP BY epc_rating, deprivation_band
                ORDER BY epc_rating, deprivation_band
            """)).fetchall()

            return {
                "summary": {
                    "total_properties": total,
                    "high_risk_count": stats[1] or 0,
                    "high_risk_pct": round((stats[1] or 0) / total * 100, 1),
                    "at_risk_count": stats[2] or 0,
                    "at_risk_pct": round((stats[2] or 0) / total * 100, 1),
                    "poor_epc_count": stats[3] or 0,
                    "high_deprivation_count": stats[4] or 0,
                    "imd_coverage": stats[5] or 0,
                },
                "areas": [
                    {
                        "area": r[0],
                        "local_authority": r[1],
                        "properties": r[2],
                        "high_risk": r[3],
                        "at_risk": r[4],
                        "avg_imd_decile": float(r[5]) if r[5] else None,
                        "avg_epc_numeric": float(r[6]) if r[6] else None,
                        "avg_imd_score": float(r[7]) if r[7] else None,
                    }
                    for r in area_rows
                ],
                "cross_tabulation": [
                    {"epc_rating": r[0], "deprivation_band": r[1], "count": r[2]}
                    for r in cross_tab
                ],
            }
        except Exception as e:
            logger.error(f"Error in get_fuel_poverty_indicators: {e}")
            return {"summary": {}, "areas": [], "cross_tabulation": []}


    @staticmethod
    def get_flood_map_data(db: Session) -> Dict[str, Any]:
        """
        Get all properties with flood data and coordinates for the Flood Intelligence map.
        Optimised: summary stats in a single query, properties in a second.
        """
        try:
            # Single summary query (replaces 6 separate queries)
            summary_rows = db.execute(text("""
                SELECT 'total' as category, 'all' as key, COUNT(*) as cnt FROM properties
                UNION ALL
                SELECT 'zone', COALESCE(flood_zone, 'Not Assessed'), COUNT(*)
                FROM properties GROUP BY flood_zone
                UNION ALL
                SELECT 'surface', COALESCE(flood_risk_surface_water, 'Not Assessed'), COUNT(*)
                FROM properties GROUP BY flood_risk_surface_water
                UNION ALL
                SELECT 'river', COALESCE(flood_risk_rivers_seas, 'Not Assessed'), COUNT(*)
                FROM properties GROUP BY flood_risk_rivers_seas
                UNION ALL
                SELECT 'warnings', 'count', COUNT(*) FROM properties WHERE active_flood_warnings > 0
                UNION ALL
                SELECT 'warnings', 'total', COALESCE(SUM(active_flood_warnings), 0)
                FROM properties WHERE active_flood_warnings > 0
            """)).fetchall()

            total = 0
            zone_distribution = {}
            surface_water_risk = {}
            river_sea_risk = {}
            warnings_count = 0
            total_warnings = 0
            for r in summary_rows:
                if r[0] == 'total':
                    total = r[2]
                elif r[0] == 'zone':
                    zone_distribution[r[1]] = r[2]
                elif r[0] == 'surface':
                    surface_water_risk[r[1]] = r[2]
                elif r[0] == 'river':
                    river_sea_risk[r[1]] = r[2]
                elif r[0] == 'warnings':
                    if r[1] == 'count':
                        warnings_count = r[2]
                    else:
                        total_warnings = int(r[2])

            # Get all properties with coordinates (needed for map plotting)
            rows = db.execute(text("""
                SELECT
                    id, address, postcode, latitude, longitude,
                    flood_zone, flood_risk_rivers_seas, flood_risk_surface_water,
                    COALESCE(active_flood_warnings, 0) as active_flood_warnings,
                    epc_rating, property_type
                FROM properties
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                ORDER BY
                    CASE flood_zone
                        WHEN 'Zone 3' THEN 1
                        WHEN 'Zone 2' THEN 2
                        WHEN 'Zone 1' THEN 3
                        ELSE 4
                    END,
                    active_flood_warnings DESC
            """)).fetchall()

            properties = []
            for r in rows:
                properties.append({
                    "id": r[0],
                    "address": r[1],
                    "postcode": r[2],
                    "latitude": float(r[3]) if r[3] else None,
                    "longitude": float(r[4]) if r[4] else None,
                    "flood_zone": r[5],
                    "flood_risk_rivers_seas": r[6],
                    "flood_risk_surface_water": r[7],
                    "active_flood_warnings": r[8],
                    "epc_rating": r[9],
                    "property_type": r[10],
                })

            return {
                "properties": properties,
                "summary": {
                    "total_properties": total,
                    "total_with_coords": len(properties),
                    "zone_distribution": zone_distribution,
                    "surface_water_risk": surface_water_risk,
                    "river_sea_risk": river_sea_risk,
                    "properties_with_warnings": warnings_count,
                    "total_active_warnings": total_warnings,
                },
            }
        except Exception as e:
            logger.error(f"Error in get_flood_map_data: {e}")
            return {"properties": [], "summary": {}}


    @staticmethod
    def get_flood_forecast_data(db: Session) -> Dict[str, Any]:
        """
        Get forecast-enriched flood data for the Flood Intelligence forecast tab.
        Returns properties with forecast risk scores, plus summary and daily timeline.
        """
        try:
            # Get all properties with forecast data
            rows = db.execute(text("""
                SELECT
                    id, address, postcode, latitude, longitude,
                    flood_zone, flood_risk_rivers_seas, flood_risk_surface_water,
                    COALESCE(active_flood_warnings, 0) as active_flood_warnings,
                    epc_rating, property_type,
                    forecast_risk_score, forecast_risk_level,
                    forecast_rainfall_48h_mm, forecast_rainfall_7day_mm,
                    forecast_peak_day, forecast_peak_rainfall_mm,
                    forecast_nearby_river_level, forecast_updated_at
                FROM properties
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                  AND forecast_risk_score IS NOT NULL
                ORDER BY forecast_risk_score DESC
            """)).fetchall()

            properties = []
            critical = elevated = watch = normal = 0
            peak_day_counts: Dict[str, Dict[str, Any]] = {}

            for r in rows:
                level = r[12] or "Normal"
                if level == "Critical":
                    critical += 1
                elif level == "Elevated":
                    elevated += 1
                elif level == "Watch":
                    watch += 1
                else:
                    normal += 1

                # Track peak day for timeline
                peak_day = r[15]
                if peak_day:
                    if peak_day not in peak_day_counts:
                        peak_day_counts[peak_day] = {"critical": 0, "elevated": 0, "rainfall_sum": 0, "count": 0}
                    if level == "Critical":
                        peak_day_counts[peak_day]["critical"] += 1
                    elif level == "Elevated":
                        peak_day_counts[peak_day]["elevated"] += 1

                properties.append({
                    "id": r[0],
                    "address": r[1],
                    "postcode": r[2],
                    "latitude": float(r[3]) if r[3] else None,
                    "longitude": float(r[4]) if r[4] else None,
                    "flood_zone": r[5],
                    "flood_risk_rivers_seas": r[6],
                    "flood_risk_surface_water": r[7],
                    "active_flood_warnings": r[8],
                    "epc_rating": r[9],
                    "property_type": r[10],
                    "forecast_risk_score": float(r[11]) if r[11] else 0,
                    "forecast_risk_level": r[12],
                    "forecast_rainfall_48h_mm": float(r[13]) if r[13] else 0,
                    "forecast_rainfall_7day_mm": float(r[14]) if r[14] else 0,
                    "forecast_peak_day": r[15],
                    "forecast_peak_rainfall_mm": float(r[16]) if r[16] else 0,
                    "forecast_nearby_river_level": r[17],
                    "forecast_updated_at": r[18].isoformat() if r[18] else None,
                })

            # Get the most recent update time
            updated_at = None
            if properties and properties[0].get("forecast_updated_at"):
                updated_at = properties[0]["forecast_updated_at"]

            # Find peak risk day
            peak_risk_day = None
            peak_risk_day_critical = 0
            for day, counts in peak_day_counts.items():
                if counts["critical"] > peak_risk_day_critical:
                    peak_risk_day = day
                    peak_risk_day_critical = counts["critical"]

            # Build daily timeline from actual forecast data
            daily_timeline = db.execute(text("""
                SELECT
                    forecast_peak_day,
                    ROUND(AVG(forecast_rainfall_48h_mm)::numeric, 1) as avg_rainfall,
                    COUNT(*) FILTER (WHERE forecast_risk_level = 'Critical') as critical,
                    COUNT(*) FILTER (WHERE forecast_risk_level = 'Elevated') as elevated,
                    COUNT(*) FILTER (WHERE forecast_risk_level = 'Watch') as watch
                FROM properties
                WHERE forecast_peak_day IS NOT NULL
                  AND forecast_risk_score IS NOT NULL
                GROUP BY forecast_peak_day
                ORDER BY forecast_peak_day
            """)).fetchall()

            timeline = []
            for row in daily_timeline:
                timeline.append({
                    "day": row[0],
                    "avg_rainfall_mm": float(row[1]) if row[1] else 0,
                    "critical": row[2],
                    "elevated": row[3],
                    "watch": row[4],
                })

            return {
                "properties": properties,
                "summary": {
                    "critical_count": critical,
                    "elevated_count": elevated,
                    "watch_count": watch,
                    "normal_count": normal,
                    "total_forecasted": len(properties),
                    "peak_risk_day": peak_risk_day,
                    "forecast_updated_at": updated_at,
                },
                "daily_timeline": timeline,
            }
        except Exception as e:
            logger.error(f"Error in get_flood_forecast_data: {e}")
            return {"properties": [], "summary": {}, "daily_timeline": []}

    @staticmethod
    def get_census_demographics(db: Session) -> Dict[str, Any]:
        """Get Census 2021 demographic summary across the portfolio."""
        try:
            total = db.execute(text("SELECT COUNT(*) FROM properties")).scalar() or 1
            enriched = db.execute(text(
                "SELECT COUNT(*) FROM properties WHERE census_enriched_at IS NOT NULL"
            )).scalar() or 0

            # Age profile averages
            age_stats = db.execute(text("""
                SELECT
                    ROUND(AVG(census_age_0_15_pct)::numeric, 1) as avg_children,
                    ROUND(AVG(census_age_16_64_pct)::numeric, 1) as avg_working,
                    ROUND(AVG(census_age_65_plus_pct)::numeric, 1) as avg_elderly,
                    ROUND(AVG(census_population_density)::numeric, 0) as avg_pop_density,
                    ROUND(AVG(census_single_person_hh_pct)::numeric, 1) as avg_single_person,
                    ROUND(AVG(census_overcrowded_pct)::numeric, 1) as avg_overcrowded,
                    ROUND(AVG(census_no_central_heating_pct)::numeric, 1) as avg_no_heating,
                    ROUND(AVG(census_disability_pct)::numeric, 1) as avg_disability,
                    ROUND(AVG(census_non_english_speaker_pct)::numeric, 1) as avg_non_english,
                    ROUND(AVG(census_deprivation_dims)::numeric, 1) as avg_deprivation_dims
                FROM properties
                WHERE census_enriched_at IS NOT NULL
            """)).fetchone()

            # Elderly concentration by ward (top areas with highest elderly %)
            elderly_wards = db.execute(text("""
                SELECT
                    COALESCE(ward_name, 'Unknown') as ward,
                    local_authority_name,
                    COUNT(*) as properties,
                    ROUND(AVG(census_age_65_plus_pct)::numeric, 1) as avg_elderly_pct,
                    ROUND(AVG(census_disability_pct)::numeric, 1) as avg_disability_pct,
                    ROUND(AVG(census_single_person_hh_pct)::numeric, 1) as avg_single_pct
                FROM properties
                WHERE census_enriched_at IS NOT NULL AND ward_name IS NOT NULL
                GROUP BY ward_name, local_authority_name
                HAVING COUNT(*) >= 3
                ORDER BY avg_elderly_pct DESC
                LIMIT 20
            """)).fetchall()

            # Vulnerability indicators by local authority
            la_stats = db.execute(text("""
                SELECT
                    local_authority_name,
                    COUNT(*) as properties,
                    ROUND(AVG(census_age_65_plus_pct)::numeric, 1) as avg_elderly,
                    ROUND(AVG(census_disability_pct)::numeric, 1) as avg_disability,
                    ROUND(AVG(census_overcrowded_pct)::numeric, 1) as avg_overcrowded,
                    ROUND(AVG(census_no_central_heating_pct)::numeric, 1) as avg_no_heating,
                    ROUND(AVG(census_non_english_speaker_pct)::numeric, 1) as avg_non_english
                FROM properties
                WHERE census_enriched_at IS NOT NULL AND local_authority_name IS NOT NULL
                GROUP BY local_authority_name
                ORDER BY properties DESC
                LIMIT 30
            """)).fetchall()

            return {
                "total_properties": total,
                "enriched_count": enriched,
                "coverage_pct": round(enriched / total * 100, 1),
                "portfolio_averages": {
                    "children_pct": float(age_stats[0]) if age_stats and age_stats[0] else None,
                    "working_age_pct": float(age_stats[1]) if age_stats and age_stats[1] else None,
                    "elderly_pct": float(age_stats[2]) if age_stats and age_stats[2] else None,
                    "population_density": float(age_stats[3]) if age_stats and age_stats[3] else None,
                    "single_person_hh_pct": float(age_stats[4]) if age_stats and age_stats[4] else None,
                    "overcrowded_pct": float(age_stats[5]) if age_stats and age_stats[5] else None,
                    "no_central_heating_pct": float(age_stats[6]) if age_stats and age_stats[6] else None,
                    "disability_pct": float(age_stats[7]) if age_stats and age_stats[7] else None,
                    "non_english_speaker_pct": float(age_stats[8]) if age_stats and age_stats[8] else None,
                    "deprivation_dims": float(age_stats[9]) if age_stats and age_stats[9] else None,
                },
                "elderly_concentration": [
                    {
                        "ward": r[0], "local_authority": r[1], "properties": r[2],
                        "avg_elderly_pct": float(r[3]) if r[3] else None,
                        "avg_disability_pct": float(r[4]) if r[4] else None,
                        "avg_single_person_pct": float(r[5]) if r[5] else None,
                    }
                    for r in elderly_wards
                ],
                "local_authority_breakdown": [
                    {
                        "local_authority": r[0], "properties": r[1],
                        "avg_elderly_pct": float(r[2]) if r[2] else None,
                        "avg_disability_pct": float(r[3]) if r[3] else None,
                        "avg_overcrowded_pct": float(r[4]) if r[4] else None,
                        "avg_no_heating_pct": float(r[5]) if r[5] else None,
                        "avg_non_english_pct": float(r[6]) if r[6] else None,
                    }
                    for r in la_stats
                ],
            }
        except Exception as e:
            logger.error(f"Error in get_census_demographics: {e}")
            return {"total_properties": 0, "enriched_count": 0, "coverage_pct": 0, "portfolio_averages": {}, "elderly_concentration": [], "local_authority_breakdown": []}

    @staticmethod
    def get_broadband_utilities(db: Session) -> Dict[str, Any]:
        """Get broadband speeds and utility provider summary across the portfolio."""
        try:
            total = db.execute(text("SELECT COUNT(*) FROM properties")).scalar() or 1
            enriched = db.execute(text(
                "SELECT COUNT(*) FROM properties WHERE utilities_enriched_at IS NOT NULL"
            )).scalar() or 0

            # Broadband speed stats
            speed_stats = db.execute(text("""
                SELECT
                    ROUND(AVG(broadband_max_download)::numeric, 1) as avg_download,
                    ROUND(AVG(broadband_max_upload)::numeric, 1) as avg_upload,
                    ROUND(MIN(broadband_max_download)::numeric, 1) as min_download,
                    ROUND(MAX(broadband_max_download)::numeric, 1) as max_download,
                    COUNT(CASE WHEN broadband_superfast_available THEN 1 END) as superfast_count,
                    COUNT(CASE WHEN broadband_ultrafast_available THEN 1 END) as ultrafast_count,
                    COUNT(CASE WHEN broadband_fttp_available THEN 1 END) as fttp_count
                FROM properties
                WHERE utilities_enriched_at IS NOT NULL
            """)).fetchone()

            # Speed distribution buckets
            speed_dist = db.execute(text("""
                SELECT
                    CASE
                        WHEN broadband_max_download < 10 THEN 'Under 10 Mbps'
                        WHEN broadband_max_download < 30 THEN '10-30 Mbps'
                        WHEN broadband_max_download < 100 THEN '30-100 Mbps'
                        WHEN broadband_max_download < 300 THEN '100-300 Mbps'
                        ELSE '300+ Mbps'
                    END as speed_band,
                    COUNT(*) as cnt
                FROM properties
                WHERE broadband_max_download IS NOT NULL
                GROUP BY speed_band
                ORDER BY MIN(broadband_max_download)
            """)).fetchall()

            # DNO breakdown
            dno_rows = db.execute(text("""
                SELECT electricity_dno, COUNT(*) as cnt
                FROM properties
                WHERE electricity_dno IS NOT NULL
                GROUP BY electricity_dno
                ORDER BY cnt DESC
            """)).fetchall()

            # GDN breakdown
            gdn_rows = db.execute(text("""
                SELECT gas_gdn, COUNT(*) as cnt
                FROM properties
                WHERE gas_gdn IS NOT NULL
                GROUP BY gas_gdn
                ORDER BY cnt DESC
            """)).fetchall()

            # Digital divide: areas with worst broadband
            poor_broadband = db.execute(text("""
                SELECT
                    COALESCE(ward_name, 'Unknown') as ward,
                    local_authority_name,
                    COUNT(*) as properties,
                    ROUND(AVG(broadband_max_download)::numeric, 1) as avg_download,
                    COUNT(CASE WHEN broadband_superfast_available THEN 1 END) as superfast,
                    COUNT(CASE WHEN broadband_fttp_available THEN 1 END) as fttp
                FROM properties
                WHERE utilities_enriched_at IS NOT NULL AND ward_name IS NOT NULL
                GROUP BY ward_name, local_authority_name
                HAVING COUNT(*) >= 3
                ORDER BY avg_download ASC
                LIMIT 20
            """)).fetchall()

            return {
                "total_properties": total,
                "enriched_count": enriched,
                "coverage_pct": round(enriched / total * 100, 1),
                "broadband": {
                    "avg_download_mbps": float(speed_stats[0]) if speed_stats and speed_stats[0] else None,
                    "avg_upload_mbps": float(speed_stats[1]) if speed_stats and speed_stats[1] else None,
                    "min_download_mbps": float(speed_stats[2]) if speed_stats and speed_stats[2] else None,
                    "max_download_mbps": float(speed_stats[3]) if speed_stats and speed_stats[3] else None,
                    "superfast_available": speed_stats[4] if speed_stats else 0,
                    "superfast_pct": round((speed_stats[4] or 0) / max(enriched, 1) * 100, 1) if speed_stats else 0,
                    "ultrafast_available": speed_stats[5] if speed_stats else 0,
                    "ultrafast_pct": round((speed_stats[5] or 0) / max(enriched, 1) * 100, 1) if speed_stats else 0,
                    "fttp_available": speed_stats[6] if speed_stats else 0,
                    "fttp_pct": round((speed_stats[6] or 0) / max(enriched, 1) * 100, 1) if speed_stats else 0,
                    "speed_distribution": [{"band": r[0], "count": r[1]} for r in speed_dist],
                },
                "electricity": {
                    "dno_breakdown": [{"dno": r[0], "count": r[1]} for r in dno_rows],
                },
                "gas": {
                    "gdn_breakdown": [{"gdn": r[0], "count": r[1]} for r in gdn_rows],
                },
                "digital_divide": [
                    {
                        "ward": r[0], "local_authority": r[1], "properties": r[2],
                        "avg_download_mbps": float(r[3]) if r[3] else None,
                        "superfast_count": r[4], "fttp_count": r[5],
                    }
                    for r in poor_broadband
                ],
            }
        except Exception as e:
            logger.error(f"Error in get_broadband_utilities: {e}")
            return {"total_properties": 0, "enriched_count": 0, "coverage_pct": 0, "broadband": {}, "electricity": {}, "gas": {}, "digital_divide": []}


    @staticmethod
    def get_strategic_insights(db: Session) -> Dict[str, Any]:
        """
        Cross-correlate ALL available data to produce top strategic insights
        for social housing decision-making. Each insight is implemented as a
        small class under ``services.insights`` and registered automatically
        via the ``@register`` decorator. The registry is walked here in rank
        order with isolated error handling — a broken insight cannot collapse
        the page.

        See ``services/insights/MIGRATION.md`` for the per-insight pattern.
        """
        from datetime import datetime
        from services.insights import run_all_insights

        results = run_all_insights(db)
        logger.info(
            "strategic_insights.generated",
            extra={"count": len(results), "ranks": [i.get("rank") for i in results]},
        )
        return {
            "insights": results,
            "total_insights": len(results),
            "generated_at": datetime.now().isoformat(),
        }



def get_analytics_service(db: Session = None) -> AnalyticsService:
    """Get analytics service instance."""
    return AnalyticsService()
