-- Migration 158: Content Plan Realization Columns
-- Adds columns for tracking actual posting results and evidence

-- 1. Add realization columns to marketing_content_plans
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS actual_post_url TEXT;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS actual_post_url_2 TEXT;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS actual_views INTEGER;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS actual_likes INTEGER;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS actual_comments INTEGER;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS actual_shares INTEGER;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS actual_engagement_rate NUMERIC(6,4);
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS actual_reach INTEGER;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS actual_impressions INTEGER;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS actual_saves INTEGER;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS actual_clicks INTEGER;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS realized_at TIMESTAMPTZ;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS realized_by UUID REFERENCES profiles(user_id);
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS realization_notes TEXT;

-- 2. Add target columns that were missing
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS target_reach INTEGER;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS target_impressions INTEGER;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS target_saves INTEGER;
ALTER TABLE marketing_content_plans ADD COLUMN IF NOT EXISTS target_clicks INTEGER;

-- 3. Add index for realization queries
CREATE INDEX IF NOT EXISTS idx_content_plans_realized ON marketing_content_plans(realized_at) WHERE realized_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_plans_platform_status ON marketing_content_plans(platform, status);
