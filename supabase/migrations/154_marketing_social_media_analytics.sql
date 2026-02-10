-- =====================================================
-- Migration 154: Marketing Social Media Analytics
-- Tables for storing social media performance data
-- from TikTok, Instagram, YouTube, and Facebook.
-- Uses pg_cron + pg_net for scheduled fetching (3x daily).
-- =====================================================

-- 1. ENUM for social media platforms
DO $$ BEGIN
  CREATE TYPE social_media_platform AS ENUM ('tiktok', 'instagram', 'youtube', 'facebook', 'linkedin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Platform credentials/config table (stores API keys per platform)
CREATE TABLE IF NOT EXISTS marketing_social_media_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform social_media_platform NOT NULL UNIQUE,
  account_id TEXT, -- platform account/page ID
  access_token TEXT, -- encrypted API token
  refresh_token TEXT, -- for OAuth refresh
  token_expires_at TIMESTAMPTZ,
  api_base_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Main analytics snapshot table - one row per platform per fetch
CREATE TABLE IF NOT EXISTS marketing_social_media_analytics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform social_media_platform NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fetch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  fetch_time_slot TEXT NOT NULL CHECK (fetch_time_slot IN ('08:00', '12:00', '17:00')),

  -- Common metrics (all platforms)
  followers_count BIGINT DEFAULT 0,
  followers_gained INTEGER DEFAULT 0,
  following_count BIGINT DEFAULT 0,
  posts_count BIGINT DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  total_likes BIGINT DEFAULT 0,
  total_comments BIGINT DEFAULT 0,
  total_shares BIGINT DEFAULT 0,
  total_saves BIGINT DEFAULT 0,
  engagement_rate NUMERIC(8,4) DEFAULT 0, -- percentage
  reach BIGINT DEFAULT 0,
  impressions BIGINT DEFAULT 0,

  -- Platform-specific metrics (stored as JSONB for flexibility)
  -- TikTok: { video_views, profile_views, avg_watch_time }
  -- Instagram: { stories_count, reels_plays, profile_visits, website_clicks }
  -- YouTube: { subscribers, watch_hours, avg_view_duration, estimated_revenue }
  -- Facebook: { page_likes, page_reach, post_engagements, video_views, link_clicks }
  -- LinkedIn: { connections, page_followers, post_impressions, unique_visitors, click_through_rate }
  platform_specific_data JSONB DEFAULT '{}',

  -- Top performing content snapshot
  top_posts JSONB DEFAULT '[]', -- array of { post_id, title, views, likes, comments, shares, url }

  -- Audience demographics snapshot
  audience_demographics JSONB DEFAULT '{}', -- { age_groups, gender, top_countries, top_cities }

  -- Metadata
  raw_api_response JSONB DEFAULT '{}', -- full API response for debugging
  fetch_status TEXT DEFAULT 'success' CHECK (fetch_status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate entries per platform per time slot per day
  UNIQUE (platform, fetch_date, fetch_time_slot)
);

-- 4. Daily aggregated summary (computed from 3 daily snapshots)
CREATE TABLE IF NOT EXISTS marketing_social_media_daily_summary (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform social_media_platform NOT NULL,
  summary_date DATE NOT NULL,

  -- End-of-day values (from last fetch of the day)
  followers_count BIGINT DEFAULT 0,
  following_count BIGINT DEFAULT 0,
  posts_count BIGINT DEFAULT 0,

  -- Daily deltas (computed: last fetch - first fetch)
  followers_gained INTEGER DEFAULT 0,
  views_gained BIGINT DEFAULT 0,
  likes_gained BIGINT DEFAULT 0,
  comments_gained BIGINT DEFAULT 0,
  shares_gained BIGINT DEFAULT 0,

  -- Daily averages
  avg_engagement_rate NUMERIC(8,4) DEFAULT 0,
  avg_reach BIGINT DEFAULT 0,
  avg_impressions BIGINT DEFAULT 0,

  -- Platform specific daily summary
  platform_specific_summary JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (platform, summary_date)
);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_social_analytics_platform_date
  ON marketing_social_media_analytics (platform, fetch_date DESC);

CREATE INDEX IF NOT EXISTS idx_social_analytics_fetched_at
  ON marketing_social_media_analytics (fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_daily_summary_platform_date
  ON marketing_social_media_daily_summary (platform, summary_date DESC);

-- 6. RLS Policies
ALTER TABLE marketing_social_media_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_social_media_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_social_media_daily_summary ENABLE ROW LEVEL SECURITY;

-- Config: only admin can read/write
CREATE POLICY "admin_config_select" ON marketing_social_media_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('Director', 'super admin')
    )
  );

CREATE POLICY "admin_config_all" ON marketing_social_media_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN ('Director', 'super admin')
    )
  );

-- Analytics data: marketing + admin can read
CREATE POLICY "marketing_analytics_select" ON marketing_social_media_analytics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN (
        'Director', 'super admin',
        'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO'
      )
    )
  );

-- Daily summary: marketing + admin can read
CREATE POLICY "marketing_daily_summary_select" ON marketing_social_media_daily_summary
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role IN (
        'Director', 'super admin',
        'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO'
      )
    )
  );

-- Service role can insert/update (for cron jobs)
-- Note: service_role (adminClient) bypasses RLS automatically

-- 7. Function to compute daily summary from snapshots
CREATE OR REPLACE FUNCTION fn_compute_social_media_daily_summary(p_date DATE DEFAULT CURRENT_DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_platform social_media_platform;
  v_first RECORD;
  v_last RECORD;
  v_avg_engagement NUMERIC(8,4);
  v_avg_reach BIGINT;
  v_avg_impressions BIGINT;
BEGIN
  FOR v_platform IN SELECT unnest(enum_range(NULL::social_media_platform)) LOOP
    -- Get first fetch of the day
    SELECT * INTO v_first
    FROM marketing_social_media_analytics
    WHERE platform = v_platform
      AND fetch_date = p_date
      AND fetch_status = 'success'
    ORDER BY fetched_at ASC
    LIMIT 1;

    -- Get last fetch of the day
    SELECT * INTO v_last
    FROM marketing_social_media_analytics
    WHERE platform = v_platform
      AND fetch_date = p_date
      AND fetch_status = 'success'
    ORDER BY fetched_at DESC
    LIMIT 1;

    -- Skip if no data
    IF v_last IS NULL THEN
      CONTINUE;
    END IF;

    -- Calculate averages
    SELECT
      COALESCE(AVG(engagement_rate), 0),
      COALESCE(AVG(reach), 0)::BIGINT,
      COALESCE(AVG(impressions), 0)::BIGINT
    INTO v_avg_engagement, v_avg_reach, v_avg_impressions
    FROM marketing_social_media_analytics
    WHERE platform = v_platform
      AND fetch_date = p_date
      AND fetch_status = 'success';

    -- Upsert daily summary
    INSERT INTO marketing_social_media_daily_summary (
      platform, summary_date,
      followers_count, following_count, posts_count,
      followers_gained, views_gained, likes_gained, comments_gained, shares_gained,
      avg_engagement_rate, avg_reach, avg_impressions,
      updated_at
    ) VALUES (
      v_platform, p_date,
      v_last.followers_count, v_last.following_count, v_last.posts_count,
      COALESCE(v_last.followers_count - v_first.followers_count, 0)::INTEGER,
      COALESCE(v_last.total_views - v_first.total_views, 0),
      COALESCE(v_last.total_likes - v_first.total_likes, 0),
      COALESCE(v_last.total_comments - v_first.total_comments, 0),
      COALESCE(v_last.total_shares - v_first.total_shares, 0),
      v_avg_engagement, v_avg_reach, v_avg_impressions,
      NOW()
    )
    ON CONFLICT (platform, summary_date)
    DO UPDATE SET
      followers_count = EXCLUDED.followers_count,
      following_count = EXCLUDED.following_count,
      posts_count = EXCLUDED.posts_count,
      followers_gained = EXCLUDED.followers_gained,
      views_gained = EXCLUDED.views_gained,
      likes_gained = EXCLUDED.likes_gained,
      comments_gained = EXCLUDED.comments_gained,
      shares_gained = EXCLUDED.shares_gained,
      avg_engagement_rate = EXCLUDED.avg_engagement_rate,
      avg_reach = EXCLUDED.avg_reach,
      avg_impressions = EXCLUDED.avg_impressions,
      updated_at = NOW();

  END LOOP;
END;
$$;

-- 8. Function that pg_cron calls to trigger the webhook fetch
-- This function uses pg_net (Supabase built-in) to call our API endpoint
CREATE OR REPLACE FUNCTION fn_trigger_social_media_fetch()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_time_slot TEXT;
  v_current_hour INTEGER;
BEGIN
  -- Determine time slot based on current WIB hour (UTC+7)
  v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Jakarta')::INTEGER;

  IF v_current_hour = 8 THEN
    v_time_slot := '08:00';
  ELSIF v_current_hour = 12 THEN
    v_time_slot := '12:00';
  ELSIF v_current_hour = 17 THEN
    v_time_slot := '17:00';
  ELSE
    v_time_slot := LPAD(v_current_hour::TEXT, 2, '0') || ':00';
  END IF;

  -- Get config from vault or environment
  -- IMPORTANT: You must set these in Supabase Vault (Dashboard > Settings > Vault)
  -- SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'app_url';
  -- SELECT decrypted_secret INTO v_service_role_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';

  -- For now, use current_setting (must be set via ALTER DATABASE or supabase config)
  v_supabase_url := current_setting('app.settings.app_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  -- If config is not set, skip (will be configured during deployment)
  IF v_supabase_url IS NULL OR v_service_role_key IS NULL THEN
    RAISE NOTICE 'Social media fetch skipped: app_url or service_role_key not configured';
    RETURN;
  END IF;

  -- Use pg_net to call the API endpoint asynchronously
  PERFORM net.http_post(
    url := v_supabase_url || '/api/marketing/social-media/fetch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := jsonb_build_object(
      'time_slot', v_time_slot,
      'triggered_by', 'pg_cron'
    )
  );
END;
$$;

-- 9. Schedule pg_cron jobs (3x daily at WIB times)
-- WIB = UTC+7, so:
-- 08:00 WIB = 01:00 UTC
-- 12:00 WIB = 05:00 UTC
-- 17:00 WIB = 10:00 UTC

-- Note: pg_cron and pg_net must be enabled in Supabase Dashboard > Database > Extensions
-- These SELECT statements will fail if extensions are not enabled yet.
-- That's OK - they can be run separately after enabling extensions.

DO $$
BEGIN
  -- Check if pg_cron extension is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing jobs if any (idempotent)
    PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE jobname IN (
      'social-media-fetch-0800',
      'social-media-fetch-1200',
      'social-media-fetch-1700',
      'social-media-daily-summary'
    );

    -- Schedule: 08:00 WIB (01:00 UTC)
    PERFORM cron.schedule(
      'social-media-fetch-0800',
      '0 1 * * *',
      $cron$SELECT fn_trigger_social_media_fetch()$cron$
    );

    -- Schedule: 12:00 WIB (05:00 UTC)
    PERFORM cron.schedule(
      'social-media-fetch-1200',
      '0 5 * * *',
      $cron$SELECT fn_trigger_social_media_fetch()$cron$
    );

    -- Schedule: 17:00 WIB (10:00 UTC)
    PERFORM cron.schedule(
      'social-media-fetch-1700',
      '0 10 * * *',
      $cron$SELECT fn_trigger_social_media_fetch()$cron$
    );

    -- Schedule daily summary computation at 23:55 WIB (16:55 UTC)
    PERFORM cron.schedule(
      'social-media-daily-summary',
      '55 16 * * *',
      $cron$SELECT fn_compute_social_media_daily_summary(CURRENT_DATE)$cron$
    );

    RAISE NOTICE 'pg_cron jobs scheduled successfully';
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled. Enable it in Supabase Dashboard > Database > Extensions, then re-run this migration.';
  END IF;
END $$;

-- 10. Seed initial platform config (without tokens - must be filled in manually)
INSERT INTO marketing_social_media_config (platform, api_base_url, is_active) VALUES
  ('tiktok', 'https://open.tiktokapis.com/v2', TRUE),
  ('instagram', 'https://graph.instagram.com/v18.0', TRUE),
  ('youtube', 'https://www.googleapis.com/youtube/v3', TRUE),
  ('facebook', 'https://graph.facebook.com/v18.0', TRUE),
  ('linkedin', 'https://api.linkedin.com/v2', TRUE)
ON CONFLICT (platform) DO NOTHING;
