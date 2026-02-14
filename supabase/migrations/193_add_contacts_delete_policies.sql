-- =====================================================
-- Migration 193: Add DELETE Policies for Contacts Table
-- =====================================================
-- PROBLEM: Contacts table has INSERT, SELECT, UPDATE policies but
-- NO DELETE policy (user or service). This means:
-- 1. Users cannot delete contacts from the UI
-- 2. Service-role triggers/RPCs cannot delete contacts
--
-- FIX: Add user DELETE policy (admin + sales) and service DELETE policy.
-- =====================================================

-- User DELETE policy: Admin and sales can delete contacts
DROP POLICY IF EXISTS contacts_delete ON public.contacts;
CREATE POLICY contacts_delete ON public.contacts
    FOR DELETE USING (
        auth.uid() IS NOT NULL
        AND (is_admin() OR is_sales())
    );

-- Service DELETE policy: service_role (adminClient) can delete contacts
DROP POLICY IF EXISTS contacts_delete_service ON public.contacts;
CREATE POLICY contacts_delete_service ON public.contacts
    FOR DELETE USING (auth.uid() IS NULL);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
