"""
API router for enrichment operations.

Provides REST endpoints for triggering enrichment, monitoring status,
and managing enrichment provider configurations.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shdt.database.models import Property, EnrichmentLog, EnrichmentConfig
from shdt.database.session import get_db
from shdt.server.services.enrichment import EnrichmentOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/enrichment", tags=["enrichment"])

# Global orchestrator instance (should be initialized on app startup)
_orchestrator: Optional[EnrichmentOrchestrator] = None


def init_enrichment_router(orchestrator: EnrichmentOrchestrator) -> None:
    """
    Initialize the router with an orchestrator instance.

    Must be called during application startup.

    Args:
        orchestrator: EnrichmentOrchestrator instance
    """
    global _orchestrator
    _orchestrator = orchestrator


def _get_orchestrator() -> EnrichmentOrchestrator:
    """Get the orchestrator instance, raising if not initialized."""
    if _orchestrator is None:
        raise RuntimeError("Enrichment router not initialized")
    return _orchestrator


@router.post("/property/{property_id}")
async def enrich_property(
    property_id: int,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Enrich a single property from all configured providers.

    Runs enrichment asynchronously for the specified property,
    storing results in the enrichment_log table.

    Args:
        property_id: ID of the property to enrich
        db: Database session

    Returns:
        dict: Enrichment result with provider-specific data

    Responses:
        200: Enrichment completed (may be partial failure)
        404: Property not found
    """
    # Verify property exists
    query = select(Property).where(Property.id == property_id)
    result = await db.execute(query)
    property_obj = result.scalar_one_or_none()

    if not property_obj:
        raise HTTPException(status_code=404, detail="Property not found")

    orchestrator = _get_orchestrator()
    enrichment_result = await orchestrator.enrich_property(str(property_id))

    logger.info(f"Enriched property {property_id}: {enrichment_result.get('success')}")

    return enrichment_result


@router.post("/batch")
async def batch_enrich(
    property_ids: List[int] = Query(..., description="List of property IDs to enrich"),
    batch_size: int = Query(50, ge=1, le=500, description="Number of concurrent enrichments"),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Enrich multiple properties in batches.

    Processes the specified properties in configurable batches,
    ideal for enriching multiple properties concurrently.

    Args:
        property_ids: List of property IDs to enrich
        batch_size: Number of properties per batch (1-500)
        db: Database session

    Returns:
        dict: Summary statistics including:
            - total: total properties processed
            - succeeded: successful enrichments
            - failed: failed enrichments
            - partial_failures: enrichments with partial failures
            - processing_time_seconds: total time
    """
    if not property_ids:
        raise HTTPException(status_code=400, detail="No property IDs provided")

    # Verify all properties exist
    query = select(func.count(Property.id)).where(Property.id.in_(property_ids))
    result = await db.execute(query)
    count = result.scalar()

    if count != len(property_ids):
        raise HTTPException(status_code=404, detail="One or more properties not found")

    orchestrator = _get_orchestrator()
    summary = await orchestrator.enrich_batch(
        [str(pid) for pid in property_ids],
        batch_size=batch_size
    )

    logger.info(f"Batch enrichment complete: {summary}")

    return summary


@router.post("/all")
async def enrich_all(
    force_refresh: bool = Query(
        False,
        description="Re-enrich all properties regardless of age"
    ),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Enrich all properties in the portfolio.

    By default, skips properties enriched within the last 30 days.
    Use force_refresh=True to re-enrich all regardless.

    This operation can take considerable time and should typically
    be run as a background task.

    Args:
        force_refresh: Whether to skip age-based filtering
        db: Database session

    Returns:
        dict: Summary statistics (see batch_enrich for structure)
    """
    orchestrator = _get_orchestrator()
    summary = await orchestrator.enrich_all(force_refresh=force_refresh)

    logger.info(f"Full portfolio enrichment complete: {summary}")

    return summary


@router.get("/status")
async def get_enrichment_status(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """
    Get enrichment status and statistics.

    Returns overall enrichment statistics and per-provider metrics.

    Returns:
        dict: Status information including:
            - total_properties: total in portfolio
            - enriched_properties: count with last_enriched_at set
            - enrichment_coverage_pct: percentage enriched
            - last_full_run: timestamp of last full portfolio enrichment
            - provider_stats: per-provider success/failure counts
    """
    # Total properties
    query = select(func.count(Property.id))
    result = await db.execute(query)
    total = result.scalar() or 0

    # Enriched properties
    query = select(func.count(Property.id)).where(
        Property.last_enriched_at.isnot(None)
    )
    result = await db.execute(query)
    enriched = result.scalar() or 0

    # Coverage percentage
    coverage_pct = round((enriched / total * 100) if total > 0 else 0, 2)

    # Last full run (most recent successful enrichment across all providers)
    query = select(func.max(EnrichmentLog.fetched_at)).where(
        EnrichmentLog.success.is_(True)
    )
    result = await db.execute(query)
    last_run = result.scalar()

    # Per-provider statistics
    query = select(
        EnrichmentLog.provider_name,
        func.count(EnrichmentLog.id).label("total"),
        func.sum(
            case([(EnrichmentLog.success.is_(True), 1)], else_=0)
        ).label("succeeded"),
    ).group_by(EnrichmentLog.provider_name)

    result = await db.execute(query)
    provider_stats = {}
    for row in result.fetchall():
        provider_name = row[0]
        total_attempts = row[1] or 0
        successful = row[2] or 0
        provider_stats[provider_name] = {
            "total_attempts": total_attempts,
            "successful": successful,
            "failed": total_attempts - successful,
            "success_rate_pct": round(
                (successful / total_attempts * 100) if total_attempts > 0 else 0, 2
            ),
        }

    return {
        "total_properties": total,
        "enriched_properties": enriched,
        "enrichment_coverage_pct": coverage_pct,
        "last_full_run": last_run.isoformat() if last_run else None,
        "provider_stats": provider_stats,
    }


@router.get("/log/{property_id}")
async def get_enrichment_log(
    property_id: int,
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Get enrichment history for a specific property.

    Returns all enrichment log entries for the property, ordered
    by most recent first.

    Args:
        property_id: Property ID to get logs for
        limit: Maximum number of log entries to return (1-1000)
        db: Database session

    Returns:
        dict: Property info and enrichment history entries
    """
    # Verify property exists
    query = select(Property).where(Property.id == property_id)
    result = await db.execute(query)
    property_obj = result.scalar_one_or_none()

    if not property_obj:
        raise HTTPException(status_code=404, detail="Property not found")

    # Get enrichment logs
    query = (
        select(EnrichmentLog)
        .where(EnrichmentLog.property_id == property_id)
        .order_by(EnrichmentLog.fetched_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    logs = result.scalars().all()

    return {
        "property_id": property_id,
        "last_enriched_at": property_obj.last_enriched_at.isoformat()
        if property_obj.last_enriched_at
        else None,
        "history_count": len(logs),
        "entries": [
            {
                "id": log.id,
                "provider_name": log.provider_name,
                "success": log.success,
                "error_message": log.error_message,
                "data_json": log.data_json,
                "fetched_at": log.fetched_at.isoformat(),
            }
            for log in logs
        ],
    }


@router.get("/config")
async def get_enrichment_config(db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """
    Get all enrichment provider configurations.

    Returns the current configuration for all enrichment providers,
    including enabled status and rate limits.

    Returns:
        dict: Mapping of provider names to their configuration
    """
    query = select(EnrichmentConfig)
    result = await db.execute(query)
    configs = result.scalars().all()

    return {
        config.provider_name: {
            "enabled": config.enabled,
            "last_run": config.last_run.isoformat() if config.last_run else None,
            "rate_limit_override": config.rate_limit_override,
            "created_at": config.created_at.isoformat(),
            "updated_at": config.updated_at.isoformat(),
        }
        for config in configs
    }


@router.patch("/config/{provider_name}")
async def update_enrichment_config(
    provider_name: str,
    enabled: Optional[bool] = None,
    rate_limit_override: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """
    Update configuration for a specific enrichment provider.

    Allows enabling/disabling providers and overriding rate limits.

    Args:
        provider_name: Name of the provider to configure
        enabled: Whether to enable/disable the provider
        rate_limit_override: Override the default rate limit (None to use default)
        db: Database session

    Returns:
        dict: Updated configuration

    Responses:
        200: Configuration updated successfully
        404: Provider not found
        400: Invalid configuration values
    """
    if enabled is None and rate_limit_override is None:
        raise HTTPException(
            status_code=400,
            detail="Must specify either 'enabled' or 'rate_limit_override'"
        )

    if rate_limit_override is not None and rate_limit_override < 1:
        raise HTTPException(
            status_code=400,
            detail="rate_limit_override must be >= 1"
        )

    # Get or create config
    query = select(EnrichmentConfig).where(
        EnrichmentConfig.provider_name == provider_name
    )
    result = await db.execute(query)
    config = result.scalar_one_or_none()

    if not config:
        config = EnrichmentConfig(provider_name=provider_name)
        db.add(config)

    # Update fields
    if enabled is not None:
        config.enabled = enabled

    if rate_limit_override is not None:
        config.rate_limit_override = rate_limit_override

    await db.commit()
    await db.refresh(config)

    logger.info(f"Updated enrichment config for {provider_name}: {enabled=}, {rate_limit_override=}")

    return {
        "provider_name": config.provider_name,
        "enabled": config.enabled,
        "last_run": config.last_run.isoformat() if config.last_run else None,
        "rate_limit_override": config.rate_limit_override,
        "updated_at": config.updated_at.isoformat(),
    }
