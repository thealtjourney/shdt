"""
Flood Risk Data Import

Downloads and imports flood risk data from Environment Agency and other sources.
Creates flood_risk_postcodes table with flood zones and risk levels.
"""

import logging
import csv
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime
import io

logger = logging.getLogger(__name__)


class FloodRiskImporter:
    """Import flood risk data into local database."""

    # EA sources for flood data
    EA_FLOOD_ZONES_URL = "https://data.gov.uk/dataset/ea/e4fa5f42-f2d8-447d-a7ee-1c57a0d6faba"
    EA_FLOOD_POSTCODES_URL = "https://environment.data.gov.uk/flood-monitoring/data/Flood"

    def __init__(self, db_connection=None):
        """
        Initialize importer.

        Args:
            db_connection: Database connection for writing data
        """
        self.db = db_connection
        self.session = requests.Session()

    def create_tables(self) -> bool:
        """Create flood_risk_postcodes table."""
        if not self.db:
            logger.error("Database connection not available")
            return False

        try:
            create_table_sql = """
                CREATE TABLE IF NOT EXISTS flood_risk_postcodes (
                    id INTEGER PRIMARY KEY AUTO_INCREMENT,
                    postcode VARCHAR(8) UNIQUE NOT NULL,
                    flood_risk_rivers_seas INTEGER COMMENT '1-4 risk level',
                    flood_risk_surface_water INTEGER COMMENT '1-4 risk level',
                    flood_zone VARCHAR(50),
                    flood_zone_number INTEGER COMMENT '1-3',
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    source VARCHAR(100),
                    INDEX idx_postcode (postcode)
                )
            """

            self.db.execute(create_table_sql)
            logger.info("flood_risk_postcodes table created")
            return True

        except Exception as e:
            logger.error(f"Failed to create table: {str(e)}")
            return False

    def import_flood_risk_data(
        self,
        postcode_flood_csv: Optional[str] = None,
        download: bool = True
    ) -> Dict[str, Any]:
        """
        Import flood risk data.

        Args:
            postcode_flood_csv: Path to CSV file with postcode flood data
            download: Whether to download data from EA API

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
        if postcode_flood_csv:
            csv_stats = self._import_from_csv(postcode_flood_csv)
            stats["total_imported"] += csv_stats["imported"]
            stats["total_updated"] += csv_stats["updated"]
            stats["errors"] += csv_stats["errors"]
            stats["sources"].append("csv")

        # Download from EA API if requested
        if download:
            ea_stats = self._import_from_ea_api()
            stats["total_imported"] += ea_stats["imported"]
            stats["total_updated"] += ea_stats["updated"]
            stats["errors"] += ea_stats["errors"]
            stats["sources"].append("ea_api")

        logger.info(
            f"Flood risk import complete: "
            f"{stats['total_imported']} imported, "
            f"{stats['total_updated']} updated, "
            f"{stats['errors']} errors"
        )

        return stats

    def _import_from_csv(self, csv_path: str) -> Dict[str, int]:
        """Import flood risk from CSV file."""
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
                        postcode = row.get("postcode", "").strip().upper()
                        if not postcode:
                            continue

                        # Parse flood risk levels (1-4)
                        try:
                            flood_rivers = int(row.get("flood_risk_rivers_seas", 0))
                        except (ValueError, TypeError):
                            flood_rivers = None

                        try:
                            flood_surface = int(row.get("flood_risk_surface_water", 0))
                        except (ValueError, TypeError):
                            flood_surface = None

                        try:
                            flood_zone_num = int(row.get("flood_zone_number", 0))
                        except (ValueError, TypeError):
                            flood_zone_num = None

                        flood_zone = row.get("flood_zone", "").strip()

                        # Upsert into database
                        upsert_sql = """
                            INSERT INTO flood_risk_postcodes
                            (postcode, flood_risk_rivers_seas, flood_risk_surface_water,
                             flood_zone, flood_zone_number, source, last_updated)
                            VALUES (%s, %s, %s, %s, %s, %s, NOW())
                            ON DUPLICATE KEY UPDATE
                            flood_risk_rivers_seas = VALUES(flood_risk_rivers_seas),
                            flood_risk_surface_water = VALUES(flood_risk_surface_water),
                            flood_zone = VALUES(flood_zone),
                            flood_zone_number = VALUES(flood_zone_number),
                            last_updated = NOW()
                        """

                        self.db.execute(
                            upsert_sql,
                            (postcode, flood_rivers, flood_surface, flood_zone,
                             flood_zone_num, "csv")
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

    def _import_from_ea_api(self) -> Dict[str, int]:
        """Import flood warnings from EA API."""
        stats = {"imported": 0, "updated": 0, "errors": 0}

        if not self.db:
            logger.error("Database connection not available")
            stats["errors"] += 1
            return stats

        try:
            logger.info("Fetching flood data from EA API...")

            response = self.session.get(
                self.EA_FLOOD_POSTCODES_URL,
                params={"_properties": "all"},
                timeout=30
            )
            response.raise_for_status()

            data = response.json()

            if not data.get("items"):
                logger.warning("No flood data returned from EA API")
                return stats

            # Process each flood warning area
            for item in data["items"]:
                try:
                    # Extract relevant fields
                    flood_id = item.get("id")
                    label = item.get("label")
                    description = item.get("description")
                    area = item.get("area")

                    if not label:
                        continue

                    # Try to extract postcode from description or area
                    # This is heuristic - actual implementation may vary
                    postcode = self._extract_postcode_from_text(
                        f"{label} {description} {area}"
                    )

                    if postcode:
                        # Determine flood risk level based on area
                        flood_zone_num = self._determine_flood_zone(item)
                        flood_risk_level = item.get("severity", 2)

                        upsert_sql = """
                            INSERT INTO flood_risk_postcodes
                            (postcode, flood_zone, flood_zone_number,
                             flood_risk_rivers_seas, source, last_updated)
                            VALUES (%s, %s, %s, %s, %s, NOW())
                            ON DUPLICATE KEY UPDATE
                            flood_zone = VALUES(flood_zone),
                            flood_zone_number = VALUES(flood_zone_number),
                            last_updated = NOW()
                        """

                        self.db.execute(
                            upsert_sql,
                            (postcode, label, flood_zone_num,
                             flood_risk_level, "ea_api")
                        )

                        stats["imported"] += 1

                except Exception as e:
                    logger.warning(f"Failed to process EA item: {str(e)}")
                    stats["errors"] += 1

            logger.info(f"EA API import complete: {stats['imported']} records")

        except requests.exceptions.RequestException as e:
            logger.error(f"EA API request failed: {str(e)}")
            stats["errors"] += 1
        except Exception as e:
            logger.error(f"EA API import failed: {str(e)}")
            stats["errors"] += 1

        return stats

    def _extract_postcode_from_text(self, text: str) -> Optional[str]:
        """Extract UK postcode from text using regex."""
        import re

        # UK postcode regex pattern
        postcode_pattern = r'[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}'

        match = re.search(postcode_pattern, text.upper())
        if match:
            return match.group().replace(" ", "")

        return None

    def _determine_flood_zone(self, item: Dict[str, Any]) -> Optional[int]:
        """Determine flood zone number from EA data."""
        # Zone 1 = Low risk, Zone 2 = Medium risk, Zone 3 = High risk
        severity = item.get("severity", "").lower()

        if "high" in severity or "warning" in severity:
            return 3
        elif "medium" in severity or "alert" in severity:
            return 2
        else:
            return 1

    async def get_import_status(self) -> Dict[str, Any]:
        """Get status of flood risk data in database."""
        if not self.db:
            return {}

        try:
            query = """
                SELECT
                    COUNT(*) as total_postcodes,
                    COUNT(DISTINCT postcode) as unique_postcodes,
                    COUNT(CASE WHEN flood_zone_number IS NOT NULL THEN 1 END) as with_zone,
                    MAX(last_updated) as last_updated
                FROM flood_risk_postcodes
            """

            result = self.db.execute(query)

            if result:
                return {
                    "total_records": result.get("total_postcodes"),
                    "unique_postcodes": result.get("unique_postcodes"),
                    "with_zone_data": result.get("with_zone"),
                    "last_updated": result.get("last_updated")
                }

        except Exception as e:
            logger.debug(f"Failed to get import status: {str(e)}")

        return {}
