-- =====================================================
-- Migration 010: Row Level Security Policies
-- SOURCE: PDF Section 6, Pages 25-27
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_handover_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadences ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospecting_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
BEGIN
  RETURN (SELECT role FROM profiles WHERE user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() IN ('Director', 'super admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is marketing
CREATE OR REPLACE FUNCTION is_marketing()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() IN ('Director', 'super admin', 'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is sales
CREATE OR REPLACE FUNCTION is_sales()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() IN ('Director', 'super admin', 'sales manager', 'salesperson', 'sales support');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- PROFILES POLICIES
-- =====================================================
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (true); -- Everyone can read profiles

CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (user_id = auth.uid() OR is_admin());

-- =====================================================
-- ACCOUNTS POLICIES
-- SOURCE: PDF Page 26 - "sales can select accounts"
-- =====================================================
CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (is_admin() OR is_sales() OR is_marketing());

CREATE POLICY accounts_insert ON accounts FOR INSERT
  WITH CHECK (is_admin() OR is_sales());

CREATE POLICY accounts_update ON accounts FOR UPDATE
  USING (is_admin() OR owner_user_id = auth.uid());

-- =====================================================
-- CONTACTS POLICIES
-- =====================================================
CREATE POLICY contacts_select ON contacts FOR SELECT
  USING (is_admin() OR is_sales() OR is_marketing());

CREATE POLICY contacts_insert ON contacts FOR INSERT
  WITH CHECK (is_admin() OR is_sales());

CREATE POLICY contacts_update ON contacts FOR UPDATE
  USING (is_admin() OR is_sales());

-- =====================================================
-- LEADS POLICIES
-- SOURCE: PDF Pages 25-27
-- Marketing: See New/In Review/Nurture/Disqualified
-- Sales: See handover pool + assigned leads
-- =====================================================
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    is_admin()
    OR (is_marketing() AND triage_status IN ('New', 'In Review', 'Nurture', 'Disqualified'))
    OR (is_sales() AND (sales_owner_user_id = auth.uid() OR handover_eligible = true))
  );

CREATE POLICY leads_insert ON leads FOR INSERT
  WITH CHECK (is_admin() OR is_marketing());

-- Marketing can update only if not handed over
-- Sales can update only their assigned leads
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    is_admin()
    OR (is_marketing() AND triage_status IN ('New', 'In Review', 'Nurture', 'Disqualified') AND sales_owner_user_id IS NULL)
    OR (is_sales() AND sales_owner_user_id = auth.uid())
  );

-- =====================================================
-- LEAD HANDOVER POOL POLICIES
-- SOURCE: PDF Page 22
-- =====================================================
CREATE POLICY pool_select ON lead_handover_pool FOR SELECT
  USING (is_admin() OR is_sales() OR handed_over_by = auth.uid());

CREATE POLICY pool_insert ON lead_handover_pool FOR INSERT
  WITH CHECK (is_admin() OR is_marketing());

CREATE POLICY pool_update ON lead_handover_pool FOR UPDATE
  USING (is_admin() OR is_sales());

-- =====================================================
-- OPPORTUNITIES POLICIES
-- SOURCE: PDF Page 26
-- =====================================================
CREATE POLICY opp_select ON opportunities FOR SELECT
  USING (is_admin() OR is_sales() OR is_marketing());

CREATE POLICY opp_insert ON opportunities FOR INSERT
  WITH CHECK (is_admin() OR is_sales());

CREATE POLICY opp_update ON opportunities FOR UPDATE
  USING (is_admin() OR owner_user_id = auth.uid());

-- =====================================================
-- OPPORTUNITY STAGE HISTORY POLICIES
-- =====================================================
CREATE POLICY stage_history_select ON opportunity_stage_history FOR SELECT
  USING (is_admin() OR is_sales() OR is_marketing());

CREATE POLICY stage_history_insert ON opportunity_stage_history FOR INSERT
  WITH CHECK (is_admin() OR is_sales());

-- =====================================================
-- ACTIVITIES POLICIES
-- SOURCE: PDF Page 25 - "marketing can see all activities"
-- =====================================================
CREATE POLICY activities_select ON activities FOR SELECT
  USING (is_admin() OR owner_user_id = auth.uid() OR is_marketing());

CREATE POLICY activities_insert ON activities FOR INSERT
  WITH CHECK (is_admin() OR is_sales() OR is_marketing());

CREATE POLICY activities_update ON activities FOR UPDATE
  USING (is_admin() OR owner_user_id = auth.uid());

-- =====================================================
-- CADENCES POLICIES
-- SOURCE: PDF Page 25 - "select for all, insert admin only"
-- =====================================================
CREATE POLICY cadences_select ON cadences FOR SELECT
  USING (is_admin() OR is_sales() OR is_marketing());

CREATE POLICY cadences_insert ON cadences FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY cadences_update ON cadences FOR UPDATE
  USING (is_admin());

-- Cadence steps follow same rules
CREATE POLICY steps_select ON cadence_steps FOR SELECT
  USING (is_admin() OR is_sales() OR is_marketing());

CREATE POLICY steps_insert ON cadence_steps FOR INSERT
  WITH CHECK (is_admin());

-- =====================================================
-- CADENCE ENROLLMENTS POLICIES
-- SOURCE: PDF Page 25
-- =====================================================
CREATE POLICY enrollments_select ON cadence_enrollments FOR SELECT
  USING (is_admin() OR enrolled_by = auth.uid());

CREATE POLICY enrollments_insert ON cadence_enrollments FOR INSERT
  WITH CHECK (is_admin() OR is_sales());

CREATE POLICY enrollments_update ON cadence_enrollments FOR UPDATE
  USING (is_admin() OR enrolled_by = auth.uid());

-- =====================================================
-- PROSPECTING TARGETS POLICIES
-- SOURCE: PDF Page 24 - "sales can select targets"
-- =====================================================
CREATE POLICY targets_select ON prospecting_targets FOR SELECT
  USING (is_admin() OR owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY targets_insert ON prospecting_targets FOR INSERT
  WITH CHECK (is_admin() OR is_sales());

CREATE POLICY targets_update ON prospecting_targets FOR UPDATE
  USING (is_admin() OR owner_user_id = auth.uid());

-- =====================================================
-- IMPORT BATCHES POLICIES
-- SOURCE: PDF - "Only certain roles can import"
-- =====================================================
CREATE POLICY imports_select ON import_batches FOR SELECT
  USING (is_admin() OR imported_by = auth.uid());

CREATE POLICY imports_insert ON import_batches FOR INSERT
  WITH CHECK (
    is_admin()
    OR get_user_role() IN ('Marketing Manager', 'sales manager')
  );

-- =====================================================
-- AUDIT LOGS POLICIES
-- =====================================================
CREATE POLICY audit_select ON audit_logs FOR SELECT
  USING (is_admin());

CREATE POLICY audit_insert ON audit_logs FOR INSERT
  WITH CHECK (true); -- Allow all authenticated users to create audit entries

COMMENT ON FUNCTION get_user_role() IS 'Returns current user role for RLS';
COMMENT ON FUNCTION is_admin() IS 'Check if user is Director or super admin';
COMMENT ON FUNCTION is_marketing() IS 'Check if user has marketing role';
COMMENT ON FUNCTION is_sales() IS 'Check if user has sales role';
