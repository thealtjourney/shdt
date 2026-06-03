"""
Open data layers API router for SHDT.

Provides endpoints for accessing geospatial data layers including:
- Flood risk zones (Environment Agency)
- Index of Multiple Deprivation (ONS)
- EPC energy performance heatmap

All endpoints return GeoJSON-compatible data for Leaflet visualization.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import logging

from services.layer_service import LayerService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["layers"])


@router.get(
    "/layers/flood-risk",
    response_model=dict,
    summary="Get flood risk zones",
    description="Returns Environment Agency flood zone data as WMS URL and zone information",
)
async def get_flood_risk(
    min_lat: float = Query(..., description="Minimum latitude (southernmost)"),
    min_lng: float = Query(..., description="Minimum longitude (westernmost)"),
    max_lat: float = Query(..., description="Maximum latitude (northernmost)"),
    max_lng: float = Query(..., description="Maximum longitude (easternmost)"),
):
    """
    Get flood risk zone data for a bounding box.

    Returns Environment Agency flood zone information including:
    - WMS URL for map tile layer
    - Zone 3: High probability (>3.3% annual)
    - Zone 2: Medium probability (1-3.3% annual)
    - Zone 1: Low probability (<1% annual)

    Each zone includes color scheme with appropriate opacity levels.

    Returns:
    - type: Layer information type
    - url: WMS service URL
    - layers: Named layers to request
    - zones: Array of zone descriptions with colors and opacity
    - attribution: Data source attribution
    """
    try:
        # Validate bbox
        LayerService.validate_bbox(min_lat, min_lng, max_lat, max_lng)

        layer_info = LayerService.get_flood_risk_wms_url()

        return {
            "type": "wms",
            "bbox": {
                "min_lat": min_lat,
                "min_lng": min_lng,
                "max_lat": max_lat,
                "max_lng": max_lng,
            },
            **layer_info,
            "timestamp": "2024-01-01T00:00:00Z",
        }

    except ValueError as e:
        logger.error(f"Validation error in flood_risk: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in get_flood_risk: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/layers/imd",
    response_model=dict,
    summary="Get IMD deprivation layer",
    description="Returns Index of Multiple Deprivation (IMD) data as GeoJSON LSOA polygons",
)
async def get_imd_layer(
    min_lat: float = Query(..., description="Minimum latitude (southernmost)"),
    min_lng: float = Query(..., description="Minimum longitude (westernmost)"),
    max_lat: float = Query(..., description="Maximum latitude (northernmost)"),
    max_lng: float = Query(..., description="Maximum longitude (easternmost)"),
):
    """
    Get Index of Multiple Deprivation (IMD) layer for a bounding box.

    Returns LSOA (Lower Super Output Areas) polygons with IMD decile classification.
    Each LSOA is colored on a diverging scale from red (most deprived, decile 1)
    to green (least deprived, decile 10).

    Query Parameters:
    - min_lat, min_lng, max_lat, max_lng: Bounding box coordinates

    Returns:
    - type: FeatureCollection
    - features: Array of GeoJSON Polygon features (LSOAs)
    - Each feature includes:
      - imd_decile: 1-10 (1 = most deprived)
      - imd_score: Derived score
      - imd_rank: National rank
    - colors: Array of 10 hex colors for deciles
    - opacity: Layer opacity (0.2 = 20%)
    - attribution: Data source attribution
    """
    try:
        # Validate bbox
        LayerService.validate_bbox(min_lat, min_lng, max_lat, max_lng)

        imd_data = LayerService.get_imd_layer(min_lat, min_lng, max_lat, max_lng)

        return imd_data

    except ValueError as e:
        logger.error(f"Validation error in IMD layer: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in get_imd_layer: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/layers/epc-heatmap",
    response_model=dict,
    summary="Get EPC energy performance heatmap",
    description="Returns grid of average EPC scores for heatmap visualization",
)
async def get_epc_heatmap(
    min_lat: float = Query(..., description="Minimum latitude (southernmost)"),
    min_lng: float = Query(..., description="Minimum longitude (westernmost)"),
    max_lat: float = Query(..., description="Maximum latitude (northernmost)"),
    max_lng: float = Query(..., description="Maximum longitude (easternmost)"),
    resolution: int = Query(10, ge=5, le=50, description="Grid resolution (cells per side)"),
):
    """
    Get EPC heatmap layer for a bounding box.

    Returns a grid of points with average EPC scores aggregated by location.
    Points are suitable for use with Leaflet.heat library for heatmap visualization.

    The heatmap uses a continuous color scale from blue (low energy performance, score ~1)
    through yellow to red (high energy performance, score ~100).

    Query Parameters:
    - min_lat, min_lng, max_lat, max_lng: Bounding box coordinates
    - resolution: Grid resolution, number of cells per side (5-50, default 10)

    Returns:
    - type: FeatureCollection
    - features: Array of GeoJSON Point features
    - Each feature includes:
      - epc_score: 1-100 (1 = poor, 100 = excellent)
      - intensity: Normalized score (0.0-1.0)
      - count: Number of properties in this grid cell
    - attribution: Data source attribution
    - metadata: Color scheme and score ranges
    """
    try:
        # Validate bbox
        LayerService.validate_bbox(min_lat, min_lng, max_lat, max_lng)

        # Validate resolution
        if resolution < 5 or resolution > 50:
            raise ValueError("Resolution must be between 5 and 50")

        epc_data = LayerService.get_epc_heatmap(
            min_lat, min_lng, max_lat, max_lng, resolution=resolution
        )

        return epc_data

    except ValueError as e:
        logger.error(f"Validation error in EPC heatmap: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error in get_epc_heatmap: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/layers/info",
    response_model=dict,
    summary="Get layers information",
    description="Returns metadata about available layers and data sources",
)
async def get_layers_info():
    """
    Get metadata about all available data layers.

    Returns information about supported layers including:
    - Layer names and descriptions
    - Data sources and attribution
    - Update frequency and data quality notes
    - API endpoint information

    Useful for UI components that need to display layer information or
    attribution requirements.

    Returns:
    - layers: Array of available layer metadata
    - Each layer includes: name, description, source, attribution, endpoint, update_frequency
    """
    try:
        layers_info = {
            "layers": [
                {
                    "id": "flood-risk",
                    "name": "Flood Risk Zones",
                    "description": "Environment Agency flood zone classifications",
                    "source": "Environment Agency",
                    "attribution": "Contains public sector information licensed under the Open Government Licence v3.0",
                    "endpoint": "/api/layers/flood-risk",
                    "update_frequency": "quarterly",
                    "data_quality": "High - authoritative source",
                    "zones": [
                        {
                            "name": "Zone 3",
                            "description": "High probability of flooding (>3.3% annual)",
                        },
                        {
                            "name": "Zone 2",
                            "description": "Medium probability of flooding (1-3.3% annual)",
                        },
                        {
                            "name": "Zone 1",
                            "description": "Low probability of flooding (<1% annual)",
                        },
                    ],
                },
                {
                    "id": "imd",
                    "name": "Index of Multiple Deprivation",
                    "description": "ONS deprivation index by Lower Super Output Area (LSOA)",
                    "source": "Office for National Statistics (ONS)",
                    "attribution": "Contains public sector information licensed under the Open Government Licence v3.0",
                    "endpoint": "/api/layers/imd",
                    "update_frequency": "annual",
                    "data_quality": "High - official government statistics",
                    "scale": "LSOA (Lower Super Output Area)",
                    "deciles": "1 (most deprived) to 10 (least deprived)",
                },
                {
                    "id": "epc-heatmap",
                    "name": "EPC Energy Performance Heatmap",
                    "description": "Average Energy Performance Certificate scores by location",
                    "source": "EPC Database (Domestic and Non-Domestic)",
                    "attribution": "Department for Energy Security & Net Zero",
                    "endpoint": "/api/layers/epc-heatmap",
                    "update_frequency": "monthly",
                    "data_quality": "Medium - based on voluntary/required registrations",
                    "scale": "Grid cells (configurable resolution)",
                    "score_range": "1 (poor) to 100 (excellent)",
                },
            ],
            "usage_notes": [
                "All layers support bounding box queries (min_lat, min_lng, max_lat, max_lng)",
                "Flood Risk returns WMS URL for tile-based visualization",
                "IMD returns GeoJSON polygons with decile classification (1-10)",
                "EPC Heatmap returns point grid suitable for Leaflet.heat library",
                "All data sources have open licenses - include attribution when using",
            ],
        }

        return layers_info

    except Exception as e:
        logger.error(f"Error in get_layers_info: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
