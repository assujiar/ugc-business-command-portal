-- ============================================
-- Script: test_overview_v2.sql
--
-- PURPOSE: Test the rpc_ticketing_overview_v2 function
-- Run this after applying migration 093
--
-- USAGE: psql -d your_database -f scripts/db/test_overview_v2.sql
-- ============================================

\echo '============================================'
\echo 'TESTING rpc_ticketing_overview_v2'
\echo '============================================'
\echo ''

-- ============================================
-- Test 1: Call with default parameters (all scope)
-- ============================================
\echo 'Test 1: Default parameters (30 days, all scope)'
\echo ''

SELECT jsonb_pretty(
    public.rpc_ticketing_overview_v2(
        p_period_days := 30,
        p_user_id := NULL,
        p_department := NULL,
        p_role := 'super_admin'
    )
);

\echo ''
\echo '============================================'

-- ============================================
-- Test 2: Call with department scope
-- ============================================
\echo 'Test 2: Department scope (DOM - Domestics Ops)'
\echo ''

SELECT jsonb_pretty(
    public.rpc_ticketing_overview_v2(
        p_period_days := 30,
        p_user_id := NULL,
        p_department := 'DOM',
        p_role := 'ticketing_manager'
    )
);

\echo ''
\echo '============================================'

-- ============================================
-- Test 3: Verify counts_by_type structure
-- ============================================
\echo 'Test 3: Verify counts_by_type structure'
\echo ''

SELECT
    (result->'counts_by_type'->'RFQ'->>'total')::INTEGER as rfq_total,
    (result->'counts_by_type'->'GEN'->>'total')::INTEGER as gen_total,
    (result->'counts_by_type'->'TOTAL'->>'total')::INTEGER as overall_total,
    (result->'counts_by_type'->'TOTAL'->>'active')::INTEGER as active_tickets,
    (result->'counts_by_type'->'TOTAL'->>'completed')::INTEGER as completed_tickets
FROM (
    SELECT public.rpc_ticketing_overview_v2(30, NULL, NULL, 'super_admin') as result
) t;

\echo ''
\echo '============================================'

-- ============================================
-- Test 4: Verify SLA compliance structure
-- ============================================
\echo 'Test 4: Verify SLA compliance structure'
\echo ''

SELECT
    (result->'sla_compliance'->'RFQ'->'first_response'->>'met')::INTEGER as rfq_fr_met,
    (result->'sla_compliance'->'RFQ'->'first_response'->>'breached')::INTEGER as rfq_fr_breached,
    (result->'sla_compliance'->'RFQ'->'first_quote'->>'met')::INTEGER as rfq_fq_met,
    (result->'sla_compliance'->'RFQ'->'first_quote'->>'breached')::INTEGER as rfq_fq_breached,
    (result->'sla_compliance'->'GEN'->'first_response'->>'met')::INTEGER as gen_fr_met,
    (result->'sla_compliance'->'GEN'->'first_response'->>'breached')::INTEGER as gen_fr_breached
FROM (
    SELECT public.rpc_ticketing_overview_v2(30, NULL, NULL, 'super_admin') as result
) t;

\echo ''
\echo '============================================'

-- ============================================
-- Test 5: Verify quotation analytics structure
-- ============================================
\echo 'Test 5: Verify quotation analytics structure'
\echo ''

SELECT
    (result->'quotation_analytics'->'summary'->>'total')::INTEGER as total_quotations,
    (result->'quotation_analytics'->'summary'->>'sent')::INTEGER as sent,
    (result->'quotation_analytics'->'summary'->>'accepted')::INTEGER as accepted,
    (result->'quotation_analytics'->'summary'->>'rejected')::INTEGER as rejected,
    (result->'quotation_analytics'->'conversion'->>'sent_to_accepted')::NUMERIC as conversion_rate,
    (result->'quotation_analytics'->'value'->>'accepted')::NUMERIC as accepted_value
FROM (
    SELECT public.rpc_ticketing_overview_v2(30, NULL, NULL, 'super_admin') as result
) t;

\echo ''
\echo '============================================'

-- ============================================
-- Test 6: Verify ops cost analytics structure
-- ============================================
\echo 'Test 6: Verify ops cost analytics structure'
\echo ''

SELECT
    (result->'ops_cost_analytics'->'summary'->>'total')::INTEGER as total_costs,
    (result->'ops_cost_analytics'->'summary'->>'submitted')::INTEGER as submitted,
    (result->'ops_cost_analytics'->'summary'->>'accepted')::INTEGER as accepted,
    (result->'ops_cost_analytics'->'summary'->>'rejected')::INTEGER as rejected,
    (result->'ops_cost_analytics'->>'approval_rate')::NUMERIC as approval_rate,
    (result->'ops_cost_analytics'->'turnaround'->>'avg_seconds')::INTEGER as avg_turnaround_seconds
FROM (
    SELECT public.rpc_ticketing_overview_v2(30, NULL, NULL, 'super_admin') as result
) t;

\echo ''
\echo '============================================'

-- ============================================
-- Test 7: Verify leaderboards structure
-- ============================================
\echo 'Test 7: Verify leaderboards structure'
\echo ''

SELECT
    jsonb_array_length(result->'leaderboards'->'by_completion') as completion_leaderboard_count,
    jsonb_array_length(result->'leaderboards'->'by_response_speed') as response_speed_leaderboard_count,
    jsonb_array_length(result->'leaderboards'->'by_quotes') as quotes_leaderboard_count,
    jsonb_array_length(result->'leaderboards'->'by_win_rate') as win_rate_leaderboard_count
FROM (
    SELECT public.rpc_ticketing_overview_v2(30, NULL, NULL, 'super_admin') as result
) t;

\echo ''
\echo '============================================'

-- ============================================
-- Test 8: Verify response time metrics
-- ============================================
\echo 'Test 8: Verify response time metrics'
\echo ''

SELECT
    (result->'response_time_metrics'->'RFQ'->'first_response'->>'count')::INTEGER as rfq_fr_count,
    (result->'response_time_metrics'->'RFQ'->'first_response'->>'avg_seconds')::INTEGER as rfq_fr_avg,
    (result->'response_time_metrics'->'GEN'->'first_response'->>'count')::INTEGER as gen_fr_count,
    (result->'response_time_metrics'->'GEN'->'first_response'->>'avg_seconds')::INTEGER as gen_fr_avg,
    (result->'response_time_metrics'->'TOTAL'->'first_response'->>'count')::INTEGER as total_fr_count
FROM (
    SELECT public.rpc_ticketing_overview_v2(30, NULL, NULL, 'super_admin') as result
) t;

\echo ''
\echo '============================================'
\echo 'ALL TESTS COMPLETE'
\echo '============================================'
