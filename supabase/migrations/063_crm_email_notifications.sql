-- =====================================================
-- CRM Email Notifications System
-- Migration: 063_crm_email_notifications.sql
-- =====================================================

-- Create enum for email notification types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crm_email_notification_type') THEN
    CREATE TYPE crm_email_notification_type AS ENUM (
      'new_lead_assignment',
      'unclaimed_lead_reminder',
      'pipeline_due_date_reminder',
      'overdue_pipeline_reminder',
      'sales_inactivity_reminder',
      'weekly_performance_summary'
    );
  END IF;
END
$$;

-- Create enum for email status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_status') THEN
    CREATE TYPE email_status AS ENUM (
      'pending',
      'sent',
      'failed',
      'skipped'
    );
  END IF;
END
$$;

-- =====================================================
-- CRM Email Log Table
-- Tracks all sent CRM notification emails
-- =====================================================
CREATE TABLE IF NOT EXISTS crm_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type crm_email_notification_type NOT NULL,
  status email_status NOT NULL DEFAULT 'pending',

  -- Recipients
  recipient_emails TEXT[] NOT NULL,
  cc_emails TEXT[],

  -- Email content (stored for reference/debugging)
  subject TEXT NOT NULL,

  -- Related entities
  lead_id TEXT REFERENCES leads(lead_id) ON DELETE SET NULL,
  opportunity_id TEXT REFERENCES opportunities(opportunity_id) ON DELETE SET NULL,
  user_id UUID REFERENCES profiles(user_id) ON DELETE SET NULL,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Response from SMTP
  message_id TEXT,
  error_message TEXT,

  -- Timestamps
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  CONSTRAINT valid_recipient CHECK (array_length(recipient_emails, 1) > 0)
);

-- =====================================================
-- CRM Notification Schedule Table
-- Tracks which notifications have been sent to avoid duplicates
-- =====================================================
CREATE TABLE IF NOT EXISTS crm_notification_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type crm_email_notification_type NOT NULL,

  -- Target entity
  lead_id TEXT REFERENCES leads(lead_id) ON DELETE CASCADE,
  opportunity_id TEXT REFERENCES opportunities(opportunity_id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(user_id) ON DELETE CASCADE,

  -- Schedule info
  interval_hours INTEGER NOT NULL,
  reminder_number INTEGER NOT NULL DEFAULT 1,

  -- Status
  is_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  email_log_id UUID REFERENCES crm_email_logs(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique indexes to prevent duplicate reminders
-- (PostgreSQL doesn't support WHERE in table-level UNIQUE constraints)
CREATE UNIQUE INDEX IF NOT EXISTS ux_crm_notification_schedules_lead
  ON crm_notification_schedules (notification_type, lead_id, interval_hours)
  WHERE lead_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_crm_notification_schedules_opportunity
  ON crm_notification_schedules (notification_type, opportunity_id, interval_hours)
  WHERE opportunity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_crm_notification_schedules_user
  ON crm_notification_schedules (notification_type, user_id, interval_hours)
  WHERE user_id IS NOT NULL;

-- =====================================================
-- Indexes for better query performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_crm_email_logs_type ON crm_email_logs(notification_type);
CREATE INDEX IF NOT EXISTS idx_crm_email_logs_status ON crm_email_logs(status);
CREATE INDEX IF NOT EXISTS idx_crm_email_logs_lead ON crm_email_logs(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_email_logs_opportunity ON crm_email_logs(opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_email_logs_user ON crm_email_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_email_logs_created ON crm_email_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_notification_schedules_type ON crm_notification_schedules(notification_type);
CREATE INDEX IF NOT EXISTS idx_crm_notification_schedules_lead ON crm_notification_schedules(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_notification_schedules_opportunity ON crm_notification_schedules(opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_notification_schedules_unsent ON crm_notification_schedules(is_sent) WHERE is_sent = FALSE;

-- =====================================================
-- Helper function to log CRM emails
-- =====================================================
CREATE OR REPLACE FUNCTION log_crm_email(
  p_notification_type crm_email_notification_type,
  p_recipient_emails TEXT[],
  p_cc_emails TEXT[],
  p_subject TEXT,
  p_lead_id TEXT DEFAULT NULL,
  p_opportunity_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO crm_email_logs (
    notification_type,
    recipient_emails,
    cc_emails,
    subject,
    lead_id,
    opportunity_id,
    user_id,
    metadata,
    status
  ) VALUES (
    p_notification_type,
    p_recipient_emails,
    p_cc_emails,
    p_subject,
    p_lead_id,
    p_opportunity_id,
    p_user_id,
    p_metadata,
    'pending'
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Function to update email log status
-- =====================================================
CREATE OR REPLACE FUNCTION update_crm_email_status(
  p_log_id UUID,
  p_status email_status,
  p_message_id TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE crm_email_logs
  SET
    status = p_status,
    message_id = COALESCE(p_message_id, message_id),
    error_message = COALESCE(p_error_message, error_message),
    sent_at = CASE WHEN p_status = 'sent' THEN NOW() ELSE sent_at END
  WHERE id = p_log_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Function to check if reminder was already sent
-- =====================================================
CREATE OR REPLACE FUNCTION was_reminder_sent(
  p_notification_type crm_email_notification_type,
  p_lead_id TEXT DEFAULT NULL,
  p_opportunity_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_interval_hours INTEGER DEFAULT 0
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM crm_notification_schedules
    WHERE notification_type = p_notification_type
      AND interval_hours = p_interval_hours
      AND is_sent = TRUE
      AND (
        (p_lead_id IS NOT NULL AND lead_id = p_lead_id) OR
        (p_opportunity_id IS NOT NULL AND opportunity_id = p_opportunity_id) OR
        (p_user_id IS NOT NULL AND user_id = p_user_id)
      )
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Function to mark reminder as sent
-- =====================================================
CREATE OR REPLACE FUNCTION mark_reminder_sent(
  p_notification_type crm_email_notification_type,
  p_email_log_id UUID,
  p_lead_id TEXT DEFAULT NULL,
  p_opportunity_id TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_interval_hours INTEGER DEFAULT 0,
  p_reminder_number INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO crm_notification_schedules (
    notification_type,
    lead_id,
    opportunity_id,
    user_id,
    interval_hours,
    reminder_number,
    is_sent,
    sent_at,
    email_log_id
  ) VALUES (
    p_notification_type,
    p_lead_id,
    p_opportunity_id,
    p_user_id,
    p_interval_hours,
    p_reminder_number,
    TRUE,
    NOW(),
    p_email_log_id
  )
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- RLS Policies
-- =====================================================
ALTER TABLE crm_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_notification_schedules ENABLE ROW LEVEL SECURITY;

-- Admin can view all email logs
CREATE POLICY "Admin can view all email logs" ON crm_email_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('Director', 'super admin')
    )
  );

-- Admin can view all notification schedules
CREATE POLICY "Admin can view all notification schedules" ON crm_notification_schedules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
      AND role IN ('Director', 'super admin')
    )
  );

-- Service role can do everything (for API routes)
CREATE POLICY "Service role full access email logs" ON crm_email_logs
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access notification schedules" ON crm_notification_schedules
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE crm_email_logs IS 'Logs all CRM notification emails sent by the system';
COMMENT ON TABLE crm_notification_schedules IS 'Tracks scheduled notifications to prevent duplicate sends';
COMMENT ON COLUMN crm_email_logs.notification_type IS 'Type of CRM notification (new_lead_assignment, unclaimed_lead_reminder, etc.)';
COMMENT ON COLUMN crm_email_logs.metadata IS 'Additional data like hours_elapsed, reminder_number, etc.';
COMMENT ON COLUMN crm_notification_schedules.interval_hours IS 'The hour interval for this reminder (e.g., 4, 6, 12, 24 for unclaimed leads)';
