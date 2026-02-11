-- =====================================================
-- Migration 166: GA4 Audience Demographics Table
-- Stores age, gender, country, city, new/returning data
-- =====================================================

-- Demographics aggregated data
CREATE TABLE IF NOT EXISTS marketing_ga4_demographics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fetch_date DATE NOT NULL,
  site TEXT NOT NULL DEFAULT 'ugc.id',
  dimension_type TEXT NOT NULL, -- 'age', 'gender', 'country', 'city', 'new_returning', 'language', 'interests'
  dimension_value TEXT NOT NULL,
  sessions INTEGER DEFAULT 0,
  users INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  engaged_sessions INTEGER DEFAULT 0,
  engagement_rate NUMERIC(8,6) DEFAULT 0,
  bounce_rate NUMERIC(8,6) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fetch_date, site, dimension_type, dimension_value)
);

-- RLS
ALTER TABLE marketing_ga4_demographics ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_ga4_demographics_select ON marketing_ga4_demographics
  FOR SELECT USING (fn_is_seo_sem_viewer());

CREATE POLICY marketing_ga4_demographics_admin ON marketing_ga4_demographics
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role IN ('super admin','admin','director'))
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ga4_demo_date_type ON marketing_ga4_demographics (fetch_date, dimension_type);
CREATE INDEX IF NOT EXISTS idx_ga4_demo_site ON marketing_ga4_demographics (site, fetch_date);
