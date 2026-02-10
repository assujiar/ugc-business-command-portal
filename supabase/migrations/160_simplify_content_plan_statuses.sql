-- =====================================================
-- Migration 160: Simplify Content Plan Statuses
-- Statuses: draft, planned, published
-- "overdue" is computed at query time (not stored)
-- Removes: in_review, approved, rejected, archived
-- =====================================================

-- 1. Convert existing statuses to simplified ones
UPDATE marketing_content_plans SET status = 'planned' WHERE status IN ('in_review', 'approved');
UPDATE marketing_content_plans SET status = 'draft' WHERE status = 'rejected';
UPDATE marketing_content_plans SET status = 'published' WHERE status = 'archived';

-- 2. Update RLS policy for content_plans_update
-- Old policy allowed editing only draft/rejected; new allows draft/planned
DROP POLICY IF EXISTS content_plans_update ON marketing_content_plans;
CREATE POLICY content_plans_update ON marketing_content_plans
  FOR UPDATE USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR (created_by = auth.uid() AND status IN ('draft', 'planned'))
    OR fn_is_content_approver()
  );

-- 3. Add check constraint to enforce valid statuses
-- (use DO block so it doesn't fail if constraint already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_content_plan_status'
  ) THEN
    ALTER TABLE marketing_content_plans
      ADD CONSTRAINT chk_content_plan_status
      CHECK (status IN ('draft', 'planned', 'published'));
  END IF;
END $$;
