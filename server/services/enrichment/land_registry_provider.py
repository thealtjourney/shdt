"""
Land Registry Enrichment Provider

Provides property transaction history and valuation data.
Matches by PAON+Street+Postcode or fuzzy address matching.
Estimates current value using HPI adjustments.
"""

import logging
from typing import Dict, Any, Optional, List, Tuple
from difflib import SequenceMatcher
from datetime import datetime
import math

logger = logging.getLogger(__name__)


class LandRegistryEnrichmentProvider:
    """Enrichment provider for Land Registry data."""

    provider_name = "land_registry"
    rate_limit = None  # No API calls, no rate limiting needed

    def __init__(self, db_connection=None, hpi_data: Optional[Dict[str, float]] = None):
        """
        Initialize Land Registry provider.

        Args:
            db_connection: Database connection for Land Registry data
            hpi_data: House Price Index data for valuation adjustment
                     Format: {year_month: index_value}
        """
        self.db = db_connection
        self.hpi_data = hpi_data or {}

    async def enrich(
        self,
        paon: Optional[str] = None,
        street: Optional[str] = None,
        postcode: Optional[str] = None,
        address: Optional[str] = None,
        property_type: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Enrich property with Land Registry data.

        Args:
            paon: Primary Addressable Object Number
            street: Street name
            postcode: Postcode
            address: Full address for fuzzy matching
            property_type: Property type hint
            **kwargs: Additional parameters

        Returns:
            Dictionary with Land Registry data
        """
        result = {
            "provider": self.provider_name,
            "success": False,
            "data": {},
            "match_type": None,
            "error": None
        }

        if not self.db:
            result["error"] = "Database connection not available"
            return result

        try:
            lr_data = None

            # Try exact match first (PAON + Street + Postcode)
            if paon and street and postcode:
                lr_data = await self._lookup_exact(paon, street, postcode)
                if lr_data:
                    result["match_type"] = "exact"

            # Try fuzzy address match
            if not lr_data and address and postcode:
                lr_data = await self._lookup_fuzzy(address, postcode)
                if lr_data:
                    result["match_type"] = "fuzzy"

            # Try postcode only
            if not lr_data and postcode:
                lr_data = await self._lookup_by_postcode(postcode)
                if lr_data:
                    result["match_type"] = "postcode_only"

            if lr_data:
                # Estimate current value if we have sale history
                lr_data = self._estimate_current_value(lr_data)
                result["success"] = True
                result["data"] = lr_data
            else:
                result["error"] = "No Land Registry data found"

        except Exception as e:
            logger.exception(
                f"Land Registry enrichment error for {address or paon}: {str(e)}"
            )
            result["error"] = str(e)

        return result

    async def _lookup_exact(
        self,
        paon: str,
        street: str,
        postcode: str
    ) -> Optional[Dict[str, Any]]:
        """Exact match by PAON, Street, and Postcode."""
        try:
            # Query assumes pp_data table with structure:
            # - paon
            # - street_name
            # - postcode
            # - price
            # - transaction_date
            # - property_type
            # - tenure_type

            query = """
                SELECT
                    paon,
                    street_name,
                    postcode,
                    price,
                    transaction_date,
                    property_type,
                    tenure_type
                FROM pp_data
                WHERE paon = %s
                    AND LOWER(street_name) = LOWER(%s)
                    AND postcode = %s
                ORDER BY transaction_date DESC
                LIMIT 100
            """

            results = self.db.execute_all(query, (paon, street, postcode))

            if results:
                return self._process_land_registry_data(results)

        except Exception as e:
            logger.debug(f"Exact match lookup failed: {str(e)}")

        return None

    async def _lookup_fuzzy(
        self,
        address: str,
        postcode: str,
        threshold: float = 0.85
    ) -> Optional[Dict[str, Any]]:
        """Fuzzy match by address within postcode."""
        try:
            query = """
                SELECT
                    paon,
                    street_name,
                    postcode,
                    price,
                    transaction_date,
                    property_type,
                    tenure_type,
                    concatenate(paon, ' ', street_name) as full_address
                FROM pp_data
                WHERE postcode = %s
                ORDER BY transaction_date DESC
                LIMIT 50
            """

            results = self.db.execute_all(query, (postcode,))

            if not results:
                return None

            # Fuzzy match addresses
            best_match = None
            best_score = 0
            best_results = []

            for record in results:
                api_address = record.get("full_address", "")
                matched, score = self._fuzzy_match_address(address, api_address, threshold)

                if matched and score > best_score:
                    best_match = record
                    best_score = score

            # If we have a best match, collect all transactions for that property
            if best_match:
                query = """
                    SELECT
                        paon,
                        street_name,
                        postcode,
                        price,
                        transaction_date,
                        property_type,
                        tenure_type
                    FROM pp_data
                    WHERE paon = %s
                        AND postcode = %s
                    ORDER BY transaction_date DESC
                """

                best_results = self.db.execute_all(
                    query,
                    (best_match["paon"], postcode)
                )

                if best_results:
                    return self._process_land_registry_data(best_results)

        except Exception as e:
            logger.debug(f"Fuzzy match lookup failed: {str(e)}")

        return None

    async def _lookup_by_postcode(
        self,
        postcode: str
    ) -> Optional[Dict[str, Any]]:
        """Lookup by postcode - returns most recent transaction."""
        try:
            query = """
                SELECT
                    paon,
                    street_name,
                    postcode,
                    price,
                    transaction_date,
                    property_type,
                    tenure_type
                FROM pp_data
                WHERE postcode = %s
                ORDER BY transaction_date DESC
                LIMIT 1
            """

            result = self.db.execute(query, (postcode,))

            if result:
                return self._process_land_registry_data([result])

        except Exception as e:
            logger.debug(f"Postcode lookup failed for {postcode}: {str(e)}")

        return None

    def _fuzzy_match_address(
        self,
        search_address: str,
        api_address: str,
        threshold: float = 0.85
    ) -> Tuple[bool, float]:
        """Perform fuzzy matching between addresses."""
        ratio = SequenceMatcher(
            None,
            search_address.lower(),
            api_address.lower()
        ).ratio()
        return ratio >= threshold, ratio

    def _process_land_registry_data(
        self,
        records: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Process and structure Land Registry data."""
        if not records:
            return {}

        most_recent = records[0]

        # Build price history
        price_history = []
        for record in records:
            price_history.append({
                "price": record.get("price"),
                "transaction_date": record.get("transaction_date"),
                "property_type": record.get("property_type"),
                "tenure_type": record.get("tenure_type")
            })

        return {
            "paon": most_recent.get("paon"),
            "street": most_recent.get("street_name"),
            "postcode": most_recent.get("postcode"),
            "property_type": most_recent.get("property_type"),
            "tenure_type": most_recent.get("tenure_type"),
            "last_sale": {
                "price": most_recent.get("price"),
                "date": most_recent.get("transaction_date")
            },
            "price_history": price_history,
            "price_history_count": len(price_history),
            "estimated_current_value": None,  # Will be set in _estimate_current_value
            "price_change_pct": self._calculate_price_change(price_history)
        }

    def _calculate_price_change(
        self,
        price_history: List[Dict[str, Any]]
    ) -> Optional[float]:
        """Calculate percentage price change from oldest to most recent sale."""
        if len(price_history) < 2:
            return None

        oldest = price_history[-1]["price"]
        newest = price_history[0]["price"]

        if oldest and newest:
            return round(((newest - oldest) / oldest) * 100, 2)

        return None

    def _estimate_current_value(
        self,
        lr_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Estimate current value using HPI adjustment."""
        try:
            if not lr_data.get("last_sale") or not lr_data["last_sale"].get("price"):
                return lr_data

            last_sale_price = lr_data["last_sale"]["price"]
            last_sale_date = lr_data["last_sale"]["date"]

            if not last_sale_date or not self.hpi_data:
                return lr_data

            # Get HPI at sale date
            try:
                sale_year_month = str(last_sale_date)[:7]  # YYYY-MM format
                sale_hpi = self.hpi_data.get(sale_year_month)

                if not sale_hpi:
                    return lr_data

                # Get current HPI (most recent)
                current_hpi = self.hpi_data.get(
                    max(self.hpi_data.keys())  # Most recent date
                )

                if current_hpi:
                    # Calculate estimated current value
                    estimated = last_sale_price * (current_hpi / sale_hpi)
                    lr_data["estimated_current_value"] = round(estimated, 2)
                    lr_data["hpi_adjustment_factor"] = round(current_hpi / sale_hpi, 4)

            except Exception as e:
                logger.debug(f"HPI adjustment failed: {str(e)}")

        except Exception as e:
            logger.debug(f"Valuation estimation failed: {str(e)}")

        return lr_data

    def set_hpi_data(self, hpi_data: Dict[str, float]) -> None:
        """
        Set House Price Index data for valuation adjustments.

        Args:
            hpi_data: Dictionary mapping year_month (YYYY-MM) to HPI value
        """
        self.hpi_data = hpi_data
        logger.info(f"HPI data updated with {len(hpi_data)} data points")

    async def get_transaction_history(
        self,
        postcode: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get transaction history for all properties in postcode."""
        if not self.db:
            return []

        try:
            query = """
                SELECT
                    paon,
                    street_name,
                    postcode,
                    price,
                    transaction_date,
                    property_type,
                    tenure_type
                FROM pp_data
                WHERE postcode = %s
                ORDER BY transaction_date DESC
                LIMIT %s
            """

            results = self.db.execute_all(query, (postcode, limit))
            return results or []

        except Exception as e:
            logger.debug(f"Transaction history lookup failed: {str(e)}")
            return []
