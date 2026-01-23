-- =====================================================
-- Migration: 063_crm_email_notifications.sql
-- CRM Email Notification Logging
-- Tracks sent notifications to prevent duplicate sends
-- =====================================================

-- Create notification log table
CREATE TABLE IF NOT EXISTS crm_notification_logs (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,              -- 'lead', 'opportunity', 'activity', 'weekly_summary'
    entity_id TEXT NOT NULL,                -- ID of the entity (lead_id, opportunity_id, etc.)
    event TEXT NOT NULL,                    -- 'new_lead', 'unclaimed', 'due_reminder', 'overdue', 'inactivity', 'weekly_summary'
    threshold INTEGER,                      -- Hours threshold (for time-based notifications)
    recipient_emails TEXT[],                -- Array of recipient emails
    cc_emails TEXT[],                       -- Array of CC emails
    subject TEXT,                           -- Email subject
    status TEXT NOT NULL DEFAULT 'sent',    -- 'sent', 'failed', 'pending'
    error_message TEXT,                     -- Error message if failed
    metadata JSONB,                         -- Additional metadata (lead details, etc.)
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate notifications for same entity + event + threshold
    CONSTRAINT crm_notification_unique_key UNIQUE (entity_type, entity_id, event, threshold)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_crm_notification_logs_entity
    ON crm_notification_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_crm_notification_logs_event
    ON crm_notification_logs(event);

CREATE INDEX IF NOT EXISTS idx_crm_notification_logs_sent_at
    ON crm_notification_logs(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_notification_logs_status
    ON crm_notification_logs(status);

-- Create index for weekly summary queries
CREATE INDEX IF NOT EXISTS idx_crm_notification_logs_weekly
    ON crm_notification_logs(event, sent_at)
    WHERE event = 'weekly_summary';

-- Add comment to table
COMMENT ON TABLE crm_notification_logs IS 'Tracks CRM email notifications to prevent duplicate sends';

-- Function to check if notification was already sent
CREATE OR REPLACE FUNCTION crm_notification_exists(
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_event TEXT,
    p_threshold INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    IF p_threshold IS NULL THEN
        RETURN EXISTS (
            SELECT 1 FROM crm_notification_logs
            WHERE entity_type = p_entity_type
            AND entity_id = p_entity_id
            AND event = p_event
            AND threshold IS NULL
            AND status = 'sent'
        );
    ELSE
        RETURN EXISTS (
            SELECT 1 FROM crm_notification_logs
            WHERE entity_type = p_entity_type
            AND entity_id = p_entity_id
            AND event = p_event
            AND threshold = p_threshold
            AND status = 'sent'
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to log notification
CREATE OR REPLACE FUNCTION crm_log_notification(
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_event TEXT,
    p_threshold INTEGER DEFAULT NULL,
    p_recipient_emails TEXT[] DEFAULT NULL,
    p_cc_emails TEXT[] DEFAULT NULL,
    p_subject TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'sent',
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_log_id BIGINT;
BEGIN
    INSERT INTO crm_notification_logs (
        entity_type, entity_id, event, threshold,
        recipient_emails, cc_emails, subject, status,
        error_message, metadata
    ) VALUES (
        p_entity_type, p_entity_id, p_event, p_threshold,
        p_recipient_emails, p_cc_emails, p_subject, p_status,
        p_error_message, p_metadata
    )
    ON CONFLICT (entity_type, entity_id, event, threshold)
    DO UPDATE SET
        status = EXCLUDED.status,
        error_message = EXCLUDED.error_message,
        sent_at = NOW()
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to clean old notification logs (keep last 90 days)
CREATE OR REPLACE FUNCTION crm_cleanup_old_notification_logs() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM crm_notification_logs
    WHERE sent_at < NOW() - INTERVAL '90 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (assuming service role has full access)
-- RLS is not needed as this table is only accessed by admin/service role

-- =====================================================
-- View for monitoring notification statistics
-- =====================================================
CREATE OR REPLACE VIEW v_crm_notification_stats AS
SELECT
    event,
    entity_type,
    COUNT(*) as total_sent,
    COUNT(*) FILTER (WHERE status = 'sent') as successful,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    MAX(sent_at) as last_sent_at,
    DATE_TRUNC('day', sent_at) as sent_date
FROM crm_notification_logs
WHERE sent_at >= NOW() - INTERVAL '30 days'
GROUP BY event, entity_type, DATE_TRUNC('day', sent_at)
ORDER BY sent_date DESC, event;

COMMENT ON VIEW v_crm_notification_stats IS 'Statistics of CRM notifications sent in the last 30 days';
