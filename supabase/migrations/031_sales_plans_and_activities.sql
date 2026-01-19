-- =====================================================
-- Migration 031: Sales Plans Table and Activities View
--
-- Sales Plans: Target planning for sales activities
-- - Maintenance existing customer
-- - Hunting new customer
-- - Winback lost customer
-- =====================================================

-- =====================================================
-- PLAN TYPE ENUM
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sales_plan_type') THEN
        CREATE TYPE sales_plan_type AS ENUM (
            'maintenance_existing',
            'hunting_new',
            'winback_lost'
        );
    END IF;
END$$;

-- =====================================================
-- POTENTIAL STATUS ENUM
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'potential_status') THEN
        CREATE TYPE potential_status AS ENUM (
            'pending',
            'potential',
            'not_potential'
        );
    END IF;
END$$;

-- =====================================================
-- SALES PLANS TABLE
-- For planning sales activities/targets
-- =====================================================
DROP TABLE IF EXISTS sales_plans CASCADE;

CREATE TABLE sales_plans (
  plan_id TEXT PRIMARY KEY,

  -- Plan Type
  plan_type sales_plan_type NOT NULL,

  -- Target Company Info
  company_name TEXT NOT NULL,
  pic_name TEXT,
  pic_phone TEXT,
  pic_email TEXT,

  -- Linked Account (for maintenance_existing and winback_lost)
  source_account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,

  -- Planning
  planned_date DATE NOT NULL,
  planned_activity_method approach_method NOT NULL,
  plan_notes TEXT,

  -- Status: planned, completed, cancelled
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),

  -- Realization (filled when activity is done)
  realized_at TIMESTAMPTZ,
  actual_activity_method approach_method,
  method_change_reason TEXT,
  realization_notes TEXT,

  -- Evidence
  evidence_url TEXT,
  evidence_file_name TEXT,
  evidence_original_url TEXT,

  -- Location (for visit/canvassing)
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  location_address TEXT,

  -- For Hunting New Customer: Potential Assessment
  potential_status potential_status DEFAULT 'pending',
  not_potential_reason TEXT,

  -- Auto-created records when marked as potential
  created_lead_id TEXT REFERENCES leads(lead_id) ON DELETE SET NULL,
  created_account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
  created_opportunity_id TEXT REFERENCES opportunities(opportunity_id) ON DELETE SET NULL,

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
CREATE INDEX IF NOT EXISTS idx_sales_plans_planned_date ON sales_plans(planned_date);
CREATE INDEX IF NOT EXISTS idx_sales_plans_plan_type ON sales_plans(plan_type);
CREATE INDEX IF NOT EXISTS idx_sales_plans_potential ON sales_plans(potential_status) WHERE plan_type = 'hunting_new';
CREATE INDEX IF NOT EXISTS idx_sales_plans_source_account ON sales_plans(source_account_id);

-- =====================================================
-- UNIFIED ACTIVITIES VIEW
-- Combines pipeline_updates and sales_plans
-- =====================================================
DROP VIEW IF EXISTS v_activities_unified CASCADE;

CREATE VIEW v_activities_unified AS
-- From sales_plans (planned and completed)
SELECT
  sp.plan_id AS activity_id,
  'sales_plan' AS source_type,
  sp.plan_type::text AS plan_type,
  COALESCE(sp.actual_activity_method, sp.planned_activity_method)::text AS activity_type,
  sp.company_name AS activity_detail,
  COALESCE(sp.realization_notes, sp.plan_notes) AS notes,
  sp.status,
  sp.planned_date::TIMESTAMPTZ AS scheduled_on,
  sp.realized_at AS completed_on,
  sp.evidence_url,
  sp.evidence_file_name,
  sp.location_lat,
  sp.location_lng,
  sp.location_address,
  sp.owner_user_id,
  COALESCE(sp.created_account_id, sp.source_account_id) AS account_id,
  sp.created_opportunity_id AS opportunity_id,
  sp.created_lead_id AS lead_id,
  sp.created_at,
  sp.potential_status::text AS potential_status,
  -- Target info
  sp.pic_name,
  sp.pic_phone,
  sp.pic_email,
  -- Joined fields
  p.name AS sales_name,
  COALESCE(a.company_name, sp.company_name) AS account_name
FROM sales_plans sp
LEFT JOIN profiles p ON sp.owner_user_id = p.user_id
LEFT JOIN accounts a ON COALESCE(sp.created_account_id, sp.source_account_id) = a.account_id

UNION ALL

-- From pipeline_updates (always completed activities)
SELECT
  pu.update_id AS activity_id,
  'pipeline_update' AS source_type,
  'pipeline' AS plan_type,
  pu.approach_method::text AS activity_type,
  CONCAT('Pipeline: ', pu.old_stage, ' → ', pu.new_stage) AS activity_detail,
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
  NULL AS potential_status,
  -- Target info (from account)
  a.pic_name,
  a.pic_phone,
  a.pic_email,
  -- Joined fields
  p.name AS sales_name,
  a.company_name AS account_name
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

-- View policy: Sales can see own, managers/admins can see all
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
COMMENT ON TABLE sales_plans IS 'Sales activity planning for maintenance, hunting, and winback';
COMMENT ON COLUMN sales_plans.plan_type IS 'Type: maintenance_existing, hunting_new, winback_lost';
COMMENT ON COLUMN sales_plans.potential_status IS 'For hunting_new: pending, potential, not_potential';
COMMENT ON VIEW v_activities_unified IS 'Unified view of all activities from sales_plans and pipeline_updates';
