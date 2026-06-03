-- Migration 005: Tenant Notification System
-- Creates tables for managing tenant notifications, alert rules, and email templates

-- Create ENUM types
CREATE TYPE alert_type AS ENUM ('flood', 'crime', 'weather', 'general');
CREATE TYPE severity_level AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE alert_status AS ENUM ('pending_approval', 'approved', 'sending', 'sent', 'cancelled', 'failed');
CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'in_app');
CREATE TYPE notification_status AS ENUM ('queued', 'sending', 'delivered', 'failed', 'bounced');

-- Tenants table
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "in_app": true}',
    gdpr_consent_given BOOLEAN DEFAULT FALSE,
    gdpr_consent_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    organisation_id UUID NOT NULL,
    CONSTRAINT email_unique_per_property UNIQUE(property_id, email),
    CONSTRAINT valid_email CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$')
);

CREATE INDEX idx_tenants_organisation_id ON tenants(organisation_id);
CREATE INDEX idx_tenants_property_id ON tenants(property_id);
CREATE INDEX idx_tenants_email ON tenants(email);
CREATE INDEX idx_tenants_is_active ON tenants(is_active);

-- Alert Rules table
CREATE TABLE alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name VARCHAR(255) NOT NULL,
    alert_type alert_type NOT NULL,
    data_source VARCHAR(255) NOT NULL,
    condition_config JSONB NOT NULL,
    severity severity_level NOT NULL DEFAULT 'medium',
    auto_send BOOLEAN DEFAULT FALSE,
    email_template_id UUID,
    enabled BOOLEAN DEFAULT TRUE,
    cooldown_hours INTEGER DEFAULT 24,
    organisation_id UUID NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cooldown_positive CHECK (cooldown_hours > 0)
);

CREATE INDEX idx_alert_rules_organisation_id ON alert_rules(organisation_id);
CREATE INDEX idx_alert_rules_alert_type ON alert_rules(alert_type);
CREATE INDEX idx_alert_rules_enabled ON alert_rules(enabled);
CREATE INDEX idx_alert_rules_created_by ON alert_rules(created_by);

-- Alert Events table
CREATE TABLE alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    trigger_data JSONB NOT NULL,
    affected_postcodes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    affected_property_count INTEGER DEFAULT 0,
    affected_tenant_count INTEGER DEFAULT 0,
    status alert_status DEFAULT 'pending_approval',
    approved_by UUID,
    approved_at TIMESTAMP,
    sent_at TIMESTAMP,
    cancelled_by UUID,
    cancelled_at TIMESTAMP,
    cancellation_reason TEXT,
    CONSTRAINT valid_status_transitions CHECK (
        (status = 'pending_approval' AND approved_at IS NULL) OR
        (status = 'approved' AND approved_at IS NOT NULL) OR
        (status IN ('sending', 'sent', 'failed') AND approved_at IS NOT NULL) OR
        (status = 'cancelled' AND cancelled_at IS NOT NULL)
    )
);

CREATE INDEX idx_alert_events_alert_rule_id ON alert_events(alert_rule_id);
CREATE INDEX idx_alert_events_status ON alert_events(status);
CREATE INDEX idx_alert_events_triggered_at ON alert_events(triggered_at);
CREATE INDEX idx_alert_events_approved_by ON alert_events(approved_by);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_event_id UUID NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id UUID NOT NULL,
    channel notification_channel NOT NULL,
    recipient_email VARCHAR(255),
    subject VARCHAR(500),
    body_html TEXT,
    body_text TEXT,
    status notification_status DEFAULT 'queued',
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    error_message TEXT,
    opened_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT email_recipient_for_email_channel CHECK (
        (channel != 'email') OR (recipient_email IS NOT NULL)
    )
);

CREATE INDEX idx_notifications_alert_event_id ON notifications(alert_event_id);
CREATE INDEX idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX idx_notifications_property_id ON notifications(property_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_sent_at ON notifications(sent_at);
CREATE INDEX idx_notifications_channel ON notifications(channel);
CREATE INDEX idx_notifications_recipient_email ON notifications(recipient_email);

-- Email Templates table
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(255) NOT NULL,
    alert_type alert_type NOT NULL,
    subject_template VARCHAR(500) NOT NULL,
    body_html_template TEXT NOT NULL,
    body_text_template TEXT NOT NULL,
    organisation_id UUID NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_default_per_org_type UNIQUE (organisation_id, alert_type, is_default) WHERE is_default = TRUE
);

CREATE INDEX idx_email_templates_organisation_id ON email_templates(organisation_id);
CREATE INDEX idx_email_templates_alert_type ON email_templates(alert_type);
CREATE INDEX idx_email_templates_is_default ON email_templates(is_default);

-- Add foreign key for email_template_id in alert_rules (after email_templates table exists)
ALTER TABLE alert_rules
ADD CONSTRAINT fk_alert_rules_email_template
FOREIGN KEY (email_template_id) REFERENCES email_templates(id) ON DELETE SET NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER tenants_update_trigger BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER notifications_update_trigger BEFORE UPDATE ON notifications
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER email_templates_update_trigger BEFORE UPDATE ON email_templates
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Create view for pending approvals
CREATE VIEW pending_approvals AS
SELECT
    ae.id as event_id,
    ar.id as rule_id,
    ar.rule_name,
    ar.alert_type,
    ae.triggered_at,
    ae.affected_property_count,
    ae.affected_tenant_count,
    ar.severity,
    ae.trigger_data
FROM alert_events ae
JOIN alert_rules ar ON ae.alert_rule_id = ar.id
WHERE ae.status = 'pending_approval'
ORDER BY ae.triggered_at DESC;

-- Create view for notification delivery metrics
CREATE VIEW notification_delivery_metrics AS
SELECT
    ae.id as event_id,
    ar.rule_name,
    ar.alert_type,
    COUNT(CASE WHEN n.status = 'delivered' THEN 1 END) as delivered_count,
    COUNT(CASE WHEN n.status = 'failed' THEN 1 END) as failed_count,
    COUNT(CASE WHEN n.status = 'bounced' THEN 1 END) as bounced_count,
    COUNT(CASE WHEN n.status = 'queued' THEN 1 END) as queued_count,
    COUNT(CASE WHEN n.opened_at IS NOT NULL THEN 1 END) as opened_count,
    COUNT(n.id) as total_count
FROM alert_events ae
JOIN alert_rules ar ON ae.alert_rule_id = ar.id
LEFT JOIN notifications n ON ae.id = n.alert_event_id
GROUP BY ae.id, ar.rule_name, ar.alert_type;
