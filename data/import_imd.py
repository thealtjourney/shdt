"""
IMD (Index of Multiple Deprivation) Data Import

Downloads and imports IMD 2019 data from open sources.
Creates imd_data table with deprivation deciles at LSOA level.
"""

import logging
import csv
from typing import Dict, Any, Optional, List
from datetime import datetime
import requests
import zipfile
import io

logger = logging.getLogger(__name__)


class IMDImporter:
    """Import IMD data into local database."""

    # Data sources for IMD 2019
    GOV_UK_IMD_URL = "https://data.gov.uk/dataset/imd2019"
    OPEN_DATA_IMD_URL = "https://data.cdrc.ac.uk/dataset/imd-2019"

    def __init__(self, db_connection=None):
        """
        Initialize importer.

        Args:
            db_connection: Database connection for writing data
        """
        self.db = db_connection
        self.session = requests.Session()

    def create_tables(self) -> bool:
        """Create imd_data table."""
        if not self.db:
            logger.error("Database connection not available")
            return False

        try:
            create_table_sql = """
                CREATE TABLE IF NOT EXISTS imd_data (
                    id INTEGER PRIMARY KEY AUTO_INCREMENT,
                    lsoa_code VARCHAR(9) UNIQUE NOT NULL,
                    lsoa_name VARCHAR(255),
                    local_authority_name VARCHAR(255),
                    imd_rank INTEGER COMMENT '1 = most deprived',
                    imd_decile INTEGER COMMENT '1 = most deprived',
                    imd_score FLOAT,
                    income_deprivation_rank INTEGER,
                    income_deprivation_decile INTEGER,
                    income_deprivation_score FLOAT,
                    employment_deprivation_rank INTEGER,
                    employment_deprivation_decile INTEGER,
                    employment_deprivation_score FLOAT,
                    health_deprivation_rank INTEGER,
                    health_deprivation_decile INTEGER,
                    health_deprivation_score FLOAT,
                    education_skills_rank INTEGER,
                    education_skills_decile INTEGER,
                    education_skills_score FLOAT,
                    crime_rank INTEGER,
                    crime_decile INTEGER,
                    crime_score FLOAT,
                    housing_services_rank INTEGER,
                    housing_services_decile INTEGER,
                    housing_services_score FLOAT,
                    living_environment_rank INTEGER,
                    living_environment_decile INTEGER,
                    living_environment_score FLOAT,
                    income_deprivation_affecting_children_rank INTEGER,
                    income_deprivation_affecting_elderly_rank INTEGER,
                    data_year INTEGER DEFAULT 2019,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_lsoa (lsoa_code),
                    INDEX idx_decile (imd_decile),
                    INDEX idx_la (local_authority_name)
                )
            """

            self.db.execute(create_table_sql)
            logger.info("imd_data table created")
            return True

        except Exception as e:
            logger.error(f"Failed to create table: {str(e)}")
            return False

    def import_imd_data(
        self,
        imd_csv: Optional[str] = None,
        download: bool = True
    ) -> Dict[str, Any]:
        """
        Import IMD data.

        Args:
            imd_csv: Path to IMD CSV file
            download: Whether to download data from external sources

        Returns:
            Dictionary with import statistics
        """
        stats = {
            "total_imported": 0,
            "total_updated": 0,
            "errors": 0,
            "sources": []
        }

        # Create tables if needed
        if not self.create_tables():
            stats["errors"] += 1
            return stats

        # Import from CSV if provided
        if imd_csv:
            csv_stats = self._import_from_csv(imd_csv)
            stats["total_imported"] += csv_stats["imported"]
            stats["total_updated"] += csv_stats["updated"]
            stats["errors"] += csv_stats["errors"]
            stats["sources"].append("csv")

        # Download from sources if requested
        if download:
            download_stats = self._download_and_import_imd()
            stats["total_imported"] += download_stats["imported"]
            stats["total_updated"] += download_stats["updated"]
            stats["errors"] += download_stats["errors"]
            stats["sources"].append("gov_uk")

        logger.info(
            f"IMD import complete: "
            f"{stats['total_imported']} imported, "
            f"{stats['total_updated']} updated, "
            f"{stats['errors']} errors"
        )

        return stats

    def _import_from_csv(self, csv_path: str) -> Dict[str, int]:
        """Import IMD data from CSV file."""
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

                        # Parse numeric fields
                        fields = {
                            "lsoa_code": lsoa_code,
                            "lsoa_name": row.get("lsoa_name", "").strip(),
                            "local_authority_name": row.get("local_authority", "").strip(),
                            "imd_rank": self._parse_int(row.get("imd_rank")),
                            "imd_decile": self._parse_int(row.get("imd_decile")),
                            "imd_score": self._parse_float(row.get("imd_score")),
                            "income_deprivation_rank": self._parse_int(row.get("income_rank")),
                            "income_deprivation_decile": self._parse_int(row.get("income_decile")),
                            "income_deprivation_score": self._parse_float(row.get("income_score")),
                            "employment_deprivation_rank": self._parse_int(row.get("employment_rank")),
                            "employment_deprivation_decile": self._parse_int(row.get("employment_decile")),
                            "employment_deprivation_score": self._parse_float(row.get("employment_score")),
                            "health_deprivation_rank": self._parse_int(row.get("health_rank")),
                            "health_deprivation_decile": self._parse_int(row.get("health_decile")),
                            "health_deprivation_score": self._parse_float(row.get("health_score")),
                            "education_skills_rank": self._parse_int(row.get("education_rank")),
                            "education_skills_decile": self._parse_int(row.get("education_decile")),
                            "education_skills_score": self._parse_float(row.get("education_score")),
                            "crime_rank": self._parse_int(row.get("crime_rank")),
                            "crime_decile": self._parse_int(row.get("crime_decile")),
                            "crime_score": self._parse_float(row.get("crime_score")),
                            "housing_services_rank": self._parse_int(row.get("housing_rank")),
                            "housing_services_decile": self._parse_int(row.get("housing_decile")),
                            "housing_services_score": self._parse_float(row.get("housing_score")),
                            "living_environment_rank": self._parse_int(row.get("environment_rank")),
                            "living_environment_decile": self._parse_int(row.get("environment_decile")),
                            "living_environment_score": self._parse_float(row.get("environment_score")),
                            "income_deprivation_affecting_children_rank": self._parse_int(
                                row.get("idac_rank")
                            ),
                            "income_deprivation_affecting_elderly_rank": self._parse_int(
                                row.get("idae_rank")
                            )
                        }

                        # Upsert into database
                        upsert_sql = """
                            INSERT INTO imd_data (
                                lsoa_code, lsoa_name, local_authority_name,
                                imd_rank, imd_decile, imd_score,
                                income_deprivation_rank, income_deprivation_decile, income_deprivation_score,
                                employment_deprivation_rank, employment_deprivation_decile, employment_deprivation_score,
                                health_deprivation_rank, health_deprivation_decile, health_deprivation_score,
                                education_skills_rank, education_skills_decile, education_skills_score,
                                crime_rank, crime_decile, crime_score,
                                housing_services_rank, housing_services_decile, housing_services_score,
                                living_environment_rank, living_environment_decile, living_environment_score,
                                income_deprivation_affecting_children_rank, income_deprivation_affecting_elderly_rank
                            ) VALUES (
                                %s, %s, %s,
                                %s, %s, %s,
                                %s, %s, %s,
                                %s, %s, %s,
                                %s, %s, %s,
                                %s, %s, %s,
                                %s, %s, %s,
                                %s, %s, %s,
                                %s, %s, %s,
                                %s, %s
                            )
                            ON DUPLICATE KEY UPDATE
                                lsoa_name = VALUES(lsoa_name),
                                local_authority_name = VALUES(local_authority_name),
                                imd_decile = VALUES(imd_decile),
                                imd_score = VALUES(imd_score),
                                last_updated = NOW()
                        """

                        self.db.execute(
                            upsert_sql,
                            tuple(fields.values())
                        )

                        stats["imported"] += 1

                    except Exception as e:
                        logger.warning(f"Failed to import row: {str(e)}")
                        stats["errors"] += 1

            logger.info(f"CSV import complete: {stats['imported']} records")

        except FileNotFoundError:
            logger.error(f"CSV file not found: {csv_path}")
            stats["errors"] += 1
        except Exception as e:
            logger.error(f"CSV import failed: {str(e)}")
            stats["errors"] += 1

        return stats

    def _download_and_import_imd(self) -> Dict[str, int]:
        """Download and import IMD data from external source."""
        stats = {"imported": 0, "updated": 0, "errors": 0}

        try:
            logger.info("Downloading IMD data from open source...")

            # This would need actual download implementation
            # Placeholder for structure
            logger.warning("IMD download not yet implemented - use CSV import instead")

            return stats

        except Exception as e:
            logger.error(f"IMD download failed: {str(e)}")
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
        """Get status of IMD data in database."""
        if not self.db:
            return {}

        try:
            query = """
                SELECT
                    COUNT(*) as total_lsoa,
                    COUNT(DISTINCT local_authority_name) as local_authorities,
                    AVG(imd_decile) as avg_imd_decile,
                    MIN(imd_decile) as most_deprived_decile,
                    MAX(imd_decile) as least_deprived_decile,
                    MAX(last_updated) as last_updated
                FROM imd_data
            """

            result = self.db.execute(query)

            if result:
                return {
                    "total_lsoa": result.get("total_lsoa"),
                    "local_authorities": result.get("local_authorities"),
                    "average_imd_decile": round(result.get("avg_imd_decile", 0), 2),
                    "most_deprived_decile": result.get("most_deprived_decile"),
                    "least_deprived_decile": result.get("least_deprived_decile"),
                    "last_updated": result.get("last_updated")
                }

        except Exception as e:
            logger.debug(f"Failed to get import status: {str(e)}")

        return {}
