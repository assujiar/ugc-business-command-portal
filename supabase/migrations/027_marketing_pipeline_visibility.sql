-- =====================================================
-- Migration 027: Marketing Department Pipeline Visibility
--
-- Allows marketing department to view pipelines and accounts
-- based on original lead creator:
-- - Marcomm/DGO/VSDO: See pipelines from leads THEY created
-- - Marketing Manager/MACX: See ALL pipelines from marketing department leads
-- =====================================================

-- 1. Add columns to accounts table to track original lead info
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS original_lead_id TEXT REFERENCES leads(lead_id),
  ADD COLUMN IF NOT EXISTS original_creator_id UUID REFERENCES profiles(user_id);

COMMENT ON COLUMN accounts.original_lead_id IS 'The first lead that created this account (preserved across retries)';
COMMENT ON COLUMN accounts.original_creator_id IS 'The user who created the original lead';

-- 2. Add column to opportunities table to track original lead creator
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS original_creator_id UUID REFERENCES profiles(user_id);

COMMENT ON COLUMN opportunities.original_creator_id IS 'The user who created the original lead for this pipeline';

-- 3. Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_accounts_original_creator ON accounts(original_creator_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_original_creator ON opportunities(original_creator_id);

-- 4. Create helper function to check if a user is in marketing department (non-manager)
CREATE OR REPLACE FUNCTION is_marketing_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() IN ('Marcomm', 'DGO', 'VSDO');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5. Create helper function to check if a user is marketing manager or MACX
CREATE OR REPLACE FUNCTION is_marketing_manager_or_macx()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() IN ('Marketing Manager', 'MACX');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 6. Create helper function to check if original creator is from marketing department
CREATE OR REPLACE FUNCTION is_original_creator_marketing(creator_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  creator_role user_role;
  creator_dept TEXT;
BEGIN
  SELECT role, department INTO creator_role, creator_dept
  FROM profiles
  WHERE user_id = creator_id;

  -- Check by department field (case insensitive)
  IF creator_dept IS NOT NULL AND LOWER(creator_dept) LIKE '%marketing%' THEN
    RETURN TRUE;
  END IF;

  -- Check by marketing role
  IF creator_role IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 7. Drop existing opportunity select policy and create new granular one
DROP POLICY IF EXISTS opp_select ON opportunities;

CREATE POLICY opp_select ON opportunities FOR SELECT
  USING (
    -- Admin can see all
    is_admin()
    -- Sales can see their owned opportunities
    OR (is_sales() AND owner_user_id = auth.uid())
    -- Sales can see opportunities they created
    OR (is_sales() AND created_by = auth.uid())
    -- Marketing Manager/MACX: See all opportunities from marketing department leads
    OR (is_marketing_manager_or_macx() AND is_original_creator_marketing(original_creator_id))
    -- Marketing staff (Marcomm/DGO/VSDO): See opportunities from leads THEY created
    OR (is_marketing_staff() AND original_creator_id = auth.uid())
    -- Fallback: Allow if original_creator_id is null (legacy data) and user is marketing
    OR (is_marketing() AND original_creator_id IS NULL)
  );

-- 8. Create/update accounts select policy for marketing visibility
DROP POLICY IF EXISTS accounts_select ON accounts;

CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (
    -- Admin can see all
    is_admin()
    -- Sales can see accounts they own
    OR (is_sales() AND owner_user_id = auth.uid())
    -- Sales can see all accounts (for prospecting)
    OR is_sales()
    -- Marketing Manager/MACX: See accounts from marketing department leads
    OR (is_marketing_manager_or_macx() AND is_original_creator_marketing(original_creator_id))
    -- Marketing staff: See accounts from leads THEY created
    OR (is_marketing_staff() AND original_creator_id = auth.uid())
    -- Fallback: Allow if original_creator_id is null (legacy data) and user is marketing
    OR (is_marketing() AND original_creator_id IS NULL)
  );

-- 9. Update v_pipeline_with_updates view to include original creator info
DROP VIEW IF EXISTS v_pipeline_with_updates CASCADE;

CREATE VIEW v_pipeline_with_updates AS
SELECT
  o.opportunity_id,
  o.name,
  o.account_id,
  o.source_lead_id,
  o.stage,
  o.estimated_value,
  o.currency,
  o.probability,
  o.next_step,
  o.next_step_due_date,
  o.owner_user_id,
  o.created_by,
  o.created_at,
  o.updated_at,
  o.closed_at,
  o.outcome,
  o.lost_reason,
  o.competitor,
  o.attempt_number,
  o.original_creator_id,
  a.company_name AS account_name,
  a.pic_name AS account_pic_name,
  a.pic_email AS account_pic_email,
  a.pic_phone AS account_pic_phone,
  a.account_status,
  a.original_lead_id AS account_original_lead_id,
  a.original_creator_id AS account_original_creator_id,
  p.name AS owner_name,
  p.email AS owner_email,
  l.company_name AS lead_company_name,
  l.created_by AS lead_created_by,
  creator.name AS original_creator_name,
  creator.role AS original_creator_role,
  creator.department AS original_creator_department,
  CASE
    WHEN creator.department IS NOT NULL AND LOWER(creator.department) LIKE '%marketing%' THEN TRUE
    WHEN creator.role IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO') THEN TRUE
    ELSE FALSE
  END AS original_creator_is_marketing,
  (SELECT COUNT(*) FROM pipeline_updates pu WHERE pu.opportunity_id = o.opportunity_id) AS update_count,
  (SELECT MAX(pu.created_at) FROM pipeline_updates pu WHERE pu.opportunity_id = o.opportunity_id) AS last_update_at
FROM opportunities o
LEFT JOIN accounts a ON o.account_id = a.account_id
LEFT JOIN profiles p ON o.owner_user_id = p.user_id
LEFT JOIN leads l ON o.source_lead_id = l.lead_id
LEFT JOIN profiles creator ON o.original_creator_id = creator.user_id
ORDER BY o.next_step_due_date ASC;

COMMENT ON VIEW v_pipeline_with_updates IS 'Pipeline/opportunities with update counts and original creator info for marketing visibility';

-- 10. Add comments for functions
COMMENT ON FUNCTION is_marketing_staff() IS 'Check if user is marketing staff (Marcomm/DGO/VSDO)';
COMMENT ON FUNCTION is_marketing_manager_or_macx() IS 'Check if user is Marketing Manager or MACX';
COMMENT ON FUNCTION is_original_creator_marketing(UUID) IS 'Check if original creator is from marketing department';
