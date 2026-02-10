-- =====================================================
-- Migration 016: MACX Role Access to Marketing Department Leads
--
-- Requirement: MACX users can view, edit, and update all leads
-- created by users in the marketing department
-- =====================================================

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Check if current user has MACX role
CREATE OR REPLACE FUNCTION is_macx()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() = 'MACX';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if a user is in the marketing department (by department field or marketing role)
CREATE OR REPLACE FUNCTION is_user_in_marketing_department(check_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_dept TEXT;
  user_role user_role;
BEGIN
  SELECT department, role INTO user_dept, user_role
  FROM profiles
  WHERE user_id = check_user_id;

  -- Check by department field (case insensitive)
  IF user_dept IS NOT NULL AND LOWER(user_dept) LIKE '%marketing%' THEN
    RETURN TRUE;
  END IF;

  -- Also check by marketing roles (as fallback)
  IF user_role IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO') THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if a lead was created by a marketing department user
CREATE OR REPLACE FUNCTION is_lead_from_marketing_department(lead_created_by UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF lead_created_by IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN is_user_in_marketing_department(lead_created_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- UPDATE VIEWS TO INCLUDE CREATOR INFO
-- =====================================================

-- Update v_lead_management to include creator's department and role
DROP VIEW IF EXISTS v_lead_management;
CREATE VIEW v_lead_management AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name AS pic_name,
  l.contact_email AS pic_email,
  l.contact_phone AS pic_phone,
  l.triage_status,
  l.source,
  l.priority,
  l.potential_revenue,
  l.claim_status,
  l.claimed_by_name,
  l.inquiry_text,
  l.notes,
  l.created_at,
  l.updated_at,
  l.created_by,
  l.marketing_owner_user_id,
  l.sales_owner_user_id,
  l.disqualified_at,
  l.disqualified_reason,
  l.qualified_at,
  l.claimed_at,
  l.account_id,
  l.opportunity_id,
  pm.name AS marketing_owner_name,
  pm.email AS marketing_owner_email,
  pm.department AS marketing_department,
  ps.name AS sales_owner_name,
  -- Creator info for MACX access check
  pc.name AS creator_name,
  pc.department AS creator_department,
  pc.role AS creator_role,
  -- Flag to indicate if creator is in marketing department
  CASE
    WHEN pc.department IS NOT NULL AND LOWER(pc.department) LIKE '%marketing%' THEN TRUE
    WHEN pc.role IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO') THEN TRUE
    ELSE FALSE
  END AS creator_is_marketing,
  a.company_name AS account_company_name,
  a.account_status
FROM leads l
LEFT JOIN profiles pm ON l.marketing_owner_user_id = pm.user_id
LEFT JOIN profiles ps ON l.sales_owner_user_id = ps.user_id
LEFT JOIN profiles pc ON l.created_by = pc.user_id
LEFT JOIN accounts a ON l.account_id = a.account_id;

-- Update v_lead_inbox to include creator info
DROP VIEW IF EXISTS v_lead_inbox;
CREATE VIEW v_lead_inbox AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name AS pic_name,
  l.contact_email AS pic_email,
  l.triage_status,
  l.source,
  l.priority,
  l.potential_revenue,
  l.claim_status,
  l.claimed_by_name,
  l.created_at,
  l.created_by,
  l.marketing_owner_user_id,
  l.sales_owner_user_id,
  l.disqualified_at,
  l.disqualified_reason,
  pm.name AS marketing_owner_name,
  pm.email AS marketing_owner_email,
  ps.name AS sales_owner_name,
  -- Creator info for MACX access check
  pc.name AS creator_name,
  pc.department AS creator_department,
  pc.role AS creator_role,
  CASE
    WHEN pc.department IS NOT NULL AND LOWER(pc.department) LIKE '%marketing%' THEN TRUE
    WHEN pc.role IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO') THEN TRUE
    ELSE FALSE
  END AS creator_is_marketing
FROM leads l
LEFT JOIN profiles pm ON l.marketing_owner_user_id = pm.user_id
LEFT JOIN profiles ps ON l.sales_owner_user_id = ps.user_id
LEFT JOIN profiles pc ON l.created_by = pc.user_id;

-- =====================================================
-- UPDATE RLS POLICIES FOR LEADS
-- =====================================================

-- Drop existing leads policies
DROP POLICY IF EXISTS leads_select ON leads;
DROP POLICY IF EXISTS leads_update ON leads;

-- Recreate SELECT policy with MACX access to marketing department leads
-- Marketing: See New/In Review/Nurture/Disqualified leads
-- Sales: See handover pool + assigned leads
-- MACX: Additionally can see ALL leads created by marketing department users
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    is_admin()
    -- Standard marketing access
    OR (is_marketing() AND triage_status IN ('New', 'In Review', 'Nurture', 'Disqualified', 'Qualified', 'Assigned to Sales'))
    -- Sales access
    OR (is_sales() AND (sales_owner_user_id = auth.uid() OR handover_eligible = true))
    -- MACX special access: can see all leads from marketing department
    OR (is_macx() AND is_lead_from_marketing_department(created_by))
  );

-- Recreate UPDATE policy with MACX access to marketing department leads
-- Marketing can update only if not handed over
-- Sales can update only their assigned leads
-- MACX: Can update ALL leads created by marketing department users
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    is_admin()
    -- Standard marketing update access
    OR (is_marketing() AND triage_status IN ('New', 'In Review', 'Nurture', 'Disqualified', 'Qualified', 'Assigned to Sales') AND sales_owner_user_id IS NULL)
    -- Sales update access
    OR (is_sales() AND sales_owner_user_id = auth.uid())
    -- MACX special access: can update all leads from marketing department
    OR (is_macx() AND is_lead_from_marketing_department(created_by))
  );

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON FUNCTION is_macx() IS 'Check if current user has MACX role';
COMMENT ON FUNCTION is_user_in_marketing_department(UUID) IS 'Check if a user belongs to marketing department (by department field or marketing role)';
COMMENT ON FUNCTION is_lead_from_marketing_department(UUID) IS 'Check if a lead was created by a user in the marketing department';
