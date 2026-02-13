-- =====================================================
-- Migration 189: Fix Resolution SLA showing 0/0/0 for closed tickets
-- =====================================================
--
-- ROOT CAUSE: resolution_met in ticket_sla_tracking is only populated
-- by rpc_ticket_mark_won() and rpc_ticket_mark_lost(). If a ticket is
-- closed via direct status update, bulk ops, or any other path,
-- resolution_met stays NULL. The RPC counts:
--   met: resolution_met = TRUE     → 0
--   breached: resolution_met = FALSE → 0
--   pending: status NOT IN (resolved, closed) → 0 (excluded!)
-- So closed tickets with NULL resolution_met are "ghosts" — not counted
-- anywhere in SLA compliance.
--
-- FIX 1: Update RPC sla_data CTE to compute resolution_met on-the-fly
--         using COALESCE(tst.resolution_met, computed_from_resolved_at)
--
-- FIX 2: Backfill existing ticket_sla_tracking records where
--         resolution_met IS NULL but ticket is resolved/closed
--
-- FIX 3: Add trigger on tickets to auto-populate resolution_met
--         when status changes to resolved/closed
--
-- =====================================================

-- =====================================================
-- FIX 2: Backfill existing resolved/closed tickets
-- =====================================================
UPDATE public.ticket_sla_tracking tst
SET
    resolution_at = COALESCE(tst.resolution_at, t.resolved_at, t.updated_at),
    resolution_met = EXTRACT(EPOCH FROM (
        COALESCE(t.resolved_at, t.updated_at) - t.created_at
    )) / 3600 <= tst.resolution_sla_hours,
    updated_at = NOW()
FROM public.tickets t
WHERE t.id = tst.ticket_id
AND tst.resolution_met IS NULL
AND t.status IN ('resolved'::ticket_status, 'closed'::ticket_status);

-- =====================================================
-- FIX 3: Trigger to auto-populate resolution SLA on ticket close
-- =====================================================
CREATE OR REPLACE FUNCTION public.fn_update_resolution_sla_on_close()
RETURNS TRIGGER AS $$
BEGIN
    -- Only fire when status transitions TO resolved/closed
    IF NEW.status IN ('resolved'::ticket_status, 'closed'::ticket_status)
       AND (OLD.status IS NULL OR OLD.status NOT IN ('resolved'::ticket_status, 'closed'::ticket_status))
    THEN
        UPDATE public.ticket_sla_tracking
        SET
            resolution_at = COALESCE(resolution_at, NEW.resolved_at, NOW()),
            resolution_met = EXTRACT(EPOCH FROM (
                COALESCE(NEW.resolved_at, NOW()) - NEW.created_at
            )) / 3600 <= resolution_sla_hours,
            updated_at = NOW()
        WHERE ticket_id = NEW.id
        AND resolution_met IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop if exists to avoid duplicate trigger
DROP TRIGGER IF EXISTS trg_update_resolution_sla_on_close ON public.tickets;

CREATE TRIGGER trg_update_resolution_sla_on_close
    AFTER UPDATE OF status ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_update_resolution_sla_on_close();

-- =====================================================
-- FIX 1: Update RPC to compute resolution_met on-the-fly
-- (defensive: handles any future NULL resolution_met edge cases)
-- =====================================================
DROP FUNCTION IF EXISTS public.rpc_ticketing_overview_v2(INTEGER, UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.rpc_ticketing_overview_v2(
    p_period_days INTEGER DEFAULT 30,
    p_user_id UUID DEFAULT NULL,
    p_department TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_view_mode TEXT DEFAULT NULL  -- 'received', 'created', or NULL
)
RETURNS JSONB AS $$
DECLARE
    v_start_date TIMESTAMPTZ;
    v_user_id UUID;
    v_user_department ticketing_department := NULL;
    v_scope TEXT; -- 'all', 'department', 'user'
    v_is_ops BOOLEAN := FALSE;
    v_view_mode TEXT;

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
    v_view_mode := COALESCE(LOWER(p_view_mode), 'all');

    -- ========================================
    -- SCOPE LOGIC (from migration 188)
    -- ========================================
    IF LOWER(p_role) IN ('super admin', 'super_admin', 'director', 'ticketing director', 'ticketing_director') THEN
        v_scope := 'all';

    ELSIF LOWER(p_role) LIKE '%ops%'
          OR LOWER(p_role) LIKE '%manager%'
          OR LOWER(p_role) LIKE '%traffic%'
          OR LOWER(p_role) LIKE '%warehous%'
          OR LOWER(p_role) IN ('macx', 'sales support', 'marcomm', 'dgo', 'vdco')
    THEN
        v_scope := 'department';

        v_user_department := CASE
            WHEN LOWER(p_role) LIKE '%exim%' THEN 'EXI'::ticketing_department
            WHEN LOWER(p_role) LIKE '%domestic%' THEN 'DOM'::ticketing_department
            WHEN LOWER(p_role) LIKE '%dtd%' OR LOWER(p_role) LIKE '%import%dtd%' THEN 'DTD'::ticketing_department
            WHEN LOWER(p_role) LIKE '%traffic%' OR LOWER(p_role) LIKE '%warehous%' THEN 'TRF'::ticketing_department
            WHEN LOWER(p_role) LIKE '%marketing%'
                 OR LOWER(p_role) IN ('macx', 'marcomm', 'dgo', 'vdco') THEN 'MKT'::ticketing_department
            WHEN LOWER(p_role) LIKE '%sales%' THEN 'SAL'::ticketing_department
            ELSE CASE LOWER(COALESCE(p_department, ''))
                WHEN 'operations' THEN 'EXI'::ticketing_department
                WHEN 'marketing'  THEN 'MKT'::ticketing_department
                WHEN 'sales'      THEN 'SAL'::ticketing_department
                ELSE NULL
            END
        END;

        v_is_ops := LOWER(p_role) LIKE '%ops%'
                    OR LOWER(p_role) LIKE '%traffic%'
                    OR LOWER(p_role) LIKE '%warehous%';

        IF v_user_department IS NULL THEN
            v_scope := 'user';
        END IF;

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
            COUNT(*) FILTER (WHERE status NOT IN ('resolved'::ticket_status, 'closed'::ticket_status)) as active,
            COUNT(*) FILTER (WHERE status IN ('resolved'::ticket_status, 'closed'::ticket_status)) as completed,
            COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as created_today,
            COUNT(*) FILTER (WHERE status IN ('resolved'::ticket_status, 'closed'::ticket_status) AND updated_at >= NOW() - INTERVAL '1 day') as resolved_today
        FROM public.tickets t
        WHERE created_at >= v_start_date
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND t.department = v_user_department)
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
        AND (
            v_view_mode = 'all'
            OR (v_view_mode = 'received' AND t.assigned_to = v_user_id)
            OR (v_view_mode = 'created' AND t.created_by = v_user_id)
        )
        GROUP BY ticket_type
    )
    SELECT jsonb_build_object(
        'RFQ', jsonb_build_object(
            'total', COALESCE((SELECT total FROM ticket_counts WHERE ticket_type = 'RFQ'::ticket_type), 0),
            'active', COALESCE((SELECT active FROM ticket_counts WHERE ticket_type = 'RFQ'::ticket_type), 0),
            'completed', COALESCE((SELECT completed FROM ticket_counts WHERE ticket_type = 'RFQ'::ticket_type), 0),
            'created_today', COALESCE((SELECT created_today FROM ticket_counts WHERE ticket_type = 'RFQ'::ticket_type), 0),
            'resolved_today', COALESCE((SELECT resolved_today FROM ticket_counts WHERE ticket_type = 'RFQ'::ticket_type), 0)
        ),
        'GEN', jsonb_build_object(
            'total', COALESCE((SELECT total FROM ticket_counts WHERE ticket_type = 'GEN'::ticket_type), 0),
            'active', COALESCE((SELECT active FROM ticket_counts WHERE ticket_type = 'GEN'::ticket_type), 0),
            'completed', COALESCE((SELECT completed FROM ticket_counts WHERE ticket_type = 'GEN'::ticket_type), 0),
            'created_today', COALESCE((SELECT created_today FROM ticket_counts WHERE ticket_type = 'GEN'::ticket_type), 0),
            'resolved_today', COALESCE((SELECT resolved_today FROM ticket_counts WHERE ticket_type = 'GEN'::ticket_type), 0)
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
    -- SECTION 2: Status Cards
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
            OR (v_scope = 'department' AND t.department = v_user_department)
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
        AND (
            v_view_mode = 'all'
            OR (v_view_mode = 'received' AND t.assigned_to = v_user_id)
            OR (v_view_mode = 'created' AND t.created_by = v_user_id)
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
                    FROM status_data WHERE ticket_type = 'RFQ'::ticket_type
                    GROUP BY status
                ) s
            ),
            'GEN', (
                SELECT COALESCE(jsonb_object_agg(status, count), '{}')
                FROM (
                    SELECT status, SUM(count)::INTEGER as count
                    FROM status_data WHERE ticket_type = 'GEN'::ticket_type
                    GROUP BY status
                ) s
            )
        )
    ) INTO v_status_cards;

    -- ============================================
    -- SECTION 3: Response Time Metrics
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
            OR (v_scope = 'department' AND t.department = v_user_department)
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
        AND (
            v_view_mode = 'all'
            OR (v_view_mode = 'received' AND t.assigned_to = v_user_id)
            OR (v_view_mode = 'created' AND t.created_by = v_user_id)
        )
    )
    SELECT jsonb_build_object(
        'RFQ', jsonb_build_object(
            'first_response', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND assignee_first_response_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(assignee_first_response_seconds)) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND assignee_first_response_seconds IS NOT NULL),
                'min_seconds', (SELECT MIN(assignee_first_response_seconds) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type),
                'max_seconds', (SELECT MAX(assignee_first_response_seconds) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type)
            ),
            'avg_response', jsonb_build_object(
                'assignee_avg', (SELECT ROUND(AVG(assignee_avg_response_seconds)) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND assignee_avg_response_seconds IS NOT NULL),
                'creator_avg', (SELECT ROUND(AVG(creator_avg_response_seconds)) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND creator_avg_response_seconds IS NOT NULL)
            ),
            'resolution', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND time_to_resolution_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(time_to_resolution_seconds)) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND time_to_resolution_seconds IS NOT NULL)
            ),
            'first_quote', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND time_to_first_quote_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(time_to_first_quote_seconds)) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND time_to_first_quote_seconds IS NOT NULL)
            ),
            'distribution', jsonb_build_object(
                'under_1_hour', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND assignee_first_response_seconds < 3600),
                'from_1_to_4_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND assignee_first_response_seconds >= 3600 AND assignee_first_response_seconds < 14400),
                'from_4_to_24_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND assignee_first_response_seconds >= 14400 AND assignee_first_response_seconds < 86400),
                'over_24_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'RFQ'::ticket_type AND assignee_first_response_seconds >= 86400)
            )
        ),
        'GEN', jsonb_build_object(
            'first_response', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN'::ticket_type AND assignee_first_response_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(assignee_first_response_seconds)) FROM response_data WHERE ticket_type = 'GEN'::ticket_type AND assignee_first_response_seconds IS NOT NULL),
                'min_seconds', (SELECT MIN(assignee_first_response_seconds) FROM response_data WHERE ticket_type = 'GEN'::ticket_type),
                'max_seconds', (SELECT MAX(assignee_first_response_seconds) FROM response_data WHERE ticket_type = 'GEN'::ticket_type)
            ),
            'avg_response', jsonb_build_object(
                'assignee_avg', (SELECT ROUND(AVG(assignee_avg_response_seconds)) FROM response_data WHERE ticket_type = 'GEN'::ticket_type AND assignee_avg_response_seconds IS NOT NULL),
                'creator_avg', (SELECT ROUND(AVG(creator_avg_response_seconds)) FROM response_data WHERE ticket_type = 'GEN'::ticket_type AND creator_avg_response_seconds IS NOT NULL)
            ),
            'resolution', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN'::ticket_type AND time_to_resolution_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(time_to_resolution_seconds)) FROM response_data WHERE ticket_type = 'GEN'::ticket_type AND time_to_resolution_seconds IS NOT NULL)
            ),
            'distribution', jsonb_build_object(
                'under_1_hour', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN'::ticket_type AND assignee_first_response_seconds < 3600),
                'from_1_to_4_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN'::ticket_type AND assignee_first_response_seconds >= 3600 AND assignee_first_response_seconds < 14400),
                'from_4_to_24_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN'::ticket_type AND assignee_first_response_seconds >= 14400 AND assignee_first_response_seconds < 86400),
                'over_24_hours', (SELECT COUNT(*) FROM response_data WHERE ticket_type = 'GEN'::ticket_type AND assignee_first_response_seconds >= 86400)
            )
        ),
        'TOTAL', jsonb_build_object(
            'first_response', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE assignee_first_response_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(assignee_first_response_seconds)) FROM response_data WHERE assignee_first_response_seconds IS NOT NULL)
            ),
            'avg_response', jsonb_build_object(
                'assignee_avg', (SELECT ROUND(AVG(assignee_avg_response_seconds)) FROM response_data WHERE assignee_avg_response_seconds IS NOT NULL),
                'creator_avg', (SELECT ROUND(AVG(creator_avg_response_seconds)) FROM response_data WHERE creator_avg_response_seconds IS NOT NULL)
            ),
            'resolution', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE time_to_resolution_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(time_to_resolution_seconds)) FROM response_data WHERE time_to_resolution_seconds IS NOT NULL)
            ),
            'first_quote', jsonb_build_object(
                'count', (SELECT COUNT(*) FROM response_data WHERE time_to_first_quote_seconds IS NOT NULL),
                'avg_seconds', (SELECT ROUND(AVG(time_to_first_quote_seconds)) FROM response_data WHERE time_to_first_quote_seconds IS NOT NULL)
            )
        )
    ) INTO v_response_time_metrics;

    -- ============================================
    -- SECTION 4: SLA Compliance Metrics
    -- FIX: compute resolution_met on-the-fly when NULL
    -- ============================================
    WITH sla_data AS (
        SELECT
            t.ticket_type,
            tst.first_response_met,
            -- FIX: compute resolution_met dynamically for resolved/closed tickets
            -- where it was never populated by mark_won/mark_lost RPCs
            COALESCE(
                tst.resolution_met,
                CASE
                    WHEN t.status IN ('resolved'::ticket_status, 'closed'::ticket_status)
                    THEN EXTRACT(EPOCH FROM (
                        COALESCE(t.resolved_at, t.updated_at) - t.created_at
                    )) / 3600 <= tst.resolution_sla_hours
                    ELSE NULL
                END
            ) AS resolution_met,
            tst.first_response_at,
            COALESCE(tst.resolution_at, t.resolved_at) AS resolution_at,
            t.status
        FROM public.ticket_sla_tracking tst
        JOIN public.tickets t ON t.id = tst.ticket_id
        WHERE t.created_at >= v_start_date
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND t.department = v_user_department)
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
        AND (
            v_view_mode = 'all'
            OR (v_view_mode = 'received' AND t.assigned_to = v_user_id)
            OR (v_view_mode = 'created' AND t.created_by = v_user_id)
        )
    ),
    pending_sla AS (
        SELECT
            t.ticket_type,
            COUNT(*) FILTER (WHERE tst.first_response_at IS NULL) as pending_first_response,
            COUNT(*) as pending_resolution
        FROM public.tickets t
        LEFT JOIN public.ticket_sla_tracking tst ON tst.ticket_id = t.id
        WHERE t.created_at >= v_start_date
        AND t.status NOT IN ('resolved'::ticket_status, 'closed'::ticket_status)
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND t.department = v_user_department)
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
        AND (
            v_view_mode = 'all'
            OR (v_view_mode = 'received' AND t.assigned_to = v_user_id)
            OR (v_view_mode = 'created' AND t.created_by = v_user_id)
        )
        GROUP BY t.ticket_type
    ),
    first_quote_pending AS (
        SELECT
            COUNT(*) as pending_count
        FROM public.tickets t
        WHERE t.created_at >= v_start_date
        AND t.ticket_type = 'RFQ'::ticket_type
        AND t.status NOT IN ('resolved'::ticket_status, 'closed'::ticket_status)
        AND NOT EXISTS (
            SELECT 1 FROM public.ticket_rate_quotes trq
            WHERE trq.ticket_id = t.id
            AND trq.status IN ('submitted'::quote_status, 'sent_to_customer'::quote_status, 'accepted'::quote_status)
        )
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND t.department = v_user_department)
            OR (v_scope = 'user' AND (t.assigned_to = v_user_id OR t.created_by = v_user_id))
        )
        AND (
            v_view_mode = 'all'
            OR (v_view_mode = 'received' AND t.assigned_to = v_user_id)
            OR (v_view_mode = 'created' AND t.created_by = v_user_id)
        )
    )
    SELECT jsonb_build_object(
        'RFQ', jsonb_build_object(
            'first_response', jsonb_build_object(
                'met', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'RFQ'::ticket_type AND first_response_met = TRUE),
                'breached', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'RFQ'::ticket_type AND first_response_met = FALSE),
                'pending', COALESCE((SELECT pending_first_response FROM pending_sla WHERE ticket_type = 'RFQ'::ticket_type), 0),
                'compliance_rate', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE first_response_met IS NOT NULL) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE first_response_met = TRUE)::NUMERIC / COUNT(*) FILTER (WHERE first_response_met IS NOT NULL)) * 100, 1)
                        ELSE 0
                    END
                    FROM sla_data WHERE ticket_type = 'RFQ'::ticket_type
                )
            ),
            'resolution', jsonb_build_object(
                'met', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'RFQ'::ticket_type AND resolution_met = TRUE),
                'breached', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'RFQ'::ticket_type AND resolution_met = FALSE),
                'pending', COALESCE((SELECT pending_resolution FROM pending_sla WHERE ticket_type = 'RFQ'::ticket_type), 0),
                'compliance_rate', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE resolution_met IS NOT NULL) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE resolution_met = TRUE)::NUMERIC / COUNT(*) FILTER (WHERE resolution_met IS NOT NULL)) * 100, 1)
                        ELSE 0
                    END
                    FROM sla_data WHERE ticket_type = 'RFQ'::ticket_type
                )
            ),
            'first_quote_pending', (SELECT pending_count FROM first_quote_pending),
            'total', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'RFQ'::ticket_type)
        ),
        'GEN', jsonb_build_object(
            'first_response', jsonb_build_object(
                'met', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'GEN'::ticket_type AND first_response_met = TRUE),
                'breached', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'GEN'::ticket_type AND first_response_met = FALSE),
                'pending', COALESCE((SELECT pending_first_response FROM pending_sla WHERE ticket_type = 'GEN'::ticket_type), 0),
                'compliance_rate', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE first_response_met IS NOT NULL) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE first_response_met = TRUE)::NUMERIC / COUNT(*) FILTER (WHERE first_response_met IS NOT NULL)) * 100, 1)
                        ELSE 0
                    END
                    FROM sla_data WHERE ticket_type = 'GEN'::ticket_type
                )
            ),
            'resolution', jsonb_build_object(
                'met', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'GEN'::ticket_type AND resolution_met = TRUE),
                'breached', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'GEN'::ticket_type AND resolution_met = FALSE),
                'pending', COALESCE((SELECT pending_resolution FROM pending_sla WHERE ticket_type = 'GEN'::ticket_type), 0),
                'compliance_rate', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE resolution_met IS NOT NULL) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE resolution_met = TRUE)::NUMERIC / COUNT(*) FILTER (WHERE resolution_met IS NOT NULL)) * 100, 1)
                        ELSE 0
                    END
                    FROM sla_data WHERE ticket_type = 'GEN'::ticket_type
                )
            ),
            'total', (SELECT COUNT(*) FROM sla_data WHERE ticket_type = 'GEN'::ticket_type)
        ),
        'TOTAL', jsonb_build_object(
            'first_response', jsonb_build_object(
                'met', (SELECT COUNT(*) FROM sla_data WHERE first_response_met = TRUE),
                'breached', (SELECT COUNT(*) FROM sla_data WHERE first_response_met = FALSE),
                'pending', COALESCE((SELECT SUM(pending_first_response) FROM pending_sla), 0),
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
                'pending', COALESCE((SELECT SUM(pending_resolution) FROM pending_sla), 0),
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
    -- SECTION 5: Quotation Analytics (skipped for ops)
    -- ============================================
    IF NOT v_is_ops THEN
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
                OR (v_scope = 'department' AND t.department = v_user_department)
                OR (v_scope = 'user' AND (
                    cq.created_by = v_user_id
                    OR EXISTS (SELECT 1 FROM public.tickets t2 WHERE t2.id = cq.ticket_id AND (t2.assigned_to = v_user_id OR t2.created_by = v_user_id))
                ))
            )
            AND (
                v_view_mode = 'all'
                OR (v_view_mode = 'received' AND t.assigned_to = v_user_id)
                OR (v_view_mode = 'created' AND t.created_by = v_user_id)
            )
        ),
        rejection_reasons AS (
            SELECT
                qrr.reason_type::TEXT as reason,
                COUNT(*) as count
            FROM public.quotation_rejection_reasons qrr
            JOIN public.customer_quotations cq ON cq.id = qrr.quotation_id
            LEFT JOIN public.tickets t ON t.id = cq.ticket_id
            WHERE cq.created_at >= v_start_date
            AND (
                v_scope = 'all'
                OR (v_scope = 'department' AND t.department = v_user_department)
                OR (v_scope = 'user' AND (
                    cq.created_by = v_user_id
                    OR EXISTS (SELECT 1 FROM public.tickets t2 WHERE t2.id = cq.ticket_id AND (t2.assigned_to = v_user_id OR t2.created_by = v_user_id))
                ))
            )
            AND (
                v_view_mode = 'all'
                OR (v_view_mode = 'received' AND t.assigned_to = v_user_id)
                OR (v_view_mode = 'created' AND t.created_by = v_user_id)
            )
            GROUP BY qrr.reason_type
        )
        SELECT jsonb_build_object(
            'summary', jsonb_build_object(
                'total', (SELECT COUNT(*) FROM quotation_data),
                'draft', (SELECT COUNT(*) FROM quotation_data WHERE status = 'draft'::customer_quotation_status),
                'sent', (SELECT COUNT(*) FROM quotation_data WHERE status = 'sent'::customer_quotation_status),
                'accepted', (SELECT COUNT(*) FROM quotation_data WHERE status = 'accepted'::customer_quotation_status),
                'rejected', (SELECT COUNT(*) FROM quotation_data WHERE status = 'rejected'::customer_quotation_status),
                'expired', (SELECT COUNT(*) FROM quotation_data WHERE status = 'expired'::customer_quotation_status)
            ),
            'value', jsonb_build_object(
                'total', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data), 0),
                'accepted', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data WHERE status = 'accepted'::customer_quotation_status), 0),
                'rejected', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data WHERE status = 'rejected'::customer_quotation_status), 0),
                'pending', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data WHERE status IN ('draft'::customer_quotation_status, 'sent'::customer_quotation_status)), 0)
            ),
            'conversion', jsonb_build_object(
                'sent_to_accepted', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE status IN ('sent'::customer_quotation_status, 'accepted'::customer_quotation_status, 'rejected'::customer_quotation_status)) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE status = 'accepted'::customer_quotation_status)::NUMERIC / COUNT(*) FILTER (WHERE status IN ('sent'::customer_quotation_status, 'accepted'::customer_quotation_status, 'rejected'::customer_quotation_status))) * 100, 1)
                        ELSE 0
                    END
                    FROM quotation_data
                ),
                'total_win_rate', (
                    SELECT CASE
                        WHEN COUNT(*) FILTER (WHERE status IN ('accepted'::customer_quotation_status, 'rejected'::customer_quotation_status)) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE status = 'accepted'::customer_quotation_status)::NUMERIC / COUNT(*) FILTER (WHERE status IN ('accepted'::customer_quotation_status, 'rejected'::customer_quotation_status))) * 100, 1)
                        ELSE 0
                    END
                    FROM quotation_data
                )
            ),
            'by_type', jsonb_build_object(
                'RFQ', jsonb_build_object(
                    'total', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'RFQ'::ticket_type),
                    'accepted', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'RFQ'::ticket_type AND status = 'accepted'::customer_quotation_status),
                    'rejected', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'RFQ'::ticket_type AND status = 'rejected'::customer_quotation_status),
                    'value_accepted', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data WHERE ticket_type = 'RFQ'::ticket_type AND status = 'accepted'::customer_quotation_status), 0)
                ),
                'GEN', jsonb_build_object(
                    'total', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'GEN'::ticket_type),
                    'accepted', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'GEN'::ticket_type AND status = 'accepted'::customer_quotation_status),
                    'rejected', (SELECT COUNT(*) FROM quotation_data WHERE ticket_type = 'GEN'::ticket_type AND status = 'rejected'::customer_quotation_status),
                    'value_accepted', COALESCE((SELECT SUM(total_selling_rate) FROM quotation_data WHERE ticket_type = 'GEN'::ticket_type AND status = 'accepted'::customer_quotation_status), 0)
                )
            ),
            'rejection_reasons', (
                SELECT COALESCE(jsonb_object_agg(reason, count), '{}')
                FROM rejection_reasons
            )
        ) INTO v_quotation_analytics;
    ELSE
        v_quotation_analytics := '{}'::JSONB;
    END IF;

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
            CASE WHEN trq.status IN ('submitted'::quote_status, 'sent_to_customer'::quote_status, 'accepted'::quote_status)
                THEN EXTRACT(EPOCH FROM (trq.updated_at - trq.created_at))
                ELSE NULL
            END as turnaround_seconds
        FROM public.ticket_rate_quotes trq
        JOIN public.tickets t ON t.id = trq.ticket_id
        WHERE trq.created_at >= v_start_date
        AND (
            v_scope = 'all'
            OR (v_scope = 'department' AND t.department = v_user_department)
            OR (v_scope = 'user' AND (
                trq.created_by = v_user_id
                OR EXISTS (SELECT 1 FROM public.tickets t2 WHERE t2.id = trq.ticket_id AND (t2.assigned_to = v_user_id OR t2.created_by = v_user_id))
            ))
        )
        AND (
            v_view_mode = 'all'
            OR (v_view_mode = 'received' AND t.assigned_to = v_user_id)
            OR (v_view_mode = 'created' AND t.created_by = v_user_id)
        )
    ),
    cost_rejection_reasons AS (
        SELECT reason, SUM(cnt)::BIGINT as count
        FROM (
            SELECT
                ocrr.reason_type::TEXT as reason,
                1 as cnt
            FROM public.operational_cost_rejection_reasons ocrr
            JOIN public.ticket_rate_quotes trq ON trq.id = ocrr.operational_cost_id
            JOIN public.tickets t ON t.id = trq.ticket_id
            WHERE trq.created_at >= v_start_date
            AND (
                v_scope = 'all'
                OR (v_scope = 'department' AND t.department = v_user_department)
                OR (v_scope = 'user' AND (
                    trq.created_by = v_user_id
                    OR (t.assigned_to = v_user_id OR t.created_by = v_user_id)
                ))
            )
            AND (
                v_view_mode = 'all'
                OR (v_view_mode = 'received' AND t.assigned_to = v_user_id)
                OR (v_view_mode = 'created' AND t.created_by = v_user_id)
            )

            UNION ALL

            SELECT
                qrr.reason_type::TEXT as reason,
                1 as cnt
            FROM public.quotation_rejection_reasons qrr
            JOIN public.customer_quotations cq ON cq.id = qrr.quotation_id
            JOIN public.ticket_rate_quotes trq ON (
                trq.id = cq.operational_cost_id
                OR (cq.operational_cost_ids IS NOT NULL AND trq.id = ANY(cq.operational_cost_ids))
            )
            JOIN public.tickets t ON t.id = trq.ticket_id
            WHERE trq.status = 'revise_requested'::quote_status
            AND trq.created_at >= v_start_date
            AND (
                v_scope = 'all'
                OR (v_scope = 'department' AND t.department = v_user_department)
                OR (v_scope = 'user' AND (
                    trq.created_by = v_user_id
                    OR (t.assigned_to = v_user_id OR t.created_by = v_user_id)
                ))
            )
            AND (
                v_view_mode = 'all'
                OR (v_view_mode = 'received' AND t.assigned_to = v_user_id)
                OR (v_view_mode = 'created' AND t.created_by = v_user_id)
            )
        ) combined
        GROUP BY reason
    )
    SELECT jsonb_build_object(
        'summary', jsonb_build_object(
            'total', (SELECT COUNT(*) FROM ops_data),
            'draft', (SELECT COUNT(*) FROM ops_data WHERE status = 'draft'::quote_status),
            'submitted', (SELECT COUNT(*) FROM ops_data WHERE status = 'submitted'::quote_status),
            'sent_to_customer', (SELECT COUNT(*) FROM ops_data WHERE status = 'sent_to_customer'::quote_status),
            'accepted', (SELECT COUNT(*) FROM ops_data WHERE status = 'accepted'::quote_status),
            'rejected', (SELECT COUNT(*) FROM ops_data WHERE status = 'rejected'::quote_status),
            'revise_requested', (SELECT COUNT(*) FROM ops_data WHERE status = 'revise_requested'::quote_status)
        ),
        'value', jsonb_build_object(
            'total', COALESCE((SELECT SUM(amount) FROM ops_data), 0),
            'approved', COALESCE((SELECT SUM(amount) FROM ops_data WHERE status IN ('submitted'::quote_status, 'sent_to_customer'::quote_status, 'accepted'::quote_status)), 0),
            'rejected', COALESCE((SELECT SUM(amount) FROM ops_data WHERE status = 'rejected'::quote_status), 0)
        ),
        'turnaround', jsonb_build_object(
            'avg_seconds', (SELECT ROUND(AVG(turnaround_seconds)) FROM ops_data WHERE turnaround_seconds IS NOT NULL),
            'min_seconds', (SELECT MIN(turnaround_seconds) FROM ops_data WHERE turnaround_seconds IS NOT NULL),
            'max_seconds', (SELECT MAX(turnaround_seconds) FROM ops_data WHERE turnaround_seconds IS NOT NULL),
            'count', (SELECT COUNT(*) FROM ops_data WHERE turnaround_seconds IS NOT NULL)
        ),
        'by_type', jsonb_build_object(
            'RFQ', jsonb_build_object(
                'total', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'RFQ'::ticket_type),
                'submitted', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'RFQ'::ticket_type AND status IN ('submitted'::quote_status, 'sent_to_customer'::quote_status, 'accepted'::quote_status)),
                'rejected', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'RFQ'::ticket_type AND status = 'rejected'::quote_status),
                'avg_turnaround', (SELECT ROUND(AVG(turnaround_seconds)) FROM ops_data WHERE ticket_type = 'RFQ'::ticket_type AND turnaround_seconds IS NOT NULL)
            ),
            'GEN', jsonb_build_object(
                'total', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'GEN'::ticket_type),
                'submitted', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'GEN'::ticket_type AND status IN ('submitted'::quote_status, 'sent_to_customer'::quote_status, 'accepted'::quote_status)),
                'rejected', (SELECT COUNT(*) FROM ops_data WHERE ticket_type = 'GEN'::ticket_type AND status = 'rejected'::quote_status),
                'avg_turnaround', (SELECT ROUND(AVG(turnaround_seconds)) FROM ops_data WHERE ticket_type = 'GEN'::ticket_type AND turnaround_seconds IS NOT NULL)
            )
        ),
        'rejection_reasons', (
            SELECT COALESCE(jsonb_object_agg(reason, count), '{}')
            FROM cost_rejection_reasons
        ),
        'approval_rate', (
            SELECT CASE
                WHEN COUNT(*) FILTER (WHERE status IN ('submitted'::quote_status, 'sent_to_customer'::quote_status, 'accepted'::quote_status, 'rejected'::quote_status, 'revise_requested'::quote_status)) > 0
                THEN ROUND((COUNT(*) FILTER (WHERE status IN ('submitted'::quote_status, 'sent_to_customer'::quote_status, 'accepted'::quote_status))::NUMERIC / COUNT(*) FILTER (WHERE status IN ('submitted'::quote_status, 'sent_to_customer'::quote_status, 'accepted'::quote_status, 'rejected'::quote_status, 'revise_requested'::quote_status))) * 100, 1)
                ELSE 0
            END
            FROM ops_data
        )
    ) INTO v_ops_cost_analytics;

    -- ============================================
    -- SECTION 7: Leaderboards (NO view_mode filter)
    -- ============================================
    WITH user_stats AS (
        SELECT
            p.user_id,
            p.name as name,
            p.role,
            p.department,
            COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id AND t.status IN ('resolved'::ticket_status, 'closed'::ticket_status) THEN t.id END) as tickets_completed,
            COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id THEN t.id END) as tickets_assigned,
            AVG(CASE WHEN trm.ticket_id = t.id AND t.assigned_to = p.user_id THEN trm.assignee_first_response_seconds END) as avg_first_response,
            COUNT(DISTINCT CASE WHEN trq.created_by = p.user_id AND trq.status IN ('submitted'::quote_status, 'sent_to_customer'::quote_status, 'accepted'::quote_status) THEN trq.id END) as quotes_submitted,
            COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id AND t.close_outcome = 'won'::ticket_close_outcome THEN t.id END) as tickets_won,
            COUNT(DISTINCT CASE WHEN t.assigned_to = p.user_id AND t.close_outcome = 'lost'::ticket_close_outcome THEN t.id END) as tickets_lost
        FROM public.profiles p
        LEFT JOIN public.tickets t ON (t.assigned_to = p.user_id OR t.created_by = p.user_id) AND t.created_at >= v_start_date
        LEFT JOIN public.ticket_response_metrics trm ON trm.ticket_id = t.id
        LEFT JOIN public.ticket_rate_quotes trq ON trq.ticket_id = t.id
        WHERE (
            v_scope = 'all'
            OR (v_scope = 'department' AND t.department = v_user_department)
            OR (v_scope = 'user' AND p.user_id = v_user_id)
        )
        GROUP BY p.user_id, p.name, p.role, p.department
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
            'is_ops', v_is_ops,
            'view_mode', v_view_mode,
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

-- Grant: must match exact 5-param signature
GRANT EXECUTE ON FUNCTION public.rpc_ticketing_overview_v2(INTEGER, UUID, TEXT, TEXT, TEXT) TO authenticated;
