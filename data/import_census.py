"""
Census 2021 Data Import

Imports Census 2021 LSOA-level data including demographics, housing, employment.
Creates census_lsoa table with comprehensive demographic breakdown.
"""

import logging
import csv
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class CensusImporter:
    """Import Census 2021 data into local database."""

    def __init__(self, db_connection=None):
        """
        Initialize importer.

        Args:
            db_connection: Database connection for writing data
        """
        self.db = db_connection

    def create_tables(self) -> bool:
        """Create census_lsoa table."""
        if not self.db:
            logger.error("Database connection not available")
            return False

        try:
            create_table_sql = """
                CREATE TABLE IF NOT EXISTS census_lsoa (
                    id INTEGER PRIMARY KEY AUTO_INCREMENT,
                    lsoa_code VARCHAR(9) UNIQUE NOT NULL,
                    lsoa_name VARCHAR(255),
                    local_authority_name VARCHAR(255),
                    population INTEGER,
                    households INTEGER,
                    owner_occupied_pct FLOAT COMMENT 'Owner occupied %',
                    rental_private_pct FLOAT COMMENT 'Private rented %',
                    rental_social_pct FLOAT COMMENT 'Social rented %',
                    avg_household_size FLOAT,
                    fuel_poverty_pct FLOAT,
                    age_0_15_pct FLOAT,
                    age_16_64_pct FLOAT,
                    age_65_plus_pct FLOAT,
                    white_pct FLOAT,
                    asian_pct FLOAT,
                    black_pct FLOAT,
                    mixed_pct FLOAT,
                    other_ethnicity_pct FLOAT,
                    christian_pct FLOAT,
                    muslim_pct FLOAT,
                    jewish_pct FLOAT,
                    buddhist_pct FLOAT,
                    hindu_pct FLOAT,
                    sikh_pct FLOAT,
                    no_religion_pct FLOAT,
                    full_time_employed_pct FLOAT,
                    part_time_employed_pct FLOAT,
                    self_employed_pct FLOAT,
                    unemployed_pct FLOAT,
                    student_pct FLOAT,
                    retired_pct FLOAT,
                    looking_after_family_pct FLOAT,
                    permanently_sick_pct FLOAT,
                    other_economically_inactive_pct FLOAT,
                    english_language_main_pct FLOAT,
                    english_language_not_well_pct FLOAT,
                    data_year INTEGER DEFAULT 2021,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_lsoa (lsoa_code),
                    INDEX idx_la (local_authority_name)
                )
            """

            self.db.execute(create_table_sql)
            logger.info("census_lsoa table created")
            return True

        except Exception as e:
            logger.error(f"Failed to create table: {str(e)}")
            return False

    def import_census_data(
        self,
        census_csv: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Import Census 2021 data.

        Args:
            census_csv: Path to Census CSV file

        Returns:
            Dictionary with import statistics
        """
        stats = {
            "total_imported": 0,
            "total_updated": 0,
            "errors": 0
        }

        # Create tables if needed
        if not self.create_tables():
            stats["errors"] += 1
            return stats

        # Import from CSV
        if census_csv:
            csv_stats = self._import_from_csv(census_csv)
            stats["total_imported"] = csv_stats["imported"]
            stats["total_updated"] = csv_stats["updated"]
            stats["errors"] = csv_stats["errors"]
        else:
            logger.warning("No Census CSV path provided")

        logger.info(
            f"Census import complete: "
            f"{stats['total_imported']} imported, "
            f"{stats['errors']} errors"
        )

        return stats

    def _import_from_csv(self, csv_path: str) -> Dict[str, int]:
        """Import Census data from CSV file."""
        stats = {"imported": 0, "updated": 0, "errors": 0}

        if not self.db:
            logger.error("Database connection not available")
            stats["errors"] += 1
            return stats

        try:
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)

                for row in reader:
                    try:
                        lsoa_code = row.get("lsoa_code", "").strip()
                        if not lsoa_code:
                            continue

                        # Parse percentage and numeric fields
                        fields = {
                            "lsoa_code": lsoa_code,
                            "lsoa_name": row.get("lsoa_name", "").strip(),
                            "local_authority_name": row.get("local_authority", "").strip(),
                            "population": self._parse_int(row.get("population")),
                            "households": self._parse_int(row.get("households")),
                            "owner_occupied_pct": self._parse_float(row.get("owner_occupied_pct")),
                            "rental_private_pct": self._parse_float(row.get("rental_private_pct")),
                            "rental_social_pct": self._parse_float(row.get("rental_social_pct")),
                            "avg_household_size": self._parse_float(row.get("avg_household_size")),
                            "fuel_poverty_pct": self._parse_float(row.get("fuel_poverty_pct")),
                            "age_0_15_pct": self._parse_float(row.get("age_0_15_pct")),
                            "age_16_64_pct": self._parse_float(row.get("age_16_64_pct")),
                            "age_65_plus_pct": self._parse_float(row.get("age_65_plus_pct")),
                            "white_pct": self._parse_float(row.get("white_pct")),
                            "asian_pct": self._parse_float(row.get("asian_pct")),
                            "black_pct": self._parse_float(row.get("black_pct")),
                            "mixed_pct": self._parse_float(row.get("mixed_pct")),
                            "other_ethnicity_pct": self._parse_float(row.get("other_ethnicity_pct")),
                            "christian_pct": self._parse_float(row.get("christian_pct")),
                            "muslim_pct": self._parse_float(row.get("muslim_pct")),
                            "jewish_pct": self._parse_float(row.get("jewish_pct")),
                            "buddhist_pct": self._parse_float(row.get("buddhist_pct")),
                            "hindu_pct": self._parse_float(row.get("hindu_pct")),
                            "sikh_pct": self._parse_float(row.get("sikh_pct")),
                            "no_religion_pct": self._parse_float(row.get("no_religion_pct")),
                            "full_time_employed_pct": self._parse_float(row.get("full_time_employed_pct")),
                            "part_time_employed_pct": self._parse_float(row.get("part_time_employed_pct")),
                            "self_employed_pct": self._parse_float(row.get("self_employed_pct")),
                            "unemployed_pct": self._parse_float(row.get("unemployed_pct")),
                            "student_pct": self._parse_float(row.get("student_pct")),
                            "retired_pct": self._parse_float(row.get("retired_pct")),
                            "looking_after_family_pct": self._parse_float(row.get("looking_after_family_pct")),
                            "permanently_sick_pct": self._parse_float(row.get("permanently_sick_pct")),
                            "other_economically_inactive_pct": self._parse_float(
                                row.get("other_economically_inactive_pct")
                            ),
                            "english_language_main_pct": self._parse_float(
                                row.get("english_language_main_pct")
                            ),
                            "english_language_not_well_pct": self._parse_float(
                                row.get("english_language_not_well_pct")
                            )
                        }

                        # Upsert into database
                        upsert_sql = """
                            INSERT INTO census_lsoa (
                                lsoa_code, lsoa_name, local_authority_name,
                                population, households,
                                owner_occupied_pct, rental_private_pct, rental_social_pct,
                                avg_household_size, fuel_poverty_pct,
                                age_0_15_pct, age_16_64_pct, age_65_plus_pct,
                                white_pct, asian_pct, black_pct, mixed_pct, other_ethnicity_pct,
                                christian_pct, muslim_pct, jewish_pct, buddhist_pct, hindu_pct, sikh_pct, no_religion_pct,
                                full_time_employed_pct, part_time_employed_pct, self_employed_pct,
                                unemployed_pct, student_pct, retired_pct,
                                looking_after_family_pct, permanently_sick_pct, other_economically_inactive_pct,
                                english_language_main_pct, english_language_not_well_pct
                            ) VALUES (
                                %s, %s, %s,
                                %s, %s,
                                %s, %s, %s,
                                %s, %s,
                                %s, %s, %s,
                                %s, %s, %s, %s, %s,
                                %s, %s, %s, %s, %s, %s, %s,
                                %s, %s, %s,
                                %s, %s, %s,
                                %s, %s, %s,
                                %s, %s
                            )
                            ON DUPLICATE KEY UPDATE
                                lsoa_name = VALUES(lsoa_name),
                                local_authority_name = VALUES(local_authority_name),
                                population = VALUES(population),
                                households = VALUES(households),
                                last_updated = NOW()
                        """

                        self.db.execute(
                            upsert_sql,
                            tuple(fields.values())
                        )

                        stats["imported"] += 1

                    except Exception as e:
                        logger.warning(f"Failed to import Census row: {str(e)}")
                        stats["errors"] += 1

            logger.info(f"Census CSV import complete: {stats['imported']} records")

        except FileNotFoundError:
            logger.error(f"Census CSV file not found: {csv_path}")
            stats["errors"] += 1
        except Exception as e:
            logger.error(f"Census CSV import failed: {str(e)}")
            stats["errors"] += 1

        return stats

    def _parse_int(self, value: Any) -> Optional[int]:
        """Safely parse integer value."""
        if value is None or value == "":
            return None
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return None

    def _parse_float(self, value: Any) -> Optional[float]:
        """Safely parse float value."""
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    async def get_import_status(self) -> Dict[str, Any]:
        """Get status of Census data in database."""
        if not self.db:
            return {}

        try:
            query = """
                SELECT
                    COUNT(*) as total_lsoa,
                    COUNT(DISTINCT local_authority_name) as local_authorities,
                    SUM(population) as total_population,
                    AVG(population) as avg_population_per_lsoa,
                    AVG(age_65_plus_pct) as avg_elderly_pct,
                    AVG(fuel_poverty_pct) as avg_fuel_poverty_pct,
                    MAX(last_updated) as last_updated
                FROM census_lsoa
            """

            result = self.db.execute(query)

            if result:
                return {
                    "total_lsoa": result.get("total_lsoa"),
                    "local_authorities": result.get("local_authorities"),
                    "total_population": result.get("total_population"),
                    "average_population_per_lsoa": result.get("avg_population_per_lsoa"),
                    "average_elderly_pct": round(result.get("avg_elderly_pct", 0), 2),
                    "average_fuel_poverty_pct": round(result.get("avg_fuel_poverty_pct", 0), 2),
                    "last_updated": result.get("last_updated")
                }

        except Exception as e:
            logger.debug(f"Failed to get import status: {str(e)}")

        return {}
