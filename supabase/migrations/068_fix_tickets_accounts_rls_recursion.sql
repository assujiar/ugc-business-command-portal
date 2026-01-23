-- ============================================
-- Migration: 068_fix_tickets_accounts_rls_recursion.sql
-- Fix infinite RLS recursion between tickets and accounts tables
--
-- Problem:
-- 1. tickets_select_policy checks accounts table (for account owner access)
-- 2. accounts_select checks tickets table (for ticketing ops access)
-- 3. This creates circular dependency causing "infinite recursion detected in policy"
--
-- Solution:
-- Create SECURITY DEFINER helper functions that bypass RLS for internal checks,
-- breaking the circular dependency chain.
-- ============================================

-- ============================================
-- 1. Create helper function to get user's owned account IDs
-- This bypasses RLS on accounts table to avoid recursion
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_owned_account_ids(p_user_id UUID)
RETURNS SETOF UUID AS $$
BEGIN
    RETURN QUERY
    SELECT account_id
    FROM public.accounts
    WHERE owner_user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.get_user_owned_account_ids(UUID) IS 'Returns account IDs owned by the user. Uses SECURITY DEFINER to bypass RLS and avoid recursion.';

-- ============================================
-- 2. Create helper function to check if user can see a specific account via ticketing
-- This bypasses RLS on tickets table to avoid recursion
-- ============================================

CREATE OR REPLACE FUNCTION public.can_see_account_via_ticketing(p_user_id UUID, p_account_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is ticketing ops and has ticket access for this account
    IF public.is_ticketing_ops(p_user_id) THEN
        RETURN EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.account_id = p_account_id
            AND (
                t.created_by = p_user_id
                OR t.assigned_to = p_user_id
                OR public.is_ticketing_admin(p_user_id)
                OR public.get_user_ticketing_department(p_user_id) = t.department
            )
        );
    END IF;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.can_see_account_via_ticketing(UUID, UUID) IS 'Checks if user can see an account via ticketing access. Uses SECURITY DEFINER to bypass RLS and avoid recursion.';

-- ============================================
-- 3. Update tickets_select_policy to use the helper function
-- ============================================

DROP POLICY IF EXISTS "tickets_select_policy" ON public.tickets;
CREATE POLICY "tickets_select_policy" ON public.tickets
    FOR SELECT
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (
            -- Admin sees all
            public.is_ticketing_admin(auth.uid())
            -- Ops sees their department
            OR public.is_ticketing_ops(auth.uid())
            -- Creator sees own tickets
            OR created_by = auth.uid()
            -- Assignee sees assigned tickets
            OR assigned_to = auth.uid()
            -- Account owner can see tickets for their accounts (for CRM integration)
            -- Using helper function to avoid RLS recursion
            OR account_id IN (SELECT public.get_user_owned_account_ids(auth.uid()))
        )
    );

-- ============================================
-- 4. Update accounts_select policy to use the helper function
-- ============================================

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
    -- Using helper function to avoid RLS recursion with tickets table
    OR public.can_see_account_via_ticketing(auth.uid(), accounts.account_id)
    -- Ticketing ops can see all accounts (simplified to avoid nested ticket check)
    OR public.is_ticketing_ops(auth.uid())
  );

-- ============================================
-- 5. Grant execute permissions
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_user_owned_account_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_account_via_ticketing(UUID, UUID) TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON POLICY "tickets_select_policy" ON public.tickets IS 'SELECT policy for tickets. Uses helper function for account owner check to avoid RLS recursion with accounts table.';
COMMENT ON POLICY "accounts_select" ON public.accounts IS 'SELECT policy for accounts. Uses helper function for ticketing access check to avoid RLS recursion with tickets table.';
