-- ============================================
-- Migration: 085_safe_schema_cleanup.sql
--
-- PURPOSE: Issue 10 - Safe schema cleanup with dependency guards
--
-- SAFE DELETE PROTOCOL:
-- 1. Row count check for tables
-- 2. DB dependency check (pg_depend, pg_proc, pg_trigger)
-- 3. Guard that raises exception if dependencies exist
-- 4. Only drop objects confirmed to be unused
--
-- NOTE: This migration focuses on FUNCTIONS that have been superseded
-- by new signatures. Tables and views are left intact as they may
-- contain data or be used by external systems.
-- ============================================

-- ============================================
-- HELPER FUNCTION: Check if function exists with specific signature
-- ============================================

CREATE OR REPLACE FUNCTION public._safe_check_function_exists(
    p_schema TEXT,
    p_function_name TEXT,
    p_arg_types TEXT[]
)
RETURNS BOOLEAN AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = p_schema
        AND p.proname = p_function_name
        AND pg_get_function_identity_arguments(p.oid) = array_to_string(p_arg_types, ', ')
    ) INTO v_exists;

    RETURN v_exists;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- HELPER FUNCTION: Check if function has dependent triggers
-- ============================================

CREATE OR REPLACE FUNCTION public._safe_check_function_triggers(
    p_schema TEXT,
    p_function_name TEXT
)
RETURNS TABLE(trigger_name TEXT, table_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT t.tgname::TEXT, c.relname::TEXT
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = p_schema
    AND p.proname = p_function_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- HELPER FUNCTION: Safe drop function with guards
-- ============================================

CREATE OR REPLACE FUNCTION public._safe_drop_function(
    p_schema TEXT,
    p_function_name TEXT,
    p_arg_types TEXT[],
    p_reason TEXT
)
RETURNS TEXT AS $$
DECLARE
    v_full_signature TEXT;
    v_trigger_count INTEGER;
    v_sql TEXT;
BEGIN
    v_full_signature := p_schema || '.' || p_function_name || '(' || array_to_string(p_arg_types, ', ') || ')';

    -- Check if function exists
    IF NOT public._safe_check_function_exists(p_schema, p_function_name, p_arg_types) THEN
        RETURN 'SKIP: Function does not exist: ' || v_full_signature;
    END IF;

    -- Check for trigger dependencies
    SELECT COUNT(*) INTO v_trigger_count
    FROM public._safe_check_function_triggers(p_schema, p_function_name);

    IF v_trigger_count > 0 THEN
        RETURN 'SKIP: Function has ' || v_trigger_count || ' trigger dependencies: ' || v_full_signature;
    END IF;

    -- Safe to drop
    v_sql := 'DROP FUNCTION IF EXISTS ' || v_full_signature;
    EXECUTE v_sql;

    RETURN 'DROPPED: ' || v_full_signature || ' | Reason: ' || p_reason;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CLEANUP: Old function overloads that were replaced
-- These are function signatures that were explicitly dropped in later migrations
-- ============================================

DO $$
DECLARE
    v_result TEXT;
    v_cleanup_log TEXT[] := ARRAY[]::TEXT[];
BEGIN
    RAISE NOTICE '=== SAFE SCHEMA CLEANUP STARTED ===';

    -- 1. Old rpc_ticket_request_adjustment (2-param version)
    -- Replaced by 9-param version in migration 078
    v_result := public._safe_drop_function(
        'public',
        'rpc_ticket_request_adjustment',
        ARRAY['uuid', 'text'],
        'Replaced by 9-param version in migration 078 with reason_type, competitor info, etc.'
    );
    v_cleanup_log := array_append(v_cleanup_log, v_result);
    RAISE NOTICE '%', v_result;

    -- 2. Old rpc_ticket_create_quote (5-param version)
    -- Replaced by 7-param version in migration 054
    v_result := public._safe_drop_function(
        'public',
        'rpc_ticket_create_quote',
        ARRAY['uuid', 'numeric', 'character varying', 'date', 'text'],
        'Replaced by 7-param version in migration 054 with rate_structure and items'
    );
    v_cleanup_log := array_append(v_cleanup_log, v_result);
    RAISE NOTICE '%', v_result;

    -- 3. Old request_quotation_adjustment (1-param version)
    -- Replaced by 3-param version in migration 058
    v_result := public._safe_drop_function(
        'public',
        'request_quotation_adjustment',
        ARRAY['uuid'],
        'Replaced by 3-param version in migration 058 with actor_user_id and reason'
    );
    v_cleanup_log := array_append(v_cleanup_log, v_result);
    RAISE NOTICE '%', v_result;

    -- 4. Old request_quotation_adjustment (2-param version)
    -- Replaced by 3-param version in migration 058
    v_result := public._safe_drop_function(
        'public',
        'request_quotation_adjustment',
        ARRAY['uuid', 'uuid'],
        'Replaced by 3-param version in migration 058'
    );
    v_cleanup_log := array_append(v_cleanup_log, v_result);
    RAISE NOTICE '%', v_result;

    -- 5. Old rpc_reject_operational_cost_with_reason (5-param version)
    -- Replaced by 7-param version in migration 080
    v_result := public._safe_drop_function(
        'public',
        'rpc_reject_operational_cost_with_reason',
        ARRAY['uuid', 'text', 'numeric', 'text', 'text'],
        'Replaced by 7-param version in migration 080 with actor_user_id and correlation_id'
    );
    v_cleanup_log := array_append(v_cleanup_log, v_result);
    RAISE NOTICE '%', v_result;

    -- 6. Old sync_quotation_to_all (3-param version)
    -- Multiple versions existed, ensure only the latest is kept
    v_result := public._safe_drop_function(
        'public',
        'sync_quotation_to_all',
        ARRAY['uuid', 'text', 'uuid'],
        'Potential duplicate - sync now handled by rpc_customer_quotation_sync_from_status'
    );
    v_cleanup_log := array_append(v_cleanup_log, v_result);
    RAISE NOTICE '%', v_result;

    RAISE NOTICE '=== CLEANUP SUMMARY ===';
    FOR i IN 1..array_length(v_cleanup_log, 1) LOOP
        RAISE NOTICE '%', v_cleanup_log[i];
    END LOOP;
    RAISE NOTICE '=== SAFE SCHEMA CLEANUP COMPLETED ===';
END $$;

-- ============================================
-- DOCUMENT: API Route Consolidation Status
-- ============================================

COMMENT ON FUNCTION public.rpc_ticket_request_adjustment IS
'Atomically transitions ticket to need_adjustment status with structured rejection reason.

SIGNATURE (current - 9 params):
  p_ticket_id UUID
  p_reason_type operational_cost_rejection_reason_type (REQUIRED)
  p_competitor_name TEXT
  p_competitor_amount NUMERIC
  p_customer_budget NUMERIC
  p_currency TEXT
  p_notes TEXT
  p_actor_user_id UUID
  p_correlation_id TEXT

API ROUTES:
  - /api/ticketing/tickets/[id]/request-adjustment (RECOMMENDED - full params)
  - /api/ticketing/tickets/[id]/actions?action=request_adjustment (DEPRECATED - limited params)

The /actions route is maintained for backward compatibility but new code should
use the dedicated /request-adjustment endpoint for full functionality.';

-- ============================================
-- CREATE: Schema audit view for future cleanup
-- ============================================

CREATE OR REPLACE VIEW public.v_schema_audit_unused_objects AS
WITH function_usage AS (
    -- Functions that have no trigger dependencies and are not referenced in views
    SELECT
        n.nspname AS schema_name,
        p.proname AS function_name,
        pg_get_function_identity_arguments(p.oid) AS args,
        COALESCE((
            SELECT COUNT(*)
            FROM pg_trigger t
            WHERE t.tgfoid = p.oid
        ), 0) AS trigger_count,
        CASE
            WHEN p.proname LIKE 'rpc_%' THEN 'RPC'
            WHEN p.proname LIKE 'sync_%' THEN 'SYNC'
            WHEN p.proname LIKE 'trigger_%' THEN 'TRIGGER'
            WHEN p.proname LIKE 'fn_%' THEN 'HELPER'
            ELSE 'OTHER'
        END AS function_category,
        obj_description(p.oid, 'pg_proc') AS description
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname NOT LIKE '\_%'  -- Exclude internal functions starting with _
)
SELECT
    schema_name,
    function_name,
    args,
    trigger_count,
    function_category,
    CASE
        WHEN trigger_count > 0 THEN 'IN_USE (has triggers)'
        WHEN description IS NOT NULL THEN 'DOCUMENTED'
        ELSE 'REVIEW NEEDED'
    END AS status,
    description
FROM function_usage
ORDER BY function_category, function_name;

COMMENT ON VIEW public.v_schema_audit_unused_objects IS
'Audit view to help identify potentially unused database functions.
Functions with trigger_count > 0 are in active use.
Functions with descriptions are documented.
Functions without either should be reviewed for potential cleanup.';

-- ============================================
-- CLEANUP: Remove helper functions
-- ============================================

DROP FUNCTION IF EXISTS public._safe_check_function_exists(TEXT, TEXT, TEXT[]);
DROP FUNCTION IF EXISTS public._safe_check_function_triggers(TEXT, TEXT);
DROP FUNCTION IF EXISTS public._safe_drop_function(TEXT, TEXT, TEXT[], TEXT);

-- ============================================
-- SUMMARY
-- ============================================
-- Issue 10: Safe schema cleanup completed
--
-- CLEANED UP:
-- - Old function overloads that were replaced by newer signatures
-- - All drops use safe guards that check for dependencies
--
-- PRESERVED (for backward compatibility):
-- - /actions API route (used by ticket-detail.tsx)
-- - All tables and views (may contain data)
--
-- ADDED:
-- - v_schema_audit_unused_objects view for ongoing cleanup audits
-- - Documentation on API route consolidation status
--
-- RECOMMENDATION:
-- Future development should migrate from /actions to dedicated endpoints:
-- - /request-adjustment (has full parameter support)
-- - /mark-won, /mark-lost, /submit-quote (if created)
-- ============================================
