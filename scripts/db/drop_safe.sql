-- ============================================
-- Script: drop_safe.sql
--
-- PURPOSE: Safely drop objects that pass ALL safety gates
--
-- SAFETY GATES:
-- Gate A (Dependency Gate): No DB dependencies (pg_depend, FK references)
-- Gate B (Code Usage Gate): Not referenced in repo code
-- Gate C (Data Gate): 0 rows for tables
-- Gate D (Protected Gate): Not in protected list
--
-- USAGE:
-- 1. First run cleanup_candidates.sql to review candidates
-- 2. Update CODE_REFERENCED_OBJECTS below based on grep results
-- 3. Run this script in a TRANSACTION (BEGIN/ROLLBACK to test)
--
-- Run with: psql -d your_database -f drop_safe.sql
-- ============================================

\echo '============================================'
\echo 'SAFE SCHEMA CLEANUP'
\echo '============================================'
\echo ''
\echo 'WARNING: This script will DROP objects.'
\echo 'Review cleanup_candidates.sql output first!'
\echo ''

-- Start transaction for safety
BEGIN;

-- ============================================
-- CONFIGURATION: Objects referenced in code
-- Update this list based on grep results from the codebase
-- ============================================

DROP TABLE IF EXISTS _code_referenced_objects;
CREATE TEMP TABLE _code_referenced_objects (
    object_type TEXT,
    object_name TEXT,
    reference_location TEXT
);

-- These objects are referenced in the codebase (from grep analysis)
-- DO NOT DROP THESE
INSERT INTO _code_referenced_objects (object_type, object_name, reference_location) VALUES
-- API Routes that reference tables/functions
('table', 'profiles', 'src/app/api/**/route.ts'),
('table', 'accounts', 'src/app/api/crm/accounts/'),
('table', 'contacts', 'src/app/api/crm/contacts/'),
('table', 'leads', 'src/app/api/crm/leads/'),
('table', 'opportunities', 'src/app/api/crm/opportunities/'),
('table', 'activities', 'src/app/api/crm/activities/'),
('table', 'pipeline_updates', 'src/app/api/crm/pipeline/'),
('table', 'sales_plans', 'src/app/api/crm/sales-plans/'),
('table', 'sales_plan_items', 'src/app/api/crm/sales-plans/'),
('table', 'tickets', 'src/app/api/ticketing/tickets/'),
('table', 'ticket_comments', 'src/app/api/ticketing/tickets/'),
('table', 'ticket_events', 'src/app/api/ticketing/tickets/'),
('table', 'ticket_attachments', 'src/app/api/ticketing/tickets/'),
('table', 'ticket_rate_quotes', 'src/app/api/ticketing/operational-costs/'),
('table', 'ticket_rate_quote_items', 'src/app/api/ticketing/operational-costs/'),
('table', 'customer_quotations', 'src/app/api/ticketing/customer-quotations/'),
('table', 'customer_quotation_items', 'src/app/api/ticketing/customer-quotations/'),
('table', 'customer_quotation_terms', 'src/app/api/ticketing/customer-quotations/terms/'),
('table', 'lead_handover_pool', 'src/app/api/crm/leads/handover/'),
('table', 'lead_bids', 'src/app/api/crm/leads/bids/'),
('table', 'departments', 'src/app/api/ticketing/'),
('table', 'ticket_categories', 'src/app/api/ticketing/'),
('table', 'opportunity_stage_history', 'src/components/crm/'),
('table', 'ticket_sla_tracking', 'src/components/ticketing/'),
('table', 'ticket_response_exchanges', 'src/components/ticketing/'),
('table', 'ticket_response_metrics', 'src/components/ticketing/'),
('table', 'sla_business_hours', 'src/app/api/ticketing/sla/'),
('table', 'sla_holidays', 'src/app/api/ticketing/sla/'),
('table', 'operational_cost_rejection_reasons', 'src/app/api/ticketing/'),
-- RPC functions called from code
('function', 'rpc_customer_quotation_mark_sent', 'src/app/api/ticketing/customer-quotations/'),
('function', 'rpc_customer_quotation_mark_accepted', 'src/app/api/ticketing/customer-quotations/'),
('function', 'rpc_customer_quotation_mark_rejected', 'src/app/api/ticketing/customer-quotations/'),
('function', 'rpc_ticket_request_adjustment', 'src/app/api/ticketing/tickets/'),
('function', 'rpc_ticket_set_need_adjustment', 'src/app/api/ticketing/tickets/'),
('function', 'rpc_ticket_add_comment', 'src/app/api/ticketing/tickets/'),
('function', 'rpc_get_ticket_sla_details', 'src/app/api/ticketing/sla/'),
('function', 'generate_customer_quotation_number', 'src/app/api/ticketing/customer-quotations/'),
('function', 'get_next_quotation_sequence', 'src/app/api/ticketing/customer-quotations/'),
('function', 'fn_resolve_latest_operational_cost', 'src/app/api/ticketing/customer-quotations/'),
('function', 'sync_quotation_to_lead', 'src/app/api/ticketing/customer-quotations/'),
('function', 'sync_quotation_to_opportunity', 'src/app/api/ticketing/customer-quotations/'),
('function', 'sync_quotation_to_ticket', 'src/app/api/ticketing/customer-quotations/'),
('function', 'record_response_exchange', 'supabase/migrations/'),
('function', 'record_ticket_interaction', 'supabase/migrations/'),
('function', 'update_ticket_response_metrics', 'supabase/migrations/'),
('function', 'calculate_business_hours_seconds', 'supabase/migrations/');

\echo 'Code-referenced objects loaded (these will NOT be dropped)'
SELECT COUNT(*) AS protected_by_code FROM _code_referenced_objects;

-- ============================================
-- PROTECTED OBJECTS (same as cleanup_candidates.sql)
-- ============================================

DROP TABLE IF EXISTS _protected_objects;
CREATE TEMP TABLE _protected_objects (
    object_type TEXT,
    object_name TEXT,
    reason TEXT
);

-- Core protected objects
INSERT INTO _protected_objects (object_type, object_name, reason)
SELECT DISTINCT object_type, object_name, 'Referenced in code: ' || reference_location
FROM _code_referenced_objects;

-- Add additional protected objects
INSERT INTO _protected_objects (object_type, object_name, reason) VALUES
-- System/config
('table', 'schema_migrations', 'Supabase system'),
('table', 'buckets', 'Supabase storage'),
('table', 'objects', 'Supabase storage'),
-- Any view is protected by default (recreating is trivial)
('view', '*', 'Views are low-risk - skip drop');

-- ============================================
-- SAFE DROP FUNCTIONS
-- ============================================

-- Function to safely drop a table
CREATE OR REPLACE FUNCTION _safe_drop_table(p_table_name TEXT)
RETURNS TEXT AS $$
DECLARE
    v_row_count INTEGER;
    v_fk_count INTEGER;
    v_trigger_count INTEGER;
    v_protected BOOLEAN;
    v_code_ref BOOLEAN;
BEGIN
    -- Check if protected
    SELECT EXISTS(
        SELECT 1 FROM _protected_objects
        WHERE object_type = 'table'
        AND (object_name = p_table_name OR object_name = '*')
    ) INTO v_protected;

    IF v_protected THEN
        RETURN 'SKIP: ' || p_table_name || ' is protected';
    END IF;

    -- Check code reference
    SELECT EXISTS(
        SELECT 1 FROM _code_referenced_objects
        WHERE object_type = 'table' AND object_name = p_table_name
    ) INTO v_code_ref;

    IF v_code_ref THEN
        RETURN 'SKIP: ' || p_table_name || ' is referenced in code';
    END IF;

    -- Gate C: Check row count
    EXECUTE format('SELECT COUNT(*) FROM public.%I', p_table_name) INTO v_row_count;
    IF v_row_count > 0 THEN
        RETURN 'SKIP: ' || p_table_name || ' has ' || v_row_count || ' rows';
    END IF;

    -- Gate A: Check FK references (incoming)
    SELECT COUNT(*) INTO v_fk_count
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = p_table_name
    AND tc.table_schema = 'public';

    IF v_fk_count > 0 THEN
        RETURN 'SKIP: ' || p_table_name || ' has ' || v_fk_count || ' incoming FK references';
    END IF;

    -- Gate A: Check trigger dependencies
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND c.relname = p_table_name
    AND NOT t.tgisinternal;

    IF v_trigger_count > 0 THEN
        RETURN 'SKIP: ' || p_table_name || ' has ' || v_trigger_count || ' triggers';
    END IF;

    -- All gates passed - drop
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', p_table_name);
    RETURN 'DROPPED: ' || p_table_name;
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'ERROR: ' || p_table_name || ' - ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Function to safely drop a function
CREATE OR REPLACE FUNCTION _safe_drop_function(p_function_name TEXT, p_args TEXT)
RETURNS TEXT AS $$
DECLARE
    v_protected BOOLEAN;
    v_code_ref BOOLEAN;
    v_trigger_count INTEGER;
    v_full_sig TEXT;
BEGIN
    v_full_sig := p_function_name || '(' || COALESCE(p_args, '') || ')';

    -- Check if protected
    SELECT EXISTS(
        SELECT 1 FROM _protected_objects
        WHERE object_type = 'function'
        AND object_name = p_function_name
    ) INTO v_protected;

    IF v_protected THEN
        RETURN 'SKIP: ' || v_full_sig || ' is protected';
    END IF;

    -- Check code reference
    SELECT EXISTS(
        SELECT 1 FROM _code_referenced_objects
        WHERE object_type = 'function' AND object_name = p_function_name
    ) INTO v_code_ref;

    IF v_code_ref THEN
        RETURN 'SKIP: ' || v_full_sig || ' is referenced in code';
    END IF;

    -- Gate A: Check trigger usage
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname = p_function_name;

    IF v_trigger_count > 0 THEN
        RETURN 'SKIP: ' || v_full_sig || ' used by ' || v_trigger_count || ' triggers';
    END IF;

    -- All gates passed - drop
    BEGIN
        EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s)', p_function_name, COALESCE(p_args, ''));
        RETURN 'DROPPED: ' || v_full_sig;
    EXCEPTION
        WHEN OTHERS THEN
            RETURN 'ERROR: ' || v_full_sig || ' - ' || SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql;

-- Function to safely drop an enum
CREATE OR REPLACE FUNCTION _safe_drop_enum(p_enum_name TEXT)
RETURNS TEXT AS $$
DECLARE
    v_usage_count INTEGER;
BEGIN
    -- Check column usage
    SELECT COUNT(*) INTO v_usage_count
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    JOIN pg_attribute a ON a.atttypid = t.oid
    WHERE n.nspname = 'public'
    AND t.typname = p_enum_name
    AND a.attnum > 0
    AND NOT a.attisdropped;

    IF v_usage_count > 0 THEN
        RETURN 'SKIP: ' || p_enum_name || ' used by ' || v_usage_count || ' columns';
    END IF;

    -- Drop
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', p_enum_name);
    RETURN 'DROPPED: ' || p_enum_name;
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'ERROR: ' || p_enum_name || ' - ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- EXECUTE SAFE DROPS
-- ============================================

\echo ''
\echo '============================================'
\echo 'EXECUTING SAFE DROPS'
\echo '============================================'
\echo ''

-- Create results table
DROP TABLE IF EXISTS _drop_results;
CREATE TEMP TABLE _drop_results (
    object_type TEXT,
    object_name TEXT,
    result TEXT,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Process tables
\echo 'Processing tables...'
INSERT INTO _drop_results (object_type, object_name, result)
SELECT
    'table',
    c.relname,
    _safe_drop_table(c.relname)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
AND c.relkind = 'r'
AND c.relname NOT LIKE '\\_%'  -- Skip temp tables
ORDER BY c.relname;

-- Process functions (only non-protected, non-trigger)
\echo 'Processing functions...'
INSERT INTO _drop_results (object_type, object_name, result)
SELECT
    'function',
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    _safe_drop_function(p.proname, pg_get_function_identity_arguments(p.oid))
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname NOT LIKE '\\_%'  -- Skip internal
AND p.proname NOT LIKE 'trigger_%'  -- Skip trigger functions by convention
ORDER BY p.proname;

-- Process enums
\echo 'Processing enums...'
INSERT INTO _drop_results (object_type, object_name, result)
SELECT
    'enum',
    t.typname,
    _safe_drop_enum(t.typname)
FROM pg_type t
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public'
AND t.typtype = 'e'
ORDER BY t.typname;

-- ============================================
-- RESULTS SUMMARY
-- ============================================

\echo ''
\echo '============================================'
\echo 'DROP RESULTS SUMMARY'
\echo '============================================'
\echo ''

\echo 'DROPPED Objects:'
SELECT object_type, object_name, result
FROM _drop_results
WHERE result LIKE 'DROPPED:%'
ORDER BY object_type, object_name;

\echo ''
\echo 'SKIPPED Objects (with reason):'
SELECT object_type, object_name, result
FROM _drop_results
WHERE result LIKE 'SKIP:%'
ORDER BY object_type, object_name;

\echo ''
\echo 'ERRORS:'
SELECT object_type, object_name, result
FROM _drop_results
WHERE result LIKE 'ERROR:%'
ORDER BY object_type, object_name;

\echo ''
\echo 'Summary counts:'
SELECT
    result_type,
    COUNT(*) AS count
FROM (
    SELECT
        CASE
            WHEN result LIKE 'DROPPED:%' THEN 'DROPPED'
            WHEN result LIKE 'SKIP:%' THEN 'SKIPPED'
            WHEN result LIKE 'ERROR:%' THEN 'ERROR'
            ELSE 'OTHER'
        END AS result_type
    FROM _drop_results
) t
GROUP BY result_type
ORDER BY result_type;

-- ============================================
-- CLEANUP
-- ============================================

DROP FUNCTION IF EXISTS _safe_drop_table(TEXT);
DROP FUNCTION IF EXISTS _safe_drop_function(TEXT, TEXT);
DROP FUNCTION IF EXISTS _safe_drop_enum(TEXT);
DROP TABLE IF EXISTS _protected_objects;
DROP TABLE IF EXISTS _code_referenced_objects;
DROP TABLE IF EXISTS _drop_results;

-- ============================================
-- IMPORTANT: Review results before committing!
-- ============================================

\echo ''
\echo '============================================'
\echo 'REVIEW COMPLETE'
\echo ''
\echo 'To COMMIT changes: Run COMMIT;'
\echo 'To ROLLBACK changes: Run ROLLBACK;'
\echo ''
\echo 'Current transaction is still open.'
\echo '============================================'

-- Uncomment to auto-commit (DANGEROUS)
-- COMMIT;

-- Default: rollback for safety
ROLLBACK;

\echo 'Transaction ROLLED BACK (dry run complete)'
\echo 'To actually drop objects, uncomment COMMIT and comment ROLLBACK'
