-- Migration: 043_fix_duplicate_is_ticketing_ops.sql
-- Drop the zero-arg version if it exists
DROP FUNCTION IF EXISTS public.is_ticketing_ops();

-- Recreate the UUID version
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

GRANT EXECUTE ON FUNCTION public.is_ticketing_ops(UUID) TO authenticated;

-- Recreate accounts_select policy with correct function name
DROP POLICY IF EXISTS accounts_select ON accounts;

CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (
    is_admin()
    OR is_sales()
    OR (is_marketing_manager_or_macx() AND (
      is_original_creator_marketing(original_creator_id)
      OR is_original_creator_marketing((SELECT created_by FROM leads WHERE lead_id = accounts.lead_id))
    ))
    OR (is_marketing_staff() AND (
      original_creator_id = auth.uid()
      OR (original_creator_id IS NULL AND EXISTS (
        SELECT 1 FROM leads WHERE lead_id = accounts.lead_id AND created_by = auth.uid()
      ))
    ))
    OR (is_marketing() AND EXISTS (
      SELECT 1 FROM leads WHERE lead_id = accounts.lead_id AND marketing_owner_user_id = auth.uid()
    ))
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
    OR public.is_ticketing_ops(auth.uid())
  );
