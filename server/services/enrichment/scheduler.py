"""
APScheduler-based enrichment scheduling and incremental enrichment orchestration.
Handles automated scheduling of enrichment tasks and prioritizes enrichment targets.
"""
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from app.models import EnrichmentConfig, Property, EnrichmentLog
from app.services.enrichment.providers import EnrichmentProviderFactory
from app.database import SessionLocal

logger = logging.getLogger(__name__)


class EnrichmentScheduler:
    """Manages scheduled enrichment tasks with incremental enrichment strategy."""

    # Default schedules per provider
    DEFAULT_SCHEDULES = {
        'epc': {'trigger': 'cron', 'day': 1, 'hour': 2, 'minute': 0, 'description': 'Monthly first day'},
        'postcodes': {'trigger': 'cron', 'day': 1, 'month': '1,4,7,10', 'hour': 3, 'minute': 0, 'description': 'Quarterly'},
        'flood': {'trigger': 'cron', 'hour': '0,12', 'minute': 0, 'description': 'Twice daily + monthly warnings'},
        'crime': {'trigger': 'cron', 'day': 15, 'hour': 4, 'minute': 0, 'description': 'Monthly 15th'},
        'imd': {'trigger': 'cron', 'month': 1, 'day': 1, 'hour': 5, 'minute': 0, 'description': 'Annually on Jan 1'},
        'census': {'trigger': 'cron', 'month': 1, 'day': 15, 'hour': 6, 'minute': 0, 'description': 'As needed'},
        'land_registry': {'trigger': 'cron', 'day': 1, 'hour': 7, 'minute': 0, 'description': 'Monthly first day'},
    }

    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.provider_factory = EnrichmentProviderFactory()
        self._load_schedules()

    def _load_schedules(self):
        """Load enrichment schedules from database and initialize scheduler."""
        db = SessionLocal()
        try:
            configs = db.query(EnrichmentConfig).all()
            for config in configs:
                if config.enabled:
                    self._schedule_provider(db, config)
        finally:
            db.close()

    def _schedule_provider(self, db: Session, config: EnrichmentConfig):
        """Schedule a specific provider based on config."""
        try:
            if config.trigger_type == 'cron':
                trigger_params = self._parse_cron_config(config.trigger_config)
                self.scheduler.add_job(
                    func=self._run_enrichment,
                    trigger=CronTrigger(**trigger_params),
                    id=f'enrichment_{config.provider}',
                    name=f'Enrich {config.provider}',
                    args=[config.provider],
                    replace_existing=True
                )
                logger.info(f"Scheduled {config.provider} enrichment: {config.trigger_config}")
            elif config.trigger_type == 'interval':
                interval_seconds = config.trigger_config.get('seconds', 3600)
                self.scheduler.add_job(
                    func=self._run_enrichment,
                    trigger='interval',
                    seconds=interval_seconds,
                    id=f'enrichment_{config.provider}',
                    name=f'Enrich {config.provider}',
                    args=[config.provider],
                    replace_existing=True
                )
                logger.info(f"Scheduled {config.provider} enrichment: every {interval_seconds}s")
        except Exception as e:
            logger.error(f"Failed to schedule {config.provider}: {e}")

    def _parse_cron_config(self, config: Dict) -> Dict[str, Any]:
        """Parse cron configuration to APScheduler CronTrigger parameters."""
        return {
            k: v for k, v in config.items() 
            if k in ['year', 'month', 'day', 'week', 'day_of_week', 'hour', 'minute', 'second']
        }

    def _run_enrichment(self, provider: str):
        """Execute enrichment for a provider using incremental strategy."""
        db = SessionLocal()
        try:
            logger.info(f"Starting scheduled enrichment for {provider}")
            
            # Get enrichment config
            config = db.query(EnrichmentConfig).filter(
                EnrichmentConfig.provider == provider
            ).first()
            
            if not config or not config.enabled:
                logger.warning(f"Provider {provider} not enabled for enrichment")
                return

            # Get enrichment provider
            enrich_provider = self.provider_factory.get_provider(provider)
            
            # Apply incremental enrichment strategy
            properties_to_enrich = self._get_incremental_batch(db, provider, config.batch_size)
            
            if not properties_to_enrich:
                logger.info(f"No properties to enrich for {provider}")
                return

            # Run enrichment
            results = enrich_provider.enrich_batch(properties_to_enrich)
            
            # Log results
            self._log_enrichment_run(db, provider, results, len(properties_to_enrich))
            
            # Update config last run time
            config.last_run = datetime.utcnow()
            config.last_run_count = len(properties_to_enrich)
            config.last_run_success = results['success_count']
            db.commit()
            
            logger.info(
                f"Completed enrichment for {provider}: "
                f"{results['success_count']}/{len(properties_to_enrich)} successful"
            )
        except Exception as e:
            logger.error(f"Enrichment failed for {provider}: {e}", exc_info=True)
        finally:
            db.close()

    def _get_incremental_batch(
        self, db: Session, provider: str, batch_size: int = 1000
    ) -> List[Property]:
        """
        Get next batch of properties to enrich using incremental strategy:
        1. New properties (never enriched for this provider)
        2. Stale properties (high staleness_score)
        3. Failed retries (error_count > threshold)
        """
        # New properties first
        new_props = db.query(Property).filter(
            and_(
                ~Property.enrichments.any(
                    EnrichmentLog.provider == provider
                ),
                Property.active == True
            )
        ).limit(batch_size // 3).all()

        remaining = batch_size - len(new_props)
        
        # Stale properties (by staleness_score)
        stale_props = db.query(Property).filter(
            and_(
                Property.enrichments.any(
                    EnrichmentLog.provider == provider
                ),
                Property.staleness_score > 0.5,
                Property.active == True
            )
        ).order_by(Property.staleness_score.desc()).limit(remaining // 2).all()

        remaining -= len(stale_props)
        
        # Failed retries
        failed_props = db.query(Property).filter(
            and_(
                Property.enrichments.any(
                    EnrichmentLog.provider == provider,
                    EnrichmentLog.error_count > 2
                ),
                Property.active == True
            )
        ).order_by(Property.staleness_score.desc()).limit(remaining).all()

        return new_props + stale_props + failed_props

    def _log_enrichment_run(
        self, db: Session, provider: str, results: Dict, total_count: int
    ):
        """Log enrichment run results."""
        log = EnrichmentLog(
            provider=provider,
            run_timestamp=datetime.utcnow(),
            total_count=total_count,
            success_count=results.get('success_count', 0),
            error_count=results.get('error_count', 0),
            skip_count=results.get('skip_count', 0),
            duration_seconds=results.get('duration_seconds', 0),
            data=results.get('details', {})
        )
        db.add(log)
        db.commit()

    def start(self):
        """Start the background scheduler."""
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("Enrichment scheduler started")

    def stop(self):
        """Stop the background scheduler."""
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("Enrichment scheduler stopped")

    def get_next_run(self, provider: str) -> Optional[datetime]:
        """Get next scheduled run time for a provider."""
        job = self.scheduler.get_job(f'enrichment_{provider}')
        if job:
            return job.next_run_time
        return None

    def get_all_schedules(self) -> List[Dict]:
        """Get all scheduled jobs."""
        schedules = []
        for job in self.scheduler.get_jobs():
            if job.id.startswith('enrichment_'):
                schedules.append({
                    'provider': job.id.replace('enrichment_', ''),
                    'name': job.name,
                    'next_run': job.next_run_time.isoformat() if job.next_run_time else None,
                    'trigger': str(job.trigger)
                })
        return schedules

    def trigger_now(self, provider: str) -> bool:
        """Manually trigger enrichment for a provider."""
        try:
            self._run_enrichment(provider)
            return True
        except Exception as e:
            logger.error(f"Manual trigger failed for {provider}: {e}")
            return False

    def update_config(
        self, db: Session, provider: str, 
        trigger_type: str, trigger_config: Dict, enabled: bool
    ) -> bool:
        """Update enrichment configuration for a provider."""
        try:
            config = db.query(EnrichmentConfig).filter(
                EnrichmentConfig.provider == provider
            ).first()
            
            if not config:
                config = EnrichmentConfig(provider=provider)
                db.add(config)
            
            config.trigger_type = trigger_type
            config.trigger_config = trigger_config
            config.enabled = enabled
            db.commit()
            
            # Reschedule the job
            if enabled:
                self._schedule_provider(db, config)
            else:
                job_id = f'enrichment_{provider}'
                job = self.scheduler.get_job(job_id)
                if job:
                    self.scheduler.remove_job(job_id)
            
            logger.info(f"Updated config for {provider}")
            return True
        except Exception as e:
            logger.error(f"Failed to update config for {provider}: {e}")
            db.rollback()
            return False


# Global scheduler instance
enrichment_scheduler = None


def get_scheduler() -> EnrichmentScheduler:
    """Get or create the global enrichment scheduler."""
    global enrichment_scheduler
    if enrichment_scheduler is None:
        enrichment_scheduler = EnrichmentScheduler()
    return enrichment_scheduler


def init_scheduler():
    """Initialize and start the enrichment scheduler."""
    scheduler = get_scheduler()
    scheduler.start()
    logger.info("Enrichment scheduler initialized and started")
