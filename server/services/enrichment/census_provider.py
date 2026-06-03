"""
Census 2021 Enrichment Provider

Provides demographic and housing data at LSOA level from local database.
No API calls required - direct database join.
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class CensusEnrichmentProvider:
    """Enrichment provider for Census 2021 data."""

    provider_name = "census"
    rate_limit = None  # No API calls, no rate limiting needed

    def __init__(self, db_connection=None):
        """
        Initialize Census provider.

        Args:
            db_connection: Database connection for Census data lookup
        """
        self.db = db_connection

    async def enrich(
        self,
        lsoa_code: Optional[str] = None,
        lsoa_name: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Enrich property with Census 2021 data.

        Args:
            lsoa_code: LSOA code
            lsoa_name: LSOA name (fallback)
            **kwargs: Additional parameters

        Returns:
            Dictionary with census demographics
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
            census_data = None

            # Try LSOA code first
            if lsoa_code:
                census_data = await self._lookup_by_code(lsoa_code)

            # Fall back to LSOA name
            if not census_data and lsoa_name:
                census_data = await self._lookup_by_name(lsoa_name)

            if census_data:
                result["success"] = True
                result["data"] = census_data
            else:
                result["error"] = f"Census data not found for LSOA {lsoa_code or lsoa_name}"

        except Exception as e:
            logger.exception(
                f"Census enrichment error for {lsoa_code or lsoa_name}: {str(e)}"
            )
            result["error"] = str(e)

        return result

    async def _lookup_by_code(self, lsoa_code: str) -> Optional[Dict[str, Any]]:
        """Lookup Census data by LSOA code."""
        try:
            # Query structure assumes census_lsoa table with columns:
            # - lsoa_code
            # - lsoa_name
            # - population
            # - households
            # - owner_occupied_pct
            # - rental_private_pct
            # - rental_social_pct
            # - avg_household_size
            # - fuel_poverty_pct
            # - age_0_15_pct
            # - age_16_64_pct
            # - age_65_plus_pct
            # - etc.

            query = """
                SELECT
                    lsoa_code,
                    lsoa_name,
                    population,
                    households,
                    owner_occupied_pct,
                    rental_private_pct,
                    rental_social_pct,
                    avg_household_size,
                    fuel_poverty_pct,
                    age_0_15_pct,
                    age_16_64_pct,
                    age_65_plus_pct,
                    white_pct,
                    asian_pct,
                    black_pct,
                    mixed_pct,
                    other_ethnicity_pct,
                    christian_pct,
                    muslim_pct,
                    jewish_pct,
                    buddhist_pct,
                    hindu_pct,
                    sikh_pct,
                    no_religion_pct,
                    full_time_employed_pct,
                    part_time_employed_pct,
                    self_employed_pct,
                    unemployed_pct,
                    student_pct,
                    retired_pct,
                    looking_after_family_pct,
                    permanently_sick_pct,
                    other_economically_inactive_pct,
                    english_language_main_pct,
                    english_language_not_well_pct
                FROM census_lsoa
                WHERE lsoa_code = %s
                LIMIT 1
            """

            result = self.db.execute(query, (lsoa_code,))

            if result:
                return self._extract_census_fields(result)

        except Exception as e:
            logger.debug(f"Census code lookup failed for {lsoa_code}: {str(e)}")

        return None

    async def _lookup_by_name(self, lsoa_name: str) -> Optional[Dict[str, Any]]:
        """Lookup Census data by LSOA name."""
        try:
            query = """
                SELECT
                    lsoa_code,
                    lsoa_name,
                    population,
                    households,
                    owner_occupied_pct,
                    rental_private_pct,
                    rental_social_pct,
                    avg_household_size,
                    fuel_poverty_pct,
                    age_0_15_pct,
                    age_16_64_pct,
                    age_65_plus_pct,
                    white_pct,
                    asian_pct,
                    black_pct,
                    mixed_pct,
                    other_ethnicity_pct,
                    christian_pct,
                    muslim_pct,
                    jewish_pct,
                    buddhist_pct,
                    hindu_pct,
                    sikh_pct,
                    no_religion_pct,
                    full_time_employed_pct,
                    part_time_employed_pct,
                    self_employed_pct,
                    unemployed_pct,
                    student_pct,
                    retired_pct,
                    looking_after_family_pct,
                    permanently_sick_pct,
                    other_economically_inactive_pct,
                    english_language_main_pct,
                    english_language_not_well_pct
                FROM census_lsoa
                WHERE lsoa_name = %s
                LIMIT 1
            """

            result = self.db.execute(query, (lsoa_name,))

            if result:
                return self._extract_census_fields(result)

        except Exception as e:
            logger.debug(f"Census name lookup failed for {lsoa_name}: {str(e)}")

        return None

    def _extract_census_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract Census fields from database result."""
        extracted = {
            "lsoa_code": data.get("lsoa_code"),
            "lsoa_name": data.get("lsoa_name"),
            "population": {
                "total": data.get("population"),
                "households": data.get("households"),
                "avg_household_size": data.get("avg_household_size")
            },
            "housing_tenure": {
                "owner_occupied_pct": data.get("owner_occupied_pct"),
                "rental_private_pct": data.get("rental_private_pct"),
                "rental_social_pct": data.get("rental_social_pct")
            },
            "fuel_poverty": {
                "fuel_poor_households_pct": data.get("fuel_poverty_pct")
            },
            "age_demographics": {
                "age_0_15_pct": data.get("age_0_15_pct"),
                "age_16_64_pct": data.get("age_16_64_pct"),
                "age_65_plus_pct": data.get("age_65_plus_pct")
            },
            "ethnicity": {
                "white_pct": data.get("white_pct"),
                "asian_pct": data.get("asian_pct"),
                "black_pct": data.get("black_pct"),
                "mixed_pct": data.get("mixed_pct"),
                "other_ethnicity_pct": data.get("other_ethnicity_pct")
            },
            "religion": {
                "christian_pct": data.get("christian_pct"),
                "muslim_pct": data.get("muslim_pct"),
                "jewish_pct": data.get("jewish_pct"),
                "buddhist_pct": data.get("buddhist_pct"),
                "hindu_pct": data.get("hindu_pct"),
                "sikh_pct": data.get("sikh_pct"),
                "no_religion_pct": data.get("no_religion_pct")
            },
            "employment_status": {
                "full_time_employed_pct": data.get("full_time_employed_pct"),
                "part_time_employed_pct": data.get("part_time_employed_pct"),
                "self_employed_pct": data.get("self_employed_pct"),
                "unemployed_pct": data.get("unemployed_pct"),
                "student_pct": data.get("student_pct"),
                "retired_pct": data.get("retired_pct"),
                "looking_after_family_pct": data.get("looking_after_family_pct"),
                "permanently_sick_pct": data.get("permanently_sick_pct"),
                "other_economically_inactive_pct": data.get("other_economically_inactive_pct")
            },
            "language": {
                "english_language_main_pct": data.get("english_language_main_pct"),
                "english_language_not_well_pct": data.get("english_language_not_well_pct")
            }
        }

        return extracted

    async def get_all_lsoa(self) -> list:
        """Get list of all LSOA codes in database."""
        if not self.db:
            return []

        try:
            query = "SELECT DISTINCT lsoa_code FROM census_lsoa ORDER BY lsoa_code"
            results = self.db.execute_all(query)
            return [r.get("lsoa_code") for r in results]

        except Exception as e:
            logger.debug(f"Failed to get LSOA list: {str(e)}")
            return []

    async def get_statistics(self) -> Dict[str, Any]:
        """Get summary statistics from Census data."""
        if not self.db:
            return {}

        try:
            query = """
                SELECT
                    COUNT(*) as total_lsoa,
                    AVG(population) as avg_population,
                    AVG(households) as avg_households,
                    AVG(avg_household_size) as avg_household_size_overall,
                    AVG(fuel_poverty_pct) as avg_fuel_poverty,
                    AVG(age_65_plus_pct) as avg_elderly_pct
                FROM census_lsoa
            """

            result = self.db.execute(query)

            if result:
                return {
                    "total_lsoa_areas": result.get("total_lsoa"),
                    "average_population_per_lsoa": result.get("avg_population"),
                    "average_households_per_lsoa": result.get("avg_households"),
                    "average_household_size": result.get("avg_household_size_overall"),
                    "average_fuel_poverty_pct": result.get("avg_fuel_poverty"),
                    "average_elderly_population_pct": result.get("avg_elderly_pct")
                }

        except Exception as e:
            logger.debug(f"Failed to get Census statistics: {str(e)}")

        return {}
