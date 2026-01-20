-- Migration 042: Fix accounts RLS for ticketing
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
