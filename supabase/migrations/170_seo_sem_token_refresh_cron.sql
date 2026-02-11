-- =====================================================
-- Migration 170: Proactive Token Refresh for SEO-SEM
-- Google OAuth access tokens expire after 1 hour.
-- This cron job refreshes them every 45 minutes to prevent
-- tokens from expiring between scheduled data fetches.
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if any (idempotent)
    BEGIN
      PERFORM cron.unschedule('seo-sem-token-refresh');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Token refresh job - every 45 minutes
    -- Google access tokens last 1 hour; refreshing at 45min ensures
    -- tokens are always valid when daily/weekly fetch jobs run
    PERFORM cron.schedule(
      'seo-sem-token-refresh',
      '*/45 * * * *',
      $cron$SELECT net.http_post(
        url := current_setting('app.settings.base_url', true) || '/api/marketing/seo-sem/token-refresh',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{"source":"pg_cron"}'::jsonb
      );$cron$
    );

    RAISE NOTICE 'pg_cron seo-sem-token-refresh job scheduled (every 45 minutes)';
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled. Skipping SEO-SEM token refresh cron job.';
  END IF;
END $$;
