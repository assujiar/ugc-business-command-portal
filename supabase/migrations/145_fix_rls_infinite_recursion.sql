-- =====================================================
-- Migration 145: HOTFIX - Fix infinite recursion in RLS policies
-- =====================================================
-- CRITICAL BUG: Migration 144's tickets_select_policy added an EXISTS subquery
-- on customer_quotations. But customer_quotations' own RLS policy
-- (customer_quotations_select from migration 067) queries tickets:
--
--   tickets_select_policy → EXISTS (customer_quotations) → customer_quotations_select
--   → EXISTS (tickets) → tickets_select_policy → INFINITE RECURSION
--
-- Same issue affects ticket_events_select_policy and ticket_comments_select_policy
-- from migration 143 (they query customer_quotations inside a tickets subquery).
--
-- FIX: Create a SECURITY DEFINER helper function that checks customer_quotations
-- WITHOUT going through RLS, breaking the recursion chain. Then use this function
-- in all three RLS policies.
-- =====================================================


-- ============================================
-- PART 1: Create SECURITY DEFINER helper function
-- This bypasses RLS on customer_quotations, preventing circular evaluation
-- ============================================

CREATE OR REPLACE FUNCTION public.is_quotation_creator_for_ticket(
    p_ticket_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.customer_quotations cq
        WHERE cq.ticket_id = p_ticket_id
        AND cq.created_by = p_user_id
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.is_quotation_creator_for_ticket IS
'SECURITY DEFINER helper for RLS policies. Checks if a user created any quotation
linked to a given ticket. Bypasses customer_quotations RLS to prevent infinite
recursion when used in tickets/ticket_events/ticket_comments policies.';

GRANT EXECUTE ON FUNCTION public.is_quotation_creator_for_ticket(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_quotation_creator_for_ticket(UUID, UUID) TO service_role;


-- ============================================
-- PART 2: Fix tickets_select_policy (from migration 144)
-- Replace EXISTS subquery with SECURITY DEFINER function call
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
            -- Ops sees their department's tickets (origin or target)
            OR (
                public.is_ticketing_ops(auth.uid())
                AND (
                    origin_dept = public.get_user_ticketing_department(auth.uid())
                    OR target_dept = public.get_user_ticketing_department(auth.uid())
                    OR department = public.get_user_ticketing_department(auth.uid())
                )
            )
            -- Creator sees own tickets
            OR created_by = auth.uid()
            -- Assignee sees assigned tickets
            OR assigned_to = auth.uid()
            -- FIX (migration 145): Use SECURITY DEFINER function to avoid recursion
            -- Quotation creators can see tickets linked to their quotations
            OR public.is_quotation_creator_for_ticket(id, auth.uid())
        )
    );


-- ============================================
-- PART 3: Fix ticket_events_select_policy (from migration 143)
-- Replace nested EXISTS with SECURITY DEFINER function call
-- ============================================

DROP POLICY IF EXISTS "ticket_events_select_policy" ON public.ticket_events;
CREATE POLICY "ticket_events_select_policy" ON public.ticket_events
    FOR SELECT
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR public.is_ticketing_ops(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
                -- FIX (migration 145): Use SECURITY DEFINER function to avoid recursion
                OR public.is_quotation_creator_for_ticket(t.id, auth.uid())
            )
        )
    );


-- ============================================
-- PART 4: Fix ticket_comments_select_policy (from migration 143)
-- Replace nested EXISTS with SECURITY DEFINER function call
-- ============================================

DROP POLICY IF EXISTS "ticket_comments_select_policy" ON public.ticket_comments;
CREATE POLICY "ticket_comments_select_policy" ON public.ticket_comments
    FOR SELECT
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR public.is_ticketing_ops(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
                -- FIX (migration 145): Use SECURITY DEFINER function to avoid recursion
                OR public.is_quotation_creator_for_ticket(t.id, auth.uid())
            )
        )
        -- Hide internal comments from non-ops/non-admin users
        AND (
            is_internal = FALSE
            OR public.is_ticketing_ops(auth.uid())
            OR public.is_ticketing_admin(auth.uid())
        )
    );


-- ============================================
-- SUMMARY
-- ============================================
-- 1. Created is_quotation_creator_for_ticket(UUID, UUID) SECURITY DEFINER function
--    - Checks customer_quotations directly, bypassing RLS
--    - Breaks the circular dependency: tickets → customer_quotations → tickets
-- 2. Fixed tickets_select_policy: replaced EXISTS subquery with function call
-- 3. Fixed ticket_events_select_policy: replaced nested EXISTS with function call
-- 4. Fixed ticket_comments_select_policy: replaced nested EXISTS with function call
-- ============================================
