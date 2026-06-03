"""
Postcode Enrichment Provider

Provides geographic, administrative, and demographic data via postcodes.io API.
Uses batch lookups for efficiency.
"""

import logging
import requests
from typing import Dict, Any, List, Optional
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)


class PostcodeEnrichmentProvider:
    """Enrichment provider for postcode data."""

    provider_name = "postcodes_io"
    rate_limit = 5  # requests per second

    def __init__(self):
        """Initialize postcode provider."""
        self.base_url = "https://api.postcodes.io"
        self.session = requests.Session()
        self.last_request_time = 0
        self.batch_size = 100

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
        Enrich property with postcode data.

        Args:
            postcode: UK postcode
            lat: Expected latitude for verification
            lng: Expected longitude for verification
            **kwargs: Additional parameters

        Returns:
            Dictionary with postcode data
        """
        result = {
            "provider": self.provider_name,
            "success": False,
            "data": {},
            "coordinate_mismatch": False,
            "error": None
        }

        try:
            await self._rate_limit()

            postcode_data = await self._lookup_postcode(postcode)

            if not postcode_data:
                result["error"] = f"Postcode not found: {postcode}"
                return result

            # Verify coordinates if provided
            if lat is not None and lng is not None:
                latitude = postcode_data.get("latitude")
                longitude = postcode_data.get("longitude")

                if latitude and longitude:
                    lat_diff = abs(latitude - lat)
                    lng_diff = abs(longitude - lng)

                    if lat_diff > 0.01 or lng_diff > 0.01:
                        result["coordinate_mismatch"] = True
                        logger.warning(
                            f"Coordinate mismatch for {postcode}: "
                            f"expected ({lat}, {lng}), got ({latitude}, {longitude})"
                        )

            result["success"] = True
            result["data"] = self._extract_postcode_fields(postcode_data)

        except Exception as e:
            logger.exception(f"Postcode enrichment error for {postcode}: {str(e)}")
            result["error"] = str(e)

        return result

    async def enrich_batch(
        self,
        postcodes: List[str]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Enrich multiple properties with postcode data using batch API.

        Args:
            postcodes: List of UK postcodes

        Returns:
            Dictionary mapping postcodes to enrichment results
        """
        results = {}

        # Process in batches of 100
        for i in range(0, len(postcodes), self.batch_size):
            batch = postcodes[i:i + self.batch_size]

            try:
                await self._rate_limit()

                batch_results = await self._lookup_postcodes_batch(batch)

                for postcode, data in batch_results.items():
                    if data:
                        results[postcode] = {
                            "success": True,
                            "data": self._extract_postcode_fields(data)
                        }
                    else:
                        results[postcode] = {
                            "success": False,
                            "error": f"Postcode not found: {postcode}"
                        }

            except Exception as e:
                logger.exception(f"Batch postcode lookup failed: {str(e)}")
                for postcode in batch:
                    results[postcode] = {
                        "success": False,
                        "error": str(e)
                    }

        return results

    async def _lookup_postcode(self, postcode: str) -> Optional[Dict[str, Any]]:
        """Lookup single postcode."""
        try:
            # Normalize postcode
            postcode = postcode.replace(" ", "").upper()

            response = self.session.get(
                f"{self.base_url}/postcodes/{postcode}",
                timeout=10
            )

            if response.status_code == 404:
                return None

            response.raise_for_status()

            data = response.json()
            return data.get("result")

        except requests.exceptions.RequestException as e:
            logger.debug(f"Postcode lookup failed for {postcode}: {str(e)}")
            return None

    async def _lookup_postcodes_batch(
        self,
        postcodes: List[str]
    ) -> Dict[str, Optional[Dict[str, Any]]]:
        """Lookup multiple postcodes in batch."""
        results = {}

        try:
            # Normalize postcodes
            normalized = [p.replace(" ", "").upper() for p in postcodes]

            payload = {"postcodes": normalized}

            response = self.session.post(
                f"{self.base_url}/postcodes",
                json=payload,
                timeout=30
            )
            response.raise_for_status()

            data = response.json()

            if data.get("result"):
                for item in data["result"]:
                    if item.get("result"):
                        postcode = item["query"]
                        results[postcode] = item["result"]
                    else:
                        results[item["query"]] = None

        except requests.exceptions.RequestException as e:
            logger.debug(f"Batch postcode lookup failed: {str(e)}")
            for postcode in postcodes:
                results[postcode] = None

        return results

    def _extract_postcode_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract all relevant postcode fields."""
        extracted = {
            "postcode": data.get("postcode"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "grid_reference": {
                "easting": data.get("easting"),
                "northing": data.get("northing")
            },
            "administrative": {
                "lsoa_code": data.get("codes", {}).get("lsoa"),
                "lsoa_name": data.get("lsoa"),
                "msoa_code": data.get("codes", {}).get("msoa"),
                "msoa_name": data.get("msoa"),
                "ward_code": data.get("codes", {}).get("ward"),
                "ward_name": data.get("ward"),
                "parish_code": data.get("codes", {}).get("parish"),
                "parish_name": data.get("parish"),
                "parliamentary_constituency_code": data.get("codes", {}).get("parliamentary_constituency"),
                "parliamentary_constituency_name": data.get("parliamentary_constituency"),
                "local_authority_code": data.get("codes", {}).get("local_authority"),
                "local_authority_name": data.get("local_authority"),
                "ccg_code": data.get("codes", {}).get("ccg"),
                "ccg_name": data.get("ccg"),
                "region": data.get("region"),
                "country": data.get("country")
            },
            "statistics": {
                "distance_to_nhs_gp": data.get("nhs_ha"),
                "police_force": data.get("police_force"),
                "police_force_code": data.get("codes", {}).get("police_force")
            },
            "quality": {
                "quality": data.get("quality"),
                "precision": data.get("nhs_ha")
            }
        }

        return extracted
