-- ============================================
-- Migration: 107_harden_rpc_exec_permissions.sql
--
-- PURPOSE: Harden SECURITY DEFINER RPC exposure
-- - REVOKE EXECUTE from PUBLIC/anon/authenticated
-- - GRANT EXECUTE only to service_role
-- - Lock search_path to prevent hijacking
--
-- RATIONALE:
-- All these RPCs are called from API routes via createAdminClient() (service_role).
-- Direct RPC calls from authenticated users would bypass API authorization.
-- This migration closes that attack vector.
--
-- IDEMPOTENCY: Safe to re-run (REVOKE/GRANT are idempotent)
-- ============================================

DO $$
DECLARE
    v_func_names TEXT[] := ARRAY[
        'fn_repair_orphan_opportunity',
        'fn_preflight_quotation_send',
        'fn_resolve_or_create_opportunity',
        'rpc_customer_quotation_mark_sent',
        'create_quotation_from_pipeline'
    ];
    v_func_name TEXT;
    v_proc RECORD;
BEGIN
    -- Check if service_role exists (Supabase default)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        RAISE NOTICE '[107] service_role role not found, skipping RPC hardening';
        RETURN;
    END IF;

    RAISE NOTICE '[107] Starting RPC permission hardening...';

    -- Iterate through target functions
    FOREACH v_func_name IN ARRAY v_func_names
    LOOP
        -- Find all overloads of this function in public schema
        FOR v_proc IN
            SELECT p.oid::regprocedure AS proc_signature, p.proname
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = v_func_name
        LOOP
            RAISE NOTICE '[107] Hardening function: %', v_proc.proc_signature;

            -- REVOKE from all public-accessible roles
            BEGIN
                EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_proc.proc_signature);
                RAISE NOTICE '[107]   REVOKE FROM PUBLIC: OK';
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '[107]   REVOKE FROM PUBLIC: % (ignored)', SQLERRM;
            END;

            BEGIN
                EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_proc.proc_signature);
                RAISE NOTICE '[107]   REVOKE FROM anon: OK';
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '[107]   REVOKE FROM anon: % (ignored)', SQLERRM;
            END;

            BEGIN
                EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_proc.proc_signature);
                RAISE NOTICE '[107]   REVOKE FROM authenticated: OK';
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '[107]   REVOKE FROM authenticated: % (ignored)', SQLERRM;
            END;

            -- GRANT only to service_role
            BEGIN
                EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_proc.proc_signature);
                RAISE NOTICE '[107]   GRANT TO service_role: OK';
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '[107]   GRANT TO service_role: % (ignored)', SQLERRM;
            END;

            -- Lock search_path for SECURITY DEFINER protection
            BEGIN
                EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', v_proc.proc_signature);
                RAISE NOTICE '[107]   SET search_path: OK';
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE '[107]   SET search_path: % (ignored)', SQLERRM;
            END;
        END LOOP;
    END LOOP;

    -- Harden monitoring view if it exists
    IF EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'v_orphan_quotation_opportunities'
    ) THEN
        RAISE NOTICE '[107] Hardening view: v_orphan_quotation_opportunities';

        BEGIN
            EXECUTE 'REVOKE ALL ON public.v_orphan_quotation_opportunities FROM PUBLIC';
            RAISE NOTICE '[107]   REVOKE ALL FROM PUBLIC: OK';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '[107]   REVOKE ALL FROM PUBLIC: % (ignored)', SQLERRM;
        END;

        BEGIN
            EXECUTE 'REVOKE ALL ON public.v_orphan_quotation_opportunities FROM anon';
            RAISE NOTICE '[107]   REVOKE ALL FROM anon: OK';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '[107]   REVOKE ALL FROM anon: % (ignored)', SQLERRM;
        END;

        BEGIN
            EXECUTE 'REVOKE ALL ON public.v_orphan_quotation_opportunities FROM authenticated';
            RAISE NOTICE '[107]   REVOKE ALL FROM authenticated: OK';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '[107]   REVOKE ALL FROM authenticated: % (ignored)', SQLERRM;
        END;

        BEGIN
            EXECUTE 'GRANT SELECT ON public.v_orphan_quotation_opportunities TO service_role';
            RAISE NOTICE '[107]   GRANT SELECT TO service_role: OK';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '[107]   GRANT SELECT TO service_role: % (ignored)', SQLERRM;
        END;
    ELSE
        RAISE NOTICE '[107] View v_orphan_quotation_opportunities not found, skipping';
    END IF;

    RAISE NOTICE '[107] RPC permission hardening complete.';
END $$;


-- ============================================
-- VERIFICATION QUERIES (for QA)
-- Run these after migration to verify permissions:
--
-- Check function privileges:
-- SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- CROSS JOIN (SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) r
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('fn_repair_orphan_opportunity', 'fn_preflight_quotation_send', 'fn_resolve_or_create_opportunity', 'rpc_customer_quotation_mark_sent', 'create_quotation_from_pipeline')
-- ORDER BY p.proname, r.rolname;
--
-- Check search_path config:
-- SELECT p.proname, p.proconfig
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('fn_repair_orphan_opportunity', 'fn_preflight_quotation_send', 'fn_resolve_or_create_opportunity', 'rpc_customer_quotation_mark_sent', 'create_quotation_from_pipeline');
-- ============================================
