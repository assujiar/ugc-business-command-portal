-- =====================================================
-- Migration: 042_fix_accounts_rls_for_ticketing.sql
-- Fix accounts RLS to allow ticketing users (Ops roles) to view accounts
-- =====================================================
-- Problem: Ops roles (EXIM Ops, domestics Ops, etc.) can access tickets
-- but cannot view linked accounts because accounts RLS only allows
-- is_admin(), is_sales(), and is_marketing()
-- Solution: Add is_ticketing_ops(auth.uid()) check to accounts_select policy
-- Note: We use the existing is_ticketing_ops(UUID) function from migration 036
-- =====================================================

-- Update accounts_select policy to include ticketing ops users
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
    -- NEW: Ticketing Ops users can view accounts linked to tickets they have access to
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
