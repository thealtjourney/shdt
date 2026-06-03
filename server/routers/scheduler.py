"""
Router for enrichment scheduling endpoints.
GET /api/scheduler/status - View schedules and next runs
POST /api/scheduler/trigger/{provider} - Manual trigger
PATCH /api/scheduler/config - Update schedule config
GET /api/scheduler/history - View enrichment history
"""
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_

from app.database import get_db
from app.models import EnrichmentConfig, EnrichmentLog
from app.services.enrichment.scheduler import get_scheduler
from app.schemas import (
    ScheduleStatusResponse, ScheduleConfigUpdate, EnrichmentLogResponse
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


@router.get("/status", response_model=Dict[str, Any])
def get_scheduler_status(db: Session = Depends(get_db)):
    """
    Get current scheduler status and schedule information.
    
    Returns:
        - schedules: List of scheduled providers with next run times
        - last_runs: Last run info per provider
        - total_scheduled: Number of active schedules
    """
    try:
        scheduler = get_scheduler()
        schedules = scheduler.get_all_schedules()
        
        # Get last run info from database
        configs = db.query(EnrichmentConfig).all()
        
        last_runs = {}
        for config in configs:
            last_run_log = db.query(EnrichmentLog).filter(
                EnrichmentLog.provider == config.provider
            ).order_by(desc(EnrichmentLog.run_timestamp)).first()
            
            last_runs[config.provider] = {
                'last_run': last_run_log.run_timestamp.isoformat() if last_run_log else None,
                'success_count': last_run_log.success_count if last_run_log else 0,
                'error_count': last_run_log.error_count if last_run_log else 0,
                'enabled': config.enabled,
                'batch_size': config.batch_size
            }
        
        return {
            'schedules': schedules,
            'last_runs': last_runs,
            'total_scheduled': len(schedules),
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get scheduler status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trigger/{provider}")
def trigger_enrichment_now(
    provider: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Manually trigger enrichment for a specific provider.
    
    Args:
        provider: Provider name (epc, postcodes, flood, crime, imd, census, land_registry)
    
    Returns:
        - status: 'triggered' if successfully started
        - provider: Provider name
        - trigger_time: When trigger was initiated
    """
    try:
        # Verify provider exists
        config = db.query(EnrichmentConfig).filter(
            EnrichmentConfig.provider == provider
        ).first()
        
        if not config:
            raise HTTPException(status_code=404, detail=f"Provider {provider} not found")
        
        scheduler = get_scheduler()
        
        # Run in background
        background_tasks.add_task(scheduler.trigger_now, provider)
        
        return {
            'status': 'triggered',
            'provider': provider,
            'trigger_time': datetime.utcnow().isoformat(),
            'message': f'Enrichment triggered for {provider}'
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to trigger enrichment for {provider}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/config")
def update_scheduler_config(
    update: ScheduleConfigUpdate,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Update enrichment schedule configuration for a provider.
    
    Args:
        provider: Provider name
        trigger_type: 'cron' or 'interval'
        trigger_config: Configuration dict for trigger
        enabled: Enable/disable the schedule
    
    Returns:
        - updated: Configuration after update
        - message: Confirmation message
    """
    try:
        scheduler = get_scheduler()
        
        success = scheduler.update_config(
            db=db,
            provider=update.provider,
            trigger_type=update.trigger_type,
            trigger_config=update.trigger_config,
            enabled=update.enabled
        )
        
        if not success:
            raise HTTPException(status_code=400, detail="Failed to update configuration")
        
        config = db.query(EnrichmentConfig).filter(
            EnrichmentConfig.provider == update.provider
        ).first()
        
        return {
            'status': 'updated',
            'provider': update.provider,
            'updated': {
                'trigger_type': config.trigger_type,
                'trigger_config': config.trigger_config,
                'enabled': config.enabled
            },
            'message': f'Configuration updated for {update.provider}'
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update scheduler config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history", response_model=Dict[str, Any])
def get_enrichment_history(
    provider: Optional[str] = Query(None, description="Filter by provider"),
    limit: int = Query(100, ge=1, le=1000, description="Number of records to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get enrichment run history with filtering and pagination.
    
    Args:
        provider: Filter by provider (optional)
        limit: Max records to return (1-1000)
        offset: Pagination offset
    
    Returns:
        - history: List of enrichment runs
        - total_count: Total records matching filter
        - filtered_by: Applied filters
    """
    try:
        query = db.query(EnrichmentLog)
        
        if provider:
            query = query.filter(EnrichmentLog.provider == provider)
        
        total_count = query.count()
        
        logs = query.order_by(desc(EnrichmentLog.run_timestamp)).offset(offset).limit(limit).all()
        
        history = []
        for log in logs:
            history.append({
                'provider': log.provider,
                'run_timestamp': log.run_timestamp.isoformat(),
                'total_count': log.total_count,
                'success_count': log.success_count,
                'error_count': log.error_count,
                'skip_count': log.skip_count,
                'success_rate': (log.success_count / log.total_count * 100) if log.total_count > 0 else 0,
                'duration_seconds': log.duration_seconds,
                'error_details': log.data.get('error_details', []) if log.data else []
            })
        
        return {
            'history': history,
            'total_count': total_count,
            'limit': limit,
            'offset': offset,
            'filtered_by': {'provider': provider} if provider else {},
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get enrichment history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/next-runs")
def get_next_scheduled_runs(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get next scheduled run times for all providers.
    
    Returns:
        - next_runs: Dict of provider -> next_run_timestamp
        - upcoming: Sorted list of next runs
    """
    try:
        scheduler = get_scheduler()
        
        next_runs = {}
        upcoming = []
        
        configs = db.query(EnrichmentConfig).filter(EnrichmentConfig.enabled == True).all()
        
        for config in configs:
            next_run = scheduler.get_next_run(config.provider)
            if next_run:
                next_runs[config.provider] = next_run.isoformat()
                upcoming.append({
                    'provider': config.provider,
                    'next_run': next_run.isoformat(),
                    'time_until_run_seconds': (next_run - datetime.utcnow()).total_seconds()
                })
        
        # Sort by time until run
        upcoming.sort(key=lambda x: x['time_until_run_seconds'])
        
        return {
            'next_runs': next_runs,
            'upcoming': upcoming,
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get next scheduled runs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test/{provider}")
def test_enrichment_provider(
    provider: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Test connection and basic functionality of an enrichment provider.
    
    Args:
        provider: Provider name
    
    Returns:
        - status: 'ok' or 'error'
        - provider: Provider name
        - details: Test results
    """
    try:
        from app.services.enrichment.providers import EnrichmentProviderFactory
        
        factory = EnrichmentProviderFactory()
        enrich_provider = factory.get_provider(provider)
        
        # Test with a single property
        test_result = enrich_provider.test_connection()
        
        return {
            'status': 'ok' if test_result else 'error',
            'provider': provider,
            'details': {
                'connection_ok': test_result,
                'test_time': datetime.utcnow().isoformat()
            }
        }
    except Exception as e:
        logger.error(f"Provider test failed for {provider}: {e}")
        return {
            'status': 'error',
            'provider': provider,
            'error': str(e),
            'test_time': datetime.utcnow().isoformat()
        }
