"""
Notification orchestrator for SHDT.

Orchestrates the complete notification workflow including alert event processing,
approval workflows, batch sending, and delivery tracking.
"""

import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from enum import Enum
import uuid

logger = logging.getLogger(__name__)


class AlertStatus(str, Enum):
    """Status of an alert event."""
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    SENDING = "sending"
    SENT = "sent"
    CANCELLED = "cancelled"
    FAILED = "failed"


class NotificationStatus(str, Enum):
    """Status of individual notifications."""
    QUEUED = "queued"
    SENDING = "sending"
    DELIVERED = "delivered"
    FAILED = "failed"
    BOUNCED = "bounced"


@dataclass
class AlertEvent:
    """Represents an alert event."""
    id: str
    alert_rule_id: str
    triggered_at: datetime
    trigger_data: Dict[str, Any]
    affected_postcodes: List[str]
    affected_property_count: int
    affected_tenant_count: int
    status: AlertStatus = AlertStatus.PENDING_APPROVAL
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    cancelled_by: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None


@dataclass
class NotificationRecord:
    """Represents a single notification."""
    id: str
    alert_event_id: str
    tenant_id: str
    property_id: str
    channel: str  # 'email', 'sms', 'in_app'
    recipient_email: Optional[str]
    subject: Optional[str]
    body_html: Optional[str]
    body_text: Optional[str]
    status: NotificationStatus = NotificationStatus.QUEUED
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    error_message: Optional[str] = None
    opened_at: Optional[datetime] = None


class NotificationOrchestrator:
    """
    Orchestrates the complete notification workflow.

    Manages alert event processing, approval workflows, notification generation,
    batch sending, and delivery tracking. This is the central orchestration point
    for the notification system.
    """

    def __init__(self):
        self.pending_events: Dict[str, AlertEvent] = {}
        self.notifications: Dict[str, List[NotificationRecord]] = {}
        self.approval_queue: List[AlertEvent] = []

    def process_alert_event(
        self,
        alert_rule_id: str,
        trigger_data: Dict[str, Any],
        affected_postcodes: List[str],
        affected_property_count: int,
        affected_tenant_count: int,
    ) -> AlertEvent:
        """
        Process a newly detected alert event.

        Creates an alert event from monitoring data and adds it to the approval queue
        if the alert rule does not have auto_send enabled.

        Args:
            alert_rule_id: ID of the triggered alert rule
            trigger_data: Data from the alert trigger
            affected_postcodes: List of affected postcodes
            affected_property_count: Number of affected properties
            affected_tenant_count: Number of affected tenants

        Returns:
            Created AlertEvent
        """
        event_id = str(uuid.uuid4())
        event = AlertEvent(
            id=event_id,
            alert_rule_id=alert_rule_id,
            triggered_at=datetime.utcnow(),
            trigger_data=trigger_data,
            affected_postcodes=affected_postcodes,
            affected_property_count=affected_property_count,
            affected_tenant_count=affected_tenant_count,
        )

        self.pending_events[event_id] = event
        self.approval_queue.append(event)

        logger.info(
            f"Processed alert event {event_id} from rule {alert_rule_id} "
            f"affecting {affected_tenant_count} tenants"
        )

        return event

    def get_pending_approvals(self) -> List[AlertEvent]:
        """
        Get all alert events pending approval.

        Returns:
            List of AlertEvent objects with PENDING_APPROVAL status
        """
        return [e for e in self.approval_queue if e.status == AlertStatus.PENDING_APPROVAL]

    def approve_and_send(
        self,
        event_id: str,
        approved_by: str,
        generated_notifications: List[NotificationRecord],
    ) -> bool:
        """
        Approve an alert event and generate notifications for sending.

        Transitions the alert event to APPROVED status, creates notification
        records for all affected tenants, and marks them for sending.

        Args:
            event_id: ID of the alert event to approve
            approved_by: User ID of the approver
            generated_notifications: List of notification records to queue

        Returns:
            True if approval successful, False otherwise
        """
        event = self.pending_events.get(event_id)
        if not event:
            logger.error(f"Alert event {event_id} not found")
            return False

        if event.status != AlertStatus.PENDING_APPROVAL:
            logger.error(f"Event {event_id} is not pending approval (status: {event.status})")
            return False

        try:
            # Update event status
            event.status = AlertStatus.APPROVED
            event.approved_by = approved_by
            event.approved_at = datetime.utcnow()

            # Store notifications
            self.notifications[event_id] = generated_notifications

            logger.info(
                f"Alert event {event_id} approved by {approved_by}. "
                f"Queued {len(generated_notifications)} notifications"
            )

            return True

        except Exception as e:
            logger.error(f"Error approving event {event_id}: {e}", exc_info=True)
            return False

    def get_queued_notifications(self, limit: int = 100) -> List[NotificationRecord]:
        """
        Get notifications queued for sending.

        Args:
            limit: Maximum number of notifications to return

        Returns:
            List of NotificationRecord objects with QUEUED status
        """
        queued = []
        for event_id, notifications in self.notifications.items():
            for notification in notifications:
                if notification.status == NotificationStatus.QUEUED:
                    queued.append(notification)
                    if len(queued) >= limit:
                        return queued

        return queued

    def mark_as_sending(self, notification_ids: List[str]) -> int:
        """
        Mark notifications as currently being sent.

        Args:
            notification_ids: List of notification IDs

        Returns:
            Count of notifications updated
        """
        updated = 0

        for event_id, notifications in self.notifications.items():
            for notification in notifications:
                if notification.id in notification_ids:
                    notification.status = NotificationStatus.SENDING
                    updated += 1

        return updated

    def mark_as_delivered(
        self,
        notification_id: str,
        message_id: Optional[str] = None,
    ) -> bool:
        """
        Mark a notification as successfully delivered.

        Args:
            notification_id: ID of the notification
            message_id: Optional email provider message ID

        Returns:
            True if successfully marked, False if not found
        """
        for event_id, notifications in self.notifications.items():
            for notification in notifications:
                if notification.id == notification_id:
                    notification.status = NotificationStatus.DELIVERED
                    notification.delivered_at = datetime.utcnow()
                    logger.info(f"Notification {notification_id} marked as delivered")
                    return True

        logger.warning(f"Notification {notification_id} not found")
        return False

    def mark_as_failed(
        self,
        notification_id: str,
        error_message: str,
    ) -> bool:
        """
        Mark a notification as failed.

        Args:
            notification_id: ID of the notification
            error_message: Error message describing the failure

        Returns:
            True if successfully marked, False if not found
        """
        for event_id, notifications in self.notifications.items():
            for notification in notifications:
                if notification.id == notification_id:
                    notification.status = NotificationStatus.FAILED
                    notification.error_message = error_message
                    logger.warning(
                        f"Notification {notification_id} marked as failed: {error_message}"
                    )
                    return True

        logger.warning(f"Notification {notification_id} not found")
        return False

    def mark_as_bounced(self, notification_id: str) -> bool:
        """
        Mark a notification as bounced (invalid email).

        Args:
            notification_id: ID of the notification

        Returns:
            True if successfully marked, False if not found
        """
        for event_id, notifications in self.notifications.items():
            for notification in notifications:
                if notification.id == notification_id:
                    notification.status = NotificationStatus.BOUNCED
                    notification.error_message = "Email address bounced"
                    logger.warning(f"Notification {notification_id} marked as bounced")
                    return True

        logger.warning(f"Notification {notification_id} not found")
        return False

    def cancel_event(
        self,
        event_id: str,
        cancelled_by: str,
        reason: str,
    ) -> bool:
        """
        Cancel an alert event and all associated notifications.

        Args:
            event_id: ID of the alert event
            cancelled_by: User ID of the canceller
            reason: Reason for cancellation

        Returns:
            True if successfully cancelled, False otherwise
        """
        event = self.pending_events.get(event_id)
        if not event:
            logger.error(f"Alert event {event_id} not found")
            return False

        if event.status in (AlertStatus.SENT, AlertStatus.CANCELLED):
            logger.error(
                f"Cannot cancel event {event_id} with status {event.status}"
            )
            return False

        try:
            # Update event status
            event.status = AlertStatus.CANCELLED
            event.cancelled_by = cancelled_by
            event.cancelled_at = datetime.utcnow()
            event.cancellation_reason = reason

            # Mark all associated notifications as cancelled (or don't send if queued)
            if event_id in self.notifications:
                for notification in self.notifications[event_id]:
                    if notification.status == NotificationStatus.QUEUED:
                        notification.status = NotificationStatus.FAILED
                        notification.error_message = f"Event cancelled: {reason}"

            logger.info(f"Alert event {event_id} cancelled by {cancelled_by}: {reason}")
            return True

        except Exception as e:
            logger.error(f"Error cancelling event {event_id}: {e}", exc_info=True)
            return False

    def mark_event_as_sent(self, event_id: str) -> bool:
        """
        Mark an alert event as fully sent.

        Args:
            event_id: ID of the alert event

        Returns:
            True if successfully marked, False otherwise
        """
        event = self.pending_events.get(event_id)
        if not event:
            logger.error(f"Alert event {event_id} not found")
            return False

        try:
            event.status = AlertStatus.SENT
            event.sent_at = datetime.utcnow()
            logger.info(f"Alert event {event_id} marked as sent")
            return True

        except Exception as e:
            logger.error(f"Error marking event {event_id} as sent: {e}", exc_info=True)
            return False

    def get_event_delivery_stats(self, event_id: str) -> Optional[Dict[str, Any]]:
        """
        Get delivery statistics for an alert event.

        Args:
            event_id: ID of the alert event

        Returns:
            Dictionary with delivery statistics or None if event not found
        """
        if event_id not in self.notifications:
            return None

        notifications = self.notifications[event_id]
        total = len(notifications)

        stats = {
            'event_id': event_id,
            'total_notifications': total,
            'delivered': sum(1 for n in notifications if n.status == NotificationStatus.DELIVERED),
            'failed': sum(1 for n in notifications if n.status == NotificationStatus.FAILED),
            'bounced': sum(1 for n in notifications if n.status == NotificationStatus.BOUNCED),
            'queued': sum(1 for n in notifications if n.status == NotificationStatus.QUEUED),
            'sending': sum(1 for n in notifications if n.status == NotificationStatus.SENDING),
        }

        if total > 0:
            stats['delivery_rate'] = stats['delivered'] / total

        return stats

    def cleanup_old_events(self, days_old: int = 30) -> int:
        """
        Remove old completed events from memory.

        Args:
            days_old: Age threshold in days

        Returns:
            Count of events removed
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)
        removed = 0

        completed_statuses = {AlertStatus.SENT, AlertStatus.CANCELLED, AlertStatus.FAILED}
        events_to_remove = [
            event_id for event_id, event in self.pending_events.items()
            if event.status in completed_statuses and event.sent_at and event.sent_at < cutoff_date
        ]

        for event_id in events_to_remove:
            del self.pending_events[event_id]
            if event_id in self.notifications:
                del self.notifications[event_id]
            removed += 1

        logger.info(f"Cleaned up {removed} old events")
        return removed
