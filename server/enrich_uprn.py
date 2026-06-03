#!/usr/bin/env python3
"""
UPRN Coordinate Enrichment via OS Open UPRN Dataset.

Matches property UPRNs against the OS Open UPRN dataset and enriches properties
with precise latitude/longitude coordinates.

The OS Open UPRN dataset is a large CSV file (~35MB, ~1.5GB uncompressed) containing
UPRN to coordinate mappings for all UK properties.

Dataset: https://api.os.uk/downloads/v1/products/OpenUPRN/downloads?area=GB&format=CSV&redirect
Columns: UPRN, LATITUDE, LONGITUDE, X_COORDINATE, Y_COORDINATE

Usage:
    python enrich_uprn.py [--limit N]

The script:
1. Checks for existing OS UPRN CSV file locally at data/os_open_uprn/
2. Downloads if missing (using curl with progress)
3. Fetches all UPRNs from the properties table that haven't been matched yet
4. Stream-reads the OS CSV (doesn't load 35M rows into memory)
5. Batch-updates matched properties with precise coordinates
6. Falls back gracefully if download fails

Note: First run may take time to download and process the large CSV file.
      Subsequent runs will reuse the cached download.
"""

import sys
import os
import csv
import time
import subprocess
import logging
import argparse
from datetime import datetime
from typing import Optional, List, Dict, Set

from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()
sys.path.insert(0, os.path.dirname(__file__))
from database import engine

# Configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data", "os_open_uprn")
OS_UPRN_FILENAME = "osopenuprn_202404_csv.csv"
OS_UPRN_LOCAL_PATH = os.path.join(DATA_DIR, OS_UPRN_FILENAME)

# Download URL - returns redirect to actual file
OS_UPRN_DOWNLOAD_URL = "https://api.os.uk/downloads/v1/products/OpenUPRN/downloads?area=GB&format=CSV&redirect"

# Batch size for database updates
BATCH_SIZE = 1000

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def ensure_data_directory() -> None:
    """Create data directory if it doesn't exist."""
    os.makedirs(DATA_DIR, exist_ok=True)
    logger.info(f"Data directory: {DATA_DIR}")


def download_os_uprn_dataset() -> bool:
    """
    Download the OS Open UPRN dataset using curl.

    Uses curl with:
    - -L: Follow redirects
    - -o: Output to file
    - -w: Write out progress info

    Returns:
        True if download succeeds, False otherwise
    """
    logger.info("Downloading OS Open UPRN dataset...")
    logger.info(f"URL: {OS_UPRN_DOWNLOAD_URL}")
    logger.info(f"Destination: {OS_UPRN_LOCAL_PATH}")

    try:
        result = subprocess.run(
            [
                "curl", "-L", "-o", OS_UPRN_LOCAL_PATH,
                "-w", "\nDownloaded: %{size_download} bytes, HTTP %{http_code}\n",
                "--max-time", "600",  # 10 minute timeout for large file
                OS_UPRN_DOWNLOAD_URL
            ],
            capture_output=True,
            text=True,
            timeout=620  # Python timeout slightly longer than curl timeout
        )

        if result.returncode != 0:
            logger.error(f"Download failed: curl returned {result.returncode}")
            logger.error(f"stderr: {result.stderr}")
            return False

        logger.info(f"Download output: {result.stdout}")

        # Verify file exists and has content
        if not os.path.exists(OS_UPRN_LOCAL_PATH):
            logger.error("Downloaded file does not exist")
            return False

        file_size = os.path.getsize(OS_UPRN_LOCAL_PATH)
        logger.info(f"Downloaded file size: {file_size:,} bytes")

        if file_size < 1000:
            logger.error("Downloaded file is too small (likely an error page)")
            os.remove(OS_UPRN_LOCAL_PATH)
            return False

        return True

    except subprocess.TimeoutExpired:
        logger.error("Download timeout (10 minutes exceeded)")
        return False
    except Exception as e:
        logger.error(f"Download error: {e}")
        return False


def get_uprn_dataset_path() -> Optional[str]:
    """
    Get path to OS UPRN CSV file, downloading if necessary.

    Returns:
        Path to CSV file if available, None if download failed
    """
    # Check if file already exists
    if os.path.exists(OS_UPRN_LOCAL_PATH):
        file_size = os.path.getsize(OS_UPRN_LOCAL_PATH)
        logger.info(f"Using cached OS UPRN file: {OS_UPRN_LOCAL_PATH} ({file_size:,} bytes)")
        return OS_UPRN_LOCAL_PATH

    # File doesn't exist, need to download
    logger.info("OS UPRN file not found locally")
    ensure_data_directory()

    if download_os_uprn_dataset():
        return OS_UPRN_LOCAL_PATH
    else:
        logger.error(
            "Failed to download OS Open UPRN dataset. "
            "To enrich UPRNs manually:\n"
            "1. Download from: https://www.ordnancesurvey.co.uk/products/os-open-uprn\n"
            "2. Place CSV at: " + OS_UPRN_LOCAL_PATH + "\n"
            "3. Re-run this script\n"
            "Skipping UPRN enrichment for now."
        )
        return None


def get_unenriched_uprns(limit: Optional[int] = None) -> Set[str]:
    """
    Fetch all unique UPRNs from properties that haven't been enriched yet.

    Query finds UPRNs where:
    - UPRN is NOT NULL (property has a UPRN)
    - uprn_matched is FALSE (coordinates haven't been enriched from UPRN yet)

    Args:
        limit: Maximum number of UPRNs to fetch

    Returns:
        Set of UPRN strings for fast lookup
    """
    try:
        with engine.connect() as connection:
            query_text = """
                SELECT DISTINCT uprn
                FROM properties
                WHERE uprn IS NOT NULL
                AND uprn IS NOT ''
                AND (uprn_matched = FALSE OR uprn_matched IS NULL)
            """

            if limit:
                query_text += f" LIMIT {limit}"

            query = text(query_text)
            result = connection.execute(query)
            uprns = {row[0] for row in result.fetchall()}

            logger.info(f"Found {len(uprns)} unenriched UPRNs")
            return uprns

    except Exception as e:
        logger.error(f"Error fetching unenriched UPRNs: {e}")
        return set()


def stream_read_os_csv(csv_path: str, target_uprns: Set[str]) -> Dict[str, Dict]:
    """
    Stream-read the OS UPRN CSV file and match against target UPRNs.

    Reads line-by-line to avoid loading entire 35M-row file into memory.
    Expected CSV columns: UPRN, LATITUDE, LONGITUDE, X_COORDINATE, Y_COORDINATE

    Args:
        csv_path: Path to OS UPRN CSV file
        target_uprns: Set of UPRNs to match

    Returns:
        Dict mapping UPRN to coordinates:
        {
            "12345678901": {
                "latitude": 51.5074,
                "longitude": -0.1278,
                "x_coordinate": 531234.5,
                "y_coordinate": 179432.1
            }
        }
    """
    matched_coordinates = {}
    lines_read = 0
    matches_found = 0

    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)

            # Validate column names
            if not reader.fieldnames:
                logger.error("CSV file is empty or invalid")
                return matched_coordinates

            expected_columns = {'UPRN', 'LATITUDE', 'LONGITUDE', 'X_COORDINATE', 'Y_COORDINATE'}
            actual_columns = set(reader.fieldnames)

            if not expected_columns.issubset(actual_columns):
                logger.error(
                    f"CSV missing expected columns. "
                    f"Expected: {expected_columns}, "
                    f"Found: {actual_columns}"
                )
                return matched_coordinates

            logger.info(f"CSV columns: {reader.fieldnames}")
            logger.info(f"Streaming through OS UPRN file...")

            for row in reader:
                lines_read += 1

                # Log progress every 1M rows
                if lines_read % 1000000 == 0:
                    logger.info(
                        f"  Progress: {lines_read:,} rows read, "
                        f"{matches_found:,} UPRNs matched"
                    )

                uprn = row.get('UPRN', '').strip()

                # Check if this UPRN is in our target set
                if uprn and uprn in target_uprns:
                    try:
                        latitude = float(row.get('LATITUDE', 0))
                        longitude = float(row.get('LONGITUDE', 0))
                        x_coordinate = float(row.get('X_COORDINATE', 0))
                        y_coordinate = float(row.get('Y_COORDINATE', 0))

                        # Only store if we have valid coordinates
                        if latitude and longitude:
                            matched_coordinates[uprn] = {
                                "latitude": latitude,
                                "longitude": longitude,
                                "x_coordinate": x_coordinate,
                                "y_coordinate": y_coordinate
                            }
                            matches_found += 1

                    except (ValueError, TypeError) as e:
                        logger.warning(f"Invalid coordinate data for UPRN {uprn}: {e}")
                        continue

        logger.info(f"CSV read complete: {lines_read:,} total rows, {matches_found:,} UPRNs matched")
        return matched_coordinates

    except FileNotFoundError:
        logger.error(f"CSV file not found: {csv_path}")
        return matched_coordinates
    except Exception as e:
        logger.error(f"Error reading CSV: {e}")
        return matched_coordinates


def batch_update_properties(uprn_coordinates: Dict[str, Dict]) -> tuple:
    """
    Batch update properties table with matched UPRN coordinates.

    Updates:
    - uprn_matched: Set to TRUE
    - latitude: Replaced with precise OS coordinate
    - longitude: Replaced with precise OS coordinate
    - x_coordinate: OS grid reference easting
    - y_coordinate: OS grid reference northing
    - last_enriched_at: Timestamp

    Args:
        uprn_coordinates: Dict mapping UPRN to coordinate dict

    Returns:
        Tuple of (updated_count, error_count)
    """
    updated_count = 0
    error_count = 0
    timestamp = datetime.utcnow().isoformat()

    if not uprn_coordinates:
        logger.info("No coordinates to update")
        return 0, 0

    try:
        with engine.begin() as connection:
            # Process in batches
            uprn_list = list(uprn_coordinates.items())
            total_batches = (len(uprn_list) + BATCH_SIZE - 1) // BATCH_SIZE

            for batch_num in range(total_batches):
                start_idx = batch_num * BATCH_SIZE
                end_idx = min(start_idx + BATCH_SIZE, len(uprn_list))
                batch_items = uprn_list[start_idx:end_idx]

                for uprn, coords in batch_items:
                    try:
                        update_query = text("""
                            UPDATE properties
                            SET
                                latitude = :latitude,
                                longitude = :longitude,
                                x_coordinate = :x_coordinate,
                                y_coordinate = :y_coordinate,
                                uprn_matched = TRUE,
                                last_enriched_at = :last_enriched_at
                            WHERE uprn = :uprn
                        """)

                        connection.execute(update_query, {
                            "latitude": coords["latitude"],
                            "longitude": coords["longitude"],
                            "x_coordinate": coords["x_coordinate"],
                            "y_coordinate": coords["y_coordinate"],
                            "uprn_matched": True,
                            "last_enriched_at": timestamp,
                            "uprn": uprn
                        })

                        updated_count += 1

                    except Exception as e:
                        logger.warning(f"Error updating UPRN {uprn}: {e}")
                        error_count += 1

                # Log progress
                if (batch_num + 1) % 10 == 0 or (batch_num + 1) == total_batches:
                    logger.info(
                        f"  Batch {batch_num + 1}/{total_batches}: "
                        f"{updated_count} updated, {error_count} errors"
                    )

        logger.info(f"Database updates complete: {updated_count} updated, {error_count} errors")
        return updated_count, error_count

    except Exception as e:
        logger.error(f"Database connection error during update: {e}")
        error_count += len(uprn_coordinates)
        return updated_count, error_count


def run_enrichment(limit: Optional[int] = None) -> None:
    """
    Run the full UPRN coordinate enrichment pipeline.

    Steps:
    1. Get path to OS UPRN CSV (download if needed)
    2. Fetch all unenriched UPRNs from database
    3. Stream-read CSV and match UPRNs
    4. Batch-update properties with coordinates
    5. Report results

    Args:
        limit: Maximum number of UPRNs to process (optional)
    """
    logger.info("=" * 70)
    logger.info("UPRN Coordinate Enrichment via OS Open UPRN Dataset")
    logger.info("=" * 70)

    start_time = datetime.now()

    # Step 1: Get CSV file path
    csv_path = get_uprn_dataset_path()
    if not csv_path:
        logger.warning("OS UPRN dataset unavailable. Skipping enrichment.")
        return

    # Step 2: Get unenriched UPRNs
    target_uprns = get_unenriched_uprns(limit=limit)
    if not target_uprns:
        logger.info("No unenriched UPRNs found. All properties are up to date.")
        return

    logger.info(f"Target UPRNs to match: {len(target_uprns)}")

    # Step 3: Stream-read CSV and match
    uprn_coordinates = stream_read_os_csv(csv_path, target_uprns)

    if not uprn_coordinates:
        logger.warning("No UPRN matches found in OS dataset")
        return

    logger.info(f"Matched coordinates for {len(uprn_coordinates)} UPRNs")

    # Step 4: Batch update database
    updated, errors = batch_update_properties(uprn_coordinates)

    # Step 5: Report
    elapsed = (datetime.now() - start_time).total_seconds()
    logger.info("=" * 70)
    logger.info("UPRN Enrichment Summary:")
    logger.info(f"  Target UPRNs:        {len(target_uprns)}")
    logger.info(f"  Matches found:       {len(uprn_coordinates)}")
    logger.info(f"  Properties updated:  {updated}")
    logger.info(f"  Update errors:       {errors}")
    logger.info(f"  Total time:          {elapsed:.1f} seconds")
    logger.info("=" * 70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Enrich property coordinates using OS Open UPRN dataset"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of UPRNs to process"
    )
    args = parser.parse_args()

    run_enrichment(limit=args.limit)
