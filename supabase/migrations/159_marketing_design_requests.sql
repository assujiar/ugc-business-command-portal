-- Migration 159: Marketing Design Requests (VDCO Module)
-- Enables marketing roles to request visual design production from VDCO

-- 1. Design Requests (main table)
CREATE TABLE IF NOT EXISTS marketing_design_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  design_type TEXT NOT NULL,
  design_subtype TEXT,
  platform_target TEXT[] DEFAULT '{}',
  dimensions TEXT,
  brand_guidelines TEXT,
  reference_urls TEXT[] DEFAULT '{}',
  reference_notes TEXT,
  copy_text TEXT,
  cta_text TEXT,
  color_preferences TEXT,
  mood_tone TEXT,
  output_format TEXT[] DEFAULT '{png}',
  quantity INTEGER DEFAULT 1,
  priority TEXT DEFAULT 'medium',
  deadline DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  requested_by UUID NOT NULL REFERENCES profiles(user_id),
  assigned_to UUID REFERENCES profiles(user_id),
  campaign_id UUID REFERENCES marketing_content_campaigns(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  first_delivered_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  revision_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_requests_status ON marketing_design_requests(status);
CREATE INDEX IF NOT EXISTS idx_design_requests_requested_by ON marketing_design_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_design_requests_assigned_to ON marketing_design_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_design_requests_deadline ON marketing_design_requests(deadline);
CREATE INDEX IF NOT EXISTS idx_design_requests_type ON marketing_design_requests(design_type);
CREATE INDEX IF NOT EXISTS idx_design_requests_priority ON marketing_design_requests(priority);

-- 2. Design Versions (each delivery from VDCO)
CREATE TABLE IF NOT EXISTS marketing_design_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES marketing_design_requests(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  design_url TEXT NOT NULL,
  design_url_2 TEXT,
  thumbnail_url TEXT,
  file_format TEXT,
  notes TEXT,
  delivered_by UUID NOT NULL REFERENCES profiles(user_id),
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  review_status TEXT DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(user_id),
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT
);

CREATE INDEX IF NOT EXISTS idx_design_versions_request ON marketing_design_versions(request_id);
CREATE INDEX IF NOT EXISTS idx_design_versions_status ON marketing_design_versions(review_status);

-- 3. Design Comments (discussion thread)
CREATE TABLE IF NOT EXISTS marketing_design_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES marketing_design_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(user_id),
  comment TEXT NOT NULL,
  comment_type TEXT DEFAULT 'comment',
  version_ref INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_comments_request ON marketing_design_comments(request_id);

-- 4. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION fn_design_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_design_request_updated_at ON marketing_design_requests;
CREATE TRIGGER trg_design_request_updated_at
  BEFORE UPDATE ON marketing_design_requests
  FOR EACH ROW EXECUTE FUNCTION fn_design_request_updated_at();

-- 5. Helper functions for RLS
CREATE OR REPLACE FUNCTION fn_is_design_requester()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND role IN ('Director', 'super admin', 'Marketing Manager', 'Marcomm', 'DGO', 'MACX')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION fn_is_design_producer()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND role IN ('Director', 'super admin', 'VDCO')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION fn_is_design_approver()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND role IN ('Director', 'super admin', 'Marketing Manager')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 6. RLS Policies
ALTER TABLE marketing_design_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_design_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_design_comments ENABLE ROW LEVEL SECURITY;

-- Requests: marketing + VDCO can see all, marketing can insert, update own drafts
CREATE POLICY design_requests_select ON marketing_design_requests
  FOR SELECT USING (fn_is_marketing_user() OR fn_is_design_producer());

CREATE POLICY design_requests_insert ON marketing_design_requests
  FOR INSERT WITH CHECK (fn_is_design_requester() AND requested_by = auth.uid());

CREATE POLICY design_requests_update ON marketing_design_requests
  FOR UPDATE USING (
    fn_is_design_requester() AND (requested_by = auth.uid() OR fn_is_design_approver())
    OR fn_is_design_producer()
  );

CREATE POLICY design_requests_delete ON marketing_design_requests
  FOR DELETE USING (
    (requested_by = auth.uid() AND status = 'draft')
    OR fn_is_design_approver()
  );

-- Versions: all marketing + VDCO can see, VDCO can insert
CREATE POLICY design_versions_select ON marketing_design_versions
  FOR SELECT USING (fn_is_marketing_user() OR fn_is_design_producer());

CREATE POLICY design_versions_insert ON marketing_design_versions
  FOR INSERT WITH CHECK (fn_is_design_producer());

CREATE POLICY design_versions_update ON marketing_design_versions
  FOR UPDATE USING (fn_is_marketing_user() OR fn_is_design_producer());

-- Comments: all marketing + VDCO can see and insert
CREATE POLICY design_comments_select ON marketing_design_comments
  FOR SELECT USING (fn_is_marketing_user() OR fn_is_design_producer());

CREATE POLICY design_comments_insert ON marketing_design_comments
  FOR INSERT WITH CHECK (
    (fn_is_marketing_user() OR fn_is_design_producer()) AND user_id = auth.uid()
  );
