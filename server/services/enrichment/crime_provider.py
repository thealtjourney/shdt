"""
Crime Risk Enrichment Provider

Provides crime statistics from UK Police API.
Uses coordinate grouping to avoid duplicate API calls.
"""

import logging
import requests
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from collections import defaultdict
import asyncio

logger = logging.getLogger(__name__)


class CrimeEnrichmentProvider:
    """Enrichment provider for crime risk data."""

    provider_name = "police_uk"
    rate_limit = 2  # requests per second

    def __init__(self):
        """Initialize crime provider."""
        self.base_url = "https://data.police.uk/api/crimes-street/all-crime"
        self.session = requests.Session()
        self.last_request_time = 0
        self.crime_cache = {}  # Cache crime data by rounded coordinates
        self.national_avg_crime_rate = 10  # Baseline for score normalization

    async def _rate_limit(self) -> None:
        """Enforce rate limiting."""
        import time
        elapsed = time.time() - self.last_request_time
        min_interval = 1.0 / self.rate_limit
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self.last_request_time = time.time()

    def _round_coordinates(
        self,
        lat: float,
        lng: float,
        precision: int = 3
    ) -> Tuple[float, float]:
        """
        Round coordinates to reduce duplicate API calls.

        Args:
            lat: Latitude
            lng: Longitude
            precision: Decimal places to round to

        Returns:
            Tuple of (rounded_lat, rounded_lng)
        """
        multiplier = 10 ** precision
        return (
            round(lat * multiplier) / multiplier,
            round(lng * multiplier) / multiplier
        )

    async def enrich(
        self,
        lat: float,
        lng: float,
        postcode: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Enrich property with crime risk data.

        Args:
            lat: Latitude
            lng: Longitude
            postcode: Postcode (optional)
            **kwargs: Additional parameters

        Returns:
            Dictionary with crime data and risk score
        """
        result = {
            "provider": self.provider_name,
            "success": False,
            "data": {},
            "error": None
        }

        try:
            # Get crime data for location
            crime_data = await self._get_crimes(lat, lng)

            if crime_data:
                result["success"] = True
                result["data"] = crime_data
            else:
                result["error"] = "No crime data available for location"

        except Exception as e:
            logger.exception(
                f"Crime enrichment error for ({lat}, {lng}): {str(e)}"
            )
            result["error"] = str(e)

        return result

    async def _get_crimes(
        self,
        lat: float,
        lng: float,
        months_back: int = 3
    ) -> Optional[Dict[str, Any]]:
        """
        Get crime data for coordinates.

        Args:
            lat: Latitude
            lng: Longitude
            months_back: Number of months to fetch (max 3)

        Returns:
            Dictionary with crime statistics or None
        """
        try:
            # Round coordinates for caching
            rounded_lat, rounded_lng = self._round_coordinates(lat, lng)
            cache_key = f"{rounded_lat},{rounded_lng}"

            # Check cache
            if cache_key in self.crime_cache:
                return self.crime_cache[cache_key]

            await self._rate_limit()

            # Get current date and format for API (YYYY-MM)
            now = datetime.now()
            date_str = now.strftime("%Y-%m")

            params = {
                "lat": lat,
                "lng": lng,
                "date": date_str
            }

            response = self.session.get(
                self.base_url,
                params=params,
                timeout=10
            )
            response.raise_for_status()

            crimes = response.json()

            if not crimes:
                return None

            # Process crimes
            result = self._process_crimes(crimes, lat, lng)

            # Cache result
            self.crime_cache[cache_key] = result

            return result

        except requests.exceptions.RequestException as e:
            logger.debug(f"Crime lookup failed for ({lat}, {lng}): {str(e)}")
            return None

    def _process_crimes(
        self,
        crimes: List[Dict[str, Any]],
        lat: float,
        lng: float
    ) -> Dict[str, Any]:
        """
        Process and aggregate crime data.

        Args:
            crimes: List of crime records from API
            lat: Property latitude
            lng: Property longitude

        Returns:
            Processed crime statistics
        """
        crime_counts = defaultdict(int)
        total_crimes = 0

        for crime in crimes:
            crime_type = crime.get("category", "other-crime")
            crime_counts[crime_type] += 1
            total_crimes += 1

        # Calculate crime risk score (1-10)
        # Normalize against national average
        crime_rate = total_crimes / max(1, len(set(
            c.get("location") for c in crimes
        )))

        risk_score = min(10, max(1, (crime_rate / self.national_avg_crime_rate) * 5))

        # Top crime types
        top_crimes = sorted(
            crime_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )[:5]

        return {
            "total_crimes_3m": total_crimes,
            "crime_risk_score": round(risk_score, 2),
            "crime_rate_per_location": round(crime_rate, 2),
            "crime_breakdown": {
                crime_type: count
                for crime_type, count in top_crimes
            },
            "all_crime_types": dict(crime_counts),
            "month_analyzed": datetime.now().strftime("%Y-%m"),
            "latitude": lat,
            "longitude": lng
        }

    async def get_crime_categories(self) -> List[str]:
        """Get list of all available crime categories."""
        try:
            await self._rate_limit()

            response = self.session.get(
                "https://data.police.uk/api/crime-categories",
                timeout=10
            )
            response.raise_for_status()

            data = response.json()
            return [item.get("url") for item in data]

        except requests.exceptions.RequestException as e:
            logger.debug(f"Crime categories lookup failed: {str(e)}")
            return []

    def clear_cache(self) -> None:
        """Clear coordinate cache."""
        self.crime_cache.clear()
        logger.info("Crime data cache cleared")

    def set_national_avg(self, avg_rate: float) -> None:
        """
        Set the national average crime rate for scoring.

        Args:
            avg_rate: National average crime rate
        """
        self.national_avg_crime_rate = avg_rate
