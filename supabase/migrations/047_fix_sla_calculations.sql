-- =====================================================
-- Migration: 047_fix_sla_calculations.sql
-- Fix business hours calculation and response metrics
-- =====================================================

-- 1. Ensure sla_business_hours has default data
INSERT INTO public.sla_business_hours (day_of_week, is_working_day, start_time, end_time)
VALUES
    (0, FALSE, '08:00:00', '18:00:00'), -- Sunday - not working
    (1, TRUE, '08:00:00', '18:00:00'),  -- Monday
    (2, TRUE, '08:00:00', '18:00:00'),  -- Tuesday
    (3, TRUE, '08:00:00', '18:00:00'),  -- Wednesday
    (4, TRUE, '08:00:00', '18:00:00'),  -- Thursday
    (5, TRUE, '08:00:00', '18:00:00'),  -- Friday
    (6, FALSE, '08:00:00', '18:00:00')  -- Saturday - not working
ON CONFLICT (day_of_week) DO UPDATE SET
    is_working_day = EXCLUDED.is_working_day,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time;

-- 2. Fix calculate_business_hours_seconds with default fallback
CREATE OR REPLACE FUNCTION public.calculate_business_hours_seconds(
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS INTEGER AS $$
DECLARE
    v_current_time TIMESTAMPTZ;
    v_total_seconds INTEGER := 0;
    v_day_of_week INTEGER;
    v_is_working_day BOOLEAN;
    v_start_time TIME;
    v_end_time TIME;
    v_day_start TIMESTAMPTZ;
    v_day_end TIMESTAMPTZ;
    v_work_start TIMESTAMPTZ;
    v_work_end TIMESTAMPTZ;
    v_is_holiday BOOLEAN;
BEGIN
    IF p_start_time IS NULL OR p_end_time IS NULL THEN
        RETURN NULL;
    END IF;

    IF p_start_time >= p_end_time THEN
        RETURN 0;
    END IF;

    v_current_time := p_start_time;

    -- Iterate through each day
    WHILE v_current_time < p_end_time LOOP
        v_day_of_week := EXTRACT(DOW FROM v_current_time)::INTEGER;

        -- Get business hours for this day (with defaults)
        SELECT
            COALESCE(is_working_day, v_day_of_week BETWEEN 1 AND 5), -- Default: Mon-Fri are working days
            COALESCE(start_time, '08:00:00'::TIME),
            COALESCE(end_time, '18:00:00'::TIME)
        INTO v_is_working_day, v_start_time, v_end_time
        FROM public.sla_business_hours
        WHERE day_of_week = v_day_of_week;

        -- If no row found, use defaults
        IF NOT FOUND THEN
            v_is_working_day := (v_day_of_week BETWEEN 1 AND 5); -- Mon-Fri
            v_start_time := '08:00:00'::TIME;
            v_end_time := '18:00:00'::TIME;
        END IF;

        -- Check if it's a holiday
        SELECT EXISTS(
            SELECT 1 FROM public.sla_holidays
            WHERE holiday_date = v_current_time::DATE
        ) INTO v_is_holiday;

        -- Only count if it's a working day and not a holiday
        IF v_is_working_day AND NOT COALESCE(v_is_holiday, FALSE) THEN
            -- Calculate working hours for this day
            v_day_start := DATE_TRUNC('day', v_current_time) + v_start_time::INTERVAL;
            v_day_end := DATE_TRUNC('day', v_current_time) + v_end_time::INTERVAL;

            -- Clamp to the actual range
            v_work_start := GREATEST(v_current_time, v_day_start);
            v_work_end := LEAST(p_end_time, v_day_end);

            -- Add seconds if there's overlap
            IF v_work_start < v_work_end THEN
                v_total_seconds := v_total_seconds + EXTRACT(EPOCH FROM (v_work_end - v_work_start))::INTEGER;
            END IF;
        END IF;

        -- Move to start of next day
        v_current_time := DATE_TRUNC('day', v_current_time) + INTERVAL '1 day';
    END LOOP;

    RETURN v_total_seconds;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.calculate_business_hours_seconds IS 'Calculates business hours (in seconds) between two timestamps with default fallback';

-- 3. Fix update_ticket_response_metrics - proper first response calculation
CREATE OR REPLACE FUNCTION public.update_ticket_response_metrics(
    p_ticket_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_ticket public.tickets;
    v_creator_metrics RECORD;
    v_assignee_metrics RECORD;
    v_first_quote RECORD;
    v_first_response RECORD;
BEGIN
    -- Get ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RETURN;
    END IF;

    -- Calculate creator metrics (tektokan avg per ticket)
    -- Sum of all response times / count of responses for this ticket
    SELECT
        COUNT(*) as total_responses,
        COALESCE(SUM(raw_response_seconds), 0)::INTEGER as sum_raw,
        COALESCE(SUM(business_response_seconds), 0)::INTEGER as sum_business,
        CASE WHEN COUNT(*) > 0
            THEN COALESCE(SUM(raw_response_seconds) / COUNT(*), 0)::INTEGER
            ELSE 0 END as avg_raw,
        CASE WHEN COUNT(*) > 0
            THEN COALESCE(SUM(business_response_seconds) / COUNT(*), 0)::INTEGER
            ELSE 0 END as avg_business
    INTO v_creator_metrics
    FROM public.ticket_response_exchanges
    WHERE ticket_id = p_ticket_id
    AND responder_type = 'creator';

    -- Calculate assignee metrics (tektokan avg per ticket)
    SELECT
        COUNT(*) as total_responses,
        COALESCE(SUM(raw_response_seconds), 0)::INTEGER as sum_raw,
        COALESCE(SUM(business_response_seconds), 0)::INTEGER as sum_business,
        CASE WHEN COUNT(*) > 0
            THEN COALESCE(SUM(raw_response_seconds) / COUNT(*), 0)::INTEGER
            ELSE 0 END as avg_raw,
        CASE WHEN COUNT(*) > 0
            THEN COALESCE(SUM(business_response_seconds) / COUNT(*), 0)::INTEGER
            ELSE 0 END as avg_business
    INTO v_assignee_metrics
    FROM public.ticket_response_exchanges
    WHERE ticket_id = p_ticket_id
    AND responder_type = 'assignee';

    -- Get first response from assignee specifically (first one after ticket creation)
    SELECT
        raw_response_seconds as first_raw,
        business_response_seconds as first_business
    INTO v_first_response
    FROM public.ticket_response_exchanges
    WHERE ticket_id = p_ticket_id
    AND responder_type = 'assignee'
    ORDER BY responded_at ASC
    LIMIT 1;

    -- Get first quote time for RFQ tickets
    IF v_ticket.ticket_type = 'RFQ' THEN
        SELECT
            EXTRACT(EPOCH FROM (MIN(created_at) - v_ticket.created_at))::INTEGER as raw_seconds,
            public.calculate_business_hours_seconds(v_ticket.created_at, MIN(created_at)) as business_seconds
        INTO v_first_quote
        FROM public.ticket_rate_quotes
        WHERE ticket_id = p_ticket_id;
    END IF;

    -- Upsert metrics
    INSERT INTO public.ticket_response_metrics (
        ticket_id,
        creator_total_responses,
        creator_avg_response_seconds,
        creator_avg_business_response_seconds,
        assignee_total_responses,
        assignee_avg_response_seconds,
        assignee_avg_business_response_seconds,
        assignee_first_response_seconds,
        assignee_first_response_business_seconds,
        time_to_first_quote_seconds,
        time_to_first_quote_business_seconds,
        time_to_resolution_seconds,
        time_to_resolution_business_seconds
    ) VALUES (
        p_ticket_id,
        v_creator_metrics.total_responses,
        v_creator_metrics.avg_raw,
        v_creator_metrics.avg_business,
        v_assignee_metrics.total_responses,
        v_assignee_metrics.avg_raw,
        v_assignee_metrics.avg_business,
        v_first_response.first_raw,
        v_first_response.first_business,
        v_first_quote.raw_seconds,
        v_first_quote.business_seconds,
        CASE WHEN v_ticket.resolved_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (v_ticket.resolved_at - v_ticket.created_at))::INTEGER
            ELSE NULL END,
        CASE WHEN v_ticket.resolved_at IS NOT NULL
            THEN public.calculate_business_hours_seconds(v_ticket.created_at, v_ticket.resolved_at)
            ELSE NULL END
    )
    ON CONFLICT (ticket_id) DO UPDATE SET
        creator_total_responses = EXCLUDED.creator_total_responses,
        creator_avg_response_seconds = EXCLUDED.creator_avg_response_seconds,
        creator_avg_business_response_seconds = EXCLUDED.creator_avg_business_response_seconds,
        assignee_total_responses = EXCLUDED.assignee_total_responses,
        assignee_avg_response_seconds = EXCLUDED.assignee_avg_response_seconds,
        assignee_avg_business_response_seconds = EXCLUDED.assignee_avg_business_response_seconds,
        assignee_first_response_seconds = COALESCE(EXCLUDED.assignee_first_response_seconds, public.ticket_response_metrics.assignee_first_response_seconds),
        assignee_first_response_business_seconds = COALESCE(EXCLUDED.assignee_first_response_business_seconds, public.ticket_response_metrics.assignee_first_response_business_seconds),
        time_to_first_quote_seconds = COALESCE(EXCLUDED.time_to_first_quote_seconds, public.ticket_response_metrics.time_to_first_quote_seconds),
        time_to_first_quote_business_seconds = COALESCE(EXCLUDED.time_to_first_quote_business_seconds, public.ticket_response_metrics.time_to_first_quote_business_seconds),
        time_to_resolution_seconds = EXCLUDED.time_to_resolution_seconds,
        time_to_resolution_business_seconds = EXCLUDED.time_to_resolution_business_seconds,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.update_ticket_response_metrics IS 'Updates aggregated response metrics for a ticket - tektokan avg = sum/count';

-- 4. Recalculate all existing ticket metrics
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.tickets LOOP
        PERFORM public.update_ticket_response_metrics(r.id);
    END LOOP;
END $$;
