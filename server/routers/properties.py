"""
Comprehensive properties API router for SHDT.

Provides endpoints for property queries, spatial filtering, aggregation,
clustering, and search functionality with OpenAPI documentation.
"""

from fastapi import APIRouter, Query, Path, Depends, HTTPException
from typing import Optional, List
from sqlalchemy.orm import Session
import logging

from database import SessionLocal
from services.property_service import PropertyService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["properties"])


def get_session():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================================
# SPECIFIC ROUTES (must come before /{id} to avoid conflicts)
# ============================================================================


@router.get(
    "/properties/bbox",
    response_model=dict,
    summary="Get properties in bounding box",
    description="Returns properties within a geographic bounding box using PostGIS spatial queries"
)
async def get_properties_bbox(
    min_lat: float = Query(..., description="Minimum latitude (southernmost)"),
    min_lng: float = Query(..., description="Minimum longitude (westernmost)"),
    max_lat: float = Query(..., description="Maximum latitude (northernmost)"),
    max_lng: float = Query(..., description="Maximum longitude (easternmost)"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(500, ge=1, le=2000, description="Results per page (max 2000)"),
    session: Session = Depends(get_session)
):
    """
    Get properties within a bounding box.

    Returns GeoJSON FeatureCollection of properties within the specified geographic bounds.
    Uses PostGIS ST_MakeEnvelope for efficient spatial queries.

    Query Parameters:
    - min_lat, min_lng, max_lat, max_lng: Bounding box coordinates
    - page: Page number for pagination
    - page_size: Number of results per page (default 500, max 2000)

    Returns:
    - type: FeatureCollection
    - features: Array of GeoJSON Feature objects
    - metadata: Total count and pagination info
    """
    try:
        # Validate bbox coordinates
        if min_lat >= max_lat:
            raise HTTPException(status_code=400, detail="min_lat must be less than max_lat")
        if min_lng >= max_lng:
            raise HTTPException(status_code=400, detail="min_lng must be less than max_lng")

        properties, total_count = PropertyService.get_properties_in_bbox(
            session=session,
            min_lat=min_lat,
            min_lng=min_lng,
            max_lat=max_lat,
            max_lng=max_lng,
            page=page,
            page_size=page_size,
        )

        # Convert to GeoJSON features
        features = []
        for prop in properties:
            if prop["latitude"] and prop["longitude"]:
                features.append({
                    "type": "Feature",
                    "id": prop["id"],
                    "geometry": {
                        "type": "Point",
                        "coordinates": [prop["longitude"], prop["latitude"]]
                    },
                    "properties": {k: v for k, v in prop.items() if k not in ["latitude", "longitude"]}
                })

        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
                "total_pages": (total_count + page_size - 1) // page_size,
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_properties_bbox: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/properties/stats",
    response_model=dict,
    summary="Get property statistics",
    description="Returns aggregate statistics for properties with optional filtering"
)
async def get_property_stats(
    epc_rating: Optional[str] = Query(None, description="Filter by EPC rating (A-G)"),
    property_type: Optional[str] = Query(None, description="Filter by property type"),
    bedrooms_min: Optional[int] = Query(None, ge=0, description="Minimum number of bedrooms"),
    bedrooms_max: Optional[int] = Query(None, ge=0, description="Maximum number of bedrooms"),
    year_built_min: Optional[int] = Query(None, ge=1800, description="Minimum year built"),
    year_built_max: Optional[int] = Query(None, description="Maximum year built"),
    heating_type: Optional[str] = Query(None, description="Filter by heating type"),
    postcode_prefix: Optional[str] = Query(None, description="Filter by postcode prefix"),
    session: Session = Depends(get_session)
):
    """
    Get aggregate statistics for properties.

    Returns:
    - total: Total number of properties matching filters
    - epc_breakdown: Count of properties by EPC rating
    - property_type_breakdown: Count by property type
    - average_condition_score: Mean stock condition score
    - heating_type_breakdown: Count by heating type
    """
    try:
        # Validate EPC rating
        if epc_rating and epc_rating.upper() not in ["A", "B", "C", "D", "E", "F", "G"]:
            raise HTTPException(status_code=400, detail="Invalid EPC rating")

        if bedrooms_min is not None and bedrooms_max is not None:
            if bedrooms_min > bedrooms_max:
                raise HTTPException(status_code=400, detail="bedrooms_min must be <= bedrooms_max")

        if year_built_min is not None and year_built_max is not None:
            if year_built_min > year_built_max:
                raise HTTPException(status_code=400, detail="year_built_min must be <= year_built_max")

        stats = PropertyService.get_property_statistics(
            session=session,
            epc_rating=epc_rating,
            property_type=property_type,
            bedrooms_min=bedrooms_min,
            bedrooms_max=bedrooms_max,
            year_built_min=year_built_min,
            year_built_max=year_built_max,
            heating_type=heating_type,
            postcode_prefix=postcode_prefix,
        )

        return stats

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_property_stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/properties/cluster",
    response_model=dict,
    summary="Get clustered properties",
    description="Returns grid-based clusters at low zoom, individual points at high zoom"
)
async def get_clustered_properties(
    min_lat: float = Query(..., description="Minimum latitude"),
    min_lng: float = Query(..., description="Minimum longitude"),
    max_lat: float = Query(..., description="Maximum latitude"),
    max_lng: float = Query(..., description="Maximum longitude"),
    zoom_level: int = Query(..., ge=1, le=22, description="Map zoom level (1-22)"),
    session: Session = Depends(get_session)
):
    """
    Get properties with intelligent clustering.

    At zoom level < 14: Returns grid-based clusters with centroids and counts
    At zoom level >= 14: Returns individual property points

    Each cluster includes:
    - centroid_latitude/longitude: Center point of cluster
    - count: Number of properties in cluster
    - dominant_epc_rating: Most common EPC rating in cluster

    Returns GeoJSON FeatureCollection with mixed feature types.
    """
    try:
        # Validate bbox
        if min_lat >= max_lat:
            raise HTTPException(status_code=400, detail="min_lat must be less than max_lat")
        if min_lng >= max_lng:
            raise HTTPException(status_code=400, detail="min_lng must be less than max_lng")

        clusters, total_count = PropertyService.get_clustered_properties(
            session=session,
            min_lat=min_lat,
            min_lng=min_lng,
            max_lat=max_lat,
            max_lng=max_lng,
            zoom_level=zoom_level,
        )

        # Convert to GeoJSON features
        features = []
        if zoom_level >= 14:
            # Individual points
            for point in clusters:
                if point["latitude"] and point["longitude"]:
                    features.append({
                        "type": "Feature",
                        "id": point["id"],
                        "geometry": {
                            "type": "Point",
                            "coordinates": [point["longitude"], point["latitude"]]
                        },
                        "properties": {k: v for k, v in point.items() if k not in ["latitude", "longitude", "id", "type"]},
                        "cluster": False,
                    })
        else:
            # Clusters
            for idx, cluster in enumerate(clusters):
                if cluster["centroid_latitude"] and cluster["centroid_longitude"]:
                    features.append({
                        "type": "Feature",
                        "id": f"cluster_{idx}",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [cluster["centroid_longitude"], cluster["centroid_latitude"]]
                        },
                        "properties": {k: v for k, v in cluster.items() if k not in ["centroid_latitude", "centroid_longitude", "type"]},
                        "cluster": True,
                    })

        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "zoom_level": zoom_level,
                "clustered": zoom_level < 14,
                "total_items": total_count,
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_clustered_properties: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/properties/search",
    response_model=dict,
    summary="Search properties",
    description="Full-text search for properties by address, postcode, or UPRN"
)
async def search_properties(
    q: str = Query(..., min_length=2, description="Search query string (address, postcode, or UPRN)"),
    limit: int = Query(20, ge=1, le=100, description="Maximum number of results"),
    session: Session = Depends(get_session)
):
    """
    Search properties with relevance scoring.

    Search matches against:
    - Address (full and partial)
    - Postcode (full and partial)
    - UPRN (Unique Property Reference Number)

    Results are ranked by relevance:
    - Exact postcode match: highest relevance
    - Address contains match
    - UPRN exact match
    - Postcode partial match
    - Address partial match

    Returns top 20 results with relevance scores.
    """
    try:
        if len(q) < 2:
            raise HTTPException(status_code=400, detail="Search query must be at least 2 characters")

        properties = PropertyService.search_properties(
            session=session,
            query=q,
            limit=limit,
        )

        # Convert to GeoJSON features
        features = []
        for prop in properties:
            if prop.get("latitude") and prop.get("longitude"):
                features.append({
                    "type": "Feature",
                    "id": prop["id"],
                    "geometry": {
                        "type": "Point",
                        "coordinates": [prop["longitude"], prop["latitude"]]
                    },
                    "properties": {k: v for k, v in prop.items() if k not in ["latitude", "longitude", "id"]},
                })

        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "query": q,
                "result_count": len(features),
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in search_properties: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================================================
# GENERIC ROUTES (after specific routes)
# ============================================================================


@router.get(
    "/properties",
    response_model=dict,
    summary="Get all properties",
    description="Returns all properties as GeoJSON FeatureCollection with optional filtering and pagination"
)
async def get_properties(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(500, ge=1, le=2000, description="Results per page (max 2000)"),
    epc_rating: Optional[str] = Query(None, description="Filter by EPC rating (A-G)"),
    property_type: Optional[str] = Query(None, description="Filter by property type"),
    bedrooms_min: Optional[int] = Query(None, ge=0, description="Minimum number of bedrooms"),
    bedrooms_max: Optional[int] = Query(None, ge=0, description="Maximum number of bedrooms"),
    year_built_min: Optional[int] = Query(None, ge=1800, description="Minimum year built"),
    year_built_max: Optional[int] = Query(None, description="Maximum year built"),
    heating_type: Optional[str] = Query(None, description="Filter by heating type"),
    postcode_prefix: Optional[str] = Query(None, description="Filter by postcode prefix"),
    session: Session = Depends(get_session)
):
    """
    Get all properties with optional filtering.

    Filter Parameters:
    - epc_rating: Energy Performance Certificate rating (A-G)
    - property_type: Type of property (house, flat, bungalow, etc.)
    - bedrooms_min/max: Filter by bedroom count range
    - year_built_min/max: Filter by construction year range
    - heating_type: Primary heating system (gas, electric, oil, renewable, etc.)
    - postcode_prefix: Filter by postcode prefix (e.g., "SW1" for London)

    Pagination:
    - page: Which page of results to return
    - page_size: Number of properties per page (default 500, max 2000)

    Returns:
    - type: FeatureCollection
    - features: Array of GeoJSON Feature objects
    - metadata: Total count and pagination info
    """
    try:
        # Validate filters
        if epc_rating and epc_rating.upper() not in ["A", "B", "C", "D", "E", "F", "G"]:
            raise HTTPException(status_code=400, detail="Invalid EPC rating")

        if bedrooms_min is not None and bedrooms_max is not None:
            if bedrooms_min > bedrooms_max:
                raise HTTPException(status_code=400, detail="bedrooms_min must be <= bedrooms_max")

        if year_built_min is not None and year_built_max is not None:
            if year_built_min > year_built_max:
                raise HTTPException(status_code=400, detail="year_built_min must be <= year_built_max")

        properties, total_count = PropertyService.get_properties(
            session=session,
            page=page,
            page_size=page_size,
            epc_rating=epc_rating,
            property_type=property_type,
            bedrooms_min=bedrooms_min,
            bedrooms_max=bedrooms_max,
            year_built_min=year_built_min,
            year_built_max=year_built_max,
            heating_type=heating_type,
            postcode_prefix=postcode_prefix,
        )

        # Convert to GeoJSON features
        features = []
        for prop in properties:
            if prop["latitude"] and prop["longitude"]:
                features.append({
                    "type": "Feature",
                    "id": prop["id"],
                    "geometry": {
                        "type": "Point",
                        "coordinates": [prop["longitude"], prop["latitude"]]
                    },
                    "properties": {k: v for k, v in prop.items() if k not in ["latitude", "longitude"]}
                })

        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
                "total_pages": (total_count + page_size - 1) // page_size,
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_properties: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/properties/{property_id}",
    response_model=dict,
    summary="Get single property",
    description="Returns a single property with all details as a GeoJSON Feature"
)
async def get_property(
    property_id: str = Path(..., description="Property ID"),
    session: Session = Depends(get_session)
):
    """
    Get a single property by ID.

    Returns a GeoJSON Feature with complete property details including:
    - Basic info: UPRN, address, postcode
    - Geographic: latitude, longitude
    - Energy: EPC rating
    - Physical: property type, bedrooms, year built
    - Condition: stock condition score, heating type, last inspection date

    Returns 404 if property not found.
    """
    try:
        # Reject non-UUID IDs (e.g. cluster_349 from map cluster clicks)
        import uuid as _uuid
        try:
            _uuid.UUID(property_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid property ID format")

        prop = PropertyService.get_property_by_id(session=session, property_id=property_id)

        if not prop:
            raise HTTPException(status_code=404, detail="Property not found")

        # Convert to GeoJSON feature
        if prop["latitude"] and prop["longitude"]:
            return {
                "type": "Feature",
                "id": prop["id"],
                "geometry": {
                    "type": "Point",
                    "coordinates": [prop["longitude"], prop["latitude"]]
                },
                "properties": {k: v for k, v in prop.items() if k not in ["latitude", "longitude"]}
            }
        else:
            return {
                "type": "Feature",
                "id": prop["id"],
                "geometry": None,
                "properties": {k: v for k, v in prop.items() if k not in ["latitude", "longitude"]}
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_property: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
