#!/usr/bin/env python3
"""
CSV Data Ingestion Pipeline for SHDT Social Housing Properties

This script ingests social housing property data from CSV files into the SHDT database.
It handles:
- Auto-detection of column mappings
- Data cleaning and normalization
- Geocoding using postcodes.io API
- Duplicate detection and idempotent imports
- Comprehensive logging and validation reporting
"""

import argparse
import csv
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote
from collections import defaultdict

import pandas as pd
import requests
from sqlalchemy import create_engine, text, and_, or_
from sqlalchemy.orm import sessionmaker
from geoalchemy2 import Geometry
from geoalchemy2.functions import ST_GeomFromText

# Configure logging
log_dir = Path(__file__).parent / "logs"
log_dir.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_dir / "import_errors.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class ColumnMapper:
    """Auto-detects CSV column mappings based on header patterns."""

    COLUMN_PATTERNS = {
        'address': ['address', 'addr', 'street_address', 'street', 'location'],
        'postcode': ['postcode', 'post_code', 'postal_code', 'zip', 'zip_code'],
        'uprn': ['uprn', 'unique_property_reference_number'],
        'property_type': ['property_type', 'type', 'property_class', 'building_type'],
        'bedrooms': ['beds', 'bedrooms', 'no_beds', 'num_beds'],
        'year_built': ['year_built', 'year_constructed', 'construction_year', 'built_year'],
        'heating': ['heating', 'heating_type', 'fuel_type'],
        'epc': ['epc', 'epc_rating', 'energy_rating'],
        'condition': ['condition', 'property_condition', 'state'],
        'latitude': ['latitude', 'lat', 'lat_decimal', 'y_coord'],
        'longitude': ['longitude', 'lon', 'lng', 'long', 'x_coord'],
        'tenure_type': ['tenure_type', 'tenure', 'ownership_type'],
        'local_authority': ['local_authority', 'local_auth', 'council', 'la'],
        'ward': ['ward', 'ward_name', 'electoral_ward'],
        'construction_type': ['construction_type', 'build_type', 'construction_method'],
        'wall_insulation': ['wall_insulation', 'wall_type', 'wall_material'],
        'roof_type': ['roof_type', 'roof_material'],
        'floor_area': ['floor_area', 'useable_area', 'total_area', 'gfa'],
    }

    @classmethod
    def detect_mappings(cls, df: pd.DataFrame) -> Dict[str, Optional[str]]:
        """
        Detect column mappings by comparing header names with known patterns.

        Args:
            df: DataFrame with CSV data

        Returns:
            Dictionary mapping standard field names to actual CSV column names
        """
        headers = [col.lower().strip() for col in df.columns]
        mappings = {}

        for standard_field, patterns in cls.COLUMN_PATTERNS.items():
            for pattern in patterns:
                pattern_lower = pattern.lower()
                for idx, header in enumerate(headers):
                    if pattern_lower in header or header == pattern_lower:
                        actual_col = df.columns[idx]
                        mappings[standard_field] = actual_col
                        break
                if standard_field in mappings:
                    break

        return mappings

    @classmethod
    def log_detected_mappings(cls, mappings: Dict[str, Optional[str]]) -> None:
        """Log detected column mappings for user verification."""
        logger.info("Detected column mappings:")
        for standard, actual in mappings.items():
            status = actual if actual else "NOT FOUND"
            logger.info(f"  {standard}: {status}")


class DataCleaner:
    """Cleans and normalizes property data."""

    CATEGORICAL_FIELDS = {
        'property_type': ['house', 'flat', 'bungalow', 'maisonette', 'shared', 'other'],
        'heating': ['gas', 'electric', 'oil', 'renewable', 'biomass', 'hybrid', 'unknown'],
        'epc': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        'condition': ['good', 'fair', 'poor', 'unknown'],
        'tenure_type': ['owned', 'rented', 'shared', 'leaseholder', 'freeholder'],
    }

    @staticmethod
    def clean_string(value: Optional[str]) -> Optional[str]:
        """Strip whitespace and return None for empty strings."""
        if pd.isna(value) or value is None:
            return None
        cleaned = str(value).strip()
        return cleaned if cleaned else None

    @staticmethod
    def clean_categorical(value: Optional[str], valid_values: List[str]) -> Optional[str]:
        """Normalize categorical field to lowercase and validate."""
        cleaned = DataCleaner.clean_string(value)
        if cleaned is None:
            return None
        normalized = cleaned.lower()
        if normalized in valid_values:
            return normalized
        return None

    @staticmethod
    def clean_integer(value: Optional[str]) -> Optional[int]:
        """Convert to integer, return None for invalid values."""
        if pd.isna(value) or value is None:
            return None
        try:
            return int(float(str(value).strip()))
        except (ValueError, TypeError):
            return None

    @staticmethod
    def clean_float(value: Optional[str]) -> Optional[float]:
        """Convert to float, return None for invalid values."""
        if pd.isna(value) or value is None:
            return None
        try:
            return float(str(value).strip())
        except (ValueError, TypeError):
            return None

    @staticmethod
    def clean_postcode(value: Optional[str]) -> Optional[str]:
        """Clean postcode: uppercase, remove extra spaces."""
        cleaned = DataCleaner.clean_string(value)
        if cleaned is None:
            return None
        return cleaned.upper().replace(' ', '')

    @classmethod
    def clean_row(cls, row: Dict, mappings: Dict[str, Optional[str]]) -> Dict:
        """Clean a single data row."""
        cleaned = {}

        # String fields
        for field in ['address', 'uprn']:
            if mappings.get(field):
                cleaned[field] = cls.clean_string(row.get(mappings[field]))

        # Postcode
        if mappings.get('postcode'):
            cleaned['postcode'] = cls.clean_postcode(row.get(mappings['postcode']))

        # Categorical fields
        for field, valid_values in cls.CATEGORICAL_FIELDS.items():
            if mappings.get(field):
                cleaned[field] = cls.clean_categorical(
                    row.get(mappings[field]), valid_values
                )

        # Integer fields
        for field in ['bedrooms', 'year_built']:
            if mappings.get(field):
                value = cls.clean_integer(row.get(mappings[field]))
                if field == 'year_built' and value:
                    if value < 1800 or value > datetime.now().year:
                        value = None
                cleaned[field] = value

        # Float fields
        for field in ['latitude', 'longitude', 'floor_area']:
            if mappings.get(field):
                cleaned[field] = cls.clean_float(row.get(mappings[field]))

        # Other string fields
        for field in ['heating', 'condition', 'tenure_type', 'local_authority', 'ward',
                      'construction_type', 'wall_insulation', 'roof_type']:
            if mappings.get(field):
                cleaned[field] = cls.clean_string(row.get(mappings[field]))

        return cleaned


class Geocoder:
    """Geocodes properties using postcodes.io API with rate limiting."""

    API_URL = "https://api.postcodes.io/postcodes"
    MAX_REQUESTS_PER_SEC = 2
    REQUEST_INTERVAL = 1.0 / MAX_REQUESTS_PER_SEC

    def __init__(self):
        self.last_request_time = 0
        self.geocoded_count = 0
        self.failed_postcodes = set()

    def rate_limit(self) -> None:
        """Enforce rate limiting."""
        import time
        elapsed = time.time() - self.last_request_time
        if elapsed < self.REQUEST_INTERVAL:
            time.sleep(self.REQUEST_INTERVAL - elapsed)

    def geocode(self, postcode: str) -> Tuple[Optional[float], Optional[float]]:
        """
        Geocode a UK postcode.

        Args:
            postcode: UK postcode (uppercase, no spaces)

        Returns:
            Tuple of (latitude, longitude) or (None, None) if failed
        """
        if not postcode or postcode in self.failed_postcodes:
            return None, None

        self.rate_limit()

        try:
            url = f"{self.API_URL}/{quote(postcode)}"
            response = requests.get(url, timeout=10)
            response.raise_for_status()

            data = response.json()
            if data.get('status') == 200:
                result = data.get('result', {})
                lat = result.get('latitude')
                lon = result.get('longitude')
                if lat and lon:
                    self.geocoded_count += 1
                    return float(lat), float(lon)
        except requests.RequestException as e:
            logger.warning(f"Geocoding failed for {postcode}: {e}")

        self.failed_postcodes.add(postcode)
        return None, None


class PropertyImporter:
    """Handles property data import into PostgreSQL."""

    def __init__(self, db_url: str):
        """Initialize database connection."""
        self.engine = create_engine(db_url, echo=False)
        self.Session = sessionmaker(bind=self.engine)
        self.stats = {
            'total_records': 0,
            'successful_imports': 0,
            'failed_imports': 0,
            'duplicates_skipped': 0,
            'geocoded_count': 0,
        }
        self.errors = []

    def check_duplicate(self, session, address: Optional[str], postcode: Optional[str],
                       uprn: Optional[str]) -> bool:
        """
        Check if property already exists in database.
        Uses UPRN as primary key, falls back to address+postcode.
        """
        try:
            query = text("""
                SELECT id FROM properties WHERE
            """)

            conditions = []
            params = {}

            if uprn:
                conditions.append("uprn = :uprn")
                params['uprn'] = uprn

            if address and postcode:
                conditions.append("(LOWER(address) = :address AND postcode = :postcode)")
                params['address'] = address.lower()
                params['postcode'] = postcode

            if not conditions:
                return False

            query = text(f"SELECT id FROM properties WHERE {' OR '.join(conditions)}")
            result = session.execute(query, params).first()
            return result is not None
        except Exception as e:
            logger.error(f"Error checking duplicate: {e}")
            return False

    def insert_property(self, session, row: Dict) -> bool:
        """Insert a single property record."""
        try:
            # Extract lat/lng for geometry
            lat = row.get('latitude')
            lon = row.get('longitude')

            # Build INSERT statement
            columns = []
            values = []
            params = {}

            for field, value in row.items():
                if field in ['latitude', 'longitude']:
                    continue
                if value is not None:
                    columns.append(field)
                    param_name = f":{field}"
                    values.append(param_name)
                    params[field] = value

            # Add geometry if available
            if lat and lon:
                columns.append('geometry')
                values.append(f"ST_GeomFromText('POINT({lon} {lat})', 4326)")

            if not columns:
                return False

            insert_sql = f"""
                INSERT INTO properties ({', '.join(columns)})
                VALUES ({', '.join(values)})
            """

            session.execute(text(insert_sql), params)
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            error_msg = f"Insert failed for {row.get('address', 'unknown')}: {e}"
            logger.error(error_msg)
            self.errors.append(error_msg)
            return False

    def import_csv(self, csv_path: str, geocoder: Geocoder) -> None:
        """
        Import properties from CSV file.

        Args:
            csv_path: Path to CSV file
            geocoder: Geocoder instance for missing coordinates
        """
        logger.info(f"Starting import from {csv_path}")

        try:
            df = pd.read_csv(csv_path, dtype=str)
            self.stats['total_records'] = len(df)
            logger.info(f"Loaded {self.stats['total_records']} records from CSV")
        except Exception as e:
            logger.error(f"Failed to read CSV: {e}")
            return

        # Detect column mappings
        mappings = ColumnMapper.detect_mappings(df)
        ColumnMapper.log_detected_mappings(mappings)

        session = self.Session()

        for idx, row in df.iterrows():
            try:
                # Clean data
                cleaned = DataCleaner.clean_row(row, mappings)

                # Geocode if missing coordinates
                if cleaned.get('postcode') and (not cleaned.get('latitude') or not cleaned.get('longitude')):
                    lat, lon = geocoder.geocode(cleaned['postcode'])
                    if lat and lon:
                        cleaned['latitude'] = lat
                        cleaned['longitude'] = lon

                # Check for duplicates
                if self.check_duplicate(session, cleaned.get('address'),
                                       cleaned.get('postcode'), cleaned.get('uprn')):
                    self.stats['duplicates_skipped'] += 1
                    logger.debug(f"Skipping duplicate: {cleaned.get('address', cleaned.get('uprn', 'unknown'))}")
                    continue

                # Insert record
                if self.insert_property(session, cleaned):
                    self.stats['successful_imports'] += 1
                else:
                    self.stats['failed_imports'] += 1

                if (idx + 1) % 100 == 0:
                    logger.info(f"Processed {idx + 1}/{self.stats['total_records']} records")

            except Exception as e:
                self.stats['failed_imports'] += 1
                error_msg = f"Row {idx}: {e}"
                logger.error(error_msg)
                self.errors.append(error_msg)

        session.close()
        self.stats['geocoded_count'] = geocoder.geocoded_count

    def generate_validation_report(self) -> None:
        """Generate and log a validation report."""
        session = self.Session()

        try:
            # Total properties
            total = session.execute(text("SELECT COUNT(*) FROM properties")).scalar()
            logger.info(f"\n{'='*60}")
            logger.info("VALIDATION REPORT")
            logger.info(f"{'='*60}")
            logger.info(f"Total properties in database: {total}")

            # By EPC rating
            logger.info("\nProperties by EPC rating:")
            epc_query = text("""
                SELECT epc, COUNT(*) as count FROM properties
                WHERE epc IS NOT NULL
                GROUP BY epc ORDER BY epc
            """)
            for row in session.execute(epc_query):
                logger.info(f"  {row[0].upper()}: {row[1]}")

            missing_epc = session.execute(
                text("SELECT COUNT(*) FROM properties WHERE epc IS NULL")
            ).scalar()
            logger.info(f"  Missing EPC: {missing_epc}")

            # By property type
            logger.info("\nProperties by type:")
            type_query = text("""
                SELECT property_type, COUNT(*) as count FROM properties
                WHERE property_type IS NOT NULL
                GROUP BY property_type ORDER BY count DESC
            """)
            for row in session.execute(type_query):
                logger.info(f"  {row[0].title()}: {row[1]}")

            missing_type = session.execute(
                text("SELECT COUNT(*) FROM properties WHERE property_type IS NULL")
            ).scalar()
            logger.info(f"  Missing type: {missing_type}")

            # Coordinates
            logger.info("\nGeographic coverage:")
            with_coords = session.execute(
                text("SELECT COUNT(*) FROM properties WHERE geometry IS NOT NULL")
            ).scalar()
            missing_coords = session.execute(
                text("SELECT COUNT(*) FROM properties WHERE geometry IS NULL")
            ).scalar()
            logger.info(f"  With coordinates: {with_coords}")
            logger.info(f"  Missing coordinates: {missing_coords}")

            logger.info(f"{'='*60}\n")

        except Exception as e:
            logger.error(f"Error generating validation report: {e}")
        finally:
            session.close()

    def print_summary(self) -> None:
        """Print import summary."""
        logger.info("\n" + "="*60)
        logger.info("IMPORT SUMMARY")
        logger.info("="*60)
        logger.info(f"Total records processed: {self.stats['total_records']}")
        logger.info(f"Successful imports: {self.stats['successful_imports']}")
        logger.info(f"Failed imports: {self.stats['failed_imports']}")
        logger.info(f"Duplicates skipped: {self.stats['duplicates_skipped']}")
        logger.info(f"Records geocoded: {self.stats['geocoded_count']}")

        if self.errors:
            logger.info(f"\nFirst 10 errors:")
            for error in self.errors[:10]:
                logger.info(f"  - {error}")

        logger.info("="*60 + "\n")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Import social housing properties from CSV into SHDT database'
    )
    parser.add_argument('--csv', required=True, help='Path to CSV file')
    parser.add_argument('--db-url', required=True, help='Database URL (postgresql://...)')

    args = parser.parse_args()

    # Validate inputs
    csv_path = Path(args.csv)
    if not csv_path.exists():
        logger.error(f"CSV file not found: {csv_path}")
        sys.exit(1)

    logger.info(f"Starting SHDT property import")
    logger.info(f"CSV file: {csv_path}")
    logger.info(f"Database: {args.db_url.split('@')[1] if '@' in args.db_url else 'local'}")

    try:
        # Initialize components
        geocoder = Geocoder()
        importer = PropertyImporter(args.db_url)

        # Run import
        importer.import_csv(str(csv_path), geocoder)

        # Print results
        importer.print_summary()

        # Generate validation report
        importer.generate_validation_report()

        logger.info("Import completed successfully")

    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
