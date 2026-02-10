-- =====================================================
-- Migration 157: Marketing Content Plan Schema
-- Content calendar, editorial workflow, campaigns,
-- hashtag library, templates, and activity log
-- =====================================================

-- 1. Campaigns table (must be created first for FK reference)
CREATE TABLE IF NOT EXISTS marketing_content_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_campaigns_status ON marketing_content_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_content_campaigns_dates ON marketing_content_campaigns(start_date, end_date);

-- 2. Content Plans table (core)
CREATE TABLE IF NOT EXISTS marketing_content_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  caption TEXT,
  notes TEXT,
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'post',
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  status TEXT NOT NULL DEFAULT 'draft',
  status_changed_at TIMESTAMPTZ,
  status_changed_by UUID REFERENCES profiles(user_id),
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  assigned_to UUID REFERENCES profiles(user_id),
  priority TEXT DEFAULT 'medium',
  visual_url TEXT,
  visual_thumbnail_url TEXT,
  campaign_id UUID REFERENCES marketing_content_campaigns(id) ON DELETE SET NULL,
  parent_plan_id UUID REFERENCES marketing_content_plans(id) ON DELETE SET NULL,
  target_views INTEGER,
  target_likes INTEGER,
  target_comments INTEGER,
  target_shares INTEGER,
  target_engagement_rate NUMERIC(6,4),
  linked_content_id BIGINT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_plans_date ON marketing_content_plans(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_content_plans_status ON marketing_content_plans(status);
CREATE INDEX IF NOT EXISTS idx_content_plans_platform ON marketing_content_plans(platform);
CREATE INDEX IF NOT EXISTS idx_content_plans_campaign ON marketing_content_plans(campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_plans_created_by ON marketing_content_plans(created_by);
CREATE INDEX IF NOT EXISTS idx_content_plans_assigned_to ON marketing_content_plans(assigned_to);
CREATE INDEX IF NOT EXISTS idx_content_plans_parent ON marketing_content_plans(parent_plan_id);

-- 3. Hashtag Library
CREATE TABLE IF NOT EXISTS marketing_hashtags (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag TEXT NOT NULL UNIQUE,
  category TEXT DEFAULT 'general',
  platforms TEXT[] DEFAULT '{}',
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hashtags_tag ON marketing_hashtags(tag);
CREATE INDEX IF NOT EXISTS idx_hashtags_category ON marketing_hashtags(category);
CREATE INDEX IF NOT EXISTS idx_hashtags_usage ON marketing_hashtags(usage_count DESC);

-- 4. Content Plan <-> Hashtag junction
CREATE TABLE IF NOT EXISTS marketing_content_plan_hashtags (
  content_plan_id UUID NOT NULL REFERENCES marketing_content_plans(id) ON DELETE CASCADE,
  hashtag_id BIGINT NOT NULL REFERENCES marketing_hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (content_plan_id, hashtag_id)
);

-- 5. Hashtag Groups
CREATE TABLE IF NOT EXISTS marketing_hashtag_groups (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  hashtag_ids BIGINT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Content Templates
CREATE TABLE IF NOT EXISTS marketing_content_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT,
  content_type TEXT,
  caption_template TEXT,
  default_hashtag_ids BIGINT[] DEFAULT '{}',
  notes TEXT,
  created_by UUID REFERENCES profiles(user_id),
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_templates_platform ON marketing_content_templates(platform);

-- 7. Editorial Comments
CREATE TABLE IF NOT EXISTS marketing_content_plan_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_plan_id UUID NOT NULL REFERENCES marketing_content_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(user_id),
  comment TEXT NOT NULL,
  comment_type TEXT NOT NULL DEFAULT 'comment',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_comments_plan ON marketing_content_plan_comments(content_plan_id);

-- 8. Activity Log
CREATE TABLE IF NOT EXISTS marketing_content_activity_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(user_id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON marketing_content_activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON marketing_content_activity_log(created_at DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at for content plans
CREATE OR REPLACE FUNCTION fn_content_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_plans_updated_at ON marketing_content_plans;
CREATE TRIGGER trg_content_plans_updated_at
  BEFORE UPDATE ON marketing_content_plans
  FOR EACH ROW EXECUTE FUNCTION fn_content_plan_updated_at();

-- Auto-update updated_at for campaigns
DROP TRIGGER IF EXISTS trg_content_campaigns_updated_at ON marketing_content_campaigns;
CREATE TRIGGER trg_content_campaigns_updated_at
  BEFORE UPDATE ON marketing_content_campaigns
  FOR EACH ROW EXECUTE FUNCTION fn_content_plan_updated_at();

-- Auto-update updated_at for templates
DROP TRIGGER IF EXISTS trg_content_templates_updated_at ON marketing_content_templates;
CREATE TRIGGER trg_content_templates_updated_at
  BEFORE UPDATE ON marketing_content_templates
  FOR EACH ROW EXECUTE FUNCTION fn_content_plan_updated_at();

-- Auto-increment hashtag usage_count on link
CREATE OR REPLACE FUNCTION fn_hashtag_usage_increment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE marketing_hashtags SET usage_count = usage_count + 1 WHERE id = NEW.hashtag_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_hashtag_usage_increment ON marketing_content_plan_hashtags;
CREATE TRIGGER trg_hashtag_usage_increment
  AFTER INSERT ON marketing_content_plan_hashtags
  FOR EACH ROW EXECUTE FUNCTION fn_hashtag_usage_increment();

-- Auto-decrement hashtag usage_count on unlink
CREATE OR REPLACE FUNCTION fn_hashtag_usage_decrement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE marketing_hashtags SET usage_count = GREATEST(0, usage_count - 1) WHERE id = OLD.hashtag_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_hashtag_usage_decrement ON marketing_content_plan_hashtags;
CREATE TRIGGER trg_hashtag_usage_decrement
  AFTER DELETE ON marketing_content_plan_hashtags
  FOR EACH ROW EXECUTE FUNCTION fn_hashtag_usage_decrement();

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- Helper: check if user has marketing role
CREATE OR REPLACE FUNCTION fn_is_marketing_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('super admin', 'Director', 'Marketing Manager',
                          'Marcomm', 'DGO', 'MACX', 'VDCO')
  );
$$;

-- Helper: check if user is approver (Manager/Director/Admin)
CREATE OR REPLACE FUNCTION fn_is_content_approver()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('super admin', 'Director', 'Marketing Manager')
  );
$$;

-- Content Plans RLS
ALTER TABLE marketing_content_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY content_plans_select ON marketing_content_plans
  FOR SELECT USING (
    auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user()
  );

CREATE POLICY content_plans_insert ON marketing_content_plans
  FOR INSERT WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user()
  );

CREATE POLICY content_plans_update ON marketing_content_plans
  FOR UPDATE USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR (created_by = auth.uid() AND status IN ('draft', 'rejected'))
    OR fn_is_content_approver()
  );

CREATE POLICY content_plans_delete ON marketing_content_plans
  FOR DELETE USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR (created_by = auth.uid() AND status = 'draft')
    OR fn_is_content_approver()
  );

-- Campaigns RLS
ALTER TABLE marketing_content_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY campaigns_select ON marketing_content_campaigns
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY campaigns_insert ON marketing_content_campaigns
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY campaigns_update ON marketing_content_campaigns
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_content_approver());
CREATE POLICY campaigns_delete ON marketing_content_campaigns
  FOR DELETE USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_content_approver());

-- Hashtags RLS
ALTER TABLE marketing_hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY hashtags_select ON marketing_hashtags
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY hashtags_insert ON marketing_hashtags
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY hashtags_update ON marketing_hashtags
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY hashtags_delete ON marketing_hashtags
  FOR DELETE USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_content_approver());

-- Hashtag junction RLS
ALTER TABLE marketing_content_plan_hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_hashtags_select ON marketing_content_plan_hashtags
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY plan_hashtags_insert ON marketing_content_plan_hashtags
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY plan_hashtags_delete ON marketing_content_plan_hashtags
  FOR DELETE USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());

-- Hashtag Groups RLS
ALTER TABLE marketing_hashtag_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY hashtag_groups_select ON marketing_hashtag_groups
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY hashtag_groups_insert ON marketing_hashtag_groups
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY hashtag_groups_delete ON marketing_hashtag_groups
  FOR DELETE USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_content_approver());

-- Templates RLS
ALTER TABLE marketing_content_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY templates_select ON marketing_content_templates
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY templates_insert ON marketing_content_templates
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY templates_update ON marketing_content_templates
  FOR UPDATE USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY templates_delete ON marketing_content_templates
  FOR DELETE USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_content_approver());

-- Comments RLS
ALTER TABLE marketing_content_plan_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY comments_select ON marketing_content_plan_comments
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY comments_insert ON marketing_content_plan_comments
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());

-- Activity Log RLS
ALTER TABLE marketing_content_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_log_select ON marketing_content_activity_log
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
CREATE POLICY activity_log_insert ON marketing_content_activity_log
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'service_role' OR fn_is_marketing_user());
