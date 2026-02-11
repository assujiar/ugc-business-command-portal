-- ============================================
-- Migration: 077_sla_analytics_views_and_functions.sql
--
-- SLA Analytics Views and Functions
-- Provides simplified analytics broken down by:
-- - Roles (ops, salesperson, marcomm, etc.)
-- - Ticket type (RFQ vs general)
-- - Per user, per department, per company
--
-- Metrics computed:
-- 1. Creator Avg Stage Response
-- 2. Assignee Avg First Time Response
-- 3. Assignee Avg Stage Response
-- 4. Assignee Avg Resolution Time
-- 5. Ops Avg First Quote
-- 6. Operational Cost Acceptance Rate
-- 7. SLA Compliance - Stage Response (< 1 hour)
-- 8. SLA Compliance - Resolution (< 24 hours)
-- ============================================

-- ============================================
-- 1. HELPER: Get user role category
-- ============================================

CREATE OR REPLACE FUNCTION public.get_role_category(p_role TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE
        WHEN p_role IN ('EXIM Ops', 'domestics Ops', 'Import DTD Ops', 'traffic & warehous') THEN 'Ops'
        WHEN p_role IN ('salesperson', 'sales manager', 'sales support') THEN 'Sales'
        WHEN p_role IN ('Marcomm', 'Marketing Manager', 'MACX') THEN 'Marketing'
        WHEN p_role IN ('DGO', 'VDCO') THEN 'Operations Support'
        WHEN p_role IN ('finance') THEN 'Finance'
        WHEN p_role IN ('Director', 'super admin') THEN 'Management'
        ELSE 'Other'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_role_category IS 'Categorizes user roles into departments';

-- ============================================
-- 2. VIEW: User SLA Metrics Summary
-- Per-user aggregated metrics
-- ============================================

CREATE OR REPLACE VIEW public.vw_user_sla_metrics AS
WITH user_creator_metrics AS (
    -- Metrics for tickets created by each user
    SELECT
        t.created_by as user_id,
        t.ticket_type::TEXT as ticket_type,
        COUNT(DISTINCT t.id) as tickets_created,
        AVG(trm.creator_avg_business_response_seconds) as avg_stage_response_seconds,
        COUNT(DISTINCT t.id) FILTER (WHERE trm.creator_avg_business_response_seconds <= 3600) as sla_stage_response_met,
        COUNT(DISTINCT t.id) FILTER (WHERE trm.creator_avg_business_response_seconds > 3600) as sla_stage_response_breached
    FROM public.tickets t
    LEFT JOIN public.ticket_response_metrics trm ON trm.ticket_id = t.id
    WHERE t.created_by IS NOT NULL
    GROUP BY t.created_by, t.ticket_type::TEXT
),
user_assignee_metrics AS (
    -- Metrics for tickets assigned to each user
    SELECT
        t.assigned_to as user_id,
        t.ticket_type::TEXT as ticket_type,
        COUNT(DISTINCT t.id) as tickets_assigned,
        AVG(trm.assignee_first_response_business_seconds) as avg_first_response_seconds,
        AVG(trm.assignee_avg_business_response_seconds) as avg_stage_response_seconds,
        AVG(trm.time_to_resolution_business_seconds) as avg_resolution_seconds,
        COUNT(DISTINCT t.id) FILTER (WHERE trm.assignee_first_response_business_seconds <= 14400) as sla_first_response_met, -- 4 hours
        COUNT(DISTINCT t.id) FILTER (WHERE trm.assignee_first_response_business_seconds > 14400) as sla_first_response_breached,
        COUNT(DISTINCT t.id) FILTER (WHERE trm.assignee_avg_business_response_seconds <= 3600) as sla_stage_response_met,
        COUNT(DISTINCT t.id) FILTER (WHERE trm.time_to_resolution_business_seconds <= 86400) as sla_resolution_met, -- 24 hours
        COUNT(DISTINCT t.id) FILTER (WHERE trm.time_to_resolution_business_seconds > 86400) as sla_resolution_breached
    FROM public.tickets t
    LEFT JOIN public.ticket_response_metrics trm ON trm.ticket_id = t.id
    WHERE t.assigned_to IS NOT NULL
    GROUP BY t.assigned_to, t.ticket_type::TEXT
),
ops_quote_metrics AS (
    -- First quote metrics for Ops users
    SELECT
        trq.created_by as user_id,
        t.ticket_type::TEXT as ticket_type,
        COUNT(DISTINCT trq.id) as total_quotes,
        AVG(EXTRACT(EPOCH FROM (trq.created_at - t.created_at))) as avg_first_quote_seconds,
        COUNT(DISTINCT trq.id) FILTER (
            WHERE EXTRACT(EPOCH FROM (trq.created_at - t.created_at)) <= 14400
        ) as sla_first_quote_met, -- 4 hours
        COUNT(DISTINCT trq.id) FILTER (
            WHERE EXTRACT(EPOCH FROM (trq.created_at - t.created_at)) > 14400
        ) as sla_first_quote_breached
    FROM public.ticket_rate_quotes trq
    JOIN public.tickets t ON t.id = trq.ticket_id
    WHERE trq.created_by IS NOT NULL
    GROUP BY trq.created_by, t.ticket_type::TEXT
),
ops_cost_acceptance AS (
    -- Operational cost acceptance rate
    SELECT
        trq.created_by as user_id,
        COUNT(*) as total_costs,
        COUNT(*) FILTER (WHERE trq.status = 'accepted') as accepted_costs,
        COUNT(*) FILTER (WHERE trq.status = 'rejected') as rejected_costs
    FROM public.ticket_rate_quotes trq
    WHERE trq.status IN ('accepted', 'rejected')
    GROUP BY trq.created_by
)
SELECT
    p.user_id,
    p.name as user_name,
    p.role as user_role,
    public.get_role_category(p.role::TEXT) as role_category,
    COALESCE(ucm.ticket_type, uam.ticket_type, oqm.ticket_type) as ticket_type,

    -- Creator metrics
    COALESCE(ucm.tickets_created, 0) as tickets_created,
    COALESCE(ucm.avg_stage_response_seconds, 0)::INTEGER as creator_avg_stage_response_seconds,
    COALESCE(ucm.sla_stage_response_met, 0) as creator_sla_stage_response_met,
    COALESCE(ucm.sla_stage_response_breached, 0) as creator_sla_stage_response_breached,

    -- Assignee metrics
    COALESCE(uam.tickets_assigned, 0) as tickets_assigned,
    COALESCE(uam.avg_first_response_seconds, 0)::INTEGER as assignee_avg_first_response_seconds,
    COALESCE(uam.avg_stage_response_seconds, 0)::INTEGER as assignee_avg_stage_response_seconds,
    COALESCE(uam.avg_resolution_seconds, 0)::INTEGER as assignee_avg_resolution_seconds,
    COALESCE(uam.sla_first_response_met, 0) as assignee_sla_first_response_met,
    COALESCE(uam.sla_first_response_breached, 0) as assignee_sla_first_response_breached,
    COALESCE(uam.sla_stage_response_met, 0) as assignee_sla_stage_response_met,
    COALESCE(uam.sla_resolution_met, 0) as assignee_sla_resolution_met,
    COALESCE(uam.sla_resolution_breached, 0) as assignee_sla_resolution_breached,

    -- Ops quote metrics
    COALESCE(oqm.total_quotes, 0) as ops_total_quotes,
    COALESCE(oqm.avg_first_quote_seconds, 0)::INTEGER as ops_avg_first_quote_seconds,
    COALESCE(oqm.sla_first_quote_met, 0) as ops_sla_first_quote_met,
    COALESCE(oqm.sla_first_quote_breached, 0) as ops_sla_first_quote_breached,

    -- Ops cost acceptance
    COALESCE(oca.total_costs, 0) as ops_total_costs,
    COALESCE(oca.accepted_costs, 0) as ops_accepted_costs,
    COALESCE(oca.rejected_costs, 0) as ops_rejected_costs,
    CASE WHEN COALESCE(oca.total_costs, 0) > 0
        THEN ROUND(COALESCE(oca.accepted_costs, 0)::NUMERIC / oca.total_costs * 100, 2)
        ELSE 0
    END as ops_acceptance_rate_percent

FROM public.profiles p
LEFT JOIN user_creator_metrics ucm ON ucm.user_id = p.user_id
LEFT JOIN user_assignee_metrics uam ON uam.user_id = p.user_id AND uam.ticket_type = COALESCE(ucm.ticket_type, uam.ticket_type)
LEFT JOIN ops_quote_metrics oqm ON oqm.user_id = p.user_id AND oqm.ticket_type = COALESCE(ucm.ticket_type, uam.ticket_type, oqm.ticket_type)
LEFT JOIN ops_cost_acceptance oca ON oca.user_id = p.user_id
WHERE ucm.user_id IS NOT NULL OR uam.user_id IS NOT NULL OR oqm.user_id IS NOT NULL OR oca.user_id IS NOT NULL;

COMMENT ON VIEW public.vw_user_sla_metrics IS 'Aggregated SLA metrics per user, broken down by ticket type';

-- ============================================
-- 3. VIEW: Department SLA Metrics Summary
-- Per-department aggregated metrics
-- ============================================

CREATE OR REPLACE VIEW public.vw_department_sla_metrics AS
SELECT
    public.get_role_category(p.role::TEXT) as department,
    usm.ticket_type,
    COUNT(DISTINCT usm.user_id) as total_users,

    -- Creator metrics
    SUM(usm.tickets_created) as total_tickets_created,
    AVG(usm.creator_avg_stage_response_seconds)::INTEGER as avg_creator_stage_response_seconds,
    SUM(usm.creator_sla_stage_response_met) as creator_sla_met,
    SUM(usm.creator_sla_stage_response_breached) as creator_sla_breached,

    -- Assignee metrics
    SUM(usm.tickets_assigned) as total_tickets_assigned,
    AVG(usm.assignee_avg_first_response_seconds)::INTEGER as avg_first_response_seconds,
    AVG(usm.assignee_avg_stage_response_seconds)::INTEGER as avg_stage_response_seconds,
    AVG(usm.assignee_avg_resolution_seconds)::INTEGER as avg_resolution_seconds,
    SUM(usm.assignee_sla_first_response_met) as first_response_sla_met,
    SUM(usm.assignee_sla_first_response_breached) as first_response_sla_breached,
    SUM(usm.assignee_sla_resolution_met) as resolution_sla_met,
    SUM(usm.assignee_sla_resolution_breached) as resolution_sla_breached,

    -- Ops metrics
    SUM(usm.ops_total_quotes) as total_quotes,
    AVG(usm.ops_avg_first_quote_seconds)::INTEGER as avg_first_quote_seconds,
    SUM(usm.ops_accepted_costs) as total_accepted_costs,
    SUM(usm.ops_rejected_costs) as total_rejected_costs,
    CASE WHEN SUM(usm.ops_total_costs) > 0
        THEN ROUND(SUM(usm.ops_accepted_costs)::NUMERIC / SUM(usm.ops_total_costs) * 100, 2)
        ELSE 0
    END as cost_acceptance_rate_percent

FROM public.vw_user_sla_metrics usm
JOIN public.profiles p ON p.user_id = usm.user_id
GROUP BY public.get_role_category(p.role::TEXT), usm.ticket_type;

COMMENT ON VIEW public.vw_department_sla_metrics IS 'Aggregated SLA metrics per department, broken down by ticket type';

-- ============================================
-- 4. VIEW: Company-wide SLA Metrics Summary
-- ============================================

CREATE OR REPLACE VIEW public.vw_company_sla_metrics AS
SELECT
    dsm.ticket_type,
    SUM(dsm.total_users) as total_users,
    SUM(dsm.total_tickets_created) as total_tickets_created,
    SUM(dsm.total_tickets_assigned) as total_tickets_assigned,
    AVG(dsm.avg_first_response_seconds)::INTEGER as avg_first_response_seconds,
    AVG(dsm.avg_stage_response_seconds)::INTEGER as avg_stage_response_seconds,
    AVG(dsm.avg_resolution_seconds)::INTEGER as avg_resolution_seconds,
    AVG(dsm.avg_first_quote_seconds)::INTEGER as avg_first_quote_seconds,
    SUM(dsm.first_response_sla_met) as first_response_sla_met,
    SUM(dsm.first_response_sla_breached) as first_response_sla_breached,
    SUM(dsm.resolution_sla_met) as resolution_sla_met,
    SUM(dsm.resolution_sla_breached) as resolution_sla_breached,
    SUM(dsm.total_accepted_costs) as total_accepted_costs,
    SUM(dsm.total_rejected_costs) as total_rejected_costs,
    CASE WHEN (SUM(dsm.total_accepted_costs) + SUM(dsm.total_rejected_costs)) > 0
        THEN ROUND(SUM(dsm.total_accepted_costs)::NUMERIC / (SUM(dsm.total_accepted_costs) + SUM(dsm.total_rejected_costs)) * 100, 2)
        ELSE 0
    END as cost_acceptance_rate_percent
FROM public.vw_department_sla_metrics dsm
GROUP BY dsm.ticket_type;

COMMENT ON VIEW public.vw_company_sla_metrics IS 'Company-wide aggregated SLA metrics, broken down by ticket type';

-- ============================================
-- 5. RPC: Get SLA Metrics with Date Filter
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_get_sla_metrics(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_department TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_ticket_type TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_user_metrics JSONB;
    v_department_metrics JSONB;
    v_company_metrics JSONB;
    v_ticket_details JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- User metrics
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'user_id', usm.user_id,
            'user_name', usm.user_name,
            'user_role', usm.user_role,
            'role_category', usm.role_category,
            'ticket_type', usm.ticket_type,
            'tickets_created', usm.tickets_created,
            'tickets_assigned', usm.tickets_assigned,
            'creator_avg_stage_response_seconds', usm.creator_avg_stage_response_seconds,
            'creator_avg_stage_response_formatted', public.format_duration(usm.creator_avg_stage_response_seconds),
            'assignee_avg_first_response_seconds', usm.assignee_avg_first_response_seconds,
            'assignee_avg_first_response_formatted', public.format_duration(usm.assignee_avg_first_response_seconds),
            'assignee_avg_stage_response_seconds', usm.assignee_avg_stage_response_seconds,
            'assignee_avg_stage_response_formatted', public.format_duration(usm.assignee_avg_stage_response_seconds),
            'assignee_avg_resolution_seconds', usm.assignee_avg_resolution_seconds,
            'assignee_avg_resolution_formatted', public.format_duration(usm.assignee_avg_resolution_seconds),
            'ops_avg_first_quote_seconds', usm.ops_avg_first_quote_seconds,
            'ops_avg_first_quote_formatted', public.format_duration(usm.ops_avg_first_quote_seconds),
            'ops_acceptance_rate_percent', usm.ops_acceptance_rate_percent,
            'sla_compliance', jsonb_build_object(
                'first_response_met', usm.assignee_sla_first_response_met,
                'first_response_breached', usm.assignee_sla_first_response_breached,
                'stage_response_met', usm.assignee_sla_stage_response_met,
                'resolution_met', usm.assignee_sla_resolution_met,
                'resolution_breached', usm.assignee_sla_resolution_breached
            )
        ) ORDER BY usm.role_category, usm.user_name
    ), '[]'::jsonb) INTO v_user_metrics
    FROM public.vw_user_sla_metrics usm
    WHERE (p_department IS NULL OR usm.role_category = p_department)
    AND (p_user_id IS NULL OR usm.user_id = p_user_id)
    AND (p_ticket_type IS NULL OR usm.ticket_type = p_ticket_type OR p_ticket_type = 'All');

    -- Department metrics
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'department', dsm.department,
            'ticket_type', dsm.ticket_type,
            'total_users', dsm.total_users,
            'total_tickets_created', dsm.total_tickets_created,
            'total_tickets_assigned', dsm.total_tickets_assigned,
            'avg_first_response_seconds', dsm.avg_first_response_seconds,
            'avg_first_response_formatted', public.format_duration(dsm.avg_first_response_seconds),
            'avg_stage_response_seconds', dsm.avg_stage_response_seconds,
            'avg_stage_response_formatted', public.format_duration(dsm.avg_stage_response_seconds),
            'avg_resolution_seconds', dsm.avg_resolution_seconds,
            'avg_resolution_formatted', public.format_duration(dsm.avg_resolution_seconds),
            'avg_first_quote_seconds', dsm.avg_first_quote_seconds,
            'avg_first_quote_formatted', public.format_duration(dsm.avg_first_quote_seconds),
            'cost_acceptance_rate_percent', dsm.cost_acceptance_rate_percent,
            'sla_compliance', jsonb_build_object(
                'first_response_met', dsm.first_response_sla_met,
                'first_response_breached', dsm.first_response_sla_breached,
                'resolution_met', dsm.resolution_sla_met,
                'resolution_breached', dsm.resolution_sla_breached
            )
        ) ORDER BY dsm.department
    ), '[]'::jsonb) INTO v_department_metrics
    FROM public.vw_department_sla_metrics dsm
    WHERE (p_department IS NULL OR dsm.department = p_department)
    AND (p_ticket_type IS NULL OR dsm.ticket_type = p_ticket_type OR p_ticket_type = 'All');

    -- Company metrics
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'ticket_type', csm.ticket_type,
            'total_users', csm.total_users,
            'total_tickets_created', csm.total_tickets_created,
            'total_tickets_assigned', csm.total_tickets_assigned,
            'avg_first_response_seconds', csm.avg_first_response_seconds,
            'avg_first_response_formatted', public.format_duration(csm.avg_first_response_seconds),
            'avg_stage_response_seconds', csm.avg_stage_response_seconds,
            'avg_stage_response_formatted', public.format_duration(csm.avg_stage_response_seconds),
            'avg_resolution_seconds', csm.avg_resolution_seconds,
            'avg_resolution_formatted', public.format_duration(csm.avg_resolution_seconds),
            'avg_first_quote_seconds', csm.avg_first_quote_seconds,
            'avg_first_quote_formatted', public.format_duration(csm.avg_first_quote_seconds),
            'cost_acceptance_rate_percent', csm.cost_acceptance_rate_percent,
            'sla_compliance', jsonb_build_object(
                'first_response_met', csm.first_response_sla_met,
                'first_response_breached', csm.first_response_sla_breached,
                'resolution_met', csm.resolution_sla_met,
                'resolution_breached', csm.resolution_sla_breached
            )
        )
    ), '[]'::jsonb) INTO v_company_metrics
    FROM public.vw_company_sla_metrics csm
    WHERE (p_ticket_type IS NULL OR csm.ticket_type = p_ticket_type OR p_ticket_type = 'All');

    RETURN jsonb_build_object(
        'success', TRUE,
        'filters', jsonb_build_object(
            'start_date', p_start_date,
            'end_date', p_end_date,
            'department', p_department,
            'user_id', p_user_id,
            'ticket_type', p_ticket_type
        ),
        'user_metrics', v_user_metrics,
        'department_metrics', v_department_metrics,
        'company_metrics', v_company_metrics
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.rpc_get_sla_metrics IS 'Get SLA metrics with optional filters';

-- ============================================
-- 6. RPC: Get Tickets for SLA Compliance Drill-down
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_get_sla_compliance_tickets(
    p_user_id UUID DEFAULT NULL,
    p_sla_type TEXT DEFAULT 'first_response', -- 'first_response', 'stage_response', 'resolution'
    p_status TEXT DEFAULT 'all', -- 'met', 'breached', 'all'
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_tickets JSONB;
    v_total_count INTEGER;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get tickets based on SLA criteria
    WITH filtered_tickets AS (
        SELECT
            t.id,
            t.ticket_code,
            t.subject,
            t.status::TEXT as status,
            t.ticket_type::TEXT as ticket_type,
            t.created_at,
            t.resolved_at,
            trm.assignee_first_response_business_seconds,
            trm.assignee_avg_business_response_seconds,
            trm.time_to_resolution_business_seconds,
            creator.name as creator_name,
            assignee.name as assignee_name,
            CASE
                WHEN p_sla_type = 'first_response' THEN
                    CASE WHEN trm.assignee_first_response_business_seconds <= 14400 THEN 'met' ELSE 'breached' END
                WHEN p_sla_type = 'stage_response' THEN
                    CASE WHEN trm.assignee_avg_business_response_seconds <= 3600 THEN 'met' ELSE 'breached' END
                WHEN p_sla_type = 'resolution' THEN
                    CASE WHEN trm.time_to_resolution_business_seconds <= 86400 THEN 'met' ELSE 'breached' END
                ELSE 'unknown'
            END as sla_status
        FROM public.tickets t
        LEFT JOIN public.ticket_response_metrics trm ON trm.ticket_id = t.id
        LEFT JOIN public.profiles creator ON creator.user_id = t.created_by
        LEFT JOIN public.profiles assignee ON assignee.user_id = t.assigned_to
        WHERE (p_user_id IS NULL OR t.created_by = p_user_id OR t.assigned_to = p_user_id)
    )
    SELECT
        jsonb_agg(
            jsonb_build_object(
                'id', ft.id,
                'ticket_code', ft.ticket_code,
                'subject', ft.subject,
                'status', ft.status,
                'ticket_type', ft.ticket_type,
                'created_at', ft.created_at,
                'resolved_at', ft.resolved_at,
                'creator_name', ft.creator_name,
                'assignee_name', ft.assignee_name,
                'sla_status', ft.sla_status,
                'metrics', jsonb_build_object(
                    'first_response_seconds', ft.assignee_first_response_business_seconds,
                    'first_response_formatted', public.format_duration(ft.assignee_first_response_business_seconds),
                    'stage_response_seconds', ft.assignee_avg_business_response_seconds,
                    'stage_response_formatted', public.format_duration(ft.assignee_avg_business_response_seconds),
                    'resolution_seconds', ft.time_to_resolution_business_seconds,
                    'resolution_formatted', public.format_duration(ft.time_to_resolution_business_seconds)
                )
            ) ORDER BY ft.created_at DESC
        ),
        COUNT(*)::INTEGER
    INTO v_tickets, v_total_count
    FROM (
        SELECT * FROM filtered_tickets
        WHERE (p_status = 'all' OR sla_status = p_status)
        LIMIT p_limit OFFSET p_offset
    ) ft;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tickets', COALESCE(v_tickets, '[]'::jsonb),
        'total_count', v_total_count,
        'limit', p_limit,
        'offset', p_offset
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.rpc_get_sla_compliance_tickets IS 'Get tickets for SLA compliance drill-down';

-- ============================================
-- 7. VIEW: User Leaderboard
-- Ranked by SLA performance
-- ============================================

CREATE OR REPLACE VIEW public.vw_user_sla_leaderboard AS
SELECT
    usm.user_id,
    usm.user_name,
    usm.user_role,
    usm.role_category,
    usm.ticket_type,
    usm.tickets_assigned,
    usm.assignee_avg_first_response_seconds,
    usm.assignee_avg_resolution_seconds,
    usm.ops_acceptance_rate_percent,
    -- Calculate overall score (lower is better for response times)
    CASE
        WHEN usm.tickets_assigned = 0 THEN 999999
        ELSE (
            COALESCE(usm.assignee_avg_first_response_seconds, 0) * 0.4 +
            COALESCE(usm.assignee_avg_resolution_seconds, 0) * 0.4 +
            (100 - COALESCE(usm.ops_acceptance_rate_percent, 0)) * 360 -- Convert to seconds scale
        )
    END as performance_score,
    RANK() OVER (
        PARTITION BY usm.role_category, usm.ticket_type
        ORDER BY
            CASE
                WHEN usm.tickets_assigned = 0 THEN 999999
                ELSE (
                    COALESCE(usm.assignee_avg_first_response_seconds, 0) * 0.4 +
                    COALESCE(usm.assignee_avg_resolution_seconds, 0) * 0.4 +
                    (100 - COALESCE(usm.ops_acceptance_rate_percent, 0)) * 360
                )
            END ASC
    ) as department_rank
FROM public.vw_user_sla_metrics usm
WHERE usm.tickets_assigned > 0;

COMMENT ON VIEW public.vw_user_sla_leaderboard IS 'User leaderboard ranked by SLA performance';

-- ============================================
-- 8. VIEW: Ticket Status Distribution
-- ============================================

CREATE OR REPLACE VIEW public.vw_ticket_status_distribution AS
SELECT
    t.status::TEXT as status,
    t.ticket_type::TEXT as ticket_type,
    COUNT(*) as count,
    ROUND(COUNT(*)::NUMERIC / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY t.ticket_type), 0) * 100, 2) as percentage
FROM public.tickets t
GROUP BY t.status, t.ticket_type;

COMMENT ON VIEW public.vw_ticket_status_distribution IS 'Distribution of tickets by status and type';

-- ============================================
-- 9. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_role_category(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_sla_metrics(DATE, DATE, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_sla_compliance_tickets(UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

GRANT SELECT ON public.vw_user_sla_metrics TO authenticated;
GRANT SELECT ON public.vw_department_sla_metrics TO authenticated;
GRANT SELECT ON public.vw_company_sla_metrics TO authenticated;
GRANT SELECT ON public.vw_user_sla_leaderboard TO authenticated;
GRANT SELECT ON public.vw_ticket_status_distribution TO authenticated;
