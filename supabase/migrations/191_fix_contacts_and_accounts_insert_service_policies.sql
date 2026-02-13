-- =====================================================
-- Migration 191: Fix Missing INSERT Service Policies for Contacts & Accounts
-- =====================================================
-- ROOT CAUSE: Migration 178 added SELECT + UPDATE service policies for
-- contacts and accounts, but MISSED the INSERT service policy.
--
-- IMPACT: When adminClient (service_role, auth.uid()=NULL) inserts into accounts,
-- the AFTER INSERT trigger `trg_sync_account_pic_to_contact` fires and tries to
-- INSERT into contacts. Without `contacts_insert_service`, the RLS policy
-- `contacts_insert` (which requires is_admin() OR is_sales()) blocks the INSERT
-- because auth.uid() is NULL in service_role context.
--
-- This causes contacts to NOT be auto-created when:
-- 1. Sales claims a marketing lead (via /api/crm/leads/claim)
-- 2. Sales creates a new lead (via /api/crm/leads POST)
-- 3. Lead conversion via rpc_lead_convert()
--
-- FIX: Add INSERT service policies for contacts and accounts.
-- =====================================================

-- =====================================================
-- CONTACTS: INSERT service policy (was missing!)
-- =====================================================
DROP POLICY IF EXISTS contacts_insert_service ON public.contacts;
CREATE POLICY contacts_insert_service ON public.contacts
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- ACCOUNTS: INSERT service policy (was also missing!)
-- =====================================================
DROP POLICY IF EXISTS accounts_insert_service ON public.accounts;
CREATE POLICY accounts_insert_service ON public.accounts
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- VERIFICATION: Check that all 3 policy types exist for contacts & accounts
-- =====================================================
DO $$
DECLARE
    v_contacts_policies TEXT;
    v_accounts_policies TEXT;
BEGIN
    SELECT string_agg(policyname, ', ' ORDER BY policyname) INTO v_contacts_policies
    FROM pg_policies
    WHERE tablename = 'contacts' AND schemaname = 'public' AND policyname LIKE '%_service%';

    SELECT string_agg(policyname, ', ' ORDER BY policyname) INTO v_accounts_policies
    FROM pg_policies
    WHERE tablename = 'accounts' AND schemaname = 'public' AND policyname LIKE '%_service%';

    RAISE WARNING '[191] contacts service policies: %', v_contacts_policies;
    RAISE WARNING '[191] accounts service policies: %', v_accounts_policies;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
