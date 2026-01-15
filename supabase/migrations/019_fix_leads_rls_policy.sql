-- =====================================================
-- Migration 019: Fix Leads RLS Policy Typo
--
-- Fix: 'Assigned to Sales' should be 'Assign to Sales'
-- This was causing 404 errors when sales/marketing users
-- tried to view lead details
-- =====================================================

-- Drop existing leads policies
DROP POLICY IF EXISTS leads_select ON leads;
DROP POLICY IF EXISTS leads_update ON leads;

-- Recreate SELECT policy with correct status name
-- Marketing: See all leads (removed status restriction for full visibility)
-- Sales: See handover pool + assigned leads
-- MACX: Additionally can see ALL leads created by marketing department users
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    is_admin()
    -- Marketing access - can see all status leads
    OR is_marketing()
    -- Sales access - own leads or handover eligible leads
    OR (is_sales() AND (sales_owner_user_id = auth.uid() OR handover_eligible = true))
    -- MACX special access: can see all leads from marketing department
    OR (is_macx() AND is_lead_from_marketing_department(created_by))
  );

-- Recreate UPDATE policy with correct status name
-- Marketing can update leads that are not yet claimed by sales
-- Sales can update only their assigned leads
-- MACX: Can update ALL leads created by marketing department users
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    is_admin()
    -- Marketing update access - can update if not claimed by sales
    OR (is_marketing() AND (sales_owner_user_id IS NULL OR sales_owner_user_id = auth.uid()))
    -- Sales update access - own leads only
    OR (is_sales() AND sales_owner_user_id = auth.uid())
    -- MACX special access: can update all leads from marketing department
    OR (is_macx() AND is_lead_from_marketing_department(created_by))
  );

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON POLICY leads_select ON leads IS 'Allow read access: admins (all), marketing (all), sales (owned + handover eligible), MACX (marketing dept leads)';
COMMENT ON POLICY leads_update ON leads IS 'Allow update: admins (all), marketing (not claimed by sales), sales (owned), MACX (marketing dept leads)';
