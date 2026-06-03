"""
Index of Multiple Deprivation (IMD) Enrichment Provider

Provides deprivation indices at LSOA level from local database.
No API calls required - direct database join.
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class IMDEnrichmentProvider:
    """Enrichment provider for IMD data."""

    provider_name = "imd"
    rate_limit = None  # No API calls, no rate limiting needed

    def __init__(self, db_connection=None):
        """
        Initialize IMD provider.

        Args:
            db_connection: Database connection for IMD data lookup
        """
        self.db = db_connection

    async def enrich(
        self,
        lsoa_code: Optional[str] = None,
        lsoa_name: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Enrich property with IMD data.

        Args:
            lsoa_code: LSOA code
            lsoa_name: LSOA name (fallback)
            **kwargs: Additional parameters

        Returns:
            Dictionary with IMD deciles
        """
        result = {
            "provider": self.provider_name,
            "success": False,
            "data": {},
            "error": None
        }

        if not self.db:
            result["error"] = "Database connection not available"
            return result

        try:
            imd_data = None

            # Try LSOA code first
            if lsoa_code:
                imd_data = await self._lookup_by_code(lsoa_code)

            # Fall back to LSOA name
            if not imd_data and lsoa_name:
                imd_data = await self._lookup_by_name(lsoa_name)

            if imd_data:
                result["success"] = True
                result["data"] = imd_data
            else:
                result["error"] = f"IMD data not found for LSOA {lsoa_code or lsoa_name}"

        except Exception as e:
            logger.exception(
                f"IMD enrichment error for {lsoa_code or lsoa_name}: {str(e)}"
            )
            result["error"] = str(e)

        return result

    async def _lookup_by_code(self, lsoa_code: str) -> Optional[Dict[str, Any]]:
        """Lookup IMD data by LSOA code."""
        try:
            # Query structure assumes:
            # - imd_data table with columns:
            #   - lsoa_code
            #   - lsoa_name
            #   - imd_decile (overall)
            #   - income_deprivation_decile
            #   - employment_deprivation_decile
            #   - health_deprivation_decile
            #   - education_skills_decile
            #   - crime_decile
            #   - housing_services_decile
            #   - living_environment_decile

            query = """
                SELECT
                    lsoa_code,
                    lsoa_name,
                    imd_decile,
                    imd_rank,
                    imd_score,
                    income_deprivation_decile,
                    income_deprivation_rank,
                    income_deprivation_score,
                    employment_deprivation_decile,
                    employment_deprivation_rank,
                    employment_deprivation_score,
                    health_deprivation_decile,
                    health_deprivation_rank,
                    health_deprivation_score,
                    education_skills_decile,
                    education_skills_rank,
                    education_skills_score,
                    crime_decile,
                    crime_rank,
                    crime_score,
                    housing_services_decile,
                    housing_services_rank,
                    housing_services_score,
                    living_environment_decile,
                    living_environment_rank,
                    living_environment_score
                FROM imd_data
                WHERE lsoa_code = %s
                LIMIT 1
            """

            # This is pseudocode - implement based on actual DB
            result = self.db.execute(query, (lsoa_code,))

            if result:
                return self._extract_imd_fields(result)

        except Exception as e:
            logger.debug(f"IMD code lookup failed for {lsoa_code}: {str(e)}")

        return None

    async def _lookup_by_name(self, lsoa_name: str) -> Optional[Dict[str, Any]]:
        """Lookup IMD data by LSOA name."""
        try:
            query = """
                SELECT
                    lsoa_code,
                    lsoa_name,
                    imd_decile,
                    imd_rank,
                    imd_score,
                    income_deprivation_decile,
                    income_deprivation_rank,
                    income_deprivation_score,
                    employment_deprivation_decile,
                    employment_deprivation_rank,
                    employment_deprivation_score,
                    health_deprivation_decile,
                    health_deprivation_rank,
                    health_deprivation_score,
                    education_skills_decile,
                    education_skills_rank,
                    education_skills_score,
                    crime_decile,
                    crime_rank,
                    crime_score,
                    housing_services_decile,
                    housing_services_rank,
                    housing_services_score,
                    living_environment_decile,
                    living_environment_rank,
                    living_environment_score
                FROM imd_data
                WHERE lsoa_name = %s
                LIMIT 1
            """

            result = self.db.execute(query, (lsoa_name,))

            if result:
                return self._extract_imd_fields(result)

        except Exception as e:
            logger.debug(f"IMD name lookup failed for {lsoa_name}: {str(e)}")

        return None

    def _extract_imd_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract IMD fields from database result."""
        extracted = {
            "lsoa_code": data.get("lsoa_code"),
            "lsoa_name": data.get("lsoa_name"),
            "overall_imd": {
                "decile": data.get("imd_decile"),
                "rank": data.get("imd_rank"),
                "score": data.get("imd_score")
            },
            "income_deprivation": {
                "decile": data.get("income_deprivation_decile"),
                "rank": data.get("income_deprivation_rank"),
                "score": data.get("income_deprivation_score")
            },
            "employment_deprivation": {
                "decile": data.get("employment_deprivation_decile"),
                "rank": data.get("employment_deprivation_rank"),
                "score": data.get("employment_deprivation_score")
            },
            "health_deprivation": {
                "decile": data.get("health_deprivation_decile"),
                "rank": data.get("health_deprivation_rank"),
                "score": data.get("health_deprivation_score")
            },
            "education_skills_deprivation": {
                "decile": data.get("education_skills_decile"),
                "rank": data.get("education_skills_rank"),
                "score": data.get("education_skills_score")
            },
            "crime_deprivation": {
                "decile": data.get("crime_decile"),
                "rank": data.get("crime_rank"),
                "score": data.get("crime_score")
            },
            "housing_services_deprivation": {
                "decile": data.get("housing_services_decile"),
                "rank": data.get("housing_services_rank"),
                "score": data.get("housing_services_score")
            },
            "living_environment_deprivation": {
                "decile": data.get("living_environment_decile"),
                "rank": data.get("living_environment_rank"),
                "score": data.get("living_environment_score")
            }
        }

        return extracted

    async def get_all_lsoa(self) -> list:
        """Get list of all LSOA codes in database."""
        if not self.db:
            return []

        try:
            query = "SELECT DISTINCT lsoa_code FROM imd_data ORDER BY lsoa_code"
            results = self.db.execute_all(query)
            return [r.get("lsoa_code") for r in results]

        except Exception as e:
            logger.debug(f"Failed to get LSOA list: {str(e)}")
            return []

    async def get_statistics(self) -> Dict[str, Any]:
        """Get summary statistics from IMD data."""
        if not self.db:
            return {}

        try:
            query = """
                SELECT
                    COUNT(*) as total_lsoa,
                    AVG(imd_decile) as avg_imd_decile,
                    MIN(imd_decile) as most_deprived_decile,
                    MAX(imd_decile) as least_deprived_decile
                FROM imd_data
            """

            result = self.db.execute(query)

            if result:
                return {
                    "total_lsoa_areas": result.get("total_lsoa"),
                    "average_imd_decile": result.get("avg_imd_decile"),
                    "most_deprived_decile": result.get("most_deprived_decile"),
                    "least_deprived_decile": result.get("least_deprived_decile")
                }

        except Exception as e:
            logger.debug(f"Failed to get IMD statistics: {str(e)}")

        return {}
