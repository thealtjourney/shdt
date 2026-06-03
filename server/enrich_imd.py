"""
IMD (Index of Multiple Deprivation) Enrichment.

Enriches properties with deprivation data by matching LSOA codes from the
postcodes.io enrichment to the English Indices of Deprivation dataset.

Supports both IoD 2025 (default, LSOA 2021) and IoD 2019 (LSOA 2011).

Run with --download to automatically download the latest IoD 2025 File 7 CSV
from GOV.UK (contains all ranks, scores and deciles at LSOA level).

The script adds these columns to the properties table:
  - imd_rank (1 = most deprived, ~33,000 = least deprived)
  - imd_decile (1 = most deprived 10%, 10 = least deprived 10%)
  - imd_score (higher = more deprived)
  - income_deprivation_score
  - employment_deprivation_score
  - education_deprivation_score
  - health_deprivation_score
  - crime_deprivation_score
  - housing_deprivation_score
  - living_environment_score

Usage:
    python enrich_imd.py --download              # Download IoD 2025 then enrich
    python enrich_imd.py                         # Use local CSV (auto-detects)
    python enrich_imd.py --csv /path/to/file.csv # Use specific CSV
"""

import sys
import os
import csv
import json
import subprocess
import argparse
import logging
from typing import Dict, Optional

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()
from database import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# IoD 2025 File 7: All Ranks, Scores, Deciles (LSOA 2021 boundaries)
# Published Oct 2025 by MHCLG — latest available
IMD_DOWNLOAD_URL = "https://assets.publishing.service.gov.uk/media/691ded56d140bbbaa59a2a7d/File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv"
DEFAULT_CSV_PATH = os.path.join(os.path.dirname(__file__), "imd_2025.csv")

# Fallback: IoD 2019 File 1 (LSOA 2011 boundaries) — kept for reference
IMD_2019_CSV_PATH = os.path.join(os.path.dirname(__file__), "imd_2019.csv")


def ensure_imd_columns():
    """Add IMD columns to properties table if they don't exist."""
    columns = [
        ("imd_rank", "INTEGER"),
        ("imd_decile", "INTEGER"),
        ("imd_score", "REAL"),
        ("income_deprivation_score", "REAL"),
        ("employment_deprivation_score", "REAL"),
        ("education_deprivation_score", "REAL"),
        ("health_deprivation_score", "REAL"),
        ("crime_deprivation_score", "REAL"),
        ("housing_deprivation_score", "REAL"),
        ("living_environment_score", "REAL"),
    ]
    with engine.begin() as conn:
        for col_name, col_type in columns:
            try:
                conn.execute(text(
                    f"ALTER TABLE properties ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
                ))
            except Exception as e:
                logger.debug(f"Column {col_name} may already exist: {e}")
    logger.info("IMD columns verified/created")


def download_imd_csv(output_path: str) -> bool:
    """Download the IoD 2025 CSV from GOV.UK using curl (with redirect following)."""
    logger.info(f"Downloading IoD 2025 data to {output_path}...")
    try:
        result = subprocess.run(
            ["curl", "-sL", "-o", output_path, "--max-time", "120",
             "-H", "User-Agent: Mozilla/5.0 SHDT-Enrichment/1.0",
             IMD_DOWNLOAD_URL],
            capture_output=True, text=True, timeout=150,
        )
        if result.returncode == 0 and os.path.exists(output_path):
            size = os.path.getsize(output_path)
            if size > 100000:  # Should be at least 100KB
                logger.info(f"  Downloaded {size:,} bytes OK")
                # Quick sanity check: peek at first line for CSV headers
                with open(output_path, 'r', encoding='utf-8-sig') as f:
                    first_line = f.readline().lower()
                if 'lsoa' in first_line or 'deprivation' in first_line or 'rank' in first_line:
                    logger.info("  File looks like a valid IMD CSV")
                    return True
                else:
                    logger.warning(f"  File header doesn't look like IMD data: {first_line[:100]}")
                    logger.warning("  Continuing anyway — column matching will verify")
                    return True
            else:
                logger.error(f"  Downloaded file too small ({size} bytes) — may be a redirect/error page")
                # Show what we got for debugging
                with open(output_path, 'r') as f:
                    logger.error(f"  Content: {f.read()[:200]}")
                return False
        else:
            logger.error(f"  curl failed: {result.stderr}")
            return False
    except Exception as e:
        logger.error(f"  Download failed: {e}")
        return False


def load_imd_data(csv_path: str) -> Dict[str, Dict]:
    """
    Load IMD data from CSV into a dict keyed by LSOA code.

    The CSV has varying column names depending on the version, so we
    try multiple known patterns.
    """
    logger.info(f"Loading IMD data from {csv_path}...")

    if not os.path.exists(csv_path):
        logger.error(f"CSV file not found: {csv_path}")
        logger.error("Download it from: https://www.gov.uk/government/statistics/english-indices-of-deprivation-2019")
        return {}

    imd_data = {}

    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []

        # Detect column names (different CSV exports use different names)
        def find_col(patterns):
            for h in headers:
                h_lower = h.lower().strip()
                for p in patterns:
                    if p in h_lower:
                        return h
            return None

        lsoa_col = find_col(['lsoa code', 'lsoa21cd', 'lsoa11cd', 'lsoa_code'])
        rank_col = find_col(['index of multiple deprivation (imd) rank', 'imd rank', 'imd_rank', 'imd - rank'])
        decile_col = find_col(['index of multiple deprivation (imd) decile', 'imd decile', 'imd_decile', 'imd - decile'])
        score_col = find_col(['index of multiple deprivation (imd) score', 'imd score', 'imd_score', 'imd - score'])
        income_col = find_col(['income score', 'income deprivation', 'income - score'])
        employment_col = find_col(['employment score', 'employment deprivation', 'employment - score'])
        education_col = find_col(['education', 'education, skills', 'education - score'])
        health_col = find_col(['health', 'health deprivation', 'health - score'])
        crime_col = find_col(['crime score', 'crime rank', 'crime - score'])
        housing_col = find_col(['barriers to housing', 'housing and services', 'barriers - score'])
        living_col = find_col(['living environment', 'living env', 'living environment - score'])

        if not lsoa_col:
            logger.error(f"Could not find LSOA code column in CSV. Headers: {headers[:5]}")
            return {}

        logger.info(f"  LSOA column: '{lsoa_col}'")
        logger.info(f"  Rank column: '{rank_col}'")
        logger.info(f"  Score column: '{score_col}'")

        for row in reader:
            lsoa = row.get(lsoa_col, '').strip()
            if not lsoa:
                continue

            def safe_float(col):
                if not col:
                    return None
                val = row.get(col, '').strip()
                try:
                    return float(val) if val else None
                except ValueError:
                    return None

            def safe_int(col):
                if not col:
                    return None
                val = row.get(col, '').strip()
                try:
                    return int(float(val)) if val else None
                except ValueError:
                    return None

            imd_data[lsoa] = {
                "imd_rank": safe_int(rank_col),
                "imd_decile": safe_int(decile_col),
                "imd_score": safe_float(score_col),
                "income_deprivation_score": safe_float(income_col),
                "employment_deprivation_score": safe_float(employment_col),
                "education_deprivation_score": safe_float(education_col),
                "health_deprivation_score": safe_float(health_col),
                "crime_deprivation_score": safe_float(crime_col),
                "housing_deprivation_score": safe_float(housing_col),
                "living_environment_score": safe_float(living_col),
            }

    logger.info(f"  Loaded {len(imd_data)} LSOA records")
    return imd_data


def get_lsoa_codes():
    """Get distinct LSOA codes from properties that haven't been IMD-enriched yet."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT DISTINCT lsoa_code
            FROM properties
            WHERE lsoa_code IS NOT NULL
              AND imd_rank IS NULL
        """)).fetchall()
        return [row[0] for row in rows]


def update_properties_imd(imd_data: Dict[str, Dict]):
    """Update properties with IMD data matched by LSOA code."""
    lsoa_codes = get_lsoa_codes()

    if not lsoa_codes:
        logger.info("No properties need IMD enrichment (all already enriched or no LSOA codes)")
        return

    logger.info(f"Matching {len(lsoa_codes)} LSOA codes to IMD data...")

    matched = 0
    unmatched = 0
    updated_props = 0

    with engine.begin() as conn:
        for lsoa in lsoa_codes:
            data = imd_data.get(lsoa)
            if not data:
                unmatched += 1
                continue

            matched += 1

            # Build SET clause for non-null values
            set_parts = []
            params = {"lsoa": lsoa}
            for key, val in data.items():
                if val is not None:
                    set_parts.append(f"{key} = :{key}")
                    params[key] = val

            if not set_parts:
                continue

            set_parts.append("last_enriched_at = NOW()")
            set_clause = ", ".join(set_parts)

            result = conn.execute(text(f"""
                UPDATE properties
                SET {set_clause}
                WHERE lsoa_code = :lsoa
                  AND imd_rank IS NULL
            """), params)
            updated_props += result.rowcount

    logger.info(f"\nIMD enrichment complete:")
    logger.info(f"  LSOA codes matched:   {matched}/{len(lsoa_codes)}")
    logger.info(f"  LSOA codes unmatched: {unmatched}")
    logger.info(f"  Properties updated:   {updated_props}")


def main():
    parser = argparse.ArgumentParser(description="Enrich properties with IMD deprivation data")
    parser.add_argument("--download", action="store_true", help="Download IoD 2025 CSV from GOV.UK first")
    parser.add_argument("--csv", type=str, default=None, help="Path to IMD CSV file")
    parser.add_argument("--force", action="store_true", help="Re-enrich all properties (even already enriched)")
    args = parser.parse_args()

    # Ensure columns exist
    ensure_imd_columns()

    # If --force, clear existing IMD data so all properties get re-enriched
    if args.force:
        logger.info("--force: clearing existing IMD data for re-enrichment...")
        with engine.begin() as conn:
            conn.execute(text(
                "UPDATE properties SET imd_rank = NULL, imd_decile = NULL, imd_score = NULL"
            ))

    # Determine CSV path
    if args.csv:
        csv_path = args.csv
    elif args.download:
        csv_path = DEFAULT_CSV_PATH
    elif os.path.exists(DEFAULT_CSV_PATH):
        csv_path = DEFAULT_CSV_PATH
        logger.info(f"Using existing {csv_path}")
    elif os.path.exists(IMD_2019_CSV_PATH):
        csv_path = IMD_2019_CSV_PATH
        logger.info(f"Using existing {csv_path} (2019 data — consider --download for IoD 2025)")
    else:
        csv_path = DEFAULT_CSV_PATH

    # Download if requested
    if args.download:
        if not download_imd_csv(csv_path):
            logger.error("Download failed. Please download manually from:")
            logger.error("https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025")
            sys.exit(1)

    # Load and enrich
    imd_data = load_imd_data(csv_path)
    if not imd_data:
        sys.exit(1)

    update_properties_imd(imd_data)


if __name__ == "__main__":
    main()
