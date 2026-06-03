"""
Notification management router for SHDT.

Provides REST API endpoints for:
- Tenant management and preferences
- Alert rule configuration
- Notification approval and sending
- Manual notification composition
- Notification history and reporting
"""

import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, Query, Body
from pydantic import BaseModel, Field, EmailStr, validator

logger = logging.getLogger(__name__)

# ============================================================================
# Request/Response Models
# ============================================================================


class NotificationPreferences(BaseModel):
    """Tenant notification preferences."""
    email: bool = True
    sms: bool = False
    in_app: bool = True


class TenantCreate(BaseModel):
    """Create a new tenant."""
    property_id: str = Field(..., description="Property ID")
    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=20)
    notification_preferences: NotificationPreferences = Field(default_factory=NotificationPreferences)
    gdpr_consent_given: bool = False


class TenantUpdate(BaseModel):
    """Update an existing tenant."""
    first_name: Optional[str] = Field(None, min_length=1, max_length=255)
    last_name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    notification_preferences: Optional[NotificationPreferences] = None
    is_active: Optional[bool] = None


class TenantResponse(BaseModel):
    """Tenant response model."""
    id: str
    property_id: str
    first_name: str
    last_name: str
    email: str
    phone: Optional[str]
    notification_preferences: NotificationPreferences
    gdpr_consent_given: bool
    gdpr_consent_date: Optional[datetime]
    is_active: bool
    organisation_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AlertRuleCreate(BaseModel):
    """Create an alert rule."""
    rule_name: str = Field(..., min_length=1, max_length=255)
    alert_type: str = Field(..., description="flood, crime, weather, or general")
    data_source: str = Field(..., min_length=1, max_length=255)
    condition_config: Dict[str, Any] = Field(..., description="Alert condition configuration")
    severity: str = Field("medium", description="critical, high, medium, or low")
    auto_send: bool = False
    email_template_id: Optional[str] = None
    cooldown_hours: int = Field(24, ge=1)

    @validator('alert_type')
    def validate_alert_type(cls, v):
        valid_types = ['flood', 'crime', 'weather', 'general']
        if v not in valid_types:
            raise ValueError(f'alert_type must be one of {valid_types}')
        return v

    @validator('severity')
    def validate_severity(cls, v):
        valid_severities = ['critical', 'high', 'medium', 'low']
        if v not in valid_severities:
            raise ValueError(f'severity must be one of {valid_severities}')
        return v


class AlertRuleUpdate(BaseModel):
    """Update an alert rule."""
    rule_name: Optional[str] = Field(None, min_length=1, max_length=255)
    condition_config: Optional[Dict[str, Any]] = None
    severity: Optional[str] = None
    auto_send: Optional[bool] = None
    email_template_id: Optional[str] = None
    enabled: Optional[bool] = None
    cooldown_hours: Optional[int] = Field(None, ge=1)


class AlertRuleResponse(BaseModel):
    """Alert rule response model."""
    id: str
    rule_name: str
    alert_type: str
    data_source: str
    condition_config: Dict[str, Any]
    severity: str
    auto_send: bool
    email_template_id: Optional[str]
    enabled: bool
    cooldown_hours: int
    organisation_id: str
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class AlertEventResponse(BaseModel):
    """Alert event response model."""
    id: str
    alert_rule_id: str
    triggered_at: datetime
    trigger_data: Dict[str, Any]
    affected_postcodes: List[str]
    affected_property_count: int
    affected_tenant_count: int
    status: str
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    sent_at: Optional[datetime]
    cancelled_by: Optional[str]
    cancelled_at: Optional[datetime]
    cancellation_reason: Optional[str]

    class Config:
        from_attributes = True


class ApprovalRequest(BaseModel):
    """Request to approve an alert event."""
    approved_by: str = Field(..., description="User ID of the approver")


class CancellationRequest(BaseModel):
    """Request to cancel an alert event."""
    cancelled_by: str = Field(..., description="User ID of the canceller")
    reason: str = Field(..., min_length=1, description="Reason for cancellation")


class EmailTemplate(BaseModel):
    """Email template model."""
    id: str
    template_name: str
    alert_type: str
    subject_template: str
    body_html_template: str
    body_text_template: Optional[str]
    organisation_id: str
    is_default: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EmailTemplateCreate(BaseModel):
    """Create an email template."""
    template_name: str = Field(..., min_length=1, max_length=255)
    alert_type: str = Field(..., description="flood, crime, weather, or general")
    subject_template: str = Field(..., min_length=1, max_length=500)
    body_html_template: str = Field(..., description="HTML template with Jinja2 syntax")
    body_text_template: Optional[str] = None
    is_default: bool = False

    @validator('alert_type')
    def validate_alert_type(cls, v):
        valid_types = ['flood', 'crime', 'weather', 'general']
        if v not in valid_types:
            raise ValueError(f'alert_type must be one of {valid_types}')
        return v


class ManualNotificationRequest(BaseModel):
    """Request to send a manual notification."""
    tenant_ids: List[str] = Field(..., min_items=1, description="Tenant IDs to notify")
    subject: str = Field(..., min_length=1, max_length=500)
    body_html: str = Field(..., description="HTML body content")
    body_text: Optional[str] = None
    channels: List[str] = Field(default=["email"], description="Notification channels")

    @validator('channels')
    def validate_channels(cls, v):
        valid_channels = ['email', 'sms', 'in_app']
        for channel in v:
            if channel not in valid_channels:
                raise ValueError(f'channel must be one of {valid_channels}')
        return v


class NotificationHistoryResponse(BaseModel):
    """Notification history entry."""
    id: str
    alert_event_id: Optional[str]
    tenant_id: str
    property_id: str
    channel: str
    recipient_email: Optional[str]
    subject: Optional[str]
    status: str
    sent_at: Optional[datetime]
    delivered_at: Optional[datetime]
    opened_at: Optional[datetime]
    error_message: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class DeliveryMetrics(BaseModel):
    """Delivery metrics for an alert event."""
    event_id: str
    total_notifications: int
    delivered: int
    failed: int
    bounced: int
    queued: int
    sending: int
    delivery_rate: float = 0.0


# ============================================================================
# Router Setup
# ============================================================================

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ============================================================================
# Tenant Management Endpoints
# ============================================================================

@router.post("/tenants", response_model=TenantResponse, status_code=201)
async def create_tenant(
    tenant: TenantCreate,
    organisation_id: str = Query(..., description="Organisation ID"),
) -> TenantResponse:
    """
    Create a new tenant.

    Args:
        tenant: Tenant creation data
        organisation_id: Organisation ID for the tenant

    Returns:
        Created tenant object
    """
    # TODO: Implement database insert
    # Validate GDPR consent if provided
    if tenant.gdpr_consent_given:
        # Log GDPR consent
        pass

    logger.info(f"Creating tenant {tenant.email} for organisation {organisation_id}")

    return TenantResponse(
        id=str(uuid4()),
        property_id=tenant.property_id,
        first_name=tenant.first_name,
        last_name=tenant.last_name,
        email=tenant.email,
        phone=tenant.phone,
        notification_preferences=tenant.notification_preferences,
        gdpr_consent_given=tenant.gdpr_consent_given,
        gdpr_consent_date=datetime.utcnow() if tenant.gdpr_consent_given else None,
        is_active=True,
        organisation_id=organisation_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant(tenant_id: str) -> TenantResponse:
    """
    Get a specific tenant by ID.

    Args:
        tenant_id: Tenant ID

    Returns:
        Tenant object
    """
    # TODO: Implement database query
    raise HTTPException(status_code=404, detail="Tenant not found")


@router.get("/tenants", response_model=List[TenantResponse])
async def list_tenants(
    organisation_id: str = Query(...),
    property_id: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> List[TenantResponse]:
    """
    List tenants with optional filtering.

    Args:
        organisation_id: Filter by organisation ID
        property_id: Optional filter by property ID
        is_active: Optional filter by active status
        skip: Number of records to skip
        limit: Maximum records to return

    Returns:
        List of tenant objects
    """
    # TODO: Implement database query with filters
    return []


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: str,
    tenant_update: TenantUpdate,
) -> TenantResponse:
    """
    Update a tenant.

    Args:
        tenant_id: Tenant ID
        tenant_update: Fields to update

    Returns:
        Updated tenant object
    """
    # TODO: Implement database update
    raise HTTPException(status_code=404, detail="Tenant not found")


@router.delete("/tenants/{tenant_id}", status_code=204)
async def delete_tenant(tenant_id: str) -> None:
    """
    Soft-delete a tenant (mark as inactive).

    Args:
        tenant_id: Tenant ID
    """
    # TODO: Implement soft delete (set is_active = False)
    logger.info(f"Deactivated tenant {tenant_id}")


# ============================================================================
# Alert Rule Management Endpoints
# ============================================================================

@router.post("/alert-rules", response_model=AlertRuleResponse, status_code=201)
async def create_alert_rule(
    rule: AlertRuleCreate,
    organisation_id: str = Query(...),
    created_by: str = Query(...),
) -> AlertRuleResponse:
    """
    Create an alert rule.

    Args:
        rule: Alert rule creation data
        organisation_id: Organisation ID
        created_by: User ID of the creator

    Returns:
        Created alert rule
    """
    # TODO: Implement database insert
    logger.info(f"Creating alert rule {rule.rule_name} for organisation {organisation_id}")

    return AlertRuleResponse(
        id=str(uuid4()),
        rule_name=rule.rule_name,
        alert_type=rule.alert_type,
        data_source=rule.data_source,
        condition_config=rule.condition_config,
        severity=rule.severity,
        auto_send=rule.auto_send,
        email_template_id=rule.email_template_id,
        enabled=True,
        cooldown_hours=rule.cooldown_hours,
        organisation_id=organisation_id,
        created_by=created_by,
        created_at=datetime.utcnow(),
    )


@router.get("/alert-rules/{rule_id}", response_model=AlertRuleResponse)
async def get_alert_rule(rule_id: str) -> AlertRuleResponse:
    """
    Get a specific alert rule by ID.

    Args:
        rule_id: Alert rule ID

    Returns:
        Alert rule object
    """
    # TODO: Implement database query
    raise HTTPException(status_code=404, detail="Alert rule not found")


@router.get("/alert-rules", response_model=List[AlertRuleResponse])
async def list_alert_rules(
    organisation_id: str = Query(...),
    alert_type: Optional[str] = Query(None),
    enabled: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> List[AlertRuleResponse]:
    """
    List alert rules with optional filtering.

    Args:
        organisation_id: Filter by organisation ID
        alert_type: Optional filter by alert type
        enabled: Optional filter by enabled status
        skip: Number of records to skip
        limit: Maximum records to return

    Returns:
        List of alert rules
    """
    # TODO: Implement database query with filters
    return []


@router.patch("/alert-rules/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(
    rule_id: str,
    rule_update: AlertRuleUpdate,
) -> AlertRuleResponse:
    """
    Update an alert rule.

    Args:
        rule_id: Alert rule ID
        rule_update: Fields to update

    Returns:
        Updated alert rule
    """
    # TODO: Implement database update
    raise HTTPException(status_code=404, detail="Alert rule not found")


@router.delete("/alert-rules/{rule_id}", status_code=204)
async def delete_alert_rule(rule_id: str) -> None:
    """
    Delete an alert rule.

    Args:
        rule_id: Alert rule ID
    """
    # TODO: Implement database delete
    logger.info(f"Deleted alert rule {rule_id}")


# ============================================================================
# Alert Event Management Endpoints
# ============================================================================

@router.get("/alert-events/pending", response_model=List[AlertEventResponse])
async def get_pending_approvals(
    organisation_id: str = Query(...),
) -> List[AlertEventResponse]:
    """
    Get all alert events pending approval.

    Args:
        organisation_id: Filter by organisation ID

    Returns:
        List of pending alert events
    """
    # TODO: Integrate with NotificationOrchestrator
    return []


@router.get("/alert-events/{event_id}", response_model=AlertEventResponse)
async def get_alert_event(event_id: str) -> AlertEventResponse:
    """
    Get a specific alert event.

    Args:
        event_id: Alert event ID

    Returns:
        Alert event object
    """
    # TODO: Implement database query
    raise HTTPException(status_code=404, detail="Alert event not found")


@router.post("/alert-events/{event_id}/approve", response_model=AlertEventResponse)
async def approve_alert_event(
    event_id: str,
    approval: ApprovalRequest,
) -> AlertEventResponse:
    """
    Approve an alert event and queue notifications for sending.

    Args:
        event_id: Alert event ID
        approval: Approval data with approver ID

    Returns:
        Updated alert event
    """
    # TODO: Integrate with NotificationOrchestrator.approve_and_send()
    logger.info(f"Alert event {event_id} approved by {approval.approved_by}")

    raise HTTPException(status_code=404, detail="Alert event not found")


@router.post("/alert-events/{event_id}/cancel", response_model=AlertEventResponse)
async def cancel_alert_event(
    event_id: str,
    cancellation: CancellationRequest,
) -> AlertEventResponse:
    """
    Cancel an alert event and cancel all associated notifications.

    Args:
        event_id: Alert event ID
        cancellation: Cancellation data

    Returns:
        Updated alert event
    """
    # TODO: Integrate with NotificationOrchestrator.cancel_event()
    logger.info(
        f"Alert event {event_id} cancelled by {cancellation.cancelled_by}: "
        f"{cancellation.reason}"
    )

    raise HTTPException(status_code=404, detail="Alert event not found")


@router.get("/alert-events/{event_id}/metrics", response_model=DeliveryMetrics)
async def get_event_delivery_metrics(event_id: str) -> DeliveryMetrics:
    """
    Get delivery metrics for an alert event.

    Args:
        event_id: Alert event ID

    Returns:
        Delivery statistics
    """
    # TODO: Integrate with NotificationOrchestrator.get_event_delivery_stats()
    raise HTTPException(status_code=404, detail="Alert event not found")


# ============================================================================
# Email Template Management Endpoints
# ============================================================================

@router.post("/email-templates", response_model=EmailTemplate, status_code=201)
async def create_email_template(
    template: EmailTemplateCreate,
    organisation_id: str = Query(...),
) -> EmailTemplate:
    """
    Create an email template.

    Args:
        template: Email template creation data
        organisation_id: Organisation ID

    Returns:
        Created email template
    """
    # TODO: Implement database insert
    logger.info(
        f"Creating email template {template.template_name} for {template.alert_type} "
        f"in organisation {organisation_id}"
    )

    return EmailTemplate(
        id=str(uuid4()),
        template_name=template.template_name,
        alert_type=template.alert_type,
        subject_template=template.subject_template,
        body_html_template=template.body_html_template,
        body_text_template=template.body_text_template,
        organisation_id=organisation_id,
        is_default=template.is_default,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )


@router.get("/email-templates", response_model=List[EmailTemplate])
async def list_email_templates(
    organisation_id: str = Query(...),
    alert_type: Optional[str] = Query(None),
) -> List[EmailTemplate]:
    """
    List email templates.

    Args:
        organisation_id: Filter by organisation ID
        alert_type: Optional filter by alert type

    Returns:
        List of email templates
    """
    # TODO: Implement database query
    return []


@router.get("/email-templates/{template_id}", response_model=EmailTemplate)
async def get_email_template(template_id: str) -> EmailTemplate:
    """
    Get a specific email template.

    Args:
        template_id: Email template ID

    Returns:
        Email template object
    """
    # TODO: Implement database query
    raise HTTPException(status_code=404, detail="Email template not found")


@router.patch("/email-templates/{template_id}", response_model=EmailTemplate)
async def update_email_template(
    template_id: str,
    template_update: EmailTemplateCreate,
) -> EmailTemplate:
    """
    Update an email template.

    Args:
        template_id: Email template ID
        template_update: Fields to update

    Returns:
        Updated email template
    """
    # TODO: Implement database update
    raise HTTPException(status_code=404, detail="Email template not found")


@router.delete("/email-templates/{template_id}", status_code=204)
async def delete_email_template(template_id: str) -> None:
    """
    Delete an email template.

    Args:
        template_id: Email template ID
    """
    # TODO: Implement database delete
    logger.info(f"Deleted email template {template_id}")


# ============================================================================
# Manual Notification Endpoints
# ============================================================================

@router.post("/notifications/send-manual", status_code=202)
async def send_manual_notification(
    notification: ManualNotificationRequest,
    organisation_id: str = Query(...),
    created_by: str = Query(...),
) -> Dict[str, Any]:
    """
    Send a manual notification to specific tenants.

    This creates a manual notification (not linked to an alert event) and queues
    it for immediate sending.

    Args:
        notification: Notification data
        organisation_id: Organisation ID
        created_by: User ID of the creator

    Returns:
        Status with notification IDs
    """
    # TODO: Implement notification creation and queuing
    logger.info(
        f"Manual notification from {created_by} to {len(notification.tenant_ids)} "
        f"tenants in organisation {organisation_id}"
    )

    return {
        'status': 'queued',
        'notification_count': len(notification.tenant_ids),
        'organisation_id': organisation_id,
    }


# ============================================================================
# Notification History Endpoints
# ============================================================================

@router.get("/notifications/history", response_model=List[NotificationHistoryResponse])
async def get_notification_history(
    organisation_id: str = Query(...),
    tenant_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    channel: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
) -> List[NotificationHistoryResponse]:
    """
    Get notification history with optional filtering.

    Args:
        organisation_id: Filter by organisation ID
        tenant_id: Optional filter by tenant ID
        status: Optional filter by notification status
        channel: Optional filter by notification channel
        days: Number of days to look back
        skip: Number of records to skip
        limit: Maximum records to return

    Returns:
        List of notification history records
    """
    # TODO: Implement database query with filters
    return []


@router.get("/notifications/{notification_id}")
async def get_notification(notification_id: str) -> NotificationHistoryResponse:
    """
    Get a specific notification.

    Args:
        notification_id: Notification ID

    Returns:
        Notification object
    """
    # TODO: Implement database query
    raise HTTPException(status_code=404, detail="Notification not found")


# ============================================================================
# Statistics & Reporting Endpoints
# ============================================================================

@router.get("/statistics/delivery")
async def get_delivery_statistics(
    organisation_id: str = Query(...),
    days: int = Query(30, ge=1, le=365),
) -> Dict[str, Any]:
    """
    Get aggregate delivery statistics for an organisation.

    Args:
        organisation_id: Organisation ID
        days: Number of days to include

    Returns:
        Delivery statistics including success rates and failure reasons
    """
    # TODO: Implement statistics calculation
    return {
        'organisation_id': organisation_id,
        'total_notifications': 0,
        'delivered': 0,
        'failed': 0,
        'bounced': 0,
        'delivery_rate': 0.0,
    }


@router.get("/statistics/alerts")
async def get_alert_statistics(
    organisation_id: str = Query(...),
    days: int = Query(30, ge=1, le=365),
) -> Dict[str, Any]:
    """
    Get alert statistics for an organisation.

    Args:
        organisation_id: Organisation ID
        days: Number of days to include

    Returns:
        Alert statistics by type and severity
    """
    # TODO: Implement statistics calculation
    return {
        'organisation_id': organisation_id,
        'total_alerts': 0,
        'by_type': {},
        'by_severity': {},
    }
