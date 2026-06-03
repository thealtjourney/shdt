"""
Tenant notification system for SHDT.

This module provides comprehensive notification management including:
- Tenant management and preferences
- Alert rule configuration
- Alert monitoring for flood, crime, and weather events
- Email service with template support
- Notification orchestration and approval workflows
"""

from .email_service import EmailService
from .monitor import AlertMonitor
from .orchestrator import NotificationOrchestrator

__all__ = [
    'EmailService',
    'AlertMonitor',
    'NotificationOrchestrator',
]
