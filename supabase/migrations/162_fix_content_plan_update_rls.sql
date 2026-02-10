-- =====================================================
-- Migration 162: Fix Content Plan UPDATE RLS Policy
-- Problem: Without explicit WITH CHECK, PostgreSQL uses USING
-- as WITH CHECK. The USING clause only allows status IN ('draft','planned'),
-- which blocks any update that changes status to 'published'
-- (e.g., realize route, status change route).
-- Fix: Add explicit WITH CHECK that allows all valid statuses.
-- =====================================================

-- Drop and recreate with explicit WITH CHECK
DROP POLICY IF EXISTS content_plans_update ON marketing_content_plans;
CREATE POLICY content_plans_update ON marketing_content_plans
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR (created_by = auth.uid() AND status IN ('draft', 'planned', 'published'))
    OR fn_is_content_approver()
  )
  WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
    OR created_by = auth.uid()
    OR fn_is_content_approver()
  );
