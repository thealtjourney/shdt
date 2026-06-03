"""
Comprehensive property service with database query logic.

Provides methods for querying property data with filtering, spatial queries,
aggregation, and full-text search capabilities.
"""

from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy import text, func
from sqlalchemy.orm import Session
from database import engine, get_db_connection
import logging

logger = logging.getLogger(__name__)


class PropertyService:
    """Service for property data operations with database queries."""

    @staticmethod
    def get_properties(
        session: Session,
        page: int = 1,
        page_size: int = 500,
        epc_rating: Optional[str] = None,
        property_type: Optional[str] = None,
        bedrooms_min: Optional[int] = None,
        bedrooms_max: Optional[int] = None,
        year_built_min: Optional[int] = None,
        year_built_max: Optional[int] = None,
        heating_type: Optional[str] = None,
        postcode_prefix: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get all properties with optional filters and pagination.

        Args:
            session: Database session
            page: Page number (1-indexed)
            page_size: Number of results per page
            epc_rating: Filter by EPC rating (A-G)
            property_type: Filter by property type
            bedrooms_min: Minimum number of bedrooms
            bedrooms_max: Maximum number of bedrooms
            year_built_min: Minimum year built
            year_built_max: Maximum year built
            heating_type: Filter by heating type
            postcode_prefix: Filter by postcode prefix

        Returns:
            Tuple of (list of property dictionaries, total count)
        """
        try:
            # Build WHERE clause with filters
            where_conditions = []
            params = {}

            if epc_rating:
                where_conditions.append("epc_rating = :epc_rating")
                params["epc_rating"] = epc_rating.upper()

            if property_type:
                where_conditions.append("property_type = :property_type")
                params["property_type"] = property_type.lower()

            if bedrooms_min is not None:
                where_conditions.append("bedrooms >= :bedrooms_min")
                params["bedrooms_min"] = bedrooms_min

            if bedrooms_max is not None:
                where_conditions.append("bedrooms <= :bedrooms_max")
                params["bedrooms_max"] = bedrooms_max

            if year_built_min is not None:
                where_conditions.append("year_built >= :year_built_min")
                params["year_built_min"] = year_built_min

            if year_built_max is not None:
                where_conditions.append("year_built <= :year_built_max")
                params["year_built_max"] = year_built_max

            if heating_type:
                where_conditions.append("heating_type = :heating_type")
                params["heating_type"] = heating_type.lower()

            if postcode_prefix:
                where_conditions.append("postcode LIKE :postcode_prefix")
                params["postcode_prefix"] = postcode_prefix.upper() + "%"

            where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"

            # Get total count
            count_query = text(f"SELECT COUNT(*) FROM properties WHERE {where_clause}")
            total_count = session.execute(count_query, params).scalar()

            # Get paginated results
            offset = (page - 1) * page_size
            query = text(f"""
                SELECT
                    id, uprn, address, postcode, latitude, longitude,
                    epc_rating, property_type, bedrooms, year_built, heating_type,
                    stock_condition_score, last_inspection_date
                FROM properties
                WHERE {where_clause}
                ORDER BY id
                LIMIT :limit OFFSET :offset
            """)
            params["limit"] = page_size
            params["offset"] = offset

            rows = session.execute(query, params).fetchall()

            # Convert to dictionaries
            properties = []
            for row in rows:
                properties.append({
                    "id": row[0],
                    "uprn": row[1],
                    "address": row[2],
                    "postcode": row[3],
                    "latitude": float(row[4]) if row[4] else None,
                    "longitude": float(row[5]) if row[5] else None,
                    "epc_rating": row[6],
                    "property_type": row[7],
                    "bedrooms": row[8],
                    "year_built": row[9],
                    "heating_type": row[10],
                    "stock_condition_score": float(row[11]) if row[11] else None,
                    "last_inspection_date": row[12].isoformat() if row[12] else None,
                })

            return properties, total_count

        except Exception as e:
            logger.error(f"Error querying properties: {e}")
            raise

    @staticmethod
    def get_property_by_id(session: Session, property_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a single property by ID with all details.

        Args:
            session: Database session
            property_id: Property ID

        Returns:
            Property dictionary or None if not found
        """
        try:
            query = text("""
                SELECT
                    id, uprn, address, postcode, latitude, longitude,
                    epc_rating, property_type, bedrooms, year_built, heating_type,
                    stock_condition_score, last_inspection_date,
                    -- Crime enrichment
                    crime_total_3months, crime_burglary_3months, crime_antisocial_3months,
                    crime_criminal_damage_3months, crime_violence_3months, crime_robbery_3months,
                    crime_other_3months, crime_risk_score, crime_last_updated,
                    -- Flood enrichment
                    flood_risk_rivers_seas, flood_risk_surface_water, flood_zone,
                    active_flood_warnings,
                    -- Postcodes.io enrichment
                    lsoa_code, lsoa_name, msoa_name, ward_name, parish,
                    parliamentary_constituency, local_authority_name, region,
                    -- EPC detail enrichment
                    epc_score, epc_potential_rating, epc_potential_score,
                    floor_area_m2, wall_type, wall_insulation, roof_insulation,
                    main_heating, main_fuel, hot_water, lighting, windows,
                    co2_emissions, co2_potential, energy_cost_current, energy_cost_potential,
                    construction_age_band, built_form
                FROM properties
                WHERE id = :id
            """)

            row = session.execute(query, {"id": property_id}).first()

            if not row:
                return None

            def _f(v):
                try: return float(v) if v is not None else None
                except (ValueError, TypeError): return None

            def _i(v):
                try: return int(v) if v is not None else None
                except (ValueError, TypeError): return None

            def _s(v):
                return str(v).strip() if v else None

            return {
                "id": row[0], "uprn": row[1], "address": row[2], "postcode": row[3],
                "latitude": _f(row[4]), "longitude": _f(row[5]),
                "epc_rating": row[6], "property_type": row[7], "bedrooms": row[8],
                "year_built": row[9], "heating_type": row[10],
                "stock_condition_score": _f(row[11]),
                "last_inspection_date": row[12].isoformat() if row[12] else None,
                # Crime
                "crime_total_3months": _i(row[13]), "crime_burglary_3months": _i(row[14]),
                "crime_antisocial_3months": _i(row[15]), "crime_criminal_damage_3months": _i(row[16]),
                "crime_violence_3months": _i(row[17]), "crime_robbery_3months": _i(row[18]),
                "crime_other_3months": _i(row[19]), "crime_risk_score": _f(row[20]),
                "crime_last_updated": row[21].isoformat() if row[21] else None,
                # Flood
                "flood_risk_rivers_seas": _s(row[22]), "flood_risk_surface_water": _s(row[23]),
                "flood_zone": _s(row[24]), "active_flood_warnings": _i(row[25]),
                # Geography
                "lsoa_code": _s(row[26]), "lsoa_name": _s(row[27]),
                "msoa_name": _s(row[28]), "ward_name": _s(row[29]),
                "parish": _s(row[30]), "parliamentary_constituency": _s(row[31]),
                "local_authority_name": _s(row[32]), "region": _s(row[33]),
                # EPC Detail
                "epc_score": _f(row[34]), "epc_potential_rating": _s(row[35]),
                "epc_potential_score": _f(row[36]), "floor_area_m2": _f(row[37]),
                "wall_type": _s(row[38]), "wall_insulation": _s(row[39]),
                "roof_insulation": _s(row[40]), "main_heating": _s(row[41]),
                "main_fuel": _s(row[42]), "hot_water": _s(row[43]),
                "lighting": _s(row[44]), "windows": _s(row[45]),
                "co2_emissions": _f(row[46]), "co2_potential": _f(row[47]),
                "energy_cost_current": _f(row[48]), "energy_cost_potential": _f(row[49]),
                "construction_age_band": _s(row[50]), "built_form": _s(row[51]),
            }

        except Exception as e:
            logger.error(f"Error getting property {property_id}: {e}")
            raise

    @staticmethod
    def get_properties_in_bbox(
        session: Session,
        min_lat: float,
        min_lng: float,
        max_lat: float,
        max_lng: float,
        page: int = 1,
        page_size: int = 500,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get properties within a bounding box using PostGIS spatial queries.

        Args:
            session: Database session
            min_lat: Minimum latitude
            min_lng: Minimum longitude
            max_lat: Maximum latitude
            max_lng: Maximum longitude
            page: Page number (1-indexed)
            page_size: Number of results per page

        Returns:
            Tuple of (list of property dictionaries, total count)
        """
        try:
            # Get total count
            count_query = text("""
                SELECT COUNT(*) FROM properties
                WHERE ST_Contains(
                    ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326),
                    geometry
                )
            """)
            params = {
                "min_lat": min_lat,
                "min_lng": min_lng,
                "max_lat": max_lat,
                "max_lng": max_lng,
            }
            total_count = session.execute(count_query, params).scalar()

            # Get paginated results
            offset = (page - 1) * page_size
            query = text("""
                SELECT
                    id, uprn, address, postcode, latitude, longitude,
                    epc_rating, property_type, bedrooms, year_built, heating_type,
                    stock_condition_score, last_inspection_date
                FROM properties
                WHERE ST_Contains(
                    ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326),
                    geometry
                )
                ORDER BY id
                LIMIT :limit OFFSET :offset
            """)
            params["limit"] = page_size
            params["offset"] = offset

            rows = session.execute(query, params).fetchall()

            # Convert to dictionaries
            properties = []
            for row in rows:
                properties.append({
                    "id": row[0],
                    "uprn": row[1],
                    "address": row[2],
                    "postcode": row[3],
                    "latitude": float(row[4]) if row[4] else None,
                    "longitude": float(row[5]) if row[5] else None,
                    "epc_rating": row[6],
                    "property_type": row[7],
                    "bedrooms": row[8],
                    "year_built": row[9],
                    "heating_type": row[10],
                    "stock_condition_score": float(row[11]) if row[11] else None,
                    "last_inspection_date": row[12].isoformat() if row[12] else None,
                })

            return properties, total_count

        except Exception as e:
            logger.error(f"Error querying bbox: {e}")
            raise

    @staticmethod
    def get_property_statistics(
        session: Session,
        epc_rating: Optional[str] = None,
        property_type: Optional[str] = None,
        bedrooms_min: Optional[int] = None,
        bedrooms_max: Optional[int] = None,
        year_built_min: Optional[int] = None,
        year_built_max: Optional[int] = None,
        heating_type: Optional[str] = None,
        postcode_prefix: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get aggregate statistics for properties with optional filters.

        Args:
            session: Database session
            epc_rating: Filter by EPC rating
            property_type: Filter by property type
            bedrooms_min: Minimum bedrooms
            bedrooms_max: Maximum bedrooms
            year_built_min: Minimum year built
            year_built_max: Maximum year built
            heating_type: Filter by heating type
            postcode_prefix: Filter by postcode prefix

        Returns:
            Dictionary with statistics
        """
        try:
            # Build WHERE clause with filters
            where_conditions = []
            params = {}

            if epc_rating:
                where_conditions.append("epc_rating = :epc_rating")
                params["epc_rating"] = epc_rating.upper()

            if property_type:
                where_conditions.append("property_type = :property_type")
                params["property_type"] = property_type.lower()

            if bedrooms_min is not None:
                where_conditions.append("bedrooms >= :bedrooms_min")
                params["bedrooms_min"] = bedrooms_min

            if bedrooms_max is not None:
                where_conditions.append("bedrooms <= :bedrooms_max")
                params["bedrooms_max"] = bedrooms_max

            if year_built_min is not None:
                where_conditions.append("year_built >= :year_built_min")
                params["year_built_min"] = year_built_min

            if year_built_max is not None:
                where_conditions.append("year_built <= :year_built_max")
                params["year_built_max"] = year_built_max

            if heating_type:
                where_conditions.append("heating_type = :heating_type")
                params["heating_type"] = heating_type.lower()

            if postcode_prefix:
                where_conditions.append("postcode LIKE :postcode_prefix")
                params["postcode_prefix"] = postcode_prefix.upper() + "%"

            where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"

            # Total count
            count_query = text(f"SELECT COUNT(*) FROM properties WHERE {where_clause}")
            total = session.execute(count_query, params).scalar()

            # EPC breakdown
            epc_query = text(f"""
                SELECT epc_rating, COUNT(*) as count
                FROM properties
                WHERE {where_clause} AND epc_rating IS NOT NULL
                GROUP BY epc_rating
                ORDER BY epc_rating
            """)
            epc_breakdown = {}
            for row in session.execute(epc_query, params).fetchall():
                epc_breakdown[row[0]] = int(row[1])

            # Property type breakdown
            type_query = text(f"""
                SELECT property_type, COUNT(*) as count
                FROM properties
                WHERE {where_clause} AND property_type IS NOT NULL
                GROUP BY property_type
                ORDER BY count DESC
            """)
            property_type_breakdown = {}
            for row in session.execute(type_query, params).fetchall():
                property_type_breakdown[row[0]] = int(row[1])

            # Average condition score
            condition_query = text(f"""
                SELECT AVG(stock_condition_score)
                FROM properties
                WHERE {where_clause} AND stock_condition_score IS NOT NULL
            """)
            avg_condition = session.execute(condition_query, params).scalar()

            # Heating type breakdown
            heating_query = text(f"""
                SELECT heating_type, COUNT(*) as count
                FROM properties
                WHERE {where_clause} AND heating_type IS NOT NULL
                GROUP BY heating_type
                ORDER BY count DESC
            """)
            heating_breakdown = {}
            for row in session.execute(heating_query, params).fetchall():
                heating_breakdown[row[0]] = int(row[1])

            return {
                "total": total,
                "epc_breakdown": epc_breakdown,
                "property_type_breakdown": property_type_breakdown,
                "average_condition_score": float(avg_condition) if avg_condition else None,
                "heating_type_breakdown": heating_breakdown,
            }

        except Exception as e:
            logger.error(f"Error calculating statistics: {e}")
            raise

    @staticmethod
    def get_clustered_properties(
        session: Session,
        min_lat: float,
        min_lng: float,
        max_lat: float,
        max_lng: float,
        zoom_level: int,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get properties with grid-based clustering at zoom < 14, individual points at zoom >= 14.

        Args:
            session: Database session
            min_lat: Minimum latitude
            min_lng: Minimum longitude
            max_lat: Maximum latitude
            max_lng: Maximum longitude
            zoom_level: Zoom level (higher = more detail)

        Returns:
            Tuple of (list of clusters/points, total count)
        """
        try:
            params = {
                "min_lat": min_lat,
                "min_lng": min_lng,
                "max_lat": max_lat,
                "max_lng": max_lng,
            }

            if zoom_level >= 14:
                # Return individual points
                query = text("""
                    SELECT
                        id, latitude, longitude, epc_rating, property_type, bedrooms,
                        year_built, heating_type, stock_condition_score
                    FROM properties
                    WHERE ST_Contains(
                        ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326),
                        geometry
                    )
                    ORDER BY id
                """)

                rows = session.execute(query, params).fetchall()
                total_count = len(rows)

                points = []
                for row in rows:
                    points.append({
                        "type": "point",
                        "id": row[0],
                        "latitude": float(row[1]) if row[1] else None,
                        "longitude": float(row[2]) if row[2] else None,
                        "epc_rating": row[3],
                        "property_type": row[4],
                        "bedrooms": row[5],
                        "year_built": row[6],
                        "heating_type": row[7],
                        "stock_condition_score": float(row[8]) if row[8] else None,
                    })

                return points, total_count

            else:
                # Grid-based clustering
                grid_size = 1.0 / (2 ** (zoom_level - 1))  # Adjust grid size by zoom

                query = text(f"""
                    SELECT
                        FLOOR((latitude - :min_lat) / :grid_size) as lat_grid,
                        FLOOR((longitude - :min_lng) / :grid_size) as lng_grid,
                        COUNT(*) as count,
                        AVG(latitude) as centroid_lat,
                        AVG(longitude) as centroid_lng,
                        (ARRAY_AGG(epc_rating) FILTER (WHERE epc_rating IS NOT NULL))[1] as dominant_epc
                    FROM properties
                    WHERE ST_Contains(
                        ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326),
                        geometry
                    )
                    GROUP BY lat_grid, lng_grid
                    ORDER BY lat_grid, lng_grid
                """)
                params["grid_size"] = grid_size

                rows = session.execute(query, params).fetchall()
                total_count = len(rows)

                clusters = []
                for row in rows:
                    clusters.append({
                        "type": "cluster",
                        "centroid_latitude": float(row[3]) if row[3] else None,
                        "centroid_longitude": float(row[4]) if row[4] else None,
                        "count": int(row[2]),
                        "dominant_epc_rating": row[5],
                    })

                return clusters, total_count

        except Exception as e:
            logger.error(f"Error clustering properties: {e}")
            raise

    @staticmethod
    def search_properties(
        session: Session,
        query: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Search properties by address, postcode, or UPRN with relevance scoring.

        Args:
            session: Database session
            query: Search query string
            limit: Maximum number of results

        Returns:
            List of matching properties ranked by relevance
        """
        try:
            search_term = f"%{query}%"
            params = {"search_term": search_term, "limit": limit}

            # Search with relevance scoring: exact matches rank higher
            search_query = text("""
                SELECT
                    id, uprn, address, postcode, latitude, longitude,
                    epc_rating, property_type, bedrooms, year_built, heating_type,
                    stock_condition_score, last_inspection_date,
                    CASE
                        WHEN UPPER(postcode) = UPPER(:query_exact) THEN 1
                        WHEN UPPER(address) LIKE UPPER(:query_exact) THEN 2
                        WHEN UPPER(uprn) = UPPER(:query_exact) THEN 3
                        WHEN UPPER(postcode) LIKE UPPER(:search_term) THEN 4
                        WHEN UPPER(address) LIKE UPPER(:search_term) THEN 5
                        ELSE 6
                    END as relevance
                FROM properties
                WHERE
                    UPPER(address) LIKE UPPER(:search_term)
                    OR UPPER(postcode) LIKE UPPER(:search_term)
                    OR UPPER(uprn) LIKE UPPER(:search_term)
                ORDER BY relevance, id
                LIMIT :limit
            """)
            params["query_exact"] = query

            rows = session.execute(search_query, params).fetchall()

            properties = []
            for row in rows:
                properties.append({
                    "id": row[0],
                    "uprn": row[1],
                    "address": row[2],
                    "postcode": row[3],
                    "latitude": float(row[4]) if row[4] else None,
                    "longitude": float(row[5]) if row[5] else None,
                    "epc_rating": row[6],
                    "property_type": row[7],
                    "bedrooms": row[8],
                    "year_built": row[9],
                    "heating_type": row[10],
                    "stock_condition_score": float(row[11]) if row[11] else None,
                    "last_inspection_date": row[12].isoformat() if row[12] else None,
                    "relevance_score": int(row[13]),
                })

            return properties

        except Exception as e:
            logger.error(f"Error searching properties: {e}")
            raise
