"""
Deduplicate properties in the SHDT database.

Finds properties with the same address + postcode, keeps the one with the
most enrichment data, and deletes the rest.

Usage:
    python deduplicate.py              # Dry run (report only)
    python deduplicate.py --execute    # Actually delete duplicates
"""

import sys
import os
import argparse
import logging

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()
from database import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def find_duplicates():
    """Find duplicate properties (same address + postcode)."""
    with engine.connect() as conn:
        # Count how many duplicate groups exist
        groups = conn.execute(text("""
            SELECT LOWER(TRIM(address)) as norm_addr, TRIM(postcode) as norm_pc, COUNT(*) as cnt
            FROM properties
            GROUP BY norm_addr, norm_pc
            HAVING COUNT(*) > 1
            ORDER BY cnt DESC
        """)).fetchall()

        total_dupes = sum(row[2] - 1 for row in groups)  # extras beyond the first
        logger.info(f"Found {len(groups)} duplicate groups, {total_dupes} extra records to remove")

        if groups:
            logger.info(f"\nTop duplicate groups:")
            for row in groups[:20]:
                logger.info(f"  {row[2]}x  {row[0][:60]}, {row[1]}")

        return groups, total_dupes


def remove_duplicates(dry_run=True):
    """
    Remove duplicate properties, keeping the best record per group.

    'Best' = the one with the most enrichment data (non-null enrichment columns).
    """
    groups, total_dupes = find_duplicates()

    if total_dupes == 0:
        logger.info("No duplicates found — database is clean.")
        return

    if dry_run:
        logger.info(f"\nDRY RUN: Would remove {total_dupes} duplicate records.")
        logger.info("Run with --execute to actually delete them.")
        return

    logger.info(f"\nRemoving {total_dupes} duplicate records...")

    removed = 0
    with engine.begin() as conn:
        # For each duplicate group, keep the row with the most enrichment data.
        # We score each row by counting non-null enrichment columns.
        result = conn.execute(text("""
            DELETE FROM properties
            WHERE id IN (
                SELECT id FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY LOWER(TRIM(address)), TRIM(postcode)
                            ORDER BY
                                -- Prefer rows with more enrichment data
                                (CASE WHEN lsoa_code IS NOT NULL THEN 1 ELSE 0 END
                                 + CASE WHEN crime_last_updated IS NOT NULL THEN 1 ELSE 0 END
                                 + CASE WHEN flood_risk_rivers_seas IS NOT NULL THEN 1 ELSE 0 END
                                 + CASE WHEN epc_score IS NOT NULL THEN 1 ELSE 0 END
                                 + CASE WHEN crime_risk_score IS NOT NULL THEN 1 ELSE 0 END
                                 + CASE WHEN region IS NOT NULL THEN 1 ELSE 0 END
                                 + CASE WHEN local_authority_name IS NOT NULL THEN 1 ELSE 0 END
                                ) DESC,
                                -- Tie-break: prefer most recently updated
                                updated_at DESC NULLS LAST,
                                created_at DESC NULLS LAST
                        ) as rn
                    FROM properties
                ) ranked
                WHERE rn > 1
            )
        """))
        removed = result.rowcount

    logger.info(f"Removed {removed} duplicate records.")

    # Show final count
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM properties")).scalar()
        logger.info(f"Properties remaining: {total}")


def main():
    parser = argparse.ArgumentParser(description="Deduplicate properties in SHDT database")
    parser.add_argument("--execute", action="store_true", help="Actually delete duplicates (default is dry run)")
    args = parser.parse_args()

    remove_duplicates(dry_run=not args.execute)


if __name__ == "__main__":
    main()
