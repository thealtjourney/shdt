"""
Layer service for open data integration (flood risk, IMD, EPC heatmap).

Provides methods for fetching and processing geospatial layer data from
open data sources including Environment Agency flood zones, Index of Multiple
Deprivation (IMD), and Energy Performance Certificate (EPC) data.
"""

from typing import Optional, List, Dict, Any, Tuple
import logging
import math
from datetime import datetime

logger = logging.getLogger(__name__)


class LayerService:
    """Service for handling geospatial data layers."""

    # Flood zone color mappings
    FLOOD_ZONE_COLORS = {
        "Zone 3": {"color": "#FF0000", "opacity": 0.30},  # Red, 30% opacity
        "Zone 2": {"color": "#FFA500", "opacity": 0.25},  # Orange, 25% opacity
        "Zone 1": {"color": "#FFFF00", "opacity": 0.20},  # Yellow, 20% opacity
    }

    # IMD decile colors (red for deprived, green for affluent)
    IMD_COLORS = [
        "#67001f",  # Decile 1 (most deprived) - dark red
        "#b2182b",  # Decile 2
        "#d6604d",  # Decile 3
        "#f4a582",  # Decile 4
        "#fddfc7",  # Decile 5
        "#d1e5f0",  # Decile 6
        "#92c5de",  # Decile 7
        "#4393c3",  # Decile 8
        "#2166ac",  # Decile 9
        "#053061",  # Decile 10 (least deprived) - dark blue/green
    ]

    @staticmethod
    def get_flood_risk_wms_url() -> Dict[str, Any]:
        """
        Get WMS URL for Environment Agency flood zone data.

        Returns GeoJSON-compatible layer info with WMS URL for Leaflet.
        Using EA's WFS service for flood risk zones.

        Returns:
            Dictionary with WMS configuration for Leaflet
        """
        try:
            # Environment Agency WFS service for flood zones
            wms_url = "https://maps.environment-agency.gov.uk/arcgis/services/flood/FloodRisk/MapServer/WMSServer"

            layer_info = {
                "type": "wms",
                "url": wms_url,
                "layers": "Flood Zone 3,Flood Zone 2,Flood Zone 1",
                "styles": "",
                "format": "image/png",
                "transparent": True,
                "attribution": "Environment Agency",
                "description": "Flood risk zones from Environment Agency",
                "zones": [
                    {
                        "name": "Zone 3",
                        "description": "High probability of flooding (>3.3% annual probability)",
                        "color": LayerService.FLOOD_ZONE_COLORS["Zone 3"]["color"],
                        "opacity": LayerService.FLOOD_ZONE_COLORS["Zone 3"]["opacity"],
                    },
                    {
                        "name": "Zone 2",
                        "description": "Medium probability of flooding (1-3.3% annual probability)",
                        "color": LayerService.FLOOD_ZONE_COLORS["Zone 2"]["color"],
                        "opacity": LayerService.FLOOD_ZONE_COLORS["Zone 2"]["opacity"],
                    },
                    {
                        "name": "Zone 1",
                        "description": "Low probability of flooding (<1% annual probability)",
                        "color": LayerService.FLOOD_ZONE_COLORS["Zone 1"]["color"],
                        "opacity": LayerService.FLOOD_ZONE_COLORS["Zone 1"]["opacity"],
                    },
                ],
            }
            return layer_info
        except Exception as e:
            logger.error(f"Error getting flood risk WMS URL: {e}")
            raise

    @staticmethod
    def get_imd_layer(
        min_lat: float,
        min_lng: float,
        max_lat: float,
        max_lng: float,
    ) -> Dict[str, Any]:
        """
        Get IMD (Index of Multiple Deprivation) layer data for a bounding box.

        Returns mock LSOA polygons with IMD deciles as GeoJSON.
        In production, this would query a database or WFS service with real ONS data.

        Args:
            min_lat: Minimum latitude
            min_lng: Minimum longitude
            max_lat: Maximum latitude
            max_lng: Maximum longitude

        Returns:
            GeoJSON FeatureCollection with LSOA polygons and IMD deciles
        """
        try:
            # Mock IMD data generation for demo purposes
            # In production, this would query ONS IMD datasets
            features = []

            # Create a grid of LSOA-like polygons in the bbox
            lat_step = (max_lat - min_lat) / 4
            lng_step = (max_lng - min_lng) / 4

            lsoa_id = 0
            for i in range(4):
                for j in range(4):
                    lsoa_id += 1
                    lat_min = min_lat + i * lat_step
                    lat_max = min_lat + (i + 1) * lat_step
                    lng_min = min_lng + j * lng_step
                    lng_max = min_lng + (j + 1) * lng_step

                    # Assign IMD decile (1-10, where 1 is most deprived)
                    decile = ((i + j) % 10) + 1

                    # Create polygon coordinates (clockwise from SW)
                    coordinates = [[
                        [lng_min, lat_min],
                        [lng_max, lat_min],
                        [lng_max, lat_max],
                        [lng_min, lat_max],
                        [lng_min, lat_min],
                    ]]

                    feature = {
                        "type": "Feature",
                        "id": f"LSOA{lsoa_id:04d}",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": coordinates,
                        },
                        "properties": {
                            "lsoa_code": f"E01000{lsoa_id:03d}",
                            "lsoa_name": f"LSOA {lsoa_id}",
                            "imd_decile": decile,
                            "imd_score": round(100 - (decile * 10), 2),
                            "imd_rank": (11 - decile) * 1000 + (i * j % 100),
                        },
                    }
                    features.append(feature)

            return {
                "type": "FeatureCollection",
                "features": features,
                "attribution": "ONS (Office for National Statistics)",
                "description": "Index of Multiple Deprivation by LSOA",
                "colors": LayerService.IMD_COLORS,
                "opacity": 0.20,
                "legend": {
                    "title": "IMD Decile",
                    "description": "1 = Most deprived, 10 = Least deprived",
                    "deciles": [
                        {"decile": i, "color": LayerService.IMD_COLORS[i - 1]}
                        for i in range(1, 11)
                    ],
                },
            }
        except Exception as e:
            logger.error(f"Error getting IMD layer: {e}")
            raise

    @staticmethod
    def get_epc_heatmap(
        min_lat: float,
        min_lng: float,
        max_lat: float,
        max_lng: float,
        resolution: int = 10,
    ) -> Dict[str, Any]:
        """
        Get EPC heatmap data - grid of average EPC scores for heatmap visualization.

        Returns a grid of points with average EPC ratings/scores for the bbox.
        In production, this would query actual property EPC data from database.

        Args:
            min_lat: Minimum latitude
            min_lng: Minimum longitude
            max_lat: Maximum latitude
            max_lng: Maximum longitude
            resolution: Grid resolution (default 10x10 cells)

        Returns:
            GeoJSON FeatureCollection with heatmap points
        """
        try:
            features = []

            # Create grid of heatmap points
            lat_step = (max_lat - min_lat) / resolution
            lng_step = (max_lng - min_lng) / resolution

            # EPC ratings to numeric scores
            epc_scores = {
                "A": 92,
                "B": 81,
                "C": 69,
                "D": 55,
                "E": 39,
                "F": 21,
                "G": 1,
            }

            for i in range(resolution):
                for j in range(resolution):
                    # Calculate center of cell
                    lat = min_lat + (i + 0.5) * lat_step
                    lng = min_lng + (j + 0.5) * lng_step

                    # Generate mock average EPC score based on location
                    # In production, this would aggregate actual property data
                    base_score = 50 + ((i + j) % 40)
                    score = max(1, min(100, base_score + (hash(f"{i}{j}") % 30)))

                    feature = {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [lng, lat],
                        },
                        "properties": {
                            "epc_score": score,
                            "intensity": score / 100.0,
                            "count": 50 + (hash(f"{i}{j}") % 200),
                        },
                    }
                    features.append(feature)

            return {
                "type": "FeatureCollection",
                "features": features,
                "attribution": "EPC Data (Non-Domestic and Domestic Energy Performance Certificates)",
                "description": "Average EPC scores heatmap",
                "metadata": {
                    "resolution": resolution,
                    "min_score": 1,
                    "max_score": 100,
                    "score_colors": {
                        "min": "#0000FF",  # Blue (cold/poor)
                        "mid": "#FFFF00",  # Yellow
                        "max": "#FF0000",  # Red (hot/good)
                    },
                },
            }
        except Exception as e:
            logger.error(f"Error getting EPC heatmap: {e}")
            raise

    @staticmethod
    def validate_bbox(
        min_lat: float,
        min_lng: float,
        max_lat: float,
        max_lng: float,
    ) -> bool:
        """
        Validate bounding box coordinates.

        Args:
            min_lat: Minimum latitude
            min_lng: Minimum longitude
            max_lat: Maximum latitude
            max_lng: Maximum longitude

        Returns:
            True if valid, raises exception otherwise
        """
        if min_lat >= max_lat:
            raise ValueError("min_lat must be less than max_lat")
        if min_lng >= max_lng:
            raise ValueError("min_lng must be less than max_lng")
        if not (-90 <= min_lat <= 90 and -90 <= max_lat <= 90):
            raise ValueError("Latitude must be between -90 and 90")
        if not (-180 <= min_lng <= 180 and -180 <= max_lng <= 180):
            raise ValueError("Longitude must be between -180 and 180")
        return True
