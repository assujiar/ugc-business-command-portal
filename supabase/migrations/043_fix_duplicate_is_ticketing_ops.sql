-- =====================================================
-- Migration: 043_fix_duplicate_is_ticketing_ops.sql
-- Fix duplicate is_ticketing_ops function ambiguity
-- =====================================================
-- Problem: There were two is_ticketing_ops functions:
--   1. is_ticketing_ops(UUID) from migration 036 (correct one)
--   2. is_ticketing_ops() zero-arg from migration 042 (duplicate)
-- This caused "function name is not unique" errors
-- Solution: Drop the zero-arg version, keep only the UUID version
-- =====================================================

-- Drop the zero-arg version if it exists (this was created by mistake in old 042)
DROP FUNCTION IF EXISTS public.is_ticketing_ops();

-- Verify the UUID version still exists (from migration 036)
-- If somehow missing, recreate it
CREATE OR REPLACE FUNCTION public.is_ticketing_ops(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT role INTO v_role FROM profiles
    WHERE profiles.user_id = is_ticketing_ops.user_id AND is_active = TRUE;

    RETURN v_role IN ('EXIM Ops', 'domestics Ops', 'Import DTD Ops', 'traffic & warehous');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.is_ticketing_ops(UUID) IS 'Check if specified user is a ticketing ops role';

-- Ensure grants are correct
GRANT EXECUTE ON FUNCTION public.is_ticketing_ops(UUID) TO authenticated;

-- Also ensure the accounts_select policy uses the correct function signature
DROP POLICY IF EXISTS accounts_select ON accounts;

CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (
    -- Admin can see all
    is_admin()
    -- Sales can see all accounts (for prospecting)
    OR is_sales()
    -- Marketing Manager/MACX: See accounts from marketing department leads
    OR (is_marketing_manager_or_macx() AND (
      is_original_creator_marketing(original_creator_id)
      OR is_original_creator_marketing((SELECT created_by FROM leads WHERE lead_id = accounts.lead_id))
    ))
    -- Marketing staff: See accounts from leads THEY created
    OR (is_marketing_staff() AND (
      original_creator_id = auth.uid()
      OR (original_creator_id IS NULL AND EXISTS (
        SELECT 1 FROM leads WHERE lead_id = accounts.lead_id AND created_by = auth.uid()
      ))
    ))
    -- Fallback: Allow if original_creator_id is null (legacy data) and user is marketing owner
    OR (is_marketing() AND EXISTS (
      SELECT 1 FROM leads WHERE lead_id = accounts.lead_id AND marketing_owner_user_id = auth.uid()
    ))
    -- Ticketing Ops users can view accounts linked to tickets they have access to
    OR (public.is_ticketing_ops(auth.uid()) AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.account_id = accounts.account_id
      AND (
        t.created_by = auth.uid()
        OR t.assigned_to = auth.uid()
        OR public.is_ticketing_admin(auth.uid())
        OR public.get_user_ticketing_department(auth.uid()) = t.department
      )
    ))
    -- Ticketing Ops can also see all accounts (for linking to tickets)
    OR public.is_ticketing_ops(auth.uid())
  );
