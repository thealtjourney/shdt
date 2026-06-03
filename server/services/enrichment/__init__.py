"""
Enrichment services module for SHDT.

This module provides the core enrichment pipeline infrastructure for enriching
property data from multiple external data sources including EPC, postcode,
flood risk, crime statistics, IMD, census, and land registry data.
"""

from .base import EnrichmentProvider
from .orchestrator import EnrichmentOrchestrator

__all__ = [
    "EnrichmentProvider",
    "EnrichmentOrchestrator",
]
