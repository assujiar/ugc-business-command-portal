-- =====================================================
-- Migration 163: Marketing SEO-SEM Performance Schema
-- All tables for SEO (Fase 1), SEM (Fase 2 & 3)
-- =====================================================

-- 1. Configuration table
CREATE TABLE IF NOT EXISTS marketing_seo_config (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service TEXT NOT NULL UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  property_id TEXT,
  api_key TEXT,
  extra_config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_fetch_at TIMESTAMPTZ,
  last_fetch_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SEO Daily Snapshot (GSC + GA4 combined)
CREATE TABLE IF NOT EXISTS marketing_seo_daily_snapshot (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  site TEXT NOT NULL,

  -- Google Search Console
  gsc_total_clicks INTEGER DEFAULT 0,
  gsc_total_impressions INTEGER DEFAULT 0,
  gsc_avg_ctr NUMERIC(6,4) DEFAULT 0,
  gsc_avg_position NUMERIC(6,2) DEFAULT 0,

  -- GA4 organic
  ga_organic_sessions INTEGER DEFAULT 0,
  ga_organic_users INTEGER DEFAULT 0,
  ga_organic_new_users INTEGER DEFAULT 0,
  ga_organic_engaged_sessions INTEGER DEFAULT 0,
  ga_organic_engagement_rate NUMERIC(6,4) DEFAULT 0,
  ga_organic_avg_session_duration NUMERIC(10,2) DEFAULT 0,
  ga_organic_bounce_rate NUMERIC(6,4) DEFAULT 0,
  ga_organic_conversions INTEGER DEFAULT 0,
  ga_organic_page_views INTEGER DEFAULT 0,

  -- Device breakdown (GSC)
  gsc_desktop_clicks INTEGER DEFAULT 0,
  gsc_mobile_clicks INTEGER DEFAULT 0,
  gsc_tablet_clicks INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, site)
);

CREATE INDEX IF NOT EXISTS idx_seo_daily_date ON marketing_seo_daily_snapshot(fetch_date DESC);
CREATE INDEX IF NOT EXISTS idx_seo_daily_site_date ON marketing_seo_daily_snapshot(site, fetch_date DESC);

-- 3. SEO Keywords (from GSC)
CREATE TABLE IF NOT EXISTS marketing_seo_keywords (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  site TEXT NOT NULL,
  query TEXT NOT NULL,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr NUMERIC(6,4) DEFAULT 0,
  position NUMERIC(6,2) DEFAULT 0,
  device TEXT,
  country TEXT,
  is_branded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, site, query, device, country)
);

CREATE INDEX IF NOT EXISTS idx_seo_keywords_date ON marketing_seo_keywords(fetch_date DESC);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_query ON marketing_seo_keywords(query);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_site_date ON marketing_seo_keywords(site, fetch_date DESC);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_clicks ON marketing_seo_keywords(clicks DESC);

-- 4. SEO Pages (GSC + GA4)
CREATE TABLE IF NOT EXISTS marketing_seo_pages (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  site TEXT NOT NULL,
  page_url TEXT NOT NULL,

  -- GSC
  gsc_clicks INTEGER DEFAULT 0,
  gsc_impressions INTEGER DEFAULT 0,
  gsc_ctr NUMERIC(6,4) DEFAULT 0,
  gsc_position NUMERIC(6,2) DEFAULT 0,

  -- GA4
  ga_sessions INTEGER,
  ga_users INTEGER,
  ga_engagement_rate NUMERIC(6,4),
  ga_avg_session_duration NUMERIC(10,2),
  ga_bounce_rate NUMERIC(6,4),
  ga_conversions INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, site, page_url)
);

CREATE INDEX IF NOT EXISTS idx_seo_pages_date ON marketing_seo_pages(fetch_date DESC);
CREATE INDEX IF NOT EXISTS idx_seo_pages_site_date ON marketing_seo_pages(site, fetch_date DESC);

-- 5. Core Web Vitals (PageSpeed Insights)
CREATE TABLE IF NOT EXISTS marketing_seo_web_vitals (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  page_url TEXT NOT NULL,
  strategy TEXT NOT NULL,

  performance_score NUMERIC(5,2),
  lcp_ms NUMERIC(10,2),
  cls NUMERIC(6,4),
  inp_ms NUMERIC(10,2),
  fcp_ms NUMERIC(10,2),
  ttfb_ms NUMERIC(10,2),
  speed_index_ms NUMERIC(10,2),

  lcp_rating TEXT,
  cls_rating TEXT,
  inp_rating TEXT,

  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, page_url, strategy)
);

CREATE INDEX IF NOT EXISTS idx_web_vitals_date ON marketing_seo_web_vitals(fetch_date DESC);

-- 6. SEM Campaigns (Google Ads + Meta Ads)
CREATE TABLE IF NOT EXISTS marketing_sem_campaigns (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  platform TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  campaign_status TEXT,

  spend NUMERIC(12,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(6,4) DEFAULT 0,
  avg_cpc NUMERIC(12,2) DEFAULT 0,
  conversions NUMERIC(10,2) DEFAULT 0,
  conversion_value NUMERIC(14,2) DEFAULT 0,
  cost_per_conversion NUMERIC(12,2) DEFAULT 0,
  roas NUMERIC(8,4) DEFAULT 0,

  impression_share NUMERIC(6,4),
  quality_score_avg NUMERIC(4,2),

  daily_budget NUMERIC(12,2),
  budget_utilization NUMERIC(6,4),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, platform, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_sem_campaigns_date ON marketing_sem_campaigns(fetch_date DESC);
CREATE INDEX IF NOT EXISTS idx_sem_campaigns_platform ON marketing_sem_campaigns(platform, fetch_date DESC);

-- 7. SEM Daily Spend
CREATE TABLE IF NOT EXISTS marketing_sem_daily_spend (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  platform TEXT NOT NULL,

  total_spend NUMERIC(12,2) DEFAULT 0,
  total_impressions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_conversions NUMERIC(10,2) DEFAULT 0,
  total_conversion_value NUMERIC(14,2) DEFAULT 0,
  avg_cpc NUMERIC(12,2) DEFAULT 0,
  avg_cpa NUMERIC(12,2) DEFAULT 0,
  overall_roas NUMERIC(8,4) DEFAULT 0,
  active_campaigns INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, platform)
);

CREATE INDEX IF NOT EXISTS idx_sem_daily_spend_date ON marketing_sem_daily_spend(fetch_date DESC);

-- 8. SEM Keywords (Google Ads)
CREATE TABLE IF NOT EXISTS marketing_sem_keywords (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  ad_group_id TEXT NOT NULL,
  ad_group_name TEXT,
  keyword_text TEXT NOT NULL,
  match_type TEXT,

  spend NUMERIC(12,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(6,4) DEFAULT 0,
  avg_cpc NUMERIC(12,2) DEFAULT 0,
  conversions NUMERIC(10,2) DEFAULT 0,
  quality_score INTEGER,
  expected_ctr_rating TEXT,
  ad_relevance_rating TEXT,
  landing_page_exp_rating TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, ad_group_id, keyword_text)
);

CREATE INDEX IF NOT EXISTS idx_sem_keywords_date ON marketing_sem_keywords(fetch_date DESC);

-- 9. SEM Search Terms (Google Ads)
CREATE TABLE IF NOT EXISTS marketing_sem_search_terms (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fetch_date DATE NOT NULL,
  search_term TEXT NOT NULL,
  campaign_name TEXT,
  ad_group_name TEXT,
  keyword_text TEXT,

  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend NUMERIC(12,2) DEFAULT 0,
  conversions NUMERIC(10,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fetch_date, search_term, keyword_text)
);

CREATE INDEX IF NOT EXISTS idx_sem_search_terms_date ON marketing_sem_search_terms(fetch_date DESC);

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE marketing_seo_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_seo_daily_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_seo_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_seo_web_vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_sem_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_sem_daily_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_sem_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_sem_search_terms ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is marketing team
CREATE OR REPLACE FUNCTION fn_is_seo_sem_viewer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('super admin', 'Director', 'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO')
  );
$$;

-- Config: select for marketing, insert/update for service_role only
CREATE POLICY seo_config_select ON marketing_seo_config
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_seo_sem_viewer());
CREATE POLICY seo_config_insert ON marketing_seo_config
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY seo_config_update ON marketing_seo_config
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'service_role');

-- Apply same SELECT+INSERT policies to all data tables
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
-- Cron Jobs (pg_cron)
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
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

-- =====================================================
-- Seed default config entries (inactive, to be configured)
-- =====================================================

INSERT INTO marketing_seo_config (service, is_active, extra_config) VALUES
  ('google_search_console', FALSE, '{"sites":["sc-domain:utamaglobalindocargo.com","sc-domain:ugc.id"]}'),
  ('google_analytics', FALSE, '{"site":"utamaglobalindocargo.com"}'),
  ('pagespeed', FALSE, '{"urls":["https://www.utamaglobalindocargo.com","https://rewards.utamaglobalindocargo.com","https://www.ugc.id"]}'),
  ('google_ads', FALSE, '{}'),
  ('meta_ads', FALSE, '{}')
ON CONFLICT (service) DO NOTHING;
