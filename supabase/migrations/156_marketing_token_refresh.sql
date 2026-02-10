-- =====================================================
-- Migration 156: Token Refresh Log & Scheduled Refresh
-- Auto-refresh OAuth tokens before they expire
-- =====================================================

-- 1. Token refresh audit log table
CREATE TABLE IF NOT EXISTS marketing_token_refresh_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform TEXT NOT NULL,
  status TEXT NOT NULL, -- 'refreshed', 'failed', 'valid', 'no_token', 'no_expiry'
  new_expires_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying recent refresh logs per platform
CREATE INDEX IF NOT EXISTS idx_token_refresh_log_platform_created
  ON marketing_token_refresh_log (platform, created_at DESC);

-- Auto-cleanup: keep only last 30 days of refresh logs
CREATE OR REPLACE FUNCTION fn_cleanup_token_refresh_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM marketing_token_refresh_log
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- RLS: Only service_role/admin can access refresh logs
ALTER TABLE marketing_token_refresh_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY token_refresh_log_admin_policy ON marketing_token_refresh_log
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('super admin', 'Director')
    )
  );

-- 2. Scheduled pg_cron jobs for token refresh
-- Runs every 6 hours to proactively check and refresh expiring tokens
-- This ensures tokens are refreshed well before the 3x daily fetch jobs

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing jobs if any (idempotent)
    PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE jobname IN ('social-media-token-refresh', 'cleanup-token-refresh-logs');

    -- Token refresh job - every 6 hours
    PERFORM cron.schedule(
      'social-media-token-refresh',
      '0 */6 * * *',
      $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.base_url', true) || '/api/marketing/social-media/token-refresh',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{"source": "pg_cron"}'::jsonb
      );
      $cron$
    );

    -- Cleanup old refresh logs - once a week on Sunday at 2 AM UTC
    PERFORM cron.schedule(
      'cleanup-token-refresh-logs',
      '0 2 * * 0',
      $cron$ SELECT fn_cleanup_token_refresh_logs(); $cron$
    );

    RAISE NOTICE 'pg_cron token refresh jobs scheduled successfully';
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled. Skipping token refresh cron jobs.';
  END IF;
END $$;

-- 3. Add last_refresh_at and refresh_error columns to config table
ALTER TABLE marketing_social_media_config
  ADD COLUMN IF NOT EXISTS last_refresh_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_refresh_error TEXT;

-- 4. Function to update config after refresh attempt
CREATE OR REPLACE FUNCTION fn_record_token_refresh(
  p_platform TEXT,
  p_success BOOLEAN,
  p_new_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_error TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE marketing_social_media_config
  SET
    last_refresh_at = NOW(),
    last_refresh_error = CASE WHEN p_success THEN NULL ELSE p_error END,
    token_expires_at = COALESCE(p_new_expires_at, token_expires_at),
    updated_at = NOW()
  WHERE platform = p_platform::social_media_platform;

  -- Also log to audit table
  INSERT INTO marketing_token_refresh_log (platform, status, new_expires_at, error_message)
  VALUES (
    p_platform,
    CASE WHEN p_success THEN 'refreshed' ELSE 'failed' END,
    p_new_expires_at,
    p_error
  );
END;
$$;
