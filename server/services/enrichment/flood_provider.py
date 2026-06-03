"""
Flood Risk Enrichment Provider

Provides flood risk data from local flood_risk_postcodes table
and live flood warnings from EA API.
"""

import logging
import requests
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import asyncio

logger = logging.getLogger(__name__)


class FloodRiskEnrichmentProvider:
    """Enrichment provider for flood risk data."""

    provider_name = "flood_risk"
    rate_limit = 3  # requests per second

    def __init__(self, db_connection=None):
        """
        Initialize flood risk provider.

        Args:
            db_connection: Database connection for flood_risk_postcodes lookup
        """
        self.db = db_connection
        self.ea_base_url = "https://environment.data.gov.uk/flood-monitoring"
        self.session = requests.Session()
        self.last_request_time = 0

    async def _rate_limit(self) -> None:
        """Enforce rate limiting."""
        import time
        elapsed = time.time() - self.last_request_time
        min_interval = 1.0 / self.rate_limit
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self.last_request_time = time.time()

    async def enrich(
        self,
        postcode: str,
        lat: Optional[float] = None,
        lng: Optional[float] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Enrich property with flood risk data.

        Args:
            postcode: UK postcode
            lat: Latitude for secondary lookup
            lng: Longitude for secondary lookup
            **kwargs: Additional parameters

        Returns:
            Dictionary with flood risk data
        """
        result = {
            "provider": self.provider_name,
            "success": False,
            "data": {},
            "error": None
        }

        try:
            flood_data = {}

            # Primary: Lookup by postcode
            if postcode:
                postcode_data = await self._lookup_by_postcode(postcode)
                if postcode_data:
                    flood_data.update(postcode_data)

            # Secondary: Lookup active flood warnings by location
            if lat is not None and lng is not None:
                warnings = await self._get_flood_warnings(lat, lng)
                if warnings:
                    flood_data["active_flood_warnings"] = warnings
                    flood_data["nearest_flood_warning"] = warnings[0] if warnings else None

            if flood_data:
                result["success"] = True
                result["data"] = flood_data
            else:
                result["error"] = "No flood risk data found"

        except Exception as e:
            logger.exception(f"Flood risk enrichment error for {postcode}: {str(e)}")
            result["error"] = str(e)

        return result

    async def _lookup_by_postcode(self, postcode: str) -> Optional[Dict[str, Any]]:
        """
        Lookup flood risk from flood_risk_postcodes table.

        Requires database connection with flood_risk_postcodes table.
        """
        if not self.db:
            logger.warning("Database connection not available for flood risk lookup")
            return None

        try:
            # Normalize postcode
            postcode = postcode.replace(" ", "").upper()

            # Query flood_risk_postcodes table
            # Assumes table structure:
            # - postcode
            # - flood_risk_rivers_seas (1-4)
            # - flood_risk_surface_water (1-4)
            # - flood_zone (1-3)

            query = """
                SELECT
                    flood_risk_rivers_seas,
                    flood_risk_surface_water,
                    flood_zone
                FROM flood_risk_postcodes
                WHERE postcode = %s
                LIMIT 1
            """

            # This is pseudocode - implement based on actual DB
            result = self.db.execute(query, (postcode,))

            if result:
                return {
                    "flood_risk_rivers_seas": result.get("flood_risk_rivers_seas"),
                    "flood_risk_surface_water": result.get("flood_risk_surface_water"),
                    "flood_zone": result.get("flood_zone")
                }

        except Exception as e:
            logger.debug(f"Flood risk postcode lookup failed for {postcode}: {str(e)}")

        return None

    async def _get_flood_warnings(
        self,
        lat: float,
        lng: float,
        radius_km: float = 5.0
    ) -> List[Dict[str, Any]]:
        """
        Get active flood warnings near coordinates from EA API.

        Args:
            lat: Latitude
            lng: Longitude
            radius_km: Search radius in kilometers

        Returns:
            List of nearby flood warnings
        """
        try:
            await self._rate_limit()

            # Query EA flood monitoring API for active warnings
            # Using bounding box rather than point search
            lat_margin = radius_km / 111.0  # 1 degree latitude ≈ 111 km
            lng_margin = radius_km / (111.0 * abs(__import__('math').cos(__import__('math').radians(lat))))

            params = {
                "min-lat": lat - lat_margin,
                "max-lat": lat + lat_margin,
                "min-lng": lng - lng_margin,
                "max-lng": lng + lng_margin,
                "parameter": "Flood",
                "_properties": "all"
            }

            response = self.session.get(
                f"{self.ea_base_url}/data/Flood",
                params=params,
                timeout=10
            )
            response.raise_for_status()

            data = response.json()
            warnings = []

            if data.get("items"):
                for item in data["items"]:
                    # Filter for active warnings
                    if item.get("status") in ["Alert", "Warning"]:
                        warnings.append({
                            "id": item.get("id"),
                            "label": item.get("label"),
                            "description": item.get("description"),
                            "status": item.get("status"),
                            "severity": item.get("severity"),
                            "latitude": item.get("lat"),
                            "longitude": item.get("long"),
                            "area": item.get("area"),
                            "updated_at": item.get("dateTime")
                        })

            # Sort by distance
            warnings.sort(
                key=lambda w: (
                    (w["latitude"] - lat) ** 2 + (w["longitude"] - lng) ** 2
                ) ** 0.5
            )

            return warnings

        except requests.exceptions.RequestException as e:
            logger.debug(f"Flood warnings lookup failed for ({lat}, {lng}): {str(e)}")
            return []

    async def get_flood_warning_areas(self) -> List[Dict[str, Any]]:
        """Get list of all flood warning areas."""
        try:
            await self._rate_limit()

            response = self.session.get(
                f"{self.ea_base_url}/data/Flood",
                params={"_properties": "all"},
                timeout=10
            )
            response.raise_for_status()

            data = response.json()
            areas = []

            if data.get("items"):
                for item in data["items"]:
                    areas.append({
                        "id": item.get("id"),
                        "label": item.get("label"),
                        "description": item.get("description"),
                        "area": item.get("area"),
                        "latitude": item.get("lat"),
                        "longitude": item.get("long")
                    })

            return areas

        except requests.exceptions.RequestException as e:
            logger.debug(f"Flood warning areas lookup failed: {str(e)}")
            return []
