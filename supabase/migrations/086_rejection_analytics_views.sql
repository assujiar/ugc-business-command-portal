-- ============================================
-- Migration: 086_rejection_analytics_views.sql
--
-- PURPOSE: Issue 11 - Add rejection reasons analytics for overview dashboard
-- - Ops cost rejection breakdown by reason type
-- - Customer quotation rejection breakdown
-- - Aggregated analytics per department and per user
-- ============================================

-- ============================================
-- 1. VIEW: Ops Cost Rejection Analytics
-- Aggregates rejection reasons from ticket_rate_quotes
-- ============================================

CREATE OR REPLACE VIEW public.v_ops_cost_rejection_analytics AS
SELECT
    trq.rejection_reason_type,
    COUNT(*) as rejection_count,
    COUNT(DISTINCT trq.ticket_id) as tickets_affected,
    COUNT(DISTINCT t.assigned_to) as assignees_affected,
    AVG(trq.amount) as avg_rejected_amount,
    SUM(trq.amount) as total_rejected_amount,
    -- Department breakdown
    p.department as assignee_department,
    -- Time-based aggregation
    DATE_TRUNC('day', trq.updated_at) as rejection_date,
    DATE_TRUNC('week', trq.updated_at) as rejection_week,
    DATE_TRUNC('month', trq.updated_at) as rejection_month
FROM public.ticket_rate_quotes trq
LEFT JOIN public.tickets t ON trq.ticket_id = t.id
LEFT JOIN public.profiles p ON t.assigned_to = p.user_id
WHERE trq.status = 'rejected'
AND trq.rejection_reason_type IS NOT NULL
GROUP BY
    trq.rejection_reason_type,
    p.department,
    DATE_TRUNC('day', trq.updated_at),
    DATE_TRUNC('week', trq.updated_at),
    DATE_TRUNC('month', trq.updated_at);

COMMENT ON VIEW public.v_ops_cost_rejection_analytics IS
'Analytics view for ops cost rejections, aggregated by rejection reason type, department, and time period.
Used by Issue 11 overview dashboard for rejection analytics section.';

-- ============================================
-- 2. VIEW: Customer Quotation Rejection Analytics
-- Aggregates rejection data from customer_quotations
-- ============================================

CREATE OR REPLACE VIEW public.v_customer_quotation_rejection_analytics AS
SELECT
    cq.rejection_reason,
    COUNT(*) as rejection_count,
    COUNT(DISTINCT cq.ticket_id) as tickets_affected,
    COUNT(DISTINCT cq.lead_id) as leads_affected,
    COUNT(DISTINCT cq.opportunity_id) as opportunities_affected,
    AVG(cq.total_selling_rate) as avg_rejected_value,
    SUM(cq.total_selling_rate) as total_rejected_value,
    -- Source type breakdown
    cq.source_type,
    -- Creator department
    p.department as creator_department,
    -- Time-based aggregation
    DATE_TRUNC('day', cq.updated_at) as rejection_date,
    DATE_TRUNC('week', cq.updated_at) as rejection_week,
    DATE_TRUNC('month', cq.updated_at) as rejection_month
FROM public.customer_quotations cq
LEFT JOIN public.profiles p ON cq.created_by = p.user_id
WHERE cq.status = 'rejected'
GROUP BY
    cq.rejection_reason,
    cq.source_type,
    p.department,
    DATE_TRUNC('day', cq.updated_at),
    DATE_TRUNC('week', cq.updated_at),
    DATE_TRUNC('month', cq.updated_at);

COMMENT ON VIEW public.v_customer_quotation_rejection_analytics IS
'Analytics view for customer quotation rejections, aggregated by rejection reason, source type, department, and time period.
Used by Issue 11 overview dashboard for rejection analytics section.';

-- ============================================
-- 3. FUNCTION: Get Rejection Analytics Summary
-- Returns comprehensive rejection analytics for dashboard
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_get_rejection_analytics(
    p_period_days INTEGER DEFAULT 30,
    p_department TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_start_date TIMESTAMPTZ;
    v_result JSONB;
    v_ops_cost_rejections JSONB;
    v_quotation_rejections JSONB;
    v_ops_by_reason JSONB;
    v_quotation_by_reason JSONB;
    v_ops_by_department JSONB;
    v_quotation_by_department JSONB;
    v_ops_trend JSONB;
    v_quotation_trend JSONB;
BEGIN
    v_start_date := NOW() - (p_period_days || ' days')::INTERVAL;

    -- Ops Cost Rejection Summary
    SELECT jsonb_build_object(
        'total_rejections', COUNT(*),
        'total_amount', COALESCE(SUM(amount), 0),
        'avg_amount', COALESCE(AVG(amount), 0),
        'unique_tickets', COUNT(DISTINCT ticket_id)
    ) INTO v_ops_cost_rejections
    FROM public.ticket_rate_quotes
    WHERE status = 'rejected'
    AND updated_at >= v_start_date
    AND (p_department IS NULL OR EXISTS (
        SELECT 1 FROM public.tickets t
        JOIN public.profiles p ON t.assigned_to = p.user_id
        WHERE t.id = ticket_rate_quotes.ticket_id
        AND p.department = p_department
    ));

    -- Ops Cost by Reason Type
    SELECT COALESCE(jsonb_object_agg(
        COALESCE(rejection_reason_type::TEXT, 'unknown'),
        jsonb_build_object(
            'count', count,
            'amount', total_amount,
            'percentage', ROUND((count::NUMERIC / NULLIF(SUM(count) OVER (), 0)) * 100, 1)
        )
    ), '{}'::JSONB) INTO v_ops_by_reason
    FROM (
        SELECT
            rejection_reason_type,
            COUNT(*) as count,
            SUM(amount) as total_amount
        FROM public.ticket_rate_quotes
        WHERE status = 'rejected'
        AND updated_at >= v_start_date
        AND (p_department IS NULL OR EXISTS (
            SELECT 1 FROM public.tickets t
            JOIN public.profiles p ON t.assigned_to = p.user_id
            WHERE t.id = ticket_rate_quotes.ticket_id
            AND p.department = p_department
        ))
        GROUP BY rejection_reason_type
    ) sub;

    -- Ops Cost by Department
    SELECT COALESCE(jsonb_object_agg(
        COALESCE(department, 'unknown'),
        jsonb_build_object(
            'count', count,
            'amount', total_amount
        )
    ), '{}'::JSONB) INTO v_ops_by_department
    FROM (
        SELECT
            p.department,
            COUNT(*) as count,
            SUM(trq.amount) as total_amount
        FROM public.ticket_rate_quotes trq
        JOIN public.tickets t ON trq.ticket_id = t.id
        LEFT JOIN public.profiles p ON t.assigned_to = p.user_id
        WHERE trq.status = 'rejected'
        AND trq.updated_at >= v_start_date
        GROUP BY p.department
    ) sub;

    -- Ops Cost Weekly Trend (last 4 weeks)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'week', week_start,
            'count', count,
            'amount', total_amount
        ) ORDER BY week_start
    ), '[]'::JSONB) INTO v_ops_trend
    FROM (
        SELECT
            DATE_TRUNC('week', updated_at)::DATE as week_start,
            COUNT(*) as count,
            SUM(amount) as total_amount
        FROM public.ticket_rate_quotes
        WHERE status = 'rejected'
        AND updated_at >= NOW() - INTERVAL '4 weeks'
        GROUP BY DATE_TRUNC('week', updated_at)
    ) sub;

    -- Customer Quotation Rejection Summary
    SELECT jsonb_build_object(
        'total_rejections', COUNT(*),
        'total_value', COALESCE(SUM(total_selling_rate), 0),
        'avg_value', COALESCE(AVG(total_selling_rate), 0),
        'unique_opportunities', COUNT(DISTINCT opportunity_id),
        'unique_leads', COUNT(DISTINCT lead_id)
    ) INTO v_quotation_rejections
    FROM public.customer_quotations
    WHERE status = 'rejected'
    AND updated_at >= v_start_date
    AND (p_department IS NULL OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.user_id = customer_quotations.created_by
        AND p.department = p_department
    ));

    -- Customer Quotation by Reason
    SELECT COALESCE(jsonb_object_agg(
        COALESCE(rejection_reason, 'unspecified'),
        jsonb_build_object(
            'count', count,
            'value', total_value,
            'percentage', ROUND((count::NUMERIC / NULLIF(SUM(count) OVER (), 0)) * 100, 1)
        )
    ), '{}'::JSONB) INTO v_quotation_by_reason
    FROM (
        SELECT
            COALESCE(rejection_reason, 'unspecified') as rejection_reason,
            COUNT(*) as count,
            SUM(total_selling_rate) as total_value
        FROM public.customer_quotations
        WHERE status = 'rejected'
        AND updated_at >= v_start_date
        AND (p_department IS NULL OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = customer_quotations.created_by
            AND p.department = p_department
        ))
        GROUP BY COALESCE(rejection_reason, 'unspecified')
    ) sub;

    -- Customer Quotation by Department
    SELECT COALESCE(jsonb_object_agg(
        COALESCE(department, 'unknown'),
        jsonb_build_object(
            'count', count,
            'value', total_value
        )
    ), '{}'::JSONB) INTO v_quotation_by_department
    FROM (
        SELECT
            p.department,
            COUNT(*) as count,
            SUM(cq.total_selling_rate) as total_value
        FROM public.customer_quotations cq
        LEFT JOIN public.profiles p ON cq.created_by = p.user_id
        WHERE cq.status = 'rejected'
        AND cq.updated_at >= v_start_date
        GROUP BY p.department
    ) sub;

    -- Customer Quotation Weekly Trend (last 4 weeks)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'week', week_start,
            'count', count,
            'value', total_value
        ) ORDER BY week_start
    ), '[]'::JSONB) INTO v_quotation_trend
    FROM (
        SELECT
            DATE_TRUNC('week', updated_at)::DATE as week_start,
            COUNT(*) as count,
            SUM(total_selling_rate) as total_value
        FROM public.customer_quotations
        WHERE status = 'rejected'
        AND updated_at >= NOW() - INTERVAL '4 weeks'
        GROUP BY DATE_TRUNC('week', updated_at)
    ) sub;

    -- Build final result
    v_result := jsonb_build_object(
        'period_days', p_period_days,
        'department_filter', p_department,
        'ops_cost_rejections', jsonb_build_object(
            'summary', v_ops_cost_rejections,
            'by_reason', v_ops_by_reason,
            'by_department', v_ops_by_department,
            'weekly_trend', v_ops_trend
        ),
        'quotation_rejections', jsonb_build_object(
            'summary', v_quotation_rejections,
            'by_reason', v_quotation_by_reason,
            'by_department', v_quotation_by_department,
            'weekly_trend', v_quotation_trend
        )
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_get_rejection_analytics IS
'Returns comprehensive rejection analytics for dashboard (Issue 11).
Includes ops cost rejections and customer quotation rejections,
broken down by reason type, department, and weekly trend.';

GRANT EXECUTE ON FUNCTION public.rpc_get_rejection_analytics(INTEGER, TEXT) TO authenticated;

-- ============================================
-- 4. VIEW: Leaderboard Rankings by Role
-- Provides role-specific leaderboards
-- ============================================

CREATE OR REPLACE VIEW public.v_ticketing_leaderboard AS
WITH user_metrics AS (
    SELECT
        p.user_id,
        p.name as name,
        p.role,
        p.department,
        -- As Assignee metrics
        COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id THEN t.id END) as tickets_assigned,
        COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id AND t.status IN ('resolved', 'closed') THEN t.id END) as tickets_completed,
        -- Response times (as assignee)
        AVG(CASE WHEN tr.user_id = p.user_id AND tr.responder_role = 'assignee'
            THEN tr.response_time_seconds END) as avg_first_response_seconds,
        COUNT(CASE WHEN tr.user_id = p.user_id AND tr.responder_role = 'assignee' THEN 1 END) as first_response_count,
        -- Quotes submitted (OPS role)
        COUNT(DISTINCT CASE WHEN trq.created_by = p.user_id AND trq.status IN ('submitted', 'sent_to_customer', 'accepted')
            THEN trq.id END) as quotes_submitted,
        -- Win rate (for tickets assigned)
        COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id AND t.close_outcome = 'won' THEN t.id END) as tickets_won,
        COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id AND t.close_outcome = 'lost' THEN t.id END) as tickets_lost
    FROM public.profiles p
    LEFT JOIN public.tickets t ON t.assigned_to = p.user_id OR t.created_by = p.user_id
    LEFT JOIN public.ticket_responses tr ON tr.ticket_id = t.id AND tr.user_id = p.user_id
    LEFT JOIN public.ticket_rate_quotes trq ON trq.ticket_id = t.id
    WHERE t.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY p.user_id, p.name, p.role, p.department
)
SELECT
    user_id,
    name,
    role,
    department,
    tickets_assigned,
    tickets_completed,
    CASE WHEN tickets_assigned > 0
        THEN ROUND((tickets_completed::NUMERIC / tickets_assigned) * 100, 1)
        ELSE 0 END as completion_rate,
    avg_first_response_seconds,
    first_response_count,
    quotes_submitted,
    tickets_won,
    tickets_lost,
    CASE WHEN (tickets_won + tickets_lost) > 0
        THEN ROUND((tickets_won::NUMERIC / (tickets_won + tickets_lost)) * 100, 1)
        ELSE 0 END as win_rate,
    -- Rankings
    ROW_NUMBER() OVER (ORDER BY tickets_completed DESC NULLS LAST) as rank_by_completion,
    ROW_NUMBER() OVER (ORDER BY avg_first_response_seconds ASC NULLS LAST) as rank_by_response_speed,
    ROW_NUMBER() OVER (ORDER BY
        CASE WHEN (tickets_won + tickets_lost) > 0
            THEN (tickets_won::NUMERIC / (tickets_won + tickets_lost))
            ELSE 0 END DESC NULLS LAST) as rank_by_win_rate,
    ROW_NUMBER() OVER (ORDER BY quotes_submitted DESC NULLS LAST) as rank_by_quotes
FROM user_metrics
WHERE tickets_assigned > 0 OR quotes_submitted > 0;

COMMENT ON VIEW public.v_ticketing_leaderboard IS
'Leaderboard view for ticketing performance rankings.
Provides rankings by completion, response speed, win rate, and quotes submitted.
Used by Issue 11 overview dashboard for leaderboard section.';

-- ============================================
-- SUMMARY
-- ============================================
-- Issue 11: Added analytics views and functions for overview dashboard:
-- 1. v_ops_cost_rejection_analytics - Ops cost rejection breakdown
-- 2. v_customer_quotation_rejection_analytics - Customer quotation rejection breakdown
-- 3. rpc_get_rejection_analytics - Comprehensive rejection analytics RPC
-- 4. v_ticketing_leaderboard - Role-specific leaderboard rankings
-- ============================================
