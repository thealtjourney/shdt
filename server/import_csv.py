"""
CSV Import Script for SHDT Properties.

Imports property data from a CSV file into the PostgreSQL database.
Handles column mapping, geometry creation, and duplicate detection (by UPRN).

Usage:
    python import_csv.py <path_to_csv>
    python import_csv.py --generate-sample   # Generate sample data and import it

Expected CSV columns (flexible - maps common variations):
    Required: address, postcode, latitude, longitude
    Optional: uprn, epc_rating, property_type, bedrooms, year_built,
              heating_type, stock_condition_score, last_inspection_date
"""

import csv
import sys
import os
import random
import logging
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()

# Add parent dir to path
sys.path.insert(0, os.path.dirname(__file__))
from database import engine

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Column name mapping: maps common CSV header variations to our DB columns
COLUMN_MAP = {
    # address
    "address": "address",
    "full_address": "address",
    "property_address": "address",
    "addr": "address",
    # postcode
    "postcode": "postcode",
    "post_code": "postcode",
    "zip": "postcode",
    "postal_code": "postcode",
    # latitude
    "latitude": "latitude",
    "lat": "latitude",
    # longitude
    "longitude": "longitude",
    "lng": "longitude",
    "lon": "longitude",
    "long": "longitude",
    # uprn
    "uprn": "uprn",
    # epc_rating
    "epc_rating": "epc_rating",
    "epc": "epc_rating",
    "epc_band": "epc_rating",
    "energy_rating": "epc_rating",
    # property_type
    "property_type": "property_type",
    "type": "property_type",
    "dwelling_type": "property_type",
    # bedrooms
    "bedrooms": "bedrooms",
    "beds": "bedrooms",
    "number_of_bedrooms": "bedrooms",
    # year_built
    "year_built": "year_built",
    "built": "year_built",
    "construction_year": "year_built",
    "build_year": "year_built",
    # heating_type
    "heating_type": "heating_type",
    "heating": "heating_type",
    "heating_system": "heating_type",
    # stock_condition_score
    "stock_condition_score": "stock_condition_score",
    "condition_score": "stock_condition_score",
    "condition": "stock_condition_score",
    # last_inspection_date
    "last_inspection_date": "last_inspection_date",
    "inspection_date": "last_inspection_date",
    "last_inspection": "last_inspection_date",
}

DB_COLUMNS = [
    "uprn", "address", "postcode", "latitude", "longitude",
    "epc_rating", "property_type", "bedrooms", "year_built",
    "heating_type", "stock_condition_score", "last_inspection_date",
]


def map_headers(csv_headers: list) -> dict:
    """Map CSV headers to database column names."""
    mapping = {}
    for header in csv_headers:
        normalized = header.strip().lower().replace(" ", "_").replace("-", "_")
        if normalized in COLUMN_MAP:
            mapping[header] = COLUMN_MAP[normalized]
        else:
            logger.warning(f"Unmapped CSV column: '{header}' — skipping")
    return mapping


def parse_row(row: dict, header_map: dict) -> dict:
    """Parse a CSV row into a database-ready dictionary."""
    parsed = {}
    for csv_col, db_col in header_map.items():
        value = row.get(csv_col, "").strip()
        if not value:
            parsed[db_col] = None
            continue

        if db_col in ("latitude", "longitude", "stock_condition_score"):
            try:
                parsed[db_col] = float(value)
            except ValueError:
                parsed[db_col] = None
        elif db_col in ("bedrooms", "year_built"):
            try:
                parsed[db_col] = int(float(value))
            except ValueError:
                parsed[db_col] = None
        elif db_col == "epc_rating":
            parsed[db_col] = value.upper()[0] if value else None
        else:
            parsed[db_col] = value

    return parsed


def import_csv(filepath: str) -> int:
    """
    Import properties from a CSV file.

    Returns:
        Number of rows imported
    """
    filepath = Path(filepath)
    if not filepath.exists():
        logger.error(f"File not found: {filepath}")
        return 0

    logger.info(f"Reading CSV: {filepath}")

    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        header_map = map_headers(headers)

        if "address" not in header_map.values():
            logger.error("CSV must have an 'address' column (or equivalent)")
            return 0
        if "postcode" not in header_map.values():
            logger.error("CSV must have a 'postcode' column (or equivalent)")
            return 0

        logger.info(f"Mapped columns: {header_map}")

        rows = []
        for row in reader:
            parsed = parse_row(row, header_map)
            if parsed.get("address") and parsed.get("postcode"):
                rows.append(parsed)

    if not rows:
        logger.warning("No valid rows found in CSV")
        return 0

    logger.info(f"Parsed {len(rows)} valid rows, inserting into database...")

    inserted = 0
    skipped = 0

    with engine.begin() as conn:
        for row in rows:
            try:
                # Build geometry from lat/lng if available
                lat = row.get("latitude")
                lng = row.get("longitude")
                geom_expr = (
                    f"ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)"
                    if lat is not None and lng is not None
                    else "NULL"
                )

                sql = text(f"""
                    INSERT INTO properties (
                        uprn, address, postcode, latitude, longitude,
                        epc_rating, property_type, bedrooms, year_built,
                        heating_type, stock_condition_score, last_inspection_date,
                        geometry
                    ) VALUES (
                        :uprn, :address, :postcode, :latitude, :longitude,
                        :epc_rating, :property_type, :bedrooms, :year_built,
                        :heating_type, :stock_condition_score,
                        CASE WHEN :last_inspection_date IS NOT NULL
                             THEN CAST(:last_inspection_date AS DATE)
                             ELSE NULL END,
                        {geom_expr}
                    )
                    ON CONFLICT (uprn) WHERE uprn IS NOT NULL
                    DO UPDATE SET
                        address = EXCLUDED.address,
                        postcode = EXCLUDED.postcode,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        epc_rating = EXCLUDED.epc_rating,
                        property_type = EXCLUDED.property_type,
                        bedrooms = EXCLUDED.bedrooms,
                        year_built = EXCLUDED.year_built,
                        heating_type = EXCLUDED.heating_type,
                        stock_condition_score = EXCLUDED.stock_condition_score,
                        last_inspection_date = EXCLUDED.last_inspection_date,
                        geometry = EXCLUDED.geometry,
                        updated_at = NOW()
                """)

                # Fill missing keys with None
                params = {col: row.get(col) for col in DB_COLUMNS}
                conn.execute(sql, params)
                inserted += 1

            except Exception as e:
                logger.warning(f"Row skipped ({row.get('address', '?')}): {e}")
                skipped += 1

    logger.info(f"Import complete: {inserted} inserted, {skipped} skipped")
    return inserted


def generate_sample_csv(filepath: str, count: int = 500) -> str:
    """
    Generate a sample CSV with realistic UK social housing properties.

    Covers major UK cities and towns with realistic distributions of
    EPC ratings, property types, heating types, and ages.
    """
    # UK locations with lat/lng ranges (city center + spread)
    locations = [
        # (city, base_lat, base_lng, spread, postcode_prefix, weight)
        ("London", 51.509, -0.118, 0.08, "SE", 80),
        ("London", 51.535, -0.065, 0.06, "E", 60),
        ("London", 51.475, -0.095, 0.05, "SW", 40),
        ("Manchester", 53.483, -2.244, 0.04, "M", 50),
        ("Birmingham", 52.486, -1.890, 0.04, "B", 45),
        ("Leeds", 53.801, -1.548, 0.03, "LS", 35),
        ("Sheffield", 53.381, -1.470, 0.03, "S", 30),
        ("Liverpool", 53.408, -2.991, 0.03, "L", 30),
        ("Bristol", 51.454, -2.587, 0.03, "BS", 25),
        ("Newcastle", 54.978, -1.614, 0.03, "NE", 25),
        ("Nottingham", 52.954, -1.158, 0.03, "NG", 20),
        ("Glasgow", 55.861, -4.251, 0.04, "G", 35),
        ("Edinburgh", 55.953, -3.188, 0.03, "EH", 25),
        ("Cardiff", 51.481, -3.179, 0.03, "CF", 20),
        ("Bradford", 53.795, -1.759, 0.03, "BD", 20),
        ("Coventry", 52.406, -1.519, 0.02, "CV", 15),
        ("Leicester", 52.636, -1.133, 0.02, "LE", 15),
        ("Hull", 53.744, -0.332, 0.02, "HU", 15),
        ("Stoke-on-Trent", 53.002, -2.179, 0.02, "ST", 10),
        ("Wolverhampton", 52.586, -2.120, 0.02, "WV", 10),
    ]

    # Weighted selection
    weighted = []
    for loc in locations:
        weighted.extend([loc] * loc[5])

    property_types = ["Flat", "Terraced", "Semi-detached", "Detached", "Bungalow"]
    property_weights = [35, 30, 20, 5, 10]  # Social housing skews to flats/terraces

    epc_ratings = ["A", "B", "C", "D", "E", "F", "G"]
    epc_weights = [2, 8, 20, 35, 25, 7, 3]  # Most are D, normal-ish distribution

    heating_types = ["Gas", "Electric", "Oil", "Solid Fuel", "Heat Pump"]
    heating_weights = [55, 25, 10, 5, 5]

    street_names = [
        "High Street", "Church Road", "Station Road", "Park Avenue",
        "Victoria Road", "Queens Road", "King Street", "Mill Lane",
        "Manor Road", "Green Lane", "Albert Road", "Springfield Road",
        "George Street", "York Road", "Windsor Drive", "Oak Avenue",
        "Elm Close", "Cedar Way", "Birch Lane", "Maple Drive",
        "The Crescent", "Woodlands Road", "Brook Street", "Hill View",
        "Riverside Walk", "Meadow Lane", "Chapel Street", "Castle Road",
        "Wellington Road", "Nelson Street", "Churchill Way", "Jubilee Close",
    ]

    rows = []
    for i in range(count):
        loc = random.choice(weighted)
        city, base_lat, base_lng, spread, pc_prefix, _ = loc

        lat = base_lat + random.uniform(-spread, spread)
        lng = base_lng + random.uniform(-spread, spread)

        house_num = random.randint(1, 200)
        street = random.choice(street_names)
        pc_area = random.randint(1, 29)
        pc_sector = random.randint(1, 9)
        pc_unit = f"{''.join(random.choices('ABCDEFGHJKLMNPRSTUVWXYZ', k=2))}"
        postcode = f"{pc_prefix}{pc_area} {pc_sector}{pc_unit}"

        prop_type = random.choices(property_types, property_weights)[0]
        epc = random.choices(epc_ratings, epc_weights)[0]
        heating = random.choices(heating_types, heating_weights)[0]

        bedrooms = (
            random.randint(1, 2) if prop_type == "Flat"
            else random.randint(1, 3) if prop_type in ("Terraced", "Bungalow")
            else random.randint(2, 4) if prop_type == "Semi-detached"
            else random.randint(3, 5)
        )

        year_built = random.choices(
            [random.randint(1880, 1919), random.randint(1920, 1945),
             random.randint(1946, 1964), random.randint(1965, 1979),
             random.randint(1980, 1999), random.randint(2000, 2024)],
            [10, 15, 25, 25, 15, 10]
        )[0]

        condition = round(random.uniform(1.0, 5.0), 1)
        days_ago = random.randint(30, 1800)
        inspection = (date.today() - timedelta(days=days_ago)).isoformat()
        uprn = f"{random.randint(10000000000, 99999999999)}"

        rows.append({
            "uprn": uprn,
            "address": f"{house_num} {street}, {city}",
            "postcode": postcode,
            "latitude": round(lat, 6),
            "longitude": round(lng, 6),
            "epc_rating": epc,
            "property_type": prop_type,
            "bedrooms": bedrooms,
            "year_built": year_built,
            "heating_type": heating,
            "stock_condition_score": condition,
            "last_inspection_date": inspection,
        })

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=DB_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    logger.info(f"Generated {count} sample properties → {filepath}")
    return filepath


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python import_csv.py <path_to_csv>")
        print("       python import_csv.py --generate-sample [count]")
        sys.exit(1)

    if sys.argv[1] == "--generate-sample":
        count = int(sys.argv[2]) if len(sys.argv) > 2 else 500
        sample_path = os.path.join(os.path.dirname(__file__), "sample_properties.csv")
        generate_sample_csv(sample_path, count)
        imported = import_csv(sample_path)
        print(f"\nDone! {imported} properties loaded into the database.")
    else:
        imported = import_csv(sys.argv[1])
        print(f"\nDone! {imported} properties loaded into the database.")
