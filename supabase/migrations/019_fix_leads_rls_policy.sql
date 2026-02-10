-- =====================================================
-- Migration 019: Fix Leads RLS Policy
--
-- Requirements:
-- 1. Marketing staff - can see leads they created (all statuses)
-- 2. Marketing Manager - can see all leads from marketing department
-- 3. MACX - can see all leads from marketing department
-- 4. Sales - can see owned leads OR handover_eligible leads
-- =====================================================

-- =====================================================
-- HELPER FUNCTIONS (ensure they exist)
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
  user_role_val user_role;
BEGIN
  SELECT department, role INTO user_dept, user_role_val
  FROM profiles
  WHERE user_id = check_user_id;

  -- Check by department field (case insensitive)
  IF user_dept IS NOT NULL AND LOWER(user_dept) LIKE '%marketing%' THEN
    RETURN TRUE;
  END IF;

  -- Also check by marketing roles (as fallback)
  IF user_role_val IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO') THEN
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

-- Helper function to check if user is Marketing Manager
CREATE OR REPLACE FUNCTION is_marketing_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() = 'Marketing Manager';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Drop existing leads policies
DROP POLICY IF EXISTS leads_select ON leads;
DROP POLICY IF EXISTS leads_update ON leads;

-- Recreate SELECT policy with proper access control
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    -- Admin can see ALL leads
    is_admin()

    -- Marketing Manager can see all leads from marketing department
    OR (is_marketing_manager() AND is_lead_from_marketing_department(created_by))

    -- MACX can see all leads from marketing department
    OR (is_macx() AND is_lead_from_marketing_department(created_by))

    -- Marketing staff can see leads they created OR where they are marketing owner
    OR (is_marketing() AND (created_by = auth.uid() OR marketing_owner_user_id = auth.uid()))

    -- Sales can see owned leads OR handover_eligible leads (for claiming)
    OR (is_sales() AND (sales_owner_user_id = auth.uid() OR handover_eligible = true))
  );

-- Recreate UPDATE policy
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    -- Admin can update ALL leads
    is_admin()

    -- Marketing Manager can update marketing department leads (not yet claimed by sales)
    OR (is_marketing_manager() AND is_lead_from_marketing_department(created_by) AND sales_owner_user_id IS NULL)

    -- MACX can update marketing department leads (not yet claimed by sales)
    OR (is_macx() AND is_lead_from_marketing_department(created_by) AND sales_owner_user_id IS NULL)

    -- Marketing staff can update their own leads (not yet claimed by sales)
    OR (is_marketing() AND (created_by = auth.uid() OR marketing_owner_user_id = auth.uid()) AND sales_owner_user_id IS NULL)

    -- Sales can update their owned leads
    OR (is_sales() AND sales_owner_user_id = auth.uid())
  );

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON FUNCTION is_marketing_manager() IS 'Check if current user is Marketing Manager';
COMMENT ON POLICY leads_select ON leads IS 'Marketing staff: own leads, Manager/MACX: marketing dept leads, Sales: owned + handover eligible';
COMMENT ON POLICY leads_update ON leads IS 'Marketing: own leads (not claimed), Manager/MACX: marketing dept leads (not claimed), Sales: owned leads';
