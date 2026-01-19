-- =====================================================
-- Migration 031: Sales Plans Table and Activities View
--
-- Creates sales_plans table for scheduled activities
-- Creates unified activities view combining pipeline_updates and sales_plans
-- =====================================================

-- =====================================================
-- SALES PLANS TABLE
-- For scheduling sales activities (visits, calls, meetings)
-- =====================================================
CREATE TABLE IF NOT EXISTS sales_plans (
  plan_id TEXT PRIMARY KEY,

  -- Activity Details
  activity_type approach_method NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,

  -- Scheduling
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,

  -- Relations
  account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
  opportunity_id TEXT REFERENCES opportunities(opportunity_id) ON DELETE SET NULL,
  lead_id TEXT REFERENCES leads(lead_id) ON DELETE SET NULL,

  -- Completion Status
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  completed_notes TEXT,

  -- Evidence (filled when completed)
  evidence_url TEXT,
  evidence_file_name TEXT,
  evidence_original_url TEXT,

  -- Location (filled when completed)
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  location_address TEXT,

  -- Ownership
  owner_user_id UUID NOT NULL REFERENCES profiles(user_id),

  -- Audit
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to generate sales plan ID
CREATE OR REPLACE FUNCTION generate_sales_plan_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan_id IS NULL THEN
    NEW.plan_id := 'SP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_plan_id ON sales_plans;
CREATE TRIGGER trg_sales_plan_id
  BEFORE INSERT ON sales_plans
  FOR EACH ROW
  EXECUTE FUNCTION generate_sales_plan_id();

-- Indexes for sales_plans
CREATE INDEX IF NOT EXISTS idx_sales_plans_owner ON sales_plans(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_sales_plans_status ON sales_plans(status);
CREATE INDEX IF NOT EXISTS idx_sales_plans_scheduled ON sales_plans(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_sales_plans_account ON sales_plans(account_id);
CREATE INDEX IF NOT EXISTS idx_sales_plans_opportunity ON sales_plans(opportunity_id);

-- =====================================================
-- UNIFIED ACTIVITIES VIEW
-- Combines pipeline_updates (completed) and sales_plans (planned + completed)
-- =====================================================
DROP VIEW IF EXISTS v_activities_unified CASCADE;

CREATE VIEW v_activities_unified AS
-- From sales_plans (planned and completed)
SELECT
  sp.plan_id AS activity_id,
  'sales_plan' AS source_type,
  sp.activity_type::text AS activity_type,
  sp.subject AS activity_detail,
  sp.description AS notes,
  sp.status,
  sp.scheduled_date::TIMESTAMPTZ AS scheduled_on,
  sp.completed_at AS completed_on,
  sp.evidence_url,
  sp.evidence_file_name,
  sp.location_lat,
  sp.location_lng,
  sp.location_address,
  sp.owner_user_id,
  sp.account_id,
  sp.opportunity_id,
  sp.lead_id,
  sp.created_at,
  -- Joined fields
  p.name AS sales_name,
  a.company_name AS account_name,
  o.name AS opportunity_name
FROM sales_plans sp
LEFT JOIN profiles p ON sp.owner_user_id = p.user_id
LEFT JOIN accounts a ON sp.account_id = a.account_id
LEFT JOIN opportunities o ON sp.opportunity_id = o.opportunity_id

UNION ALL

-- From pipeline_updates (always completed activities)
SELECT
  pu.update_id AS activity_id,
  'pipeline_update' AS source_type,
  pu.approach_method::text AS activity_type,
  CONCAT('Pipeline Update: ', pu.old_stage, ' → ', pu.new_stage) AS activity_detail,
  pu.notes,
  'completed' AS status,
  pu.updated_at AS scheduled_on,
  pu.updated_at AS completed_on,
  pu.evidence_url,
  pu.evidence_file_name,
  pu.location_lat,
  pu.location_lng,
  pu.location_address,
  pu.updated_by AS owner_user_id,
  o.account_id,
  pu.opportunity_id,
  o.source_lead_id AS lead_id,
  pu.created_at,
  -- Joined fields
  p.name AS sales_name,
  a.company_name AS account_name,
  o.name AS opportunity_name
FROM pipeline_updates pu
LEFT JOIN opportunities o ON pu.opportunity_id = o.opportunity_id
LEFT JOIN profiles p ON pu.updated_by = p.user_id
LEFT JOIN accounts a ON o.account_id = a.account_id;

-- =====================================================
-- RLS POLICIES FOR SALES_PLANS
-- =====================================================
ALTER TABLE sales_plans ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "sales_plans_select_policy" ON sales_plans;
DROP POLICY IF EXISTS "sales_plans_insert_policy" ON sales_plans;
DROP POLICY IF EXISTS "sales_plans_update_policy" ON sales_plans;
DROP POLICY IF EXISTS "sales_plans_delete_policy" ON sales_plans;

-- View policy: Sales can see own, managers/admins can see all in dept
CREATE POLICY "sales_plans_select_policy" ON sales_plans
  FOR SELECT USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid()
      AND role IN ('super admin', 'Director', 'sales manager', 'sales support', 'Marketing Manager', 'MACX')
    )
  );

-- Insert policy: Salesperson and admin can create
CREATE POLICY "sales_plans_insert_policy" ON sales_plans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid()
      AND role IN ('super admin', 'salesperson')
    )
  );

-- Update policy: Own plans or admin
CREATE POLICY "sales_plans_update_policy" ON sales_plans
  FOR UPDATE USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid()
      AND role IN ('super admin')
    )
  );

-- Delete policy: Manager, support, admin can delete
CREATE POLICY "sales_plans_delete_policy" ON sales_plans
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid()
      AND role IN ('super admin', 'sales manager', 'sales support')
    )
  );

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE sales_plans IS 'Scheduled sales activities (visits, calls, meetings)';
COMMENT ON VIEW v_activities_unified IS 'Unified view of all activities from sales_plans and pipeline_updates';
