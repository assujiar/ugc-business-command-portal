-- =====================================================
-- Migration 155: Content-Level Social Media Analytics
-- Stores individual post/video/reel performance data
-- per platform for granular content analysis.
-- =====================================================

-- 1. Content type enum
DO $$ BEGIN
  CREATE TYPE social_media_content_type AS ENUM (
    'post', 'video', 'reel', 'story', 'short', 'carousel', 'live', 'article'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Content-level analytics table
CREATE TABLE IF NOT EXISTS marketing_social_media_content (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  platform social_media_platform NOT NULL,
  content_id TEXT NOT NULL,             -- platform's native ID for the content
  content_type social_media_content_type NOT NULL DEFAULT 'post',

  -- Content metadata
  title TEXT,
  caption TEXT,
  url TEXT,                              -- direct link to the content
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,
  hashtags TEXT[] DEFAULT '{}',          -- extracted hashtags

  -- Performance metrics (updated each fetch)
  views_count BIGINT DEFAULT 0,
  likes_count BIGINT DEFAULT 0,
  comments_count BIGINT DEFAULT 0,
  shares_count BIGINT DEFAULT 0,
  saves_count BIGINT DEFAULT 0,
  reach BIGINT DEFAULT 0,
  impressions BIGINT DEFAULT 0,

  -- Engagement
  engagement_rate NUMERIC(8,4) DEFAULT 0, -- (likes+comments+shares) / reach * 100
  click_count BIGINT DEFAULT 0,

  -- Video-specific metrics
  video_duration_seconds INTEGER,
  avg_watch_time_seconds NUMERIC(10,2),
  watch_through_rate NUMERIC(8,4),       -- % viewers who watched to end

  -- Platform-specific extra metrics (flexible JSONB)
  -- TikTok: { video_play_count, full_video_watched, avg_time_watched }
  -- Instagram: { profile_visits_from_post, follows_from_post, saved_count }
  -- YouTube: { estimated_minutes_watched, average_view_duration, estimated_revenue, subscriber_gained }
  -- Facebook: { reactions_breakdown: { like, love, haha, wow, sad, angry }, negative_feedback }
  -- LinkedIn: { unique_impressions, click_through_rate, engagement_rate_linkedin }
  extra_metrics JSONB DEFAULT '{}',

  -- Tracking
  last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
  fetch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate content entries per platform
  UNIQUE (platform, content_id)
);

-- 3. Content performance history (track metric changes over time)
CREATE TABLE IF NOT EXISTS marketing_social_media_content_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_id_ref BIGINT NOT NULL REFERENCES marketing_social_media_content(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  views_count BIGINT DEFAULT 0,
  likes_count BIGINT DEFAULT 0,
  comments_count BIGINT DEFAULT 0,
  shares_count BIGINT DEFAULT 0,
  saves_count BIGINT DEFAULT 0,
  engagement_rate NUMERIC(8,4) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_social_content_platform
  ON marketing_social_media_content (platform, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_content_platform_type
  ON marketing_social_media_content (platform, content_type, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_content_engagement
  ON marketing_social_media_content (platform, engagement_rate DESC);

CREATE INDEX IF NOT EXISTS idx_social_content_views
  ON marketing_social_media_content (platform, views_count DESC);

CREATE INDEX IF NOT EXISTS idx_social_content_history_ref
  ON marketing_social_media_content_history (content_id_ref, recorded_at DESC);

-- 5. RLS
ALTER TABLE marketing_social_media_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_social_media_content_history ENABLE ROW LEVEL SECURITY;

-- Marketing + Admin can read content analytics
CREATE POLICY "marketing_content_select" ON marketing_social_media_content
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

CREATE POLICY "marketing_content_history_select" ON marketing_social_media_content_history
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

-- Service role handles inserts/updates (via cron webhook)
