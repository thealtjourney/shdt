"""
Master Enrichment Runner — runs all enrichment providers in sequence.

Usage:
    python enrich_all.py                  # Run all providers
    python enrich_all.py --limit 10       # Limit each provider to 10 locations/postcodes
    python enrich_all.py --only postcodes # Run only one provider
    python enrich_all.py --skip crime     # Skip one provider
"""

import sys
import os
import time
import argparse
import logging

sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

PROVIDERS = ["postcodes", "crime", "flood", "imd", "epc", "forecast", "census", "uprn", "broadband"]


def run_postcodes(limit):
    logger.info("=" * 60)
    logger.info("RUNNING: Postcodes.io Enrichment (LSOA, ward, region)")
    logger.info("=" * 60)
    from enrich_postcodes import main as postcodes_main
    # Monkey-patch sys.argv for argparse
    old_argv = sys.argv
    sys.argv = ["enrich_postcodes.py"] + (["--limit", str(limit)] if limit else [])
    try:
        postcodes_main()
    finally:
        sys.argv = old_argv


def run_crime(limit):
    logger.info("=" * 60)
    logger.info("RUNNING: Police Crime API Enrichment")
    logger.info("=" * 60)
    from enrich_crime import run_enrichment
    run_enrichment(limit=limit)


def run_flood(limit):
    logger.info("=" * 60)
    logger.info("RUNNING: Environment Agency Flood Risk Enrichment")
    logger.info("=" * 60)
    from enrich_flood import run_enrichment
    run_enrichment(limit=limit)


def run_imd(limit):
    logger.info("=" * 60)
    logger.info("RUNNING: IMD Deprivation Enrichment")
    logger.info("=" * 60)
    from enrich_imd import main as imd_main
    old_argv = sys.argv
    sys.argv = ["enrich_imd.py", "--download"]
    try:
        imd_main()
    finally:
        sys.argv = old_argv


def run_epc(limit):
    logger.info("=" * 60)
    logger.info("RUNNING: EPC Energy Performance Enrichment")
    logger.info("=" * 60)
    from enrich_epc import enrich_properties
    enrich_properties(limit=limit)


def run_forecast(limit):
    logger.info("=" * 60)
    logger.info("RUNNING: Weather Forecast Flood Risk Enrichment")
    logger.info("=" * 60)
    from enrich_forecast import run_enrichment
    run_enrichment(limit=limit)




def run_census(limit):
    logger.info("=" * 60)
    logger.info("RUNNING: Census 2021 Demographic Enrichment")
    logger.info("=" * 60)
    from enrich_census import run_enrichment
    run_enrichment(limit=limit)


def run_uprn(limit):
    logger.info("=" * 60)
    logger.info("RUNNING: OS Open UPRN Coordinate Enrichment")
    logger.info("=" * 60)
    from enrich_uprn import run_enrichment
    run_enrichment(limit=limit)


def run_broadband(limit):
    logger.info("=" * 60)
    logger.info("RUNNING: Broadband & Utilities Enrichment")
    logger.info("=" * 60)
    from enrich_broadband import run_enrichment
    run_enrichment(limit=limit)


def main():
    parser = argparse.ArgumentParser(description="Run all enrichment providers")
    parser.add_argument("--limit", type=int, default=None, help="Limit per provider")
    parser.add_argument("--only", choices=PROVIDERS, default=None, help="Run only this provider")
    parser.add_argument("--skip", choices=PROVIDERS, action="append", default=[], help="Skip provider(s)")
    args = parser.parse_args()

    runners = {
        "postcodes": run_postcodes,
        "crime": run_crime,
        "flood": run_flood,
        "imd": run_imd,
        "epc": run_epc,
        "forecast": run_forecast,
        "census": run_census,
        "uprn": run_uprn,
        "broadband": run_broadband,
    }

    to_run = [args.only] if args.only else PROVIDERS
    to_run = [p for p in to_run if p not in args.skip]

    logger.info(f"Enrichment pipeline: {', '.join(to_run)}")
    if args.limit:
        logger.info(f"Limit per provider: {args.limit}")
    logger.info("")

    for provider in to_run:
        start = time.time()
        try:
            runners[provider](args.limit)
        except Exception as e:
            logger.error(f"Provider '{provider}' failed: {e}")
            import traceback
            traceback.print_exc()
        elapsed = time.time() - start
        logger.info(f"  {provider} completed in {elapsed:.1f}s\n")

    logger.info("All enrichment providers complete.")


if __name__ == "__main__":
    main()
