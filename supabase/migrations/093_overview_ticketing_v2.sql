-- ============================================
-- Migration: 093_overview_ticketing_v2.sql
--
-- PURPOSE: BUG #11 - Comprehensive Overview Ticketing V2
-- Creates a single RPC that returns all dashboard data
--
-- Actual schema used:
-- - ticket_sla_tracking: first_response_met, resolution_met (BOOLEAN)
-- - ticket_response_metrics: assignee_first_response_seconds, time_to_resolution_seconds, etc.
-- - ticket_response_exchanges: exchange_number (INTEGER), raw_response_seconds
-- ============================================

-- ============================================
-- 1. MAIN RPC: Ticketing Overview V2
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticketing_overview_v2(
    p_period_days INTEGER DEFAULT 30,
    p_user_id UUID DEFAULT NULL,
    p_department TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_start_date TIMESTAMPTZ;
    v_user_id UUID;
    v_user_department TEXT;
    v_scope TEXT; -- 'all', 'department', 'user'

    -- Result sections
    v_counts_by_type JSONB;
    v_status_cards JSONB;
    v_response_time_metrics JSONB;
    v_sla_compliance JSONB;
    v_quotation_analytics JSONB;
    v_ops_cost_analytics JSONB;
    v_leaderboards JSONB;
    v_result JSONB;
BEGIN
    v_start_date := NOW() - (p_period_days || ' days')::INTERVAL;
    v_user_id := COALESCE(p_user_id, auth.uid());

    -- Determine scope based on role
    IF p_role IN ('super_admin', 'director', 'ticketing_director') THEN
        v_scope := 'all';
    ELSIF p_role IN ('manager', 'ticketing_manager', 'ops_manager') THEN
        v_scope := 'department';
        v_user_department := p_department;
    ELSE
        v_scope := 'user';
    END IF;

    -- ============================================
    -- SECTION 1: Counts by Type (RFQ/GEN/TOTAL)
    -- ============================================
    WITH ticket_counts AS (
        SELECT
            ticket_type,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed')) as active,
            COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')) as completed,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as created_today,
            COUNT(*) FILTER (WHERE status IN ('resolved', 'closed') AND updated_at >= NOW() - INTERVAL '1 day') as resolved_today
        FROM public.tickets t
        WHERE created_at >= v_start_date
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE (p.user_id = t.assigned_to OR p.user_id = t.created_by)
                AND p.department = v_user_department
            ))
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
        GROUP BY ticket_type
    )
    SELECT jsonb_build_object(
        'RFQ', jsonb_build_object(
            'total', COALESCE((SELECT total FROM ticket_counts WHERE ticket_type = 'RFQ'), 0),
            'active', COALESCE((SELECT active FROM ticket_counts WHERE ticket_type = 'RFQ'), 0),
            'completed', COALESCE((SELECT completed FROM ticket_counts WHERE ticket_type = 'RFQ'), 0),
            'created_today', COALESCE((SELECT created_today FROM ticket_counts WHERE ticket_type = 'RFQ'), 0),
            'resolved_today', COALESCE((SELECT resolved_today FROM ticket_counts WHERE ticket_type = 'RFQ'), 0)
        ),
        'GEN', jsonb_build_object(
            'total', COALESCE((SELECT total FROM ticket_counts WHERE ticket_type = 'GEN'), 0),
            'active', COALESCE((SELECT active FROM ticket_counts WHERE ticket_type = 'GEN'), 0),
            'completed', COALESCE((SELECT completed FROM ticket_counts WHERE ticket_type = 'GEN'), 0),
            'created_today', COALESCE((SELECT created_today FROM ticket_counts WHERE ticket_type = 'GEN'), 0),
            'resolved_today', COALESCE((SELECT resolved_today FROM ticket_counts WHERE ticket_type = 'GEN'), 0)
        ),
        'TOTAL', jsonb_build_object(
            'total', COALESCE((SELECT SUM(total) FROM ticket_counts), 0),
            'active', COALESCE((SELECT SUM(active) FROM ticket_counts), 0),
            'completed', COALESCE((SELECT SUM(completed) FROM ticket_counts), 0),
            'created_today', COALESCE((SELECT SUM(created_today) FROM ticket_counts), 0),
            'resolved_today', COALESCE((SELECT SUM(resolved_today) FROM ticket_counts), 0)
        )
    ) INTO v_counts_by_type;

    -- ============================================
    -- SECTION 2: Status Cards (by status, by priority, by type)
    -- ============================================
    WITH status_data AS (
        SELECT
            status,
            priority,
            ticket_type,
            COUNT(*) as count
        FROM public.tickets t
        WHERE created_at >= v_start_date
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE (p.user_id = t.assigned_to OR p.user_id = t.created_by)
                AND p.department = v_user_department
            ))
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
        GROUP BY status, priority, ticket_type
    )
    SELECT jsonb_build_object(
        'by_status', (
            SELECT COALESCE(jsonb_object_agg(status, count), '{}')
            FROM (
                SELECT status, SUM(count)::INTEGER as count
                FROM status_data
                GROUP BY status
            ) s
        ),
        'by_priority', (
            SELECT COALESCE(jsonb_object_agg(priority, count), '{}')
            FROM (
                SELECT priority, SUM(count)::INTEGER as count
                FROM status_data
                GROUP BY priority
            ) s
        ),
        'by_status_and_type', jsonb_build_object(
            'RFQ', (
                SELECT COALESCE(jsonb_object_agg(status, count), '{}')
                FROM (
                    SELECT status, SUM(count)::INTEGER as count
                    FROM status_data WHERE ticket_type = 'RFQ'
                    GROUP BY status
                ) s
            ),
            'GEN', (
                SELECT COALESCE(jsonb_object_agg(status, count), '{}')
                FROM (
                    SELECT status, SUM(count)::INTEGER as count
                    FROM status_data WHERE ticket_type = 'GEN'
                    GROUP BY status
                ) s
            )
        )
    ) INTO v_status_cards;

    -- ============================================
    -- SECTION 3: Response Time Metrics
    -- Uses ticket_response_metrics table (one row per ticket)
    -- ============================================
    WITH response_data AS (
        SELECT
            t.ticket_type,
            trm.assignee_first_response_seconds,
            trm.assignee_avg_response_seconds,
            trm.creator_avg_response_seconds,
            trm.time_to_resolution_seconds,
            trm.time_to_first_quote_seconds
        FROM public.ticket_response_metrics trm
        JOIN public.tickets t ON t.id = trm.ticket_id
        WHERE t.created_at >= v_start_date
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE (p.user_id = t.assigned_to OR p.user_id = t.created_by)
                AND p.department = v_user_department
            ))
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
    )
    SELECT jsonb_build_object(
        'RFQ', jsonb_build_object(
            'first_response', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ' AND assignee_first_response_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(assignee_first_response_seconds)) FROM response_data WHERE ticket_type = 'RFQ' AND assignee_first_response_seconds IS NOT NULL),
                'min_seconds', (SELECT MIN(assignee_first_response_seconds) FROM response_data WHERE ticket_type = 'RFQ'),
                'max_seconds', (SELECT MAX(assignee_first_response_seconds) FROM response_data WHERE ticket_type = 'RFQ')
            ),
            'avg_response', jsonb_build_object(
                'assignee_avg', (SELECT ROUND(AVG(assignee_avg_response_seconds)) FROM response_data WHERE ticket_type = 'RFQ' AND assignee_avg_response_seconds IS NOT NULL),
                'creator_avg', (SELECT ROUND(AVG(creator_avg_response_seconds)) FROM response_data WHERE ticket_type = 'RFQ' AND creator_avg_response_seconds IS NOT NULL)
            ),
            'resolution', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ' AND time_to_resolution_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(time_to_resolution_seconds)) FROM response_data WHERE ticket_type = 'RFQ' AND time_to_resolution_seconds IS NOT NULL)
            ),
            'first_quote', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ' AND time_to_first_quote_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(time_to_first_quote_seconds)) FROM response_data WHERE ticket_type = 'RFQ' AND time_to_first_quote_seconds IS NOT NULL)
            ),
            'distribution', jsonb_build_object(
                'under_1_hour', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ' AND assignee_first_response_seconds < 3600),
                'from_1_to_4_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ' AND assignee_first_response_seconds >= 3600 AND assignee_first_response_seconds < 14400),
                'from_4_to_24_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ' AND assignee_first_response_seconds >= 14400 AND assignee_first_response_seconds < 86400),
                'over_24_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ' AND assignee_first_response_seconds >= 86400)
            )
        ),
        'GEN', jsonb_build_object(
            'first_response', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN' AND assignee_first_response_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(assignee_first_response_seconds)) FROM response_data WHERE ticket_type = 'GEN' AND assignee_first_response_seconds IS NOT NULL),
                'min_seconds', (SELECT MIN(assignee_first_response_seconds) FROM response_data WHERE ticket_type = 'GEN'),
                'max_seconds', (SELECT MAX(assignee_first_response_seconds) FROM response_data WHERE ticket_type = 'GEN')
            ),
            'avg_response', jsonb_build_object(
                'assignee_avg', (SELECT ROUND(AVG(assignee_avg_response_seconds)) FROM response_data WHERE ticket_type = 'GEN' AND assignee_avg_response_seconds IS NOT NULL),
                'creator_avg', (SELECT ROUND(AVG(creator_avg_response_seconds)) FROM response_data WHERE ticket_type = 'GEN' AND creator_avg_response_seconds IS NOT NULL)
            ),
            'resolution', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN' AND time_to_resolution_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(time_to_resolution_seconds)) FROM response_data WHERE ticket_type = 'GEN' AND time_to_resolution_seconds IS NOT NULL)
            ),
            'distribution', jsonb_build_object(
                'under_1_hour', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN' AND assignee_first_response_seconds < 3600),
                'from_1_to_4_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN' AND assignee_first_response_seconds >= 3600 AND assignee_first_response_seconds < 14400),
                'from_4_to_24_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN' AND assignee_first_response_seconds >= 14400 AND assignee_first_response_seconds < 86400),
                'over_24_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN' AND assignee_first_response_seconds >= 86400)
            )
        ),
        'TOTAL', jsonb_build_object(
            'first_response', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE assignee_first_response_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(assignee_first_response_seconds)) FROM response_data WHERE assignee_first_response_seconds IS NOT NULL)
            ),
            'resolution', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE time_to_resolution_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(time_to_resolution_seconds)) FROM response_data WHERE time_to_resolution_seconds IS NOT NULL)
            )
        )
    ) INTO v_response_time_metrics;

    -- ============================================
    -- SECTION 4: SLA Compliance Metrics
    -- Uses ticket_sla_tracking table
    -- ============================================
    WITH sla_data AS (
        SELECT
            t.ticket_type,
            tst.first_response_met,
            tst.resolution_met,
            tst.first_response_at,
            tst.resolution_at,
            t.status
        FROM public.ticket_sla_tracking tst
        JOIN public.tickets t ON t.id = tst.ticket_id
        WHERE t.created_at >= v_start_date
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE (p.user_id = t.assigned_to OR p.user_id = t.created_by)
                AND p.department = v_user_department
            ))
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
    ),
    pending_sla AS (
        SELECT
            t.ticket_type,
            COUNT(*) FILTER (WHERE tst.first_response_at IS NULL) as pending_first_response,
            COUNT(*) FILTER (WHERE t.status NOT IN ('resolved', 'closed')) as pending_resolution
        FROM public.tickets t
        LEFT JOIN public.ticket_sla_tracking tst ON tst.ticket_id = t.id
        WHERE t.created_at >= v_start_date
        AND t.status NOT IN ('resolved', 'closed')
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE (p.user_id = t.assigned_to OR p.user_id = t.created_by)
                AND p.department = v_user_department
            ))
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
        GROUP BY t.ticket_type
    ),
    first_quote_pending AS (
        SELECT
            COUNT(*) as pending_count
        FROM public.tickets t
        WHERE t.created_at >= v_start_date
        AND t.ticket_type = 'RFQ'
        AND t.status NOT IN ('resolved', 'closed')
        AND NOT EXISTS (
            SELECT 1 FROM public.ticket_rate_quotes trq
            WHERE trq.ticket_id = t.id
            AND trq.status IN ('submitted', 'sent_to_customer', 'accepted')
        )
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE (p.user_id = t.assigned_to OR p.user_id = t.created_by)
                AND p.department = v_user_department
            ))
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
    )
    SELECT jsonb_build_object(
        'RFQ', jsonb_build_object(
            'first_response', jsonb_build_object(
                'met', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'RFQ' AND first_response_met = TRUE),
                'breached', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'RFQ' AND first_response_met = FALSE),
                'pending', COALESCE((SELECT pending_first_response FROM pending_sla WHERE ticket_type = 'RFQ'), 0),
                'compliance_rate', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE first_response_met IS NOT NULL) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE first_response_met = TRUE)::NUMERIC / COUNT(*) FILTER (WHERE first_response_met IS NOT NULL)) * 100, 1)
                        ELSE 0
                    END
                    FROM sla_data WHERE ticket_type = 'RFQ'
                )
            ),
            'resolution', jsonb_build_object(
                'met', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'RFQ' AND resolution_met = TRUE),
                'breached', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'RFQ' AND resolution_met = FALSE),
                'pending', COALESCE((SELECT pending_resolution FROM pending_sla WHERE ticket_type = 'RFQ'), 0),
                'compliance_rate', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE resolution_met IS NOT NULL) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE resolution_met = TRUE)::NUMERIC / COUNT(*) FILTER (WHERE resolution_met IS NOT NULL)) * 100, 1)
                        ELSE 0
                    END
                    FROM sla_data WHERE ticket_type = 'RFQ'
                )
            ),
            'first_quote_pending', (SELECT pending_count FROM first_quote_pending),
            'total', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'RFQ')
        ),
        'GEN', jsonb_build_object(
            'first_response', jsonb_build_object(
                'met', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'GEN' AND first_response_met = TRUE),
                'breached', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'GEN' AND first_response_met = FALSE),
                'pending', COALESCE((SELECT pending_first_response FROM pending_sla WHERE ticket_type = 'GEN'), 0),
                'compliance_rate', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE first_response_met IS NOT NULL) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE first_response_met = TRUE)::NUMERIC / COUNT(*) FILTER (WHERE first_response_met IS NOT NULL)) * 100, 1)
                        ELSE 0
                    END
                    FROM sla_data WHERE ticket_type = 'GEN'
                )
            ),
            'resolution', jsonb_build_object(
                'met', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'GEN' AND resolution_met = TRUE),
                'breached', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'GEN' AND resolution_met = FALSE),
                'pending', COALESCE((SELECT pending_resolution FROM pending_sla WHERE ticket_type = 'GEN'), 0),
                'compliance_rate', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE resolution_met IS NOT NULL) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE resolution_met = TRUE)::NUMERIC / COUNT(*) FILTER (WHERE resolution_met IS NOT NULL)) * 100, 1)
                        ELSE 0
                    END
                    FROM sla_data WHERE ticket_type = 'GEN'
                )
            ),
            'total', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'GEN')
        ),
        'TOTAL', jsonb_build_object(
            'first_response', jsonb_build_object(
                'met', (SELECT COUNT(*) FROM sla_data WHERE first_response_met = TRUE),
                'breached', (SELECT COUNT(*) FROM sla_data WHERE first_response_met = FALSE),
                'compliance_rate', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE first_response_met IS NOT NULL) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE first_response_met = TRUE)::NUMERIC / COUNT(*) FILTER (WHERE first_response_met IS NOT NULL)) * 100, 1)
                        ELSE 0
                    END
                    FROM sla_data
                )
            ),
            'resolution', jsonb_build_object(
                'met', (SELECT COUNT(*) FROM sla_data WHERE resolution_met = TRUE),
                'breached', (SELECT COUNT(*) FROM sla_data WHERE resolution_met = FALSE),
                'compliance_rate', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE resolution_met IS NOT NULL) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE resolution_met = TRUE)::NUMERIC / COUNT(*) FILTER (WHERE resolution_met IS NOT NULL)) * 100, 1)
                        ELSE 0
                    END
                    FROM sla_data
                )
            )
        )
    ) INTO v_sla_compliance;

    -- ============================================
    -- SECTION 5: Quotation Analytics
    -- ============================================
    WITH quotation_data AS (
        SELECT
            cq.status,
            cq.source_type,
            cq.total_selling_rate,
            cq.created_at,
            t.ticket_type
        FROM public.customer_quotations cq
        LEFT JOIN public.tickets t ON t.id = cq.ticket_id
        WHERE cq.created_at >= v_start_date
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.user_id = cq.created_by
                AND p.department = v_user_department
            ))
            OR (v_scope = 'user' AND cq.created_by = v_user_id)
        )
    ),
    rejection_reasons AS (
        SELECT
            qrr.reason_type::TEXT as reason,
            COUNT(*) as count
        FROM public.quotation_rejection_reasons qrr
        JOIN public.customer_quotations cq ON cq.id = qrr.quotation_id
        WHERE cq.created_at >= v_start_date
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.user_id = cq.created_by
                AND p.department = v_user_department
            ))
            OR (v_scope = 'user' AND cq.created_by = v_user_id)
        )
        GROUP BY qrr.reason_type
    )
    SELECT jsonb_build_object(
        'summary', jsonb_build_object(
            'total', (SELECT COUNT(*) FROM quotation_data),
            'draft', (SELECT COUNT(*) FROM quotation_data WHERE status = 'draft'),
            'sent', (SELECT COUNT(*) FROM quotation_data WHERE status = 'sent'),
            'accepted', (SELECT COUNT(*) FROM quotation_data WHERE status = 'accepted'),
            'rejected', (SELECT COUNT(*) FROM quotation_data WHERE status = 'rejected'),
            'expired', (SELECT COUNT(*) FROM quotation_data WHERE status = 'expired')
        ),
        'value', jsonb_build_object(
            'total', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data), 0),
            'accepted', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data WHERE status = 'accepted'), 0),
            'rejected', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data WHERE status = 'rejected'), 0),
            'pending', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data WHERE status IN ('draft', 'sent')), 0)
        ),
        'conversion', jsonb_build_object(
            'sent_to_accepted', (
                SELECT CASE
                    WHEN COUNT(*) FILTER (WHERE status IN ('sent', 'accepted', 'rejected')) > 0
                    THEN ROUND((COUNT(*) FILTER (WHERE status = 'accepted')::NUMERIC / COUNT(*) FILTER (WHERE status IN ('sent', 'accepted', 'rejected'))) * 100, 1)
                    ELSE 0
                END
                FROM quotation_data
            ),
            'total_win_rate', (
                SELECT CASE
                    WHEN COUNT(*) FILTER (WHERE status IN ('accepted', 'rejected')) > 0
                    THEN ROUND((COUNT(*) FILTER (WHERE status = 'accepted')::NUMERIC / COUNT(*) FILTER (WHERE status IN ('accepted', 'rejected'))) * 100, 1)
                    ELSE 0
                END
                FROM quotation_data
            )
        ),
        'by_type', jsonb_build_object(
            'RFQ', jsonb_build_object(
                'total', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'RFQ'),
                'accepted', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'RFQ' AND status = 'accepted'),
                'rejected', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'RFQ' AND status = 'rejected'),
                'value_accepted', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data WHERE ticket_type = 'RFQ' AND status = 'accepted'), 0)
            ),
            'GEN', jsonb_build_object(
                'total', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'GEN'),
                'accepted', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'GEN' AND status = 'accepted'),
                'rejected', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'GEN' AND status = 'rejected'),
                'value_accepted', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data WHERE ticket_type = 'GEN' AND status = 'accepted'), 0)
            )
        ),
        'rejection_reasons', (
            SELECT COALESCE(jsonb_object_agg(reason, count), '{}')
            FROM rejection_reasons
        )
    ) INTO v_quotation_analytics;

    -- ============================================
    -- SECTION 6: Ops Cost Analytics
    -- ============================================
    WITH ops_data AS (
        SELECT
            trq.status,
            trq.amount,
            trq.created_at,
            trq.updated_at,
            t.ticket_type,
            CASE WHEN trq.status IN ('submitted', 'sent_to_customer', 'accepted')
                THEN EXTRACT(EPOCH FROM (trq.updated_at - trq.created_at))
                ELSE NULL
            END as turnaround_seconds
        FROM public.ticket_rate_quotes trq
        JOIN public.tickets t ON t.id = trq.ticket_id
        WHERE trq.created_at >= v_start_date
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.user_id = trq.created_by
                AND p.department = v_user_department
            ))
            OR (v_scope = 'user' AND trq.created_by = v_user_id)
        )
    ),
    cost_rejection_reasons AS (
        SELECT
            ocrr.reason_type::TEXT as reason,
            COUNT(*) as count
        FROM public.operational_cost_rejection_reasons ocrr
        JOIN public.ticket_rate_quotes trq ON trq.id = ocrr.operational_cost_id
        WHERE trq.created_at >= v_start_date
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.user_id = trq.created_by
                AND p.department = v_user_department
            ))
            OR (v_scope = 'user' AND trq.created_by = v_user_id)
        )
        GROUP BY ocrr.reason_type
    )
    SELECT jsonb_build_object(
        'summary', jsonb_build_object(
            'total', (SELECT COUNT(*) FROM ops_data),
            'draft', (SELECT COUNT(*) FROM ops_data WHERE status = 'draft'),
            'submitted', (SELECT COUNT(*) FROM ops_data WHERE status = 'submitted'),
            'sent_to_customer', (SELECT COUNT(*) FROM ops_data WHERE status = 'sent_to_customer'),
            'accepted', (SELECT COUNT(*) FROM ops_data WHERE status = 'accepted'),
            'rejected', (SELECT COUNT(*) FROM ops_data WHERE status = 'rejected')
        ),
        'value', jsonb_build_object(
            'total', COALESCE((SELECT SUM(amount) FROM ops_data), 0),
            'approved', COALESCE((SELECT SUM(amount) FROM ops_data WHERE status IN ('submitted', 'sent_to_customer', 'accepted')), 0),
            'rejected', COALESCE((SELECT SUM(amount) FROM ops_data WHERE status = 'rejected'), 0)
        ),
        'turnaround', jsonb_build_object(
            'avg_seconds', (SELECT ROUND(AVG(turnaround_seconds)) FROM ops_data WHERE turnaround_seconds IS NOT NULL),
            'min_seconds', (SELECT MIN(turnaround_seconds) FROM ops_data WHERE turnaround_seconds IS NOT NULL),
            'max_seconds', (SELECT MAX(turnaround_seconds) FROM ops_data WHERE turnaround_seconds IS NOT NULL),
            'count', (SELECT COUNT(*) FROM ops_data WHERE turnaround_seconds IS NOT NULL)
        ),
        'by_type', jsonb_build_object(
            'RFQ', jsonb_build_object(
                'total', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'RFQ'),
                'submitted', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'RFQ' AND status IN ('submitted', 'sent_to_customer', 'accepted')),
                'rejected', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'RFQ' AND status = 'rejected'),
                'avg_turnaround', (SELECT ROUND(AVG(turnaround_seconds)) FROM ops_data WHERE ticket_type = 'RFQ' AND turnaround_seconds IS NOT NULL)
            ),
            'GEN', jsonb_build_object(
                'total', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'GEN'),
                'submitted', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'GEN' AND status IN ('submitted', 'sent_to_customer', 'accepted')),
                'rejected', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'GEN' AND status = 'rejected'),
                'avg_turnaround', (SELECT ROUND(AVG(turnaround_seconds)) FROM ops_data WHERE ticket_type = 'GEN' AND turnaround_seconds IS NOT NULL)
            )
        ),
        'rejection_reasons', (
            SELECT COALESCE(jsonb_object_agg(reason, count), '{}')
            FROM cost_rejection_reasons
        ),
        'approval_rate', (
            SELECT CASE
                WHEN COUNT(*) FILTER (WHERE status IN ('submitted', 'sent_to_customer', 'accepted', 'rejected')) > 0
                THEN ROUND((COUNT(*) FILTER (WHERE status IN ('submitted', 'sent_to_customer', 'accepted'))::NUMERIC / COUNT(*) FILTER (WHERE status IN ('submitted', 'sent_to_customer', 'accepted', 'rejected'))) * 100, 1)
                ELSE 0
            END
            FROM ops_data
        )
    ) INTO v_ops_cost_analytics;

    -- ============================================
    -- SECTION 7: Leaderboards
    -- ============================================
    WITH user_stats AS (
        SELECT
            p.user_id,
            p.full_name as name,
            p.role,
            p.department,
            COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id AND t.status IN ('resolved', 'closed') THEN t.id END) as tickets_completed,
            COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id THEN t.id END) as tickets_assigned,
            AVG(CASE WHEN trm.ticket_id = t.id AND t.assigned_to = p.user_id THEN trm.assignee_first_response_seconds END) as avg_first_response,
            COUNT(DISTINCT CASE WHEN trq.created_by = p.user_id AND trq.status IN ('submitted', 'sent_to_customer', 'accepted') THEN trq.id END) as quotes_submitted,
            COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id AND t.close_outcome = 'won' THEN t.id END) as tickets_won,
            COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id AND t.close_outcome = 'lost' THEN t.id END) as tickets_lost
        FROM public.profiles p
        LEFT JOIN public.tickets t ON (t.assigned_to = p.user_id OR t.created_by = p.user_id) AND t.created_at >= v_start_date
        LEFT JOIN public.ticket_response_metrics trm ON trm.ticket_id = t.id
        LEFT JOIN public.ticket_rate_quotes trq ON trq.ticket_id = t.id
        WHERE (
            v_scope = 'all'
            OR (v_scope = 'department' AND p.department = v_user_department)
            OR (v_scope = 'user' AND p.user_id = v_user_id)
        )
        GROUP BY p.user_id, p.full_name, p.role, p.department
        HAVING COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id THEN t.id END) > 0
    )
    SELECT jsonb_build_object(
        'by_completion', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'user_id', user_id,
                    'name', name,
                    'role', role,
                    'department', department,
                    'tickets_completed', tickets_completed,
                    'tickets_assigned', tickets_assigned,
                    'completion_rate', CASE WHEN tickets_assigned > 0 THEN ROUND((tickets_completed::NUMERIC / tickets_assigned) * 100, 1) ELSE 0 END
                )
                ORDER BY tickets_completed DESC
            ), '[]')
            FROM (SELECT * FROM user_stats ORDER BY tickets_completed DESC LIMIT 10) s
        ),
        'by_response_speed', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'user_id', user_id,
                    'name', name,
                    'role', role,
                    'department', department,
                    'avg_first_response_seconds', ROUND(avg_first_response)
                )
                ORDER BY avg_first_response ASC NULLS LAST
            ), '[]')
            FROM (SELECT * FROM user_stats WHERE avg_first_response IS NOT NULL ORDER BY avg_first_response ASC LIMIT 10) s
        ),
        'by_quotes', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'user_id', user_id,
                    'name', name,
                    'role', role,
                    'department', department,
                    'quotes_submitted', quotes_submitted
                )
                ORDER BY quotes_submitted DESC
            ), '[]')
            FROM (SELECT * FROM user_stats WHERE quotes_submitted > 0 ORDER BY quotes_submitted DESC LIMIT 10) s
        ),
        'by_win_rate', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'user_id', user_id,
                    'name', name,
                    'role', role,
                    'department', department,
                    'tickets_won', tickets_won,
                    'tickets_lost', tickets_lost,
                    'win_rate', CASE WHEN (tickets_won + tickets_lost) > 0 THEN ROUND((tickets_won::NUMERIC / (tickets_won + tickets_lost)) * 100, 1) ELSE 0 END
                )
                ORDER BY CASE WHEN (tickets_won + tickets_lost) > 0 THEN (tickets_won::NUMERIC / (tickets_won + tickets_lost)) ELSE 0 END DESC
            ), '[]')
            FROM (SELECT * FROM user_stats WHERE (tickets_won + tickets_lost) > 0 ORDER BY CASE WHEN (tickets_won + tickets_lost) > 0 THEN (tickets_won::NUMERIC / (tickets_won + tickets_lost)) ELSE 0 END DESC LIMIT 10) s
        )
    ) INTO v_leaderboards;

    -- ============================================
    -- BUILD FINAL RESULT
    -- ============================================
    v_result := jsonb_build_object(
        'meta', jsonb_build_object(
            'period_days', p_period_days,
            'start_date', v_start_date,
            'scope', v_scope,
            'department', v_user_department,
            'generated_at', NOW()
        ),
        'counts_by_type', v_counts_by_type,
        'status_cards', v_status_cards,
        'response_time_metrics', v_response_time_metrics,
        'sla_compliance', v_sla_compliance,
        'quotation_analytics', v_quotation_analytics,
        'ops_cost_analytics', v_ops_cost_analytics,
        'leaderboards', v_leaderboards
    );

    RETURN v_result;
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'error', TRUE,
            'message', SQLERRM,
            'detail', SQLSTATE
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticketing_overview_v2 IS
'Comprehensive Overview Ticketing V2 RPC - BUG #11
Returns all dashboard data in a single call with role-based scoping.
Uses actual schema: ticket_sla_tracking (first_response_met, resolution_met), ticket_response_metrics (assignee_first_response_seconds, etc.)';

GRANT EXECUTE ON FUNCTION public.rpc_ticketing_overview_v2(INTEGER, UUID, TEXT, TEXT) TO authenticated;

-- ============================================
-- 2. PERFORMANCE INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tickets_created_at_type ON public.tickets(created_at, ticket_type);
CREATE INDEX IF NOT EXISTS idx_tickets_status_type ON public.tickets(status, ticket_type);
CREATE INDEX IF NOT EXISTS idx_customer_quotations_created_status ON public.customer_quotations(created_at, status);
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_created_status ON public.ticket_rate_quotes(created_at, status);
