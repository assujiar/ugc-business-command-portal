-- =====================================================
-- Migration 123: Fix search_path for all quotation RPC functions
-- =====================================================
-- ISSUE: rpc_customer_quotation_mark_sent (migration 117) and
--        rpc_customer_quotation_mark_rejected (migration 112) are missing
--        SET search_path, causing issues with helper function lookups
--        in SECURITY DEFINER context.
--
-- This migration adds search_path to all affected functions.
-- =====================================================

-- ============================================
-- FIX 1: Add search_path to rpc_customer_quotation_mark_sent
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'rpc_customer_quotation_mark_sent'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.rpc_customer_quotation_mark_sent SET search_path = public, pg_temp';
        RAISE NOTICE '[123] search_path added to rpc_customer_quotation_mark_sent';
    ELSE
        RAISE WARNING '[123] rpc_customer_quotation_mark_sent not found!';
    END IF;
END $$;

-- ============================================
-- FIX 2: Add search_path to rpc_customer_quotation_mark_rejected
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'rpc_customer_quotation_mark_rejected'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.rpc_customer_quotation_mark_rejected SET search_path = public, pg_temp';
        RAISE NOTICE '[123] search_path added to rpc_customer_quotation_mark_rejected';
    ELSE
        RAISE WARNING '[123] rpc_customer_quotation_mark_rejected not found!';
    END IF;
END $$;

-- ============================================
-- FIX 3: Verify rpc_customer_quotation_mark_accepted has search_path
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'rpc_customer_quotation_mark_accepted'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.rpc_customer_quotation_mark_accepted SET search_path = public, pg_temp';
        RAISE NOTICE '[123] search_path verified for rpc_customer_quotation_mark_accepted';
    END IF;
END $$;

-- ============================================
-- FIX 4: Verify rpc_opportunity_change_stage has search_path
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'rpc_opportunity_change_stage'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.rpc_opportunity_change_stage SET search_path = public, pg_temp';
        RAISE NOTICE '[123] search_path verified for rpc_opportunity_change_stage';
    END IF;
END $$;

-- ============================================
-- FIX 5: Verify fn_resolve_or_create_opportunity has search_path
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_resolve_or_create_opportunity'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.fn_resolve_or_create_opportunity SET search_path = public, pg_temp';
        RAISE NOTICE '[123] search_path added to fn_resolve_or_create_opportunity';
    END IF;
END $$;

-- ============================================
-- FIX 6: Verify fn_check_quotation_authorization has search_path
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_check_quotation_authorization'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.fn_check_quotation_authorization SET search_path = public, pg_temp';
        RAISE NOTICE '[123] search_path added to fn_check_quotation_authorization';
    END IF;
END $$;

-- ============================================
-- FIX 7: Verify fn_validate_quotation_transition has search_path
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_validate_quotation_transition'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.fn_validate_quotation_transition SET search_path = public, pg_temp';
        RAISE NOTICE '[123] search_path added to fn_validate_quotation_transition';
    END IF;
END $$;

-- ============================================
-- FIX 8: Verify sync_opportunity_tickets_closed has search_path
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sync_opportunity_tickets_closed'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.sync_opportunity_tickets_closed SET search_path = public, pg_temp';
        RAISE NOTICE '[123] search_path added to sync_opportunity_tickets_closed';
    END IF;
END $$;

-- ============================================
-- FIX 9: Verify sync_opportunity_to_quotation has search_path
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sync_opportunity_to_quotation'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.sync_opportunity_to_quotation SET search_path = public, pg_temp';
        RAISE NOTICE '[123] search_path added to sync_opportunity_to_quotation';
    END IF;
END $$;

-- ============================================
-- FIX 10: Verify sync_opportunity_to_account has search_path
-- ============================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'sync_opportunity_to_account'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.sync_opportunity_to_account SET search_path = public, pg_temp';
        RAISE NOTICE '[123] search_path added to sync_opportunity_to_account';
    END IF;
END $$;

-- ============================================
-- VERIFICATION: List all quotation-related functions and their config
-- ============================================
DO $$
DECLARE
    v_func RECORD;
BEGIN
    RAISE NOTICE '[123] === FUNCTION VERIFICATION ===';
    FOR v_func IN
        SELECT p.proname, p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.proname IN (
            'rpc_customer_quotation_mark_sent',
            'rpc_customer_quotation_mark_rejected',
            'rpc_customer_quotation_mark_accepted',
            'rpc_opportunity_change_stage',
            'fn_resolve_or_create_opportunity',
            'fn_check_quotation_authorization',
            'fn_validate_quotation_transition',
            'sync_opportunity_tickets_closed',
            'sync_opportunity_to_quotation',
            'sync_opportunity_to_account'
        )
        ORDER BY p.proname
    LOOP
        RAISE NOTICE '[123] Function: % | Config: %', v_func.proname, v_func.proconfig;
    END LOOP;
END $$;

-- ============================================
-- SUMMARY
-- ============================================
-- Migration 123: Comprehensive search_path fix for all RPC functions
--
-- Functions fixed:
-- 1. rpc_customer_quotation_mark_sent
-- 2. rpc_customer_quotation_mark_rejected
-- 3. rpc_customer_quotation_mark_accepted (verified)
-- 4. rpc_opportunity_change_stage (verified)
-- 5. fn_resolve_or_create_opportunity
-- 6. fn_check_quotation_authorization
-- 7. fn_validate_quotation_transition
-- 8. sync_opportunity_tickets_closed
-- 9. sync_opportunity_to_quotation
-- 10. sync_opportunity_to_account
--
-- Why search_path matters:
-- - SECURITY DEFINER functions run with creator's privileges
-- - Without explicit search_path, function might not find helper functions
-- - This can cause "function does not exist" errors at runtime
-- ============================================
