"""
EPC (Energy Performance Certificate) Enrichment Provider

Provides energy efficiency ratings and recommendations for properties.
Lookups via UPRN first, then postcode+address fuzzy matching.
"""

import logging
import base64
import requests
from typing import Dict, Any, List, Optional, Tuple
from difflib import SequenceMatcher
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)


class EPCEnrichmentProvider:
    """Enrichment provider for Energy Performance Certificates."""

    provider_name = "epc"
    rate_limit = 2  # requests per second

    def __init__(self, api_key: str, email: str):
        """
        Initialize EPC provider.

        Args:
            api_key: EPC API key
            email: Email address for basic auth
        """
        self.api_key = api_key
        self.email = email
        self.base_url = "https://epc.opendatacommunities.org/api/v1/domestic/search"
        self.session = requests.Session()
        self._setup_auth()
        self.last_request_time = 0

    def _setup_auth(self) -> None:
        """Setup basic authentication headers."""
        credentials = f"{self.email}:{self.api_key}"
        encoded = base64.b64encode(credentials.encode()).decode()
        self.session.headers.update({"Authorization": f"Basic {encoded}"})

    async def _rate_limit(self) -> None:
        """Enforce rate limiting."""
        import time
        elapsed = time.time() - self.last_request_time
        min_interval = 1.0 / self.rate_limit
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self.last_request_time = time.time()

    def _fuzzy_match_address(
        self,
        search_address: str,
        api_address: str,
        threshold: float = 0.85
    ) -> Tuple[bool, float]:
        """
        Perform fuzzy matching between addresses.

        Args:
            search_address: Original search address
            api_address: Address from API response
            threshold: Match confidence threshold (0-1)

        Returns:
            Tuple of (matched, confidence_score)
        """
        ratio = SequenceMatcher(None, search_address.lower(), api_address.lower()).ratio()
        return ratio >= threshold, ratio

    async def enrich(
        self,
        uprn: Optional[str] = None,
        postcode: Optional[str] = None,
        address: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Enrich property with EPC data.

        Args:
            uprn: Unique Property Reference Number
            postcode: Postcode
            address: Full address for fuzzy matching
            **kwargs: Additional parameters

        Returns:
            Dictionary with EPC data and match confidence
        """
        result = {
            "provider": self.provider_name,
            "success": False,
            "data": {},
            "match_confidence": None,
            "error": None
        }

        try:
            await self._rate_limit()

            # Try UPRN lookup first
            if uprn:
                epc_data = await self._lookup_by_uprn(uprn)
                if epc_data:
                    result["success"] = True
                    result["match_confidence"] = "exact_uprn"
                    result["data"] = epc_data
                    return result

            # Try postcode + address fuzzy matching
            if postcode and address:
                epc_data = await self._lookup_by_postcode_address(
                    postcode, address
                )
                if epc_data:
                    result["success"] = True
                    result["data"] = epc_data
                    return result

            # Fallback to postcode only
            if postcode:
                epc_data = await self._lookup_by_postcode(postcode)
                if epc_data:
                    result["success"] = True
                    result["match_confidence"] = "postcode_only"
                    result["data"] = epc_data
                    return result

            result["error"] = "No EPC data found"

        except Exception as e:
            logger.exception(f"EPC enrichment error for UPRN {uprn}: {str(e)}")
            result["error"] = str(e)

        return result

    async def _lookup_by_uprn(self, uprn: str) -> Optional[Dict[str, Any]]:
        """Lookup EPC by UPRN."""
        try:
            params = {"uprn": uprn}
            response = self.session.get(
                self.base_url,
                params=params,
                timeout=10
            )
            response.raise_for_status()

            data = response.json()
            if data.get("rows") and len(data["rows"]) > 0:
                # Get most recent EPC
                epc = sorted(
                    data["rows"],
                    key=lambda x: x.get("inspection_date", ""),
                    reverse=True
                )[0]
                return self._extract_epc_fields(epc)

        except requests.exceptions.RequestException as e:
            logger.debug(f"EPC UPRN lookup failed for {uprn}: {str(e)}")

        return None

    async def _lookup_by_postcode_address(
        self,
        postcode: str,
        address: str
    ) -> Optional[Dict[str, Any]]:
        """Lookup EPC by postcode and fuzzy match address."""
        try:
            params = {"postcode": postcode}
            response = self.session.get(
                self.base_url,
                params=params,
                timeout=10
            )
            response.raise_for_status()

            data = response.json()
            if not data.get("rows"):
                return None

            # Fuzzy match addresses
            best_match = None
            best_score = 0

            for epc in data["rows"]:
                api_address = (
                    f"{epc.get('address1', '')} "
                    f"{epc.get('address2', '')} "
                    f"{epc.get('address3', '')}"
                ).strip()

                matched, score = self._fuzzy_match_address(address, api_address, 0.85)
                if matched and score > best_score:
                    best_match = epc
                    best_score = score

            if best_match:
                return self._extract_epc_fields(best_match)

        except requests.exceptions.RequestException as e:
            logger.debug(f"EPC postcode lookup failed for {postcode}: {str(e)}")

        return None

    async def _lookup_by_postcode(self, postcode: str) -> Optional[Dict[str, Any]]:
        """Lookup EPC by postcode only."""
        try:
            params = {"postcode": postcode}
            response = self.session.get(
                self.base_url,
                params=params,
                timeout=10
            )
            response.raise_for_status()

            data = response.json()
            if data.get("rows") and len(data["rows"]) > 0:
                # Get most recent EPC
                epc = sorted(
                    data["rows"],
                    key=lambda x: x.get("inspection_date", ""),
                    reverse=True
                )[0]
                return self._extract_epc_fields(epc)

        except requests.exceptions.RequestException as e:
            logger.debug(f"EPC postcode lookup failed for {postcode}: {str(e)}")

        return None

    def _extract_epc_fields(self, epc: Dict[str, Any]) -> Dict[str, Any]:
        """Extract all relevant EPC fields."""
        extracted = {
            "uprn": epc.get("uprn"),
            "rating": epc.get("energy_efficiency_rating"),
            "score": epc.get("energy_efficiency_score"),
            "potential_rating": epc.get("potential_energy_efficiency_rating"),
            "potential_score": epc.get("potential_energy_efficiency_score"),
            "inspection_date": epc.get("inspection_date"),
            "lodgement_date": epc.get("lodgement_date"),
            "expiry_date": epc.get("expiry_date"),
            "co2_emissions": epc.get("co2_emissions"),
            "co2_emissions_potential": epc.get("co2_emiss_potential"),
            "co2_intensity_current": epc.get("co2_emissions_current"),
            "co2_intensity_potential": epc.get("co2_intensity_potential"),
            "annual_heating_cost": epc.get("heating_cost"),
            "annual_heating_cost_potential": epc.get("heating_cost_potential"),
            "annual_hot_water_cost": epc.get("hot_water_cost"),
            "annual_hot_water_cost_potential": epc.get("hot_water_cost_potential"),
            "annual_lighting_cost": epc.get("lighting_cost"),
            "annual_lighting_cost_potential": epc.get("lighting_cost_potential"),
            "total_floor_area": epc.get("total_floor_area"),
            "building_reference_number": epc.get("building_reference_number"),
            "construction_age_band": epc.get("construction_age_band"),
            "main_fuel_type": epc.get("main_fuel_type"),
            "property_type": epc.get("property_type"),
            "building_elements": self._extract_building_elements(epc),
            "recommendations": self._extract_recommendations(epc),
            "address": {
                "address1": epc.get("address1"),
                "address2": epc.get("address2"),
                "address3": epc.get("address3"),
                "postcode": epc.get("postcode")
            }
        }

        return extracted

    def _extract_building_elements(self, epc: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract building elements (walls, roof, windows, etc.)."""
        elements = []

        # Map EPC fields to building element categories
        element_map = {
            "walls": epc.get("walls_description"),
            "roof": epc.get("roof_description"),
            "windows": epc.get("windows_description"),
            "main_heating": epc.get("main_heating_description"),
            "main_heating_controls": epc.get("main_heating_controls_description"),
            "secondary_heating": epc.get("secondary_heating_description"),
            "hot_water": epc.get("hot_water_description"),
            "lighting": epc.get("lighting_description"),
            "air_tightness": epc.get("air_tightness_description"),
            "glazed_area": epc.get("glazed_area"),
            "draught_stripping": epc.get("draught_stripping"),
            "insulation_thickness": epc.get("loft_insulation_thickness"),
            "cavity_wall_insulation": epc.get("cavity_wall_insulation")
        }

        for element_type, description in element_map.items():
            if description:
                elements.append({
                    "type": element_type,
                    "description": description
                })

        return elements

    def _extract_recommendations(self, epc: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract improvement recommendations."""
        recommendations = []

        # Standard recommendation fields in EPC API
        rec_fields = [f"improvement_number_{i}" for i in range(1, 7)]

        for field in rec_fields:
            rec_text = epc.get(field)
            if rec_text:
                recommendations.append({
                    "text": rec_text,
                    "typical_saving": epc.get(f"{field}_saving"),
                    "indicative_cost": epc.get(f"{field}_cost")
                })

        return recommendations
