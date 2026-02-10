-- =====================================================
-- Migration 161: Fix Design Request RBAC
-- Rules:
--   SELECT: own requests only (except MM/MACX/Director/super admin see all,
--           VDCO sees assigned + submitted/active requests)
--   INSERT requests: non-VDCO marketing roles only
--   INSERT versions: VDCO only (design delivery)
--   UPDATE versions (review): requester + MM/MACX only (NOT VDCO)
-- =====================================================

-- Helper: check if user is a supervisor (can see all)
CREATE OR REPLACE FUNCTION fn_is_design_supervisor()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND role IN ('Director', 'super admin', 'Marketing Manager', 'MACX')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: check if user is VDCO (producer role)
-- (redefine to be just VDCO, not Director/super admin - those use supervisor)
CREATE OR REPLACE FUNCTION fn_is_design_producer()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND role = 'VSDO'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: can review designs (requester, MM, MACX, Director, super admin - NOT VDCO)
CREATE OR REPLACE FUNCTION fn_can_review_design()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
    AND role IN ('Director', 'super admin', 'Marketing Manager', 'MACX', 'Marcomm', 'DGO')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- Fix SELECT policy on design_requests
-- Supervisor (MM/MACX/Director/super admin): see all
-- VDCO: see assigned to them + all submitted/active (to pick up work)
-- Others: own requests only
-- =====================================================
DROP POLICY IF EXISTS design_requests_select ON marketing_design_requests;
CREATE POLICY design_requests_select ON marketing_design_requests
  FOR SELECT USING (
    fn_is_design_supervisor()
    OR (fn_is_design_producer() AND (
      assigned_to = auth.uid()
      OR status IN ('submitted', 'accepted', 'in_progress', 'delivered', 'revision_requested')
    ))
    OR requested_by = auth.uid()
  );

-- Fix INSERT policy (non-VDCO marketing roles)
DROP POLICY IF EXISTS design_requests_insert ON marketing_design_requests;
CREATE POLICY design_requests_insert ON marketing_design_requests
  FOR INSERT WITH CHECK (
    fn_is_design_requester() AND requested_by = auth.uid()
    AND NOT fn_is_design_producer()
  );

-- Fix UPDATE policy
DROP POLICY IF EXISTS design_requests_update ON marketing_design_requests;
CREATE POLICY design_requests_update ON marketing_design_requests
  FOR UPDATE USING (
    fn_is_design_supervisor()
    OR fn_is_design_producer()
    OR (requested_by = auth.uid() AND status IN ('draft', 'delivered'))
  );

-- Fix DELETE policy (own drafts or supervisor)
DROP POLICY IF EXISTS design_requests_delete ON marketing_design_requests;
CREATE POLICY design_requests_delete ON marketing_design_requests
  FOR DELETE USING (
    (requested_by = auth.uid() AND status = 'draft')
    OR fn_is_design_supervisor()
  );

-- =====================================================
-- Fix design_versions policies
-- SELECT: same as requests
-- INSERT: VDCO + supervisor only
-- UPDATE (review): non-VDCO reviewers only
-- =====================================================
DROP POLICY IF EXISTS design_versions_select ON marketing_design_versions;
CREATE POLICY design_versions_select ON marketing_design_versions
  FOR SELECT USING (
    fn_is_design_supervisor()
    OR fn_is_design_producer()
    OR EXISTS (
      SELECT 1 FROM marketing_design_requests r
      WHERE r.id = marketing_design_versions.request_id
      AND r.requested_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS design_versions_insert ON marketing_design_versions;
CREATE POLICY design_versions_insert ON marketing_design_versions
  FOR INSERT WITH CHECK (
    fn_is_design_producer() OR fn_is_design_supervisor()
  );

DROP POLICY IF EXISTS design_versions_update ON marketing_design_versions;
CREATE POLICY design_versions_update ON marketing_design_versions
  FOR UPDATE USING (
    fn_can_review_design()
    OR fn_is_design_supervisor()
  );

-- =====================================================
-- Fix design_comments policies (everyone involved can see+add)
-- =====================================================
DROP POLICY IF EXISTS design_comments_select ON marketing_design_comments;
CREATE POLICY design_comments_select ON marketing_design_comments
  FOR SELECT USING (
    fn_is_design_supervisor()
    OR fn_is_design_producer()
    OR EXISTS (
      SELECT 1 FROM marketing_design_requests r
      WHERE r.id = marketing_design_comments.request_id
      AND r.requested_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS design_comments_insert ON marketing_design_comments;
CREATE POLICY design_comments_insert ON marketing_design_comments
  FOR INSERT WITH CHECK (
    (fn_is_marketing_user() OR fn_is_design_producer()) AND user_id = auth.uid()
  );
