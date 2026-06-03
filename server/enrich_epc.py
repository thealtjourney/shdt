#!/usr/bin/env python3
"""
EPC (Energy Performance Certificate) enrichment script for Social Housing Digital Twin.

Fetches EPC data from the Open Data Communities API and enriches property records
in the database with energy performance information.

Usage:
    python enrich_epc.py [--limit N]

Requirements:
    - EPC_API_KEY and EPC_EMAIL environment variables must be set
    - Register at https://epc.opendatacommunities.org to obtain credentials
"""

import os
import sys
import json
import time
import base64
import subprocess
import argparse
import string
from datetime import datetime
from typing import Optional, List, Dict, Any
from difflib import SequenceMatcher

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
from database import engine
from sqlalchemy import text

load_dotenv()

# Configuration
EPC_API_KEY = os.getenv("EPC_API_KEY")
EPC_EMAIL = os.getenv("EPC_EMAIL")
EPC_BASE_URL = "https://epc.opendatacommunities.org/api/v1"
RATE_LIMIT_DELAY = 0.5  # seconds between API calls
REQUEST_TIMEOUT = 20  # seconds
CURL_TIMEOUT = 15  # seconds for curl itself

# Field mapping from EPC API to database columns
EPC_FIELD_MAPPING = {
    "current-energy-rating": "epc_rating",
    "current-energy-efficiency": "epc_score",
    "potential-energy-rating": "epc_potential_rating",
    "potential-energy-efficiency": "epc_potential_score",
    "lodgement-date": "epc_lodgement_date",
    "inspection-date": "epc_inspection_date",
    "total-floor-area": "floor_area_m2",
    "walls-description": "wall_type",
    "walls-energy-eff": "wall_insulation",
    "roof-description": "roof_insulation",
    "mainheat-description": "main_heating",
    "main-fuel": "main_fuel",
    "hot-water-description": "hot_water",
    "lighting-description": "lighting",
    "windows-description": "windows",
    "co2-emissions-current": "co2_emissions",
    "co2-emissions-potential": "co2_potential",
    "energy-consumption-current": "energy_cost_current",
    "energy-consumption-potential": "energy_cost_potential",
    "construction-age-band": "construction_age_band",
    "built-form": "built_form",
}


def check_credentials() -> None:
    """Verify that EPC API credentials are configured."""
    if not EPC_API_KEY or not EPC_EMAIL:
        print("ERROR: Missing EPC API credentials")
        print("\nTo use this script, you must:")
        print("1. Register at: https://epc.opendatacommunities.org")
        print("2. Obtain your API key and email")
        print("3. Set environment variables:")
        print("   export EPC_EMAIL='your.email@example.com'")
        print("   export EPC_API_KEY='your-api-key-here'")
        print("\nYou can also add these to a .env file in the project root.")
        sys.exit(1)


def normalize_address(address: str) -> str:
    """Normalize address for comparison."""
    if not address:
        return ""
    # Lowercase, remove punctuation, extra whitespace
    normalized = address.lower()
    normalized = normalized.translate(str.maketrans("", "", string.punctuation))
    normalized = " ".join(normalized.split())
    return normalized


def address_similarity(addr1: str, addr2: str) -> float:
    """Calculate similarity score between two addresses (0.0 to 1.0)."""
    norm1 = normalize_address(addr1)
    norm2 = normalize_address(addr2)
    return SequenceMatcher(None, norm1, norm2).ratio()


def make_epc_request(postcode: str) -> Optional[Dict[str, Any]]:
    """
    Make authenticated request to EPC API using curl.

    Args:
        postcode: UK postcode to search

    Returns:
        Parsed JSON response or None if request failed
    """
    try:
        # Create Basic auth header
        auth_string = f"{EPC_EMAIL}:{EPC_API_KEY}"
        auth_bytes = auth_string.encode("utf-8")
        auth_b64 = base64.b64encode(auth_bytes).decode("ascii")

        url = f"{EPC_BASE_URL}/domestic/search?postcode={postcode}&size=100"

        # Make request with curl
        result = subprocess.run(
            [
                "curl",
                "-s",
                "-w", "\n%{http_code}",
                "--max-time", str(CURL_TIMEOUT),
                "-H", f"Authorization: Basic {auth_b64}",
                "-H", "Accept: application/json",
                url,
            ],
            capture_output=True,
            text=True,
            timeout=REQUEST_TIMEOUT,
        )

        if result.returncode != 0:
            print(f"  WARNING: curl error for {postcode}: {result.stderr}")
            return None

        # Split response and status code
        lines = result.stdout.strip().rsplit("\n", 1)
        if len(lines) != 2:
            print(f"  WARNING: Unexpected curl response format for {postcode}")
            return None

        response_text, status_code = lines
        status_code = int(status_code)

        if status_code != 200:
            print(f"  WARNING: EPC API returned {status_code} for {postcode}")
            return None

        data = json.loads(response_text)
        return data

    except json.JSONDecodeError:
        print(f"  WARNING: Invalid JSON response for {postcode}")
        return None
    except ValueError as e:
        print(f"  WARNING: Error parsing response for {postcode}: {e}")
        return None
    except subprocess.TimeoutExpired:
        print(f"  WARNING: Request timeout for {postcode}")
        return None
    except Exception as e:
        print(f"  WARNING: Unexpected error requesting {postcode}: {e}")
        return None


def match_epc_to_property(
    epc_records: List[Dict[str, Any]], property_address: str
) -> Optional[Dict[str, Any]]:
    """
    Find the best matching EPC record for a property address.

    Args:
        epc_records: List of EPC records from API
        property_address: Property address from database

    Returns:
        Best matching EPC record or None
    """
    if not epc_records:
        return None

    best_match = None
    best_score = 0.5  # Minimum threshold

    for record in epc_records:
        epc_address = record.get("address", "")
        score = address_similarity(property_address, epc_address)

        if score > best_score:
            best_score = score
            best_match = record

    return best_match


def extract_epc_data(epc_record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract and map EPC fields from API response to database fields.

    Args:
        epc_record: Raw EPC record from API

    Returns:
        Mapped data dictionary for database update
    """
    data = {}

    for api_field, db_field in EPC_FIELD_MAPPING.items():
        value = epc_record.get(api_field)

        if value is not None:
            # Convert string numbers to appropriate types
            if db_field in ["epc_score", "epc_potential_score", "floor_area_m2",
                           "co2_emissions", "co2_potential", "energy_cost_current",
                           "energy_cost_potential"]:
                try:
                    data[db_field] = float(value)
                except (ValueError, TypeError):
                    pass  # Keep as None if conversion fails
            else:
                data[db_field] = str(value).strip() if value else None

    return data


def get_properties_needing_enrichment(limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Get properties with NULL epc_score (not yet enriched).

    Args:
        limit: Optional maximum number of properties to return

    Returns:
        List of property records with id, postcode, and address
    """
    query = """
        SELECT id, postcode, address
        FROM properties
        WHERE epc_score IS NULL
        ORDER BY postcode, id
    """

    if limit:
        query += f" LIMIT {int(limit)}"

    with engine.connect() as conn:
        result = conn.execute(text(query))
        rows = result.fetchall()
        return [
            {"id": row[0], "postcode": row[1], "address": row[2]}
            for row in rows
        ]


def update_property_epc_data(property_id: int, epc_data: Dict[str, Any]) -> bool:
    """
    Update a property record with EPC data.

    Args:
        property_id: Property ID to update
        epc_data: Dictionary of field:value pairs to update

    Returns:
        True if update succeeded, False otherwise
    """
    if not epc_data:
        return False

    try:
        # Add timestamp
        epc_data["last_enriched_at"] = datetime.utcnow().isoformat()

        # Build SET clause
        set_clauses = [f"{key} = :{key}" for key in epc_data.keys()]
        set_clause = ", ".join(set_clauses)

        query = f"""
            UPDATE properties
            SET {set_clause}
            WHERE id = :property_id
        """

        params = epc_data.copy()
        params["property_id"] = property_id

        with engine.connect() as conn:
            conn.execute(text(query), params)
            conn.commit()

        return True

    except Exception as e:
        print(f"    ERROR updating property {property_id}: {e}")
        return False


def enrich_properties(limit: Optional[int] = None) -> None:
    """
    Main enrichment function. Fetches EPC data and updates properties.

    Args:
        limit: Optional maximum number of properties to enrich
    """
    print("EPC Enrichment Script")
    print("=" * 60)

    check_credentials()

    # Get properties needing enrichment
    properties = get_properties_needing_enrichment(limit)

    if not properties:
        print("✓ No properties need enrichment (all have epc_score set)")
        return

    print(f"Found {len(properties)} properties needing enrichment")
    print()

    # Group properties by postcode
    by_postcode = {}
    for prop in properties:
        postcode = prop["postcode"]
        if postcode not in by_postcode:
            by_postcode[postcode] = []
        by_postcode[postcode].append(prop)

    print(f"Querying EPC API for {len(by_postcode)} unique postcodes...")
    print()

    total_updated = 0
    total_matched = 0

    for postcode_idx, (postcode, postcode_props) in enumerate(by_postcode.items(), 1):
        print(f"[{postcode_idx}/{len(by_postcode)}] Postcode: {postcode}")

        if not postcode or postcode.strip() == "":
            print(f"  SKIP: Empty postcode")
            continue

        # Query API
        epc_response = make_epc_request(postcode)

        if not epc_response:
            print(f"  SKIP: API request failed")
            time.sleep(RATE_LIMIT_DELAY)
            continue

        epc_records = epc_response.get("rows", [])
        print(f"  Found {len(epc_records)} EPC records")

        # Match and update each property in this postcode
        for prop in postcode_props:
            match = match_epc_to_property(epc_records, prop["address"])

            if match:
                epc_data = extract_epc_data(match)
                if update_property_epc_data(prop["id"], epc_data):
                    total_updated += 1
                    total_matched += 1
                    print(f"    ✓ Updated property {prop['id']}")
                else:
                    print(f"    ✗ Failed to update property {prop['id']}")
            else:
                print(f"    - No match for property {prop['id']}: {prop['address']}")

        # Rate limiting
        time.sleep(RATE_LIMIT_DELAY)

    print()
    print("=" * 60)
    print(f"Enrichment Complete")
    print(f"  Total matched: {total_matched}")
    print(f"  Total updated: {total_updated}")


def main():
    """Entry point with CLI argument parsing."""
    parser = argparse.ArgumentParser(
        description="Enrich property records with EPC data from Open Data Communities"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of properties to enrich (default: all)",
    )

    args = parser.parse_args()

    try:
        enrich_properties(limit=args.limit)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
