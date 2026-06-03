"""
Alert monitoring service for SHDT.

Monitors external data sources for alerts and triggers notifications based on
configured rules. Supports flood, crime, weather, and general alerts with
configurable monitoring intervals.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from enum import Enum
from abc import ABC, abstractmethod
import asyncio
from dataclasses import dataclass

logger = logging.getLogger(__name__)


class AlertType(str, Enum):
    """Supported alert types."""
    FLOOD = "flood"
    CRIME = "crime"
    WEATHER = "weather"
    GENERAL = "general"


@dataclass
class MonitorConfig:
    """Configuration for alert monitoring."""
    alert_type: AlertType
    check_interval_minutes: int
    data_source_url: str
    timeout_seconds: int = 30
    retry_attempts: int = 3


class BaseMonitor(ABC):
    """Base class for alert monitors."""

    def __init__(self, config: MonitorConfig):
        self.config = config
        self.last_check: Optional[datetime] = None
        self.is_running = False

    @abstractmethod
    async def check_for_alerts(self) -> List[Dict[str, Any]]:
        """Check data source for alerts. Returns list of detected alerts."""
        pass

    async def run_continuously(self):
        """Run the monitor in a continuous loop."""
        self.is_running = True
        logger.info(f"Starting {self.config.alert_type} monitor")

        while self.is_running:
            try:
                await self.check_for_alerts()
                self.last_check = datetime.utcnow()
            except Exception as e:
                logger.error(f"Error in {self.config.alert_type} monitor: {e}", exc_info=True)

            await asyncio.sleep(self.config.check_interval_minutes * 60)

    def stop(self):
        """Stop the monitor."""
        self.is_running = False
        logger.info(f"Stopped {self.config.alert_type} monitor")


class FloodMonitor(BaseMonitor):
    """
    Monitors for flood alerts.

    Checks data sources every 15 minutes for flood warnings and flood events.
    Supports multiple data sources including EA Flood Monitoring API, weather services.
    """

    def __init__(self):
        config = MonitorConfig(
            alert_type=AlertType.FLOOD,
            check_interval_minutes=15,
            data_source_url="https://flood-monitoring.data.gov.uk/",
        )
        super().__init__(config)
        self.monitored_areas: Dict[str, List[str]] = {}  # organisation_id -> postcodes

    async def check_for_alerts(self) -> List[Dict[str, Any]]:
        """
        Check Environment Agency flood monitoring data.

        Returns:
            List of flood alerts with affected areas.
        """
        alerts = []

        try:
            # TODO: Integrate with EA Flood API or similar service
            # This would fetch real flood data for configured postcodes
            logger.debug(f"Checking flood monitoring at {datetime.utcnow()}")

            # Example structure of returned alerts:
            # {
            #     'alert_id': 'EA12345',
            #     'type': 'flood_alert' | 'flood_warning',
            #     'severity': 'high',
            #     'affected_areas': ['SW1A 1AA', 'SW1A 1AB'],
            #     'description': 'Flood alert for...',
            #     'timestamp': datetime,
            # }

        except Exception as e:
            logger.error(f"Flood monitoring check failed: {e}", exc_info=True)

        return alerts

    def register_area(self, organisation_id: str, postcodes: List[str]):
        """Register postcodes to monitor for this organisation."""
        if organisation_id not in self.monitored_areas:
            self.monitored_areas[organisation_id] = []
        self.monitored_areas[organisation_id].extend(postcodes)

    def get_monitored_areas(self, organisation_id: str) -> List[str]:
        """Get postcodes being monitored for an organisation."""
        return self.monitored_areas.get(organisation_id, [])


class CrimeMonitor(BaseMonitor):
    """
    Monitors for crime alerts.

    Checks data sources daily for crime incidents and patterns.
    Supports UK Police API and other crime data sources.
    """

    def __init__(self):
        config = MonitorConfig(
            alert_type=AlertType.CRIME,
            check_interval_minutes=24 * 60,  # Daily
            data_source_url="https://data.police.uk/",
        )
        super().__init__(config)
        self.crime_categories: List[str] = [
            'burglary',
            'robbery',
            'assault',
            'theft',
            'vehicle-crime',
        ]

    async def check_for_alerts(self) -> List[Dict[str, Any]]:
        """
        Check police crime data API.

        Returns:
            List of crime alerts for monitored areas.
        """
        alerts = []

        try:
            # TODO: Integrate with UK Police API
            logger.debug(f"Checking crime data at {datetime.utcnow()}")

            # Example structure of returned alerts:
            # {
            #     'alert_id': 'UK_CRIME_12345',
            #     'category': 'burglary' | 'robbery' | 'assault',
            #     'severity': 'high',
            #     'affected_areas': ['SW1A 1AA'],
            #     'incident_count': 5,
            #     'description': 'Multiple burglaries reported...',
            #     'timestamp': datetime,
            # }

        except Exception as e:
            logger.error(f"Crime monitoring check failed: {e}", exc_info=True)

        return alerts

    def set_crime_categories(self, categories: List[str]):
        """Configure which crime categories to monitor."""
        valid_categories = [
            'burglary', 'robbery', 'assault', 'theft', 'vehicle-crime',
            'vandalism', 'shoplifting', 'other-crime'
        ]
        self.crime_categories = [c for c in categories if c in valid_categories]


class WeatherMonitor(BaseMonitor):
    """
    Monitors for weather-related alerts.

    Checks data sources every 30 minutes for severe weather warnings including
    wind, heavy rain, snow, ice, and extreme temperatures.
    """

    def __init__(self):
        config = MonitorConfig(
            alert_type=AlertType.WEATHER,
            check_interval_minutes=30,
            data_source_url="https://www.metoffice.gov.uk/",
        )
        super().__init__(config)
        self.weather_types = [
            'wind',
            'rain',
            'snow',
            'ice',
            'heat',
            'cold',
        ]

    async def check_for_alerts(self) -> List[Dict[str, Any]]:
        """
        Check Met Office weather alerts and other weather services.

        Returns:
            List of weather alerts for monitored areas.
        """
        alerts = []

        try:
            # TODO: Integrate with Met Office API or weather data provider
            logger.debug(f"Checking weather data at {datetime.utcnow()}")

            # Example structure of returned alerts:
            # {
            #     'alert_id': 'WEATHER_12345',
            #     'type': 'wind' | 'rain' | 'snow' | 'ice' | 'heat' | 'cold',
            #     'severity': 'amber' | 'red',
            #     'affected_areas': ['SW1A 1AA', 'SW1A 1AB'],
            #     'description': 'Severe wind warning...',
            #     'valid_from': datetime,
            #     'valid_to': datetime,
            # }

        except Exception as e:
            logger.error(f"Weather monitoring check failed: {e}", exc_info=True)

        return alerts

    def set_weather_types(self, types: List[str]):
        """Configure which weather types to monitor."""
        valid_types = ['wind', 'rain', 'snow', 'ice', 'heat', 'cold']
        self.weather_types = [t for t in types if t in valid_types]


class AlertMonitor:
    """
    Central alert monitoring service.

    Coordinates multiple monitors for different alert types and manages
    the continuous checking of external data sources.
    """

    def __init__(self):
        self.monitors = {
            AlertType.FLOOD: FloodMonitor(),
            AlertType.CRIME: CrimeMonitor(),
            AlertType.WEATHER: WeatherMonitor(),
        }
        self.is_running = False
        self.tasks: List[asyncio.Task] = []

    async def start(self):
        """Start all monitors."""
        if self.is_running:
            logger.warning("AlertMonitor is already running")
            return

        self.is_running = True
        logger.info("Starting AlertMonitor")

        for monitor in self.monitors.values():
            task = asyncio.create_task(monitor.run_continuously())
            self.tasks.append(task)

    async def stop(self):
        """Stop all monitors."""
        if not self.is_running:
            return

        self.is_running = False
        logger.info("Stopping AlertMonitor")

        for monitor in self.monitors.values():
            monitor.stop()

        # Wait for all tasks to complete
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
            self.tasks.clear()

    def get_monitor(self, alert_type: AlertType) -> Optional[BaseMonitor]:
        """Get a specific monitor by alert type."""
        return self.monitors.get(alert_type)

    def get_last_check(self, alert_type: AlertType) -> Optional[datetime]:
        """Get the timestamp of the last check for an alert type."""
        monitor = self.get_monitor(alert_type)
        return monitor.last_check if monitor else None

    def is_monitor_running(self, alert_type: AlertType) -> bool:
        """Check if a specific monitor is running."""
        monitor = self.get_monitor(alert_type)
        return monitor.is_running if monitor else False
