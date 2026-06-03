#!/usr/bin/env python3
"""
Postcodes.io Enrichment Script for Social Housing Digital Twin
Enriches property records with LSOA, MSOA, ward, and other geographic data.
"""

import os
import sys
import json
import time
import logging
import argparse
import subprocess
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
from database import engine
from sqlalchemy import text

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
POSTCODES_API_URL = "https://api.postcodes.io/postcodes"
BATCH_SIZE = 100
RATE_LIMIT_DELAY = 0.5  # seconds between batches
HTTP_TIMEOUT = 15  # curl timeout in seconds


def get_unenriched_postcodes(limit=None):
    """
    Fetch unique postcodes from properties where lsoa_code is NULL.

    Args:
        limit: Maximum number of postcodes to fetch (optional)

    Returns:
        List of postcode strings
    """
    try:
        with engine.connect() as connection:
            query = text("""
                SELECT DISTINCT postcode
                FROM properties
                WHERE lsoa_code IS NULL
                ORDER BY postcode
            """)

            if limit:
                query = text(f"""
                    SELECT DISTINCT postcode
                    FROM properties
                    WHERE lsoa_code IS NULL
                    ORDER BY postcode
                    LIMIT {limit}
                """)

            result = connection.execute(query)
            postcodes = [row[0] for row in result.fetchall()]
            logger.info(f"Found {len(postcodes)} unique unenriched postcodes")
            return postcodes
    except Exception as e:
        logger.error(f"Error fetching unenriched postcodes: {e}")
        return []


def batch_postcodes(postcodes, batch_size=BATCH_SIZE):
    """
    Split postcodes into batches of specified size.

    Args:
        postcodes: List of postcode strings
        batch_size: Maximum postcodes per batch

    Yields:
        Lists of postcodes (batches)
    """
    for i in range(0, len(postcodes), batch_size):
        yield postcodes[i:i + batch_size]


def query_postcodes_api(batch):
    """
    Query Postcodes.io API with a batch of postcodes.

    Uses the shared `http_client` helper which prefers httpx in production
    (Linux / Azure) and falls back to subprocess+curl on macOS LibreSSL.
    See server/http_client.py for the full backend-selection logic.

    Args:
        batch: List of postcode strings

    Returns:
        Dict with 'success' (bool), 'data' (dict or None), 'error' (str or None)
    """
    from http_client import http_post_json

    result = http_post_json(POSTCODES_API_URL, {"postcodes": batch}, timeout=HTTP_TIMEOUT)

    if not result["success"]:
        return {"success": False, "data": None, "error": result.get("error") or "Unknown error"}

    response_data = result["data"]
    if not response_data or not response_data.get("result"):
        return {"success": False, "data": None, "error": "No results in API response"}

    return {"success": True, "data": response_data, "error": None}


def parse_api_response(api_response):
    """
    Parse Postcodes.io API response and extract relevant fields.

    Args:
        api_response: API response dict with 'result' key

    Returns:
        Dict mapping postcode to enriched data
    """
    enriched_data = {}

    if not api_response.get("result"):
        return enriched_data

    for result in api_response["result"]:
        postcode = result.get("query")
        if not postcode:
            continue

        query_result = result.get("result")
        if not query_result:
            continue

        # postcodes.io puts codes in a nested 'codes' dict
        codes = query_result.get("codes", {})
        enriched_data[postcode] = {
            "lsoa_code": codes.get("lsoa", None),
            "lsoa_name": query_result.get("lsoa", None),
            "msoa_code": codes.get("msoa", None),
            "msoa_name": query_result.get("msoa", None),
            "ward_code": codes.get("admin_ward", None),
            "ward_name": query_result.get("admin_ward", None),
            "parish": query_result.get("parish", None),
            "parliamentary_constituency": query_result.get("parliamentary_constituency", None),
            "local_authority_code": codes.get("admin_district", None),
            "local_authority_name": query_result.get("admin_district", None),
            "region": query_result.get("region", None),
        }

    return enriched_data


def update_properties(postcode_data):
    """
    Update properties table with enriched postcode data.

    Args:
        postcode_data: Dict mapping postcode to enriched data

    Returns:
        Tuple (updated_count, error_count)
    """
    updated_count = 0
    error_count = 0
    timestamp = datetime.utcnow().isoformat()

    try:
        with engine.connect() as connection:
            for postcode, data in postcode_data.items():
                try:
                    # Build update clause dynamically
                    update_fields = []
                    params = {}

                    for key, value in data.items():
                        if value is not None:
                            update_fields.append(f"{key} = :{key}")
                            params[key] = value

                    update_fields.append("last_enriched_at = :last_enriched_at")
                    params["last_enriched_at"] = timestamp
                    params["postcode"] = postcode

                    update_query = text(f"""
                        UPDATE properties
                        SET {', '.join(update_fields)}
                        WHERE postcode = :postcode
                    """)

                    connection.execute(update_query, params)
                    updated_count += 1

                except Exception as e:
                    logger.warning(f"Error updating postcode {postcode}: {e}")
                    error_count += 1

            connection.commit()

    except Exception as e:
        logger.error(f"Database connection error during update: {e}")
        error_count += len(postcode_data)

    return updated_count, error_count


def main():
    """Main enrichment process."""
    parser = argparse.ArgumentParser(
        description="Enrich property postcodes using Postcodes.io API"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of postcodes to process"
    )
    args = parser.parse_args()

    logger.info("Starting postcode enrichment process")

    # Fetch unenriched postcodes
    postcodes = get_unenriched_postcodes(limit=args.limit)
    if not postcodes:
        logger.info("No unenriched postcodes found")
        return

    # Process in batches
    total_updated = 0
    total_errors = 0
    batch_count = 0

    for batch in batch_postcodes(postcodes, BATCH_SIZE):
        batch_count += 1
        logger.info(f"Processing batch {batch_count} ({len(batch)} postcodes)")

        # Query API
        api_response = query_postcodes_api(batch)

        if not api_response["success"]:
            logger.error(f"Batch {batch_count} failed: {api_response['error']}")
            total_errors += len(batch)
            time.sleep(RATE_LIMIT_DELAY)
            continue

        # Parse and update
        enriched_data = parse_api_response(api_response["data"])
        updated, errors = update_properties(enriched_data)

        total_updated += updated
        total_errors += errors

        logger.info(f"Batch {batch_count} complete: {updated} updated, {errors} errors")

        # Rate limiting
        time.sleep(RATE_LIMIT_DELAY)

    # Summary
    logger.info(
        f"Enrichment complete: {total_updated} properties updated, "
        f"{total_errors} errors, {batch_count} batches processed"
    )


if __name__ == "__main__":
    main()
