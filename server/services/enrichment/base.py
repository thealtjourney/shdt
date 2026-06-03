"""
Abstract base class for enrichment providers.

Provides a standardized interface for all enrichment data sources with
built-in retry logic, rate limiting, and timeout handling.
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class EnrichmentProvider(ABC):
    """
    Abstract base class for all enrichment providers.

    Provides standardized enrichment interface with:
    - Automatic retry logic with exponential backoff
    - Rate limiting via asyncio.Semaphore
    - 10-second timeout protection
    - Standardized result formatting
    """

    # Retry configuration
    RETRY_ATTEMPTS = 3
    RETRY_DELAYS = [1, 2, 4]  # seconds for exponential backoff
    REQUEST_TIMEOUT = 10  # seconds

    def __init__(self, rate_limit: Optional[int] = None):
        """
        Initialize the enrichment provider.

        Args:
            rate_limit: Maximum concurrent requests. Uses provider_rate_limit if not specified.
        """
        self._semaphore = asyncio.Semaphore(rate_limit or self.provider_rate_limit)
        self._logger = logger.getChild(self.provider_name)

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """
        Return the name of this provider.

        Returns:
            str: Unique provider identifier (e.g., 'epc', 'postcodes', 'flood_risk')
        """
        pass

    @property
    @abstractmethod
    def provider_rate_limit(self) -> int:
        """
        Return the default rate limit (concurrent requests) for this provider.

        Returns:
            int: Number of concurrent requests allowed
        """
        pass

    @abstractmethod
    async def enrich(self, property_id: str) -> Dict[str, Any]:
        """
        Enrich a property with data from this provider.

        Must be implemented by subclasses. This method should:
        - Fetch relevant data for the property
        - Return only the enrichment data (not wrapped in result dict)
        - Raise exceptions for errors (will be caught by wrapper)

        Args:
            property_id: The property identifier to enrich

        Returns:
            dict: Enrichment data for this property

        Raises:
            Exception: For any data fetching errors
        """
        pass

    async def enrich_with_retry(self, property_id: str) -> Dict[str, Any]:
        """
        Enrich with automatic retry logic and rate limiting.

        Wraps the enrich() method with:
        - Rate limiting using semaphore
        - Automatic retry with exponential backoff
        - 10-second timeout per attempt
        - Standardized error handling

        Args:
            property_id: The property to enrich

        Returns:
            dict: Standardized result dictionary with:
                - provider: provider name
                - success: whether enrichment succeeded
                - data: enriched data (if successful)
                - error: error message (if failed)
                - fetched_at: timestamp of fetch attempt
        """
        async with self._semaphore:
            for attempt in range(self.RETRY_ATTEMPTS):
                try:
                    self._logger.debug(
                        f"Enriching property {property_id} (attempt {attempt + 1}/{self.RETRY_ATTEMPTS})"
                    )

                    data = await asyncio.wait_for(
                        self.enrich(property_id),
                        timeout=self.REQUEST_TIMEOUT
                    )

                    self._logger.debug(f"Successfully enriched property {property_id}")
                    return {
                        "provider": self.provider_name,
                        "success": True,
                        "data": data,
                        "error": None,
                        "fetched_at": datetime.utcnow().isoformat(),
                    }

                except asyncio.TimeoutError:
                    error_msg = (
                        f"Timeout after {self.REQUEST_TIMEOUT}s "
                        f"(attempt {attempt + 1}/{self.RETRY_ATTEMPTS})"
                    )
                    self._logger.warning(f"Property {property_id}: {error_msg}")

                    if attempt == self.RETRY_ATTEMPTS - 1:
                        return {
                            "provider": self.provider_name,
                            "success": False,
                            "data": {},
                            "error": error_msg,
                            "fetched_at": datetime.utcnow().isoformat(),
                        }

                    delay = self.RETRY_DELAYS[attempt]
                    self._logger.debug(f"Retrying in {delay}s...")
                    await asyncio.sleep(delay)

                except Exception as e:
                    error_msg = f"{type(e).__name__}: {str(e)}"
                    self._logger.warning(f"Property {property_id}: {error_msg}")

                    if attempt == self.RETRY_ATTEMPTS - 1:
                        return {
                            "provider": self.provider_name,
                            "success": False,
                            "data": {},
                            "error": error_msg,
                            "fetched_at": datetime.utcnow().isoformat(),
                        }

                    delay = self.RETRY_DELAYS[attempt]
                    self._logger.debug(f"Retrying in {delay}s...")
                    await asyncio.sleep(delay)

            # Should not reach here, but defensive fallback
            return {
                "provider": self.provider_name,
                "success": False,
                "data": {},
                "error": "Unknown error after all retries",
                "fetched_at": datetime.utcnow().isoformat(),
            }
