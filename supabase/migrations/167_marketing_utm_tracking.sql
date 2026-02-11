-- =====================================================
-- Migration 167: UTM Tracking & Lead Attribution
-- Stores GA4 traffic source attribution data
-- =====================================================

-- UTM/Source attribution data from GA4
CREATE TABLE IF NOT EXISTS marketing_ga4_utm_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fetch_date DATE NOT NULL,
  site TEXT NOT NULL DEFAULT 'ugc.id',
  -- UTM parameters
  source TEXT NOT NULL DEFAULT '(direct)',        -- utm_source / sessionSource
  medium TEXT NOT NULL DEFAULT '(none)',           -- utm_medium / sessionMedium
  campaign TEXT NOT NULL DEFAULT '(not set)',      -- utm_campaign / sessionCampaignName
  content TEXT DEFAULT NULL,                       -- utm_content
  term TEXT DEFAULT NULL,                          -- utm_term
  -- Metrics
  sessions INTEGER DEFAULT 0,
  users INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  engaged_sessions INTEGER DEFAULT 0,
  engagement_rate NUMERIC(8,6) DEFAULT 0,
  bounce_rate NUMERIC(8,6) DEFAULT 0,
  avg_session_duration NUMERIC(10,2) DEFAULT 0,
  page_views INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_value NUMERIC(12,2) DEFAULT 0,
  -- Channel grouping
  channel_group TEXT DEFAULT NULL,                 -- sessionDefaultChannelGroup
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fetch_date, site, source, medium, campaign)
);

-- RLS
ALTER TABLE marketing_ga4_utm_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_ga4_utm_select ON marketing_ga4_utm_tracking
  FOR SELECT USING (fn_is_seo_sem_viewer());

CREATE POLICY marketing_ga4_utm_admin ON marketing_ga4_utm_tracking
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role IN ('super admin','admin','director'))
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_utm_date ON marketing_ga4_utm_tracking (fetch_date);
CREATE INDEX IF NOT EXISTS idx_utm_source_medium ON marketing_ga4_utm_tracking (source, medium);
CREATE INDEX IF NOT EXISTS idx_utm_campaign ON marketing_ga4_utm_tracking (campaign);
CREATE INDEX IF NOT EXISTS idx_utm_channel ON marketing_ga4_utm_tracking (channel_group);

-- Landing page performance (which pages convert best from which sources)
CREATE TABLE IF NOT EXISTS marketing_ga4_landing_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fetch_date DATE NOT NULL,
  site TEXT NOT NULL DEFAULT 'ugc.id',
  landing_page TEXT NOT NULL,
  source TEXT DEFAULT '(direct)',
  medium TEXT DEFAULT '(none)',
  sessions INTEGER DEFAULT 0,
  users INTEGER DEFAULT 0,
  engaged_sessions INTEGER DEFAULT 0,
  engagement_rate NUMERIC(8,6) DEFAULT 0,
  bounce_rate NUMERIC(8,6) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_value NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fetch_date, site, landing_page, source, medium)
);

ALTER TABLE marketing_ga4_landing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_ga4_lp_select ON marketing_ga4_landing_pages
  FOR SELECT USING (fn_is_seo_sem_viewer());

CREATE POLICY marketing_ga4_lp_admin ON marketing_ga4_landing_pages
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = auth.uid() AND profiles.role IN ('super admin','admin','director'))
  );

CREATE INDEX IF NOT EXISTS idx_lp_date ON marketing_ga4_landing_pages (fetch_date);
CREATE INDEX IF NOT EXISTS idx_lp_page ON marketing_ga4_landing_pages (landing_page);
