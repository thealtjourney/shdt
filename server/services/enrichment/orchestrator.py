"""
Enrichment orchestrator for coordinating multiple data sources.

Manages the enrichment pipeline, coordinating multiple providers in parallel,
batch processing, and persistence of results.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from shdt.database.models import Property, EnrichmentLog, EnrichmentConfig

logger = logging.getLogger(__name__)


class EnrichmentOrchestrator:
    """
    Orchestrates enrichment of properties from multiple providers.

    Coordinates parallel enrichment from multiple providers, manages batching,
    handles partial failures, and persists results to the database.
    """

    # Batch processing defaults
    DEFAULT_BATCH_SIZE = 50
    ENRICHMENT_VALIDITY_DAYS = 30

    def __init__(self, db_session: AsyncSession, providers: List[Any]):
        """
        Initialize the orchestrator.

        Args:
            db_session: AsyncSQL session for database operations
            providers: List of EnrichmentProvider instances
        """
        self.db = db_session
        self.providers = {p.provider_name: p for p in providers}
        self._logger = logger.getChild("Orchestrator")

    async def enrich_property(self, property_id: str) -> Dict[str, Any]:
        """
        Enrich a single property from all configured providers.

        Runs all enabled providers in parallel using asyncio.gather.
        Handles partial failures gracefully - if some providers fail,
        others still complete and partial results are returned.

        Args:
            property_id: The property ID to enrich

        Returns:
            dict: Aggregated enrichment results with structure:
                {
                    "property_id": str,
                    "success": bool,  # True if at least one provider succeeded
                    "results": {
                        "provider_name": {
                            "success": bool,
                            "data": {},
                            "error": Optional[str],
                            "fetched_at": str
                        }
                    },
                    "partial_failure": bool,  # True if some providers failed
                    "enriched_at": str
                }
        """
        self._logger.info(f"Starting enrichment for property {property_id}")

        # Get enabled providers from config
        enabled_providers = await self._get_enabled_providers()

        # Run all providers in parallel
        tasks = [
            self.providers[name].enrich_with_retry(property_id)
            for name in enabled_providers
            if name in self.providers
        ]

        results = await asyncio.gather(*tasks, return_exceptions=False)

        # Aggregate results
        aggregated = {
            "property_id": property_id,
            "success": False,
            "results": {},
            "partial_failure": False,
            "enriched_at": datetime.utcnow().isoformat(),
        }

        succeeded = 0
        failed = 0

        for result in results:
            provider_name = result.get("provider")
            aggregated["results"][provider_name] = {
                "success": result.get("success", False),
                "data": result.get("data", {}),
                "error": result.get("error"),
                "fetched_at": result.get("fetched_at"),
            }

            if result.get("success"):
                succeeded += 1
            else:
                failed += 1

        aggregated["success"] = succeeded > 0
        aggregated["partial_failure"] = failed > 0 and succeeded > 0

        self._logger.info(
            f"Enrichment complete for property {property_id}: "
            f"{succeeded} succeeded, {failed} failed"
        )

        return aggregated

    async def enrich_batch(
        self,
        property_ids: List[str],
        batch_size: int = DEFAULT_BATCH_SIZE
    ) -> Dict[str, Any]:
        """
        Enrich multiple properties in batches with progress tracking.

        Processes properties in configurable batch sizes to manage
        memory and rate limits. Returns summary statistics.

        Args:
            property_ids: List of property IDs to enrich
            batch_size: Number of properties to process concurrently

        Returns:
            dict: Summary with structure:
                {
                    "total": int,
                    "succeeded": int,
                    "failed": int,
                    "partial_failures": int,
                    "processing_time_seconds": float,
                    "start_time": str,
                    "end_time": str
                }
        """
        start_time = datetime.utcnow()
        start_iso = start_time.isoformat()

        self._logger.info(
            f"Starting batch enrichment: {len(property_ids)} properties, "
            f"batch size {batch_size}"
        )

        total = len(property_ids)
        succeeded = 0
        failed = 0
        partial_failures = 0

        # Process in batches
        for i in range(0, len(property_ids), batch_size):
            batch = property_ids[i : i + batch_size]
            self._logger.debug(
                f"Processing batch {i // batch_size + 1} "
                f"({len(batch)} properties)"
            )

            # Process all properties in batch in parallel
            tasks = [self.enrich_property(pid) for pid in batch]
            batch_results = await asyncio.gather(*tasks, return_exceptions=False)

            # Update counters
            for result in batch_results:
                try:
                    await self._store_enrichment_result(result)

                    if result.get("success"):
                        succeeded += 1
                    else:
                        failed += 1

                    if result.get("partial_failure"):
                        partial_failures += 1

                except Exception as e:
                    self._logger.error(
                        f"Failed to store enrichment result for "
                        f"{result.get('property_id')}: {e}"
                    )
                    failed += 1

        end_time = datetime.utcnow()
        processing_time = (end_time - start_time).total_seconds()

        summary = {
            "total": total,
            "succeeded": succeeded,
            "failed": failed,
            "partial_failures": partial_failures,
            "processing_time_seconds": processing_time,
            "start_time": start_iso,
            "end_time": end_time.isoformat(),
        }

        self._logger.info(f"Batch enrichment complete: {summary}")
        return summary

    async def enrich_all(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Enrich all properties in the portfolio.

        Intelligently processes all properties, skipping those enriched
        within the last 30 days unless force_refresh is True.

        Args:
            force_refresh: If True, re-enrich all properties regardless of age

        Returns:
            dict: Summary statistics (same structure as enrich_batch)
        """
        self._logger.info(f"Starting full portfolio enrichment (force_refresh={force_refresh})")

        # Get all property IDs
        query = select(Property.id)
        if not force_refresh:
            cutoff_date = datetime.utcnow() - timedelta(days=self.ENRICHMENT_VALIDITY_DAYS)
            query = query.where(
                (Property.last_enriched_at.is_(None))
                | (Property.last_enriched_at < cutoff_date)
            )

        result = await self.db.execute(query)
        property_ids = [row[0] for row in result.fetchall()]

        self._logger.info(
            f"Processing {len(property_ids)} properties "
            f"(force_refresh={force_refresh})"
        )

        return await self.enrich_batch(property_ids)

    async def _store_enrichment_result(self, enrichment_result: Dict[str, Any]) -> None:
        """
        Store enrichment results in database.

        Saves individual provider results to enrichment_log table and
        updates properties table with enriched fields and timestamp.

        Args:
            enrichment_result: Result dict from enrich_property()
        """
        property_id = enrichment_result.get("property_id")

        # Store individual provider results in enrichment_log
        for provider_name, provider_result in enrichment_result.get("results", {}).items():
            log_entry = EnrichmentLog(
                property_id=property_id,
                provider_name=provider_name,
                success=provider_result.get("success", False),
                data_json=provider_result.get("data", {}),
                error_message=provider_result.get("error"),
                fetched_at=datetime.fromisoformat(provider_result.get("fetched_at")),
            )
            self.db.add(log_entry)

        # Update property with enriched fields and timestamp
        stmt = (
            update(Property)
            .where(Property.id == property_id)
            .values(last_enriched_at=datetime.utcnow())
        )

        # If enrichment was successful, also update enriched fields
        if enrichment_result.get("success"):
            enriched_data = self._flatten_enrichment_data(
                enrichment_result.get("results", {})
            )
            if enriched_data:
                stmt = stmt.values(**enriched_data)

        await self.db.execute(stmt)
        await self.db.commit()

        self._logger.debug(f"Stored enrichment results for property {property_id}")

    def _flatten_enrichment_data(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """
        Flatten nested enrichment results into property fields.

        Converts nested provider results into flat dictionary suitable
        for updating Property model fields.

        Args:
            results: Provider results dict from enrichment_result["results"]

        Returns:
            dict: Flattened data ready for database update
        """
        flattened = {}

        for provider_name, provider_result in results.items():
            if not provider_result.get("success"):
                continue

            data = provider_result.get("data", {})

            # Flatten provider data with provider prefix
            for key, value in data.items():
                db_field = f"{provider_name}_{key}"
                flattened[db_field] = value

        return flattened

    async def _get_enabled_providers(self) -> List[str]:
        """
        Get list of enabled providers from enrichment_config table.

        Returns:
            list: Names of enabled providers, or all configured providers if table is empty
        """
        try:
            query = select(EnrichmentConfig.provider_name).where(
                EnrichmentConfig.enabled.is_(True)
            )
            result = await self.db.execute(query)
            enabled = [row[0] for row in result.fetchall()]

            if enabled:
                return enabled

        except Exception as e:
            self._logger.warning(f"Could not fetch enabled providers from config: {e}")

        # Fallback to all configured providers
        return list(self.providers.keys())
