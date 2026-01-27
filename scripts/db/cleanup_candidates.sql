-- ============================================
-- Script: cleanup_candidates.sql
--
-- PURPOSE: Identify schema cleanup candidates (NON-DESTRUCTIVE)
-- This script ONLY analyzes and reports - it does NOT modify anything
--
-- Run with: psql -d your_database -f cleanup_candidates.sql
-- ============================================

\echo '============================================'
\echo 'SCHEMA CLEANUP CANDIDATES ANALYSIS'
\echo '============================================'
\echo ''

-- ============================================
-- 1. KNOWN PROTECTED OBJECTS (DO NOT DROP)
-- Objects explicitly used by the application
-- ============================================

\echo '1. PROTECTED OBJECTS LIST'
\echo '   These objects are known to be in use and will NEVER be dropped'
\echo ''

-- Create temporary table of protected objects
DROP TABLE IF EXISTS _protected_objects;
CREATE TEMP TABLE _protected_objects (
    object_type TEXT,
    object_name TEXT,
    reason TEXT
);

-- Insert known protected objects
INSERT INTO _protected_objects (object_type, object_name, reason) VALUES
-- Core CRM tables
('table', 'profiles', 'User profiles - core auth'),
('table', 'accounts', 'CRM accounts'),
('table', 'contacts', 'CRM contacts'),
('table', 'leads', 'CRM leads'),
('table', 'opportunities', 'CRM opportunities/pipeline'),
('table', 'opportunity_stage_history', 'Pipeline audit trail'),
('table', 'activities', 'CRM activities'),
('table', 'pipeline_updates', 'Pipeline updates log'),
('table', 'sales_plans', 'Sales target feature - used by sales_plans endpoints'),
('table', 'sales_plan_items', 'Sales plan items'),
-- Ticketing tables
('table', 'tickets', 'Core ticketing'),
('table', 'ticket_comments', 'Ticket discussions'),
('table', 'ticket_events', 'Ticket audit log'),
('table', 'ticket_attachments', 'File attachments'),
('table', 'ticket_rate_quotes', 'Operational costs'),
('table', 'ticket_rate_quote_items', 'Cost breakdown items'),
('table', 'ticket_sla_tracking', 'SLA tracking'),
('table', 'ticket_response_exchanges', 'Response time tracking'),
('table', 'ticket_response_metrics', 'Aggregated SLA metrics'),
-- Customer Quotations
('table', 'customer_quotations', 'Customer-facing quotes'),
('table', 'customer_quotation_items', 'Quote line items'),
('table', 'customer_quotation_terms', 'Quote terms templates'),
-- Lead management
('table', 'lead_handover_pool', 'Lead assignment pool'),
('table', 'lead_bids', 'Lead bidding'),
-- Config tables
('table', 'sla_business_hours', 'SLA business hours config'),
('table', 'sla_holidays', 'SLA holidays config'),
('table', 'departments', 'Department config'),
('table', 'ticket_categories', 'Ticket categories'),
-- Functions (RPC endpoints used by API routes)
('function', 'rpc_customer_quotation_mark_sent', 'Quotation workflow'),
('function', 'rpc_customer_quotation_mark_accepted', 'Quotation workflow'),
('function', 'rpc_customer_quotation_mark_rejected', 'Quotation workflow'),
('function', 'rpc_ticket_request_adjustment', 'Ticket adjustment'),
('function', 'rpc_ticket_set_need_adjustment', 'Manual adjustment'),
('function', 'rpc_ticket_add_comment', 'Add ticket comment'),
('function', 'rpc_get_ticket_sla_details', 'SLA details'),
('function', 'record_response_exchange', 'SLA tracking'),
('function', 'record_ticket_interaction', 'SLA tracking'),
('function', 'fn_resolve_latest_operational_cost', 'Cost resolution'),
('function', 'generate_customer_quotation_number', 'Quote numbering'),
('function', 'get_next_quotation_sequence', 'Quote sequencing'),
('function', 'sync_quotation_to_lead', 'Entity sync'),
('function', 'sync_quotation_to_opportunity', 'Entity sync'),
('function', 'sync_quotation_to_ticket', 'Entity sync'),
('function', 'sync_quotation_to_all', 'Entity sync'),
('function', 'fn_check_ticket_authorization', 'Auth check'),
('function', 'fn_check_quotation_authorization', 'Auth check'),
('function', 'fn_validate_ticket_transition', 'State machine'),
('function', 'fn_validate_quotation_transition', 'State machine'),
-- Views
('view', 'v_latest_operational_costs', 'Cost resolution'),
('view', 'v_ticket_sla_audit', 'SLA audit'),
('view', 'v_schema_audit_unused_objects', 'Schema audit');

SELECT object_type, object_name, reason FROM _protected_objects ORDER BY object_type, object_name;

\echo ''
\echo '============================================'
\echo '2. TABLE ANALYSIS'
\echo '============================================'
\echo ''

-- ============================================
-- 2. TABLE ANALYSIS
-- ============================================

DROP TABLE IF EXISTS _table_analysis;
CREATE TEMP TABLE _table_analysis AS
WITH table_info AS (
    SELECT
        c.relname AS table_name,
        c.oid AS table_oid,
        pg_catalog.pg_table_size(c.oid) AS table_size_bytes,
        (SELECT COUNT(*) FROM pg_catalog.pg_index i WHERE i.indrelid = c.oid) AS index_count
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relkind = 'r'  -- Regular tables only
),
row_counts AS (
    SELECT
        schemaname,
        relname AS table_name,
        n_live_tup AS estimated_rows
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
),
fk_references AS (
    -- Tables that are REFERENCED BY other tables (have incoming FKs)
    SELECT DISTINCT
        ccu.table_name AS referenced_table,
        COUNT(DISTINCT tc.constraint_name) AS incoming_fk_count
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    GROUP BY ccu.table_name
),
fk_dependencies AS (
    -- Tables that HAVE foreign keys (depend on other tables)
    SELECT
        tc.table_name,
        COUNT(DISTINCT tc.constraint_name) AS outgoing_fk_count
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    GROUP BY tc.table_name
),
trigger_deps AS (
    SELECT
        c.relname AS table_name,
        COUNT(*) AS trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND NOT t.tgisinternal
    GROUP BY c.relname
),
view_deps AS (
    -- Tables referenced by views
    SELECT DISTINCT
        d.refobjid::regclass::text AS table_name,
        COUNT(DISTINCT c.relname) AS view_count
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class c ON c.oid = r.ev_class
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE d.refclassid = 'pg_class'::regclass
    AND c.relkind = 'v'
    AND n.nspname = 'public'
    AND d.refobjid::regclass::text NOT LIKE 'pg_%'
    GROUP BY d.refobjid
),
policy_deps AS (
    SELECT
        c.relname AS table_name,
        COUNT(*) AS policy_count
    FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    GROUP BY c.relname
)
SELECT
    ti.table_name,
    COALESCE(rc.estimated_rows, 0) AS estimated_rows,
    pg_size_pretty(ti.table_size_bytes) AS table_size,
    ti.index_count,
    COALESCE(fkr.incoming_fk_count, 0) AS incoming_fk_count,
    COALESCE(fkd.outgoing_fk_count, 0) AS outgoing_fk_count,
    COALESCE(td.trigger_count, 0) AS trigger_count,
    COALESCE(vd.view_count, 0) AS view_references,
    COALESCE(pd.policy_count, 0) AS rls_policy_count,
    CASE WHEN po.object_name IS NOT NULL THEN TRUE ELSE FALSE END AS is_protected,
    COALESCE(po.reason, '') AS protection_reason
FROM table_info ti
LEFT JOIN row_counts rc ON rc.table_name = ti.table_name
LEFT JOIN fk_references fkr ON fkr.referenced_table = ti.table_name
LEFT JOIN fk_dependencies fkd ON fkd.table_name = ti.table_name
LEFT JOIN trigger_deps td ON td.table_name = ti.table_name
LEFT JOIN view_deps vd ON vd.table_name = ti.table_name
LEFT JOIN policy_deps pd ON pd.table_name = ti.table_name
LEFT JOIN _protected_objects po ON po.object_type = 'table' AND po.object_name = ti.table_name
ORDER BY ti.table_name;

\echo '2a. All Tables with Dependencies'
SELECT * FROM _table_analysis ORDER BY table_name;

\echo ''
\echo '2b. POTENTIAL TABLE CLEANUP CANDIDATES'
\echo '      (0 rows, 0 incoming FKs, 0 triggers, 0 view refs, NOT protected)'
SELECT
    table_name,
    estimated_rows,
    table_size,
    'CANDIDATE: Empty table with no dependencies' AS status
FROM _table_analysis
WHERE estimated_rows = 0
AND incoming_fk_count = 0
AND trigger_count = 0
AND view_references = 0
AND NOT is_protected
ORDER BY table_name;

\echo ''
\echo '2c. BLOCKED TABLE CANDIDATES (reason shown)'
SELECT
    table_name,
    estimated_rows,
    CASE
        WHEN is_protected THEN 'PROTECTED: ' || protection_reason
        WHEN estimated_rows > 0 THEN 'HAS_DATA: ' || estimated_rows || ' rows'
        WHEN incoming_fk_count > 0 THEN 'HAS_INCOMING_FK: ' || incoming_fk_count || ' references'
        WHEN trigger_count > 0 THEN 'HAS_TRIGGERS: ' || trigger_count || ' triggers'
        WHEN view_references > 0 THEN 'REFERENCED_BY_VIEW: ' || view_references || ' views'
        ELSE 'UNKNOWN'
    END AS block_reason
FROM _table_analysis
WHERE is_protected
   OR estimated_rows > 0
   OR incoming_fk_count > 0
   OR trigger_count > 0
   OR view_references > 0
ORDER BY table_name;

\echo ''
\echo '============================================'
\echo '3. FUNCTION ANALYSIS'
\echo '============================================'
\echo ''

DROP TABLE IF EXISTS _function_analysis;
CREATE TEMP TABLE _function_analysis AS
WITH function_info AS (
    SELECT
        p.proname AS function_name,
        pg_get_function_identity_arguments(p.oid) AS args,
        p.oid AS function_oid,
        CASE
            WHEN p.proname LIKE 'rpc_%' THEN 'RPC'
            WHEN p.proname LIKE 'fn_%' THEN 'HELPER'
            WHEN p.proname LIKE 'trigger_%' THEN 'TRIGGER_FN'
            WHEN p.proname LIKE 'sync_%' THEN 'SYNC'
            ELSE 'OTHER'
        END AS function_category
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname NOT LIKE '\\_%'  -- Exclude internal
),
trigger_usage AS (
    SELECT DISTINCT
        p.proname AS function_name,
        COUNT(*) AS trigger_count
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    GROUP BY p.proname
),
called_by_functions AS (
    -- Functions that call other functions (very approximate - text search)
    SELECT
        p2.proname AS function_name,
        COUNT(DISTINCT p1.proname) AS called_by_count
    FROM pg_proc p1
    JOIN pg_namespace n1 ON p1.pronamespace = n1.oid
    JOIN pg_proc p2 ON pg_get_functiondef(p1.oid) LIKE '%' || p2.proname || '%'
    JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
    WHERE n1.nspname = 'public'
    AND n2.nspname = 'public'
    AND p1.proname != p2.proname
    GROUP BY p2.proname
)
SELECT
    fi.function_name,
    fi.args,
    fi.function_category,
    COALESCE(tu.trigger_count, 0) AS trigger_count,
    COALESCE(cbf.called_by_count, 0) AS called_by_count,
    CASE WHEN po.object_name IS NOT NULL THEN TRUE ELSE FALSE END AS is_protected,
    COALESCE(po.reason, '') AS protection_reason
FROM function_info fi
LEFT JOIN trigger_usage tu ON tu.function_name = fi.function_name
LEFT JOIN called_by_functions cbf ON cbf.function_name = fi.function_name
LEFT JOIN _protected_objects po ON po.object_type = 'function' AND po.object_name = fi.function_name
ORDER BY fi.function_category, fi.function_name;

\echo '3a. All Functions with Dependencies'
SELECT * FROM _function_analysis ORDER BY function_category, function_name;

\echo ''
\echo '3b. POTENTIAL FUNCTION CLEANUP CANDIDATES'
\echo '      (0 triggers, 0 callers, NOT protected)'
SELECT
    function_name,
    args,
    function_category,
    'CANDIDATE: No trigger usage, no callers detected' AS status
FROM _function_analysis
WHERE trigger_count = 0
AND called_by_count = 0
AND NOT is_protected
ORDER BY function_category, function_name;

\echo ''
\echo '============================================'
\echo '4. VIEW ANALYSIS'
\echo '============================================'
\echo ''

DROP TABLE IF EXISTS _view_analysis;
CREATE TEMP TABLE _view_analysis AS
WITH view_info AS (
    SELECT
        c.relname AS view_name,
        c.oid AS view_oid
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relkind = 'v'
),
view_dependencies AS (
    -- Views that depend on this view
    SELECT
        v1.relname AS view_name,
        COUNT(DISTINCT v2.relname) AS dependent_view_count
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class v1 ON d.refobjid = v1.oid
    JOIN pg_class v2 ON v2.oid = r.ev_class
    JOIN pg_namespace n1 ON n1.oid = v1.relnamespace
    JOIN pg_namespace n2 ON n2.oid = v2.relnamespace
    WHERE v1.relkind = 'v'
    AND v2.relkind = 'v'
    AND n1.nspname = 'public'
    AND n2.nspname = 'public'
    AND v1.relname != v2.relname
    GROUP BY v1.relname
)
SELECT
    vi.view_name,
    COALESCE(vd.dependent_view_count, 0) AS dependent_view_count,
    CASE WHEN po.object_name IS NOT NULL THEN TRUE ELSE FALSE END AS is_protected,
    COALESCE(po.reason, '') AS protection_reason
FROM view_info vi
LEFT JOIN view_dependencies vd ON vd.view_name = vi.view_name
LEFT JOIN _protected_objects po ON po.object_type = 'view' AND po.object_name = vi.view_name
ORDER BY vi.view_name;

\echo '4a. All Views'
SELECT * FROM _view_analysis ORDER BY view_name;

\echo ''
\echo '4b. POTENTIAL VIEW CLEANUP CANDIDATES'
SELECT
    view_name,
    'CANDIDATE: No dependent views, not protected' AS status
FROM _view_analysis
WHERE dependent_view_count = 0
AND NOT is_protected
ORDER BY view_name;

\echo ''
\echo '============================================'
\echo '5. ENUM ANALYSIS'
\echo '============================================'
\echo ''

DROP TABLE IF EXISTS _enum_analysis;
CREATE TEMP TABLE _enum_analysis AS
WITH enum_info AS (
    SELECT
        t.typname AS enum_name,
        t.oid AS enum_oid
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
    AND t.typtype = 'e'
),
enum_usage AS (
    -- Columns that use this enum
    SELECT
        t.typname AS enum_name,
        COUNT(DISTINCT a.attrelid::regclass::text || '.' || a.attname) AS column_usage_count
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    JOIN pg_attribute a ON a.atttypid = t.oid
    JOIN pg_class c ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
    AND t.typtype = 'e'
    AND a.attnum > 0
    AND NOT a.attisdropped
    GROUP BY t.typname
)
SELECT
    ei.enum_name,
    COALESCE(eu.column_usage_count, 0) AS column_usage_count
FROM enum_info ei
LEFT JOIN enum_usage eu ON eu.enum_name = ei.enum_name
ORDER BY ei.enum_name;

\echo '5a. All Enums with Usage'
SELECT * FROM _enum_analysis ORDER BY enum_name;

\echo ''
\echo '5b. POTENTIAL ENUM CLEANUP CANDIDATES (0 column usage)'
SELECT
    enum_name,
    'CANDIDATE: Not used by any column' AS status
FROM _enum_analysis
WHERE column_usage_count = 0
ORDER BY enum_name;

\echo ''
\echo '============================================'
\echo '6. DUPLICATE/REDUNDANT OBJECTS'
\echo '============================================'
\echo ''

\echo '6a. Functions with multiple overloads (potential cleanup)'
SELECT
    proname AS function_name,
    COUNT(*) AS overload_count,
    STRING_AGG(pg_get_function_identity_arguments(oid), ' | ') AS signatures
FROM pg_proc
JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
WHERE pg_namespace.nspname = 'public'
GROUP BY proname
HAVING COUNT(*) > 1
ORDER BY overload_count DESC, function_name;

\echo ''
\echo '6b. Tables with potential naming conflicts (similar names)'
SELECT
    t1.table_name AS table1,
    t2.table_name AS table2,
    'Similar names - verify both needed' AS note
FROM information_schema.tables t1
JOIN information_schema.tables t2 ON t1.table_name < t2.table_name
WHERE t1.table_schema = 'public'
AND t2.table_schema = 'public'
AND (
    REPLACE(t1.table_name, '_', '') = REPLACE(t2.table_name, '_', '')
    OR t1.table_name LIKE t2.table_name || '%'
    OR t2.table_name LIKE t1.table_name || '%'
);

\echo ''
\echo '============================================'
\echo '7. SUMMARY'
\echo '============================================'
\echo ''

\echo 'Table Candidates:'
SELECT COUNT(*) AS candidate_count FROM _table_analysis
WHERE estimated_rows = 0 AND incoming_fk_count = 0 AND trigger_count = 0 AND view_references = 0 AND NOT is_protected;

\echo ''
\echo 'Function Candidates:'
SELECT COUNT(*) AS candidate_count FROM _function_analysis
WHERE trigger_count = 0 AND called_by_count = 0 AND NOT is_protected;

\echo ''
\echo 'View Candidates:'
SELECT COUNT(*) AS candidate_count FROM _view_analysis
WHERE dependent_view_count = 0 AND NOT is_protected;

\echo ''
\echo 'Enum Candidates:'
SELECT COUNT(*) AS candidate_count FROM _enum_analysis WHERE column_usage_count = 0;

\echo ''
\echo '============================================'
\echo 'ANALYSIS COMPLETE'
\echo 'Review output above before running drop_safe.sql'
\echo '============================================'

-- Clean up temp tables
DROP TABLE IF EXISTS _protected_objects;
DROP TABLE IF EXISTS _table_analysis;
DROP TABLE IF EXISTS _function_analysis;
DROP TABLE IF EXISTS _view_analysis;
DROP TABLE IF EXISTS _enum_analysis;
