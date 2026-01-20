-- ============================================
-- Ticketing Module - RLS Policies
-- Part of UGC Business Command Portal Integration
--
-- RBAC Matrix (using CRM roles):
-- - Director, super admin: Full access
-- - Marketing roles: Create/view tickets, comment
-- - Sales roles: Create/view tickets, comment
-- - Ops roles (EXIM, domestics, Import DTD, traffic): Full ticketing access (assign/transition/close)
-- - finance: No access
-- ============================================

-- ============================================
-- HELPER FUNCTIONS FOR TICKETING RLS
-- Uses CRM profiles table
-- ============================================

-- Check if user can access ticketing module
CREATE OR REPLACE FUNCTION public.can_access_ticketing(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE profiles.user_id = can_access_ticketing.user_id AND is_active = TRUE;

    -- Finance role has no access
    IF user_role = 'finance' THEN
        RETURN FALSE;
    END IF;

    RETURN user_role IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is ticketing admin (can manage all tickets)
CREATE OR REPLACE FUNCTION public.is_ticketing_admin(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE profiles.user_id = is_ticketing_admin.user_id AND is_active = TRUE;

    RETURN user_role IN ('Director', 'super admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is ops manager (can assign tickets)
CREATE OR REPLACE FUNCTION public.is_ticketing_ops(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE profiles.user_id = is_ticketing_ops.user_id AND is_active = TRUE;

    RETURN user_role IN (
        'Director', 'super admin',
        'EXIM Ops', 'domestics Ops', 'Import DTD Ops', 'traffic & warehous'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Map user role to ticketing department
CREATE OR REPLACE FUNCTION public.get_user_ticketing_department(user_id UUID)
RETURNS ticketing_department AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE profiles.user_id = get_user_ticketing_department.user_id AND is_active = TRUE;

    -- Map CRM roles to ticketing departments
    CASE user_role
        WHEN 'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO' THEN RETURN 'MKT';
        WHEN 'sales manager', 'salesperson', 'sales support' THEN RETURN 'SAL';
        WHEN 'domestics Ops' THEN RETURN 'DOM';
        WHEN 'EXIM Ops' THEN RETURN 'EXI';
        WHEN 'Import DTD Ops' THEN RETURN 'DTD';
        WHEN 'traffic & warehous' THEN RETURN 'TRF';
        ELSE RETURN NULL;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- ENABLE RLS ON TICKETING TABLES
-- ============================================
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_rate_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticketing_sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_sla_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_sequences ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SLA CONFIG POLICIES
-- Read for all (except finance), write for admin only
-- ============================================
DROP POLICY IF EXISTS "ticketing_sla_config_select" ON public.ticketing_sla_config;
CREATE POLICY "ticketing_sla_config_select" ON public.ticketing_sla_config
    FOR SELECT
    TO authenticated
    USING (public.can_access_ticketing(auth.uid()));

DROP POLICY IF EXISTS "ticketing_sla_config_insert" ON public.ticketing_sla_config;
CREATE POLICY "ticketing_sla_config_insert" ON public.ticketing_sla_config
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_ticketing_admin(auth.uid()));

DROP POLICY IF EXISTS "ticketing_sla_config_update" ON public.ticketing_sla_config;
CREATE POLICY "ticketing_sla_config_update" ON public.ticketing_sla_config
    FOR UPDATE
    TO authenticated
    USING (public.is_ticketing_admin(auth.uid()))
    WITH CHECK (public.is_ticketing_admin(auth.uid()));

-- ============================================
-- TICKETS POLICIES
-- All non-finance users can view/create tickets
-- Ops users can update tickets in their department
-- ============================================

-- SELECT: All non-finance authenticated users can view tickets
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
        )
    );

-- INSERT: All non-finance users can create tickets
DROP POLICY IF EXISTS "tickets_insert_policy" ON public.tickets;
CREATE POLICY "tickets_insert_policy" ON public.tickets
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND created_by = auth.uid()
    );

-- UPDATE: Admin, Ops, creator, or assignee can update
DROP POLICY IF EXISTS "tickets_update_policy" ON public.tickets;
CREATE POLICY "tickets_update_policy" ON public.tickets
    FOR UPDATE
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (
            public.is_ticketing_admin(auth.uid())
            OR public.is_ticketing_ops(auth.uid())
            OR created_by = auth.uid()
            OR assigned_to = auth.uid()
        )
    )
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND (
            public.is_ticketing_admin(auth.uid())
            OR public.is_ticketing_ops(auth.uid())
            OR created_by = auth.uid()
            OR assigned_to = auth.uid()
        )
    );

-- DELETE: Admin only (soft delete preferred)
DROP POLICY IF EXISTS "tickets_delete_policy" ON public.tickets;
CREATE POLICY "tickets_delete_policy" ON public.tickets
    FOR DELETE
    TO authenticated
    USING (public.is_ticketing_admin(auth.uid()));

-- ============================================
-- TICKET EVENTS POLICIES
-- Append-only audit log
-- ============================================

-- SELECT: Based on ticket access
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
            )
        )
    );

-- INSERT: System/authenticated users can add events
DROP POLICY IF EXISTS "ticket_events_insert_policy" ON public.ticket_events;
CREATE POLICY "ticket_events_insert_policy" ON public.ticket_events
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND actor_user_id = auth.uid()
    );

-- No UPDATE or DELETE - audit logs are append-only

-- ============================================
-- TICKET ASSIGNMENTS POLICIES
-- Only Ops and Admin can assign
-- ============================================

-- SELECT: Based on ticket access
DROP POLICY IF EXISTS "ticket_assignments_select_policy" ON public.ticket_assignments;
CREATE POLICY "ticket_assignments_select_policy" ON public.ticket_assignments
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
            )
        )
    );

-- INSERT: Only Ops and Admin can assign
DROP POLICY IF EXISTS "ticket_assignments_insert_policy" ON public.ticket_assignments;
CREATE POLICY "ticket_assignments_insert_policy" ON public.ticket_assignments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND (public.is_ticketing_admin(auth.uid()) OR public.is_ticketing_ops(auth.uid()))
        AND assigned_by = auth.uid()
    );

-- ============================================
-- TICKET COMMENTS POLICIES
-- ============================================

-- SELECT: Based on ticket access, hide internal from non-ops
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
            )
        )
        -- Hide internal comments from non-ops users
        AND (
            is_internal = FALSE
            OR public.is_ticketing_ops(auth.uid())
            OR public.is_ticketing_admin(auth.uid())
        )
    );

-- INSERT: Users can comment on tickets they can access
DROP POLICY IF EXISTS "ticket_comments_insert_policy" ON public.ticket_comments;
CREATE POLICY "ticket_comments_insert_policy" ON public.ticket_comments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR public.is_ticketing_ops(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
            )
        )
        -- Only ops/admin can create internal comments
        AND (
            is_internal = FALSE
            OR public.is_ticketing_ops(auth.uid())
            OR public.is_ticketing_admin(auth.uid())
        )
    );

-- UPDATE: Users can update their own comments
DROP POLICY IF EXISTS "ticket_comments_update_policy" ON public.ticket_comments;
CREATE POLICY "ticket_comments_update_policy" ON public.ticket_comments
    FOR UPDATE
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (user_id = auth.uid() OR public.is_ticketing_admin(auth.uid()))
    )
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND (user_id = auth.uid() OR public.is_ticketing_admin(auth.uid()))
    );

-- DELETE: Users can delete own comments, admin can delete all
DROP POLICY IF EXISTS "ticket_comments_delete_policy" ON public.ticket_comments;
CREATE POLICY "ticket_comments_delete_policy" ON public.ticket_comments
    FOR DELETE
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (user_id = auth.uid() OR public.is_ticketing_admin(auth.uid()))
    );

-- ============================================
-- TICKET ATTACHMENTS POLICIES
-- ============================================

-- SELECT: Based on ticket access
DROP POLICY IF EXISTS "ticket_attachments_select_policy" ON public.ticket_attachments;
CREATE POLICY "ticket_attachments_select_policy" ON public.ticket_attachments
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
            )
        )
    );

-- INSERT: Users can upload to tickets they can access
DROP POLICY IF EXISTS "ticket_attachments_insert_policy" ON public.ticket_attachments;
CREATE POLICY "ticket_attachments_insert_policy" ON public.ticket_attachments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND uploaded_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR public.is_ticketing_ops(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
            )
        )
    );

-- DELETE: Uploader or admin can delete
DROP POLICY IF EXISTS "ticket_attachments_delete_policy" ON public.ticket_attachments;
CREATE POLICY "ticket_attachments_delete_policy" ON public.ticket_attachments
    FOR DELETE
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (uploaded_by = auth.uid() OR public.is_ticketing_admin(auth.uid()))
    );

-- ============================================
-- TICKET RATE QUOTES POLICIES
-- Only Ops and Admin can create quotes
-- ============================================

-- SELECT: Based on ticket access
DROP POLICY IF EXISTS "ticket_rate_quotes_select_policy" ON public.ticket_rate_quotes;
CREATE POLICY "ticket_rate_quotes_select_policy" ON public.ticket_rate_quotes
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
            )
        )
    );

-- INSERT: Only Ops and Admin can create quotes
DROP POLICY IF EXISTS "ticket_rate_quotes_insert_policy" ON public.ticket_rate_quotes;
CREATE POLICY "ticket_rate_quotes_insert_policy" ON public.ticket_rate_quotes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND (public.is_ticketing_admin(auth.uid()) OR public.is_ticketing_ops(auth.uid()))
        AND created_by = auth.uid()
    );

-- UPDATE: Creator or admin can update
DROP POLICY IF EXISTS "ticket_rate_quotes_update_policy" ON public.ticket_rate_quotes;
CREATE POLICY "ticket_rate_quotes_update_policy" ON public.ticket_rate_quotes
    FOR UPDATE
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (created_by = auth.uid() OR public.is_ticketing_admin(auth.uid()))
    )
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND (created_by = auth.uid() OR public.is_ticketing_admin(auth.uid()))
    );

-- DELETE: Creator or admin can delete
DROP POLICY IF EXISTS "ticket_rate_quotes_delete_policy" ON public.ticket_rate_quotes;
CREATE POLICY "ticket_rate_quotes_delete_policy" ON public.ticket_rate_quotes
    FOR DELETE
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (created_by = auth.uid() OR public.is_ticketing_admin(auth.uid()))
    );

-- ============================================
-- SLA TRACKING POLICIES
-- ============================================

-- SELECT: Based on ticket access
DROP POLICY IF EXISTS "ticket_sla_tracking_select_policy" ON public.ticket_sla_tracking;
CREATE POLICY "ticket_sla_tracking_select_policy" ON public.ticket_sla_tracking
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
            )
        )
    );

-- INSERT/UPDATE: Ops and Admin
DROP POLICY IF EXISTS "ticket_sla_tracking_insert_policy" ON public.ticket_sla_tracking;
CREATE POLICY "ticket_sla_tracking_insert_policy" ON public.ticket_sla_tracking
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND (public.is_ticketing_admin(auth.uid()) OR public.is_ticketing_ops(auth.uid()))
    );

DROP POLICY IF EXISTS "ticket_sla_tracking_update_policy" ON public.ticket_sla_tracking;
CREATE POLICY "ticket_sla_tracking_update_policy" ON public.ticket_sla_tracking
    FOR UPDATE
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (public.is_ticketing_admin(auth.uid()) OR public.is_ticketing_ops(auth.uid()))
    )
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND (public.is_ticketing_admin(auth.uid()) OR public.is_ticketing_ops(auth.uid()))
    );

-- ============================================
-- TICKET SEQUENCES POLICIES
-- System use for ticket code generation
-- ============================================

DROP POLICY IF EXISTS "ticket_sequences_select_policy" ON public.ticket_sequences;
CREATE POLICY "ticket_sequences_select_policy" ON public.ticket_sequences
    FOR SELECT
    TO authenticated
    USING (public.can_access_ticketing(auth.uid()));

DROP POLICY IF EXISTS "ticket_sequences_insert_policy" ON public.ticket_sequences;
CREATE POLICY "ticket_sequences_insert_policy" ON public.ticket_sequences
    FOR INSERT
    TO authenticated
    WITH CHECK (public.can_access_ticketing(auth.uid()));

DROP POLICY IF EXISTS "ticket_sequences_update_policy" ON public.ticket_sequences;
CREATE POLICY "ticket_sequences_update_policy" ON public.ticket_sequences
    FOR UPDATE
    TO authenticated
    USING (public.can_access_ticketing(auth.uid()))
    WITH CHECK (public.can_access_ticketing(auth.uid()));

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.can_access_ticketing(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ticketing_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ticketing_ops(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_ticketing_department(UUID) TO authenticated;
