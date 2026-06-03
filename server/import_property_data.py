"""
Import PropertyData.csv into SHDT database.

Handles:
1. Extracting UK postcodes from the address field
2. Batch geocoding postcodes via postcodes.io (free, no API key needed)
3. Inserting into PostgreSQL with PostGIS geometry
"""

import csv
import re
import sys
import os
import time
import logging
import json
from typing import Dict, List, Optional, Tuple
from pathlib import Path

import requests
from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()
sys.path.insert(0, os.path.dirname(__file__))
from database import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# UK postcode regex pattern
UK_POSTCODE_RE = re.compile(
    r'([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$',
    re.IGNORECASE
)

# postcodes.io allows up to 100 postcodes per batch request
GEOCODE_BATCH_SIZE = 100


def extract_postcode(address: str) -> Optional[str]:
    """Extract UK postcode from the end of an address string."""
    match = UK_POSTCODE_RE.search(address.strip())
    if match:
        pc = match.group(1).upper().strip()
        # Normalize spacing: ensure single space before last 3 chars
        if " " not in pc:
            pc = pc[:-3] + " " + pc[-3:]
        return pc
    return None


def batch_geocode(postcodes: List[str]) -> Dict[str, Tuple[float, float]]:
    """
    Geocode a batch of postcodes using postcodes.io bulk lookup.

    Returns dict of postcode -> (latitude, longitude)
    """
    results = {}

    for i in range(0, len(postcodes), GEOCODE_BATCH_SIZE):
        batch = postcodes[i:i + GEOCODE_BATCH_SIZE]

        try:
            resp = requests.post(
                "https://api.postcodes.io/postcodes",
                json={"postcodes": batch},
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()

            for item in data.get("result", []):
                query_pc = item.get("query", "")
                result = item.get("result")
                if result and result.get("latitude") and result.get("longitude"):
                    results[query_pc.upper().replace(" ", "")] = (
                        result["latitude"],
                        result["longitude"],
                    )
        except requests.RequestException as e:
            logger.warning(f"Geocode batch failed (batch {i//GEOCODE_BATCH_SIZE}): {e}")
            time.sleep(1)

        # Rate limit: postcodes.io allows ~100 requests/sec, but be nice
        if i + GEOCODE_BATCH_SIZE < len(postcodes):
            time.sleep(0.3)

    return results


def map_property_class(prop_class: str) -> str:
    """Map CSV property class to our standard property types."""
    mapping = {
        "house": "House",
        "flat": "Flat",
        "bungalow": "Bungalow",
        "maisonette": "Flat",
        "bedsit": "Flat",
        "park home": "Other",
    }
    return mapping.get(prop_class.lower().strip(), prop_class.title())


def import_property_data(filepath: str) -> int:
    """
    Import PropertyData.csv into the database.

    Steps:
    1. Read CSV and extract postcodes
    2. Collect unique postcodes and geocode them
    3. Insert properties with coordinates
    """
    filepath = Path(filepath)
    if not filepath.exists():
        logger.error(f"File not found: {filepath}")
        return 0

    # Step 1: Read all rows and extract postcodes
    logger.info(f"Reading CSV: {filepath}")
    rows = []
    postcodes_needed = set()

    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            address = row.get("propertyaddress", "").strip()
            if not address:
                continue

            postcode = extract_postcode(address)
            parsed = {
                "address": address,
                "postcode": postcode,
                "local_authority": row.get("localauthoritydesc", "").strip(),
                "property_type": map_property_class(row.get("propertyclass", "")),
            }
            rows.append(parsed)

            if postcode:
                postcodes_needed.add(postcode)

    logger.info(f"Read {len(rows)} rows, {len(postcodes_needed)} unique postcodes to geocode")

    # Step 2: Geocode all unique postcodes
    postcodes_list = list(postcodes_needed)
    logger.info(f"Geocoding {len(postcodes_list)} postcodes via postcodes.io...")

    geocode_cache = {}
    total_batches = (len(postcodes_list) + GEOCODE_BATCH_SIZE - 1) // GEOCODE_BATCH_SIZE

    for batch_num in range(total_batches):
        start = batch_num * GEOCODE_BATCH_SIZE
        end = start + GEOCODE_BATCH_SIZE
        batch = postcodes_list[start:end]

        batch_results = batch_geocode(batch)
        geocode_cache.update(batch_results)

        if (batch_num + 1) % 10 == 0 or batch_num == total_batches - 1:
            logger.info(
                f"  Geocoded batch {batch_num + 1}/{total_batches} "
                f"({len(geocode_cache)}/{len(postcodes_list)} postcodes resolved)"
            )

    logger.info(f"Geocoding complete: {len(geocode_cache)}/{len(postcodes_list)} postcodes resolved")

    # Step 3: Insert into database
    logger.info("Inserting properties into database...")
    inserted = 0
    skipped_no_postcode = 0
    skipped_no_coords = 0
    skipped_error = 0

    with engine.begin() as conn:
        for i, row in enumerate(rows):
            postcode = row["postcode"]

            if not postcode:
                skipped_no_postcode += 1
                continue

            # Look up coordinates
            pc_key = postcode.upper().replace(" ", "")
            coords = geocode_cache.get(pc_key)

            if not coords:
                skipped_no_coords += 1
                continue

            lat, lng = coords

            try:
                sql = text("""
                    INSERT INTO properties (
                        address, postcode, latitude, longitude,
                        property_type, geometry
                    ) VALUES (
                        :address, :postcode, :latitude, :longitude,
                        :property_type,
                        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
                    )
                    ON CONFLICT (LOWER(TRIM(address)), TRIM(postcode))
                    DO UPDATE SET
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        property_type = COALESCE(EXCLUDED.property_type, properties.property_type),
                        geometry = EXCLUDED.geometry,
                        updated_at = NOW()
                """)

                conn.execute(sql, {
                    "address": row["address"],
                    "postcode": postcode,
                    "latitude": lat,
                    "longitude": lng,
                    "property_type": row["property_type"],
                })
                inserted += 1

            except Exception as e:
                skipped_error += 1
                if skipped_error <= 5:
                    logger.warning(f"Insert failed ({row['address'][:50]}): {e}")

            if (i + 1) % 5000 == 0:
                logger.info(f"  Progress: {i + 1}/{len(rows)} rows processed, {inserted} inserted")

    logger.info(f"\nImport complete:")
    logger.info(f"  Total rows:          {len(rows)}")
    logger.info(f"  Inserted:            {inserted}")
    logger.info(f"  Skipped (no PC):     {skipped_no_postcode}")
    logger.info(f"  Skipped (no coords): {skipped_no_coords}")
    logger.info(f"  Skipped (errors):    {skipped_error}")

    return inserted


if __name__ == "__main__":
    if len(sys.argv) > 1:
        csv_path = sys.argv[1]
    else:
        # Default path
        csv_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "PropertyData.csv"
        )
        if not os.path.exists(csv_path):
            csv_path = os.path.expanduser("~/Documents/dt/PropertyData.csv")

    logger.info(f"Starting import from: {csv_path}")
    count = import_property_data(csv_path)
    print(f"\nDone! {count} properties imported.")
