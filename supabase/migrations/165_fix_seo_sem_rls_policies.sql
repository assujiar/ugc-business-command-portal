-- =====================================================
-- Migration 165: Fix SEO-SEM RLS policies
-- Migration 163 was partially applied, so some policies
-- already exist. Drop all and recreate cleanly.
-- =====================================================

-- Ensure RLS is enabled on all tables
ALTER TABLE marketing_seo_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_seo_daily_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_seo_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_seo_web_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_sem_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_sem_daily_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_sem_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_sem_search_terms ENABLE ROW LEVEL SECURITY;

-- Helper function (CREATE OR REPLACE is idempotent)
CREATE OR REPLACE FUNCTION fn_is_seo_sem_viewer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('super admin', 'Director', 'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO')
  );
$$;

-- Drop all existing policies first (IF EXISTS for safety)
DO $$
DECLARE
  tbl TEXT;
BEGIN
  -- Config table policies
  DROP POLICY IF EXISTS seo_config_select ON marketing_seo_config;
  DROP POLICY IF EXISTS seo_config_insert ON marketing_seo_config;
  DROP POLICY IF EXISTS seo_config_update ON marketing_seo_config;

  -- Data table policies
  FOR tbl IN SELECT unnest(ARRAY[
    'marketing_seo_daily_snapshot',
    'marketing_seo_keywords',
    'marketing_seo_pages',
    'marketing_seo_web_vitals',
    'marketing_sem_campaigns',
    'marketing_sem_daily_spend',
    'marketing_sem_keywords',
    'marketing_sem_search_terms'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON %I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON %I', tbl, tbl);
  END LOOP;
END $$;

-- Recreate config policies
CREATE POLICY seo_config_select ON marketing_seo_config
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_seo_sem_viewer());
CREATE POLICY seo_config_insert ON marketing_seo_config
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY seo_config_update ON marketing_seo_config
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'service_role');

-- Recreate data table policies
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'marketing_seo_daily_snapshot',
    'marketing_seo_keywords',
    'marketing_seo_pages',
    'marketing_seo_web_vitals',
    'marketing_sem_campaigns',
    'marketing_sem_daily_spend',
    'marketing_sem_keywords',
    'marketing_sem_search_terms'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY %I_select ON %I FOR SELECT USING (auth.jwt() ->> ''role'' = ''service_role'' OR fn_is_seo_sem_viewer())',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY %I_insert ON %I FOR INSERT WITH CHECK (auth.jwt() ->> ''role'' = ''service_role'')',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY %I_delete ON %I FOR DELETE USING (auth.jwt() ->> ''role'' = ''service_role'')',
      tbl, tbl
    );
  END LOOP;
END $$;

-- =====================================================
-- Cron Jobs (pg_cron) - idempotent with unschedule first
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing jobs first (ignore errors if they don't exist)
    BEGIN
      PERFORM cron.unschedule('seo-sem-daily-fetch');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('seo-sem-weekly-vitals');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      PERFORM cron.unschedule('seo-sem-cleanup');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Daily SEO fetch: 06:00 WIB = 23:00 UTC day before
    PERFORM cron.schedule(
      'seo-sem-daily-fetch',
      '0 23 * * *',
      $cron$SELECT net.http_post(
        url := current_setting('app.settings.base_url', true) || '/api/marketing/seo-sem/fetch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{"source":"pg_cron","type":"daily_seo"}'::jsonb
      );$cron$
    );

    -- Weekly web vitals: Monday 07:00 WIB = 00:00 UTC Monday
    PERFORM cron.schedule(
      'seo-sem-weekly-vitals',
      '0 0 * * 1',
      $cron$SELECT net.http_post(
        url := current_setting('app.settings.base_url', true) || '/api/marketing/seo-sem/fetch',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{"source":"pg_cron","type":"weekly_vitals"}'::jsonb
      );$cron$
    );

    -- Cleanup old data: Sunday 03:00 UTC
    PERFORM cron.schedule(
      'seo-sem-cleanup',
      '0 3 * * 0',
      $cron$
        DELETE FROM marketing_seo_daily_snapshot WHERE fetch_date < CURRENT_DATE - INTERVAL '12 months';
        DELETE FROM marketing_seo_keywords WHERE fetch_date < CURRENT_DATE - INTERVAL '12 months';
        DELETE FROM marketing_seo_pages WHERE fetch_date < CURRENT_DATE - INTERVAL '12 months';
        DELETE FROM marketing_seo_web_vitals WHERE fetch_date < CURRENT_DATE - INTERVAL '6 months';
        DELETE FROM marketing_sem_campaigns WHERE fetch_date < CURRENT_DATE - INTERVAL '12 months';
        DELETE FROM marketing_sem_daily_spend WHERE fetch_date < CURRENT_DATE - INTERVAL '12 months';
        DELETE FROM marketing_sem_keywords WHERE fetch_date < CURRENT_DATE - INTERVAL '12 months';
        DELETE FROM marketing_sem_search_terms WHERE fetch_date < CURRENT_DATE - INTERVAL '12 months';
      $cron$
    );
  END IF;
END $$;

-- Seed config entries (idempotent via ON CONFLICT)
INSERT INTO marketing_seo_config (service, is_active, extra_config) VALUES
  ('google_search_console', FALSE, '{"sites":["sc-domain:utamaglobalindocargo.com","sc-domain:ugc.id"]}'),
  ('google_analytics', FALSE, '{"site":"utamaglobalindocargo.com"}'),
  ('pagespeed', FALSE, '{"urls":["https://www.utamaglobalindocargo.com","https://rewards.utamaglobalindocargo.com","https://www.ugc.id"]}'),
  ('google_ads', FALSE, '{}'),
  ('meta_ads', FALSE, '{}')
ON CONFLICT (service) DO NOTHING;
