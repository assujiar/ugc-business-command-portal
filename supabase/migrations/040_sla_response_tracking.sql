-- ============================================
-- Migration: 040_sla_response_tracking.sql
-- Advanced SLA Response Time Tracking System
-- ============================================
-- Features:
-- - Track response time exchanges between creator and assignee
-- - Calculate business hours (08:00-18:00 weekdays)
-- - Holiday configuration for SLA calculations
-- - Response metrics (avg response time, avg first response, avg resolution)
-- ============================================

-- ============================================
-- 1. NEW ENUMS
-- ============================================

-- Response Owner: who needs to respond next
DO $$ BEGIN
    CREATE TYPE response_owner AS ENUM ('creator', 'assignee');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE response_owner IS 'Indicates who needs to respond next on a ticket';

-- ============================================
-- 2. UPDATE TICKETS TABLE
-- Add pending_response_from to track who needs to respond
-- ============================================

ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS pending_response_from response_owner DEFAULT 'assignee';

COMMENT ON COLUMN public.tickets.pending_response_from IS 'Who needs to respond next (creator/assignee)';

-- Create index for pending response queries
CREATE INDEX IF NOT EXISTS idx_tickets_pending_response_from ON public.tickets(pending_response_from);

-- ============================================
-- 3. SLA BUSINESS HOURS CONFIGURATION
-- Configurable working hours per day
-- ============================================

CREATE TABLE IF NOT EXISTS public.sla_business_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday, 6=Saturday
    is_working_day BOOLEAN DEFAULT TRUE,
    start_time TIME NOT NULL DEFAULT '08:00:00',
    end_time TIME NOT NULL DEFAULT '18:00:00',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(day_of_week)
);

COMMENT ON TABLE public.sla_business_hours IS 'Business hours configuration for SLA calculations';

-- Insert default business hours (Monday-Friday 08:00-18:00)
INSERT INTO public.sla_business_hours (day_of_week, is_working_day, start_time, end_time)
VALUES
    (0, FALSE, '08:00:00', '18:00:00'), -- Sunday - not working
    (1, TRUE, '08:00:00', '18:00:00'),  -- Monday
    (2, TRUE, '08:00:00', '18:00:00'),  -- Tuesday
    (3, TRUE, '08:00:00', '18:00:00'),  -- Wednesday
    (4, TRUE, '08:00:00', '18:00:00'),  -- Thursday
    (5, TRUE, '08:00:00', '18:00:00'),  -- Friday
    (6, FALSE, '08:00:00', '18:00:00')  -- Saturday - not working
ON CONFLICT (day_of_week) DO NOTHING;

-- ============================================
-- 4. SLA HOLIDAYS TABLE
-- Public holidays excluded from SLA calculations
-- ============================================

CREATE TABLE IF NOT EXISTS public.sla_holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holiday_date DATE NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_recurring BOOLEAN DEFAULT FALSE, -- Annual recurring holiday
    created_by UUID REFERENCES public.profiles(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.sla_holidays IS 'Holidays excluded from SLA business hours calculations';

CREATE INDEX IF NOT EXISTS idx_sla_holidays_date ON public.sla_holidays(holiday_date);

-- ============================================
-- 5. TICKET RESPONSE EXCHANGES TABLE
-- Track each response exchange between creator and assignee
-- ============================================

CREATE TABLE IF NOT EXISTS public.ticket_response_exchanges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,

    -- Response details
    responder_user_id UUID NOT NULL REFERENCES public.profiles(user_id),
    responder_type response_owner NOT NULL, -- 'creator' or 'assignee'
    comment_id UUID REFERENCES public.ticket_comments(id) ON DELETE SET NULL,

    -- Timing (from last response of the other party)
    previous_response_at TIMESTAMPTZ, -- When the other party last responded
    responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Response time calculation
    raw_response_seconds INTEGER, -- Total seconds (raw, including non-business hours)
    business_response_seconds INTEGER, -- Business hours only (08:00-18:00 weekdays)

    -- Sequence tracking
    exchange_number INTEGER NOT NULL, -- 1, 2, 3, etc.

    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ticket_response_exchanges IS 'Tracks response time exchanges between ticket creator and assignee';

CREATE INDEX IF NOT EXISTS idx_ticket_response_exchanges_ticket_id ON public.ticket_response_exchanges(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_response_exchanges_responder ON public.ticket_response_exchanges(responder_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_response_exchanges_responder_type ON public.ticket_response_exchanges(responder_type);

-- ============================================
-- 6. TICKET RESPONSE METRICS TABLE
-- Cached/aggregated metrics per ticket
-- ============================================

CREATE TABLE IF NOT EXISTS public.ticket_response_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID UNIQUE NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,

    -- Creator metrics
    creator_total_responses INTEGER DEFAULT 0,
    creator_avg_response_seconds INTEGER DEFAULT 0,
    creator_avg_business_response_seconds INTEGER DEFAULT 0,

    -- Assignee (department) metrics
    assignee_total_responses INTEGER DEFAULT 0,
    assignee_avg_response_seconds INTEGER DEFAULT 0,
    assignee_avg_business_response_seconds INTEGER DEFAULT 0,
    assignee_first_response_seconds INTEGER, -- Time to first response from dept
    assignee_first_response_business_seconds INTEGER,

    -- Quote metrics (for RFQ)
    time_to_first_quote_seconds INTEGER,
    time_to_first_quote_business_seconds INTEGER,

    -- Resolution metrics
    time_to_resolution_seconds INTEGER,
    time_to_resolution_business_seconds INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ticket_response_metrics IS 'Aggregated response time metrics per ticket';

CREATE INDEX IF NOT EXISTS idx_ticket_response_metrics_ticket_id ON public.ticket_response_metrics(ticket_id);

-- ============================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS set_sla_business_hours_updated_at ON public.sla_business_hours;
CREATE TRIGGER set_sla_business_hours_updated_at
    BEFORE UPDATE ON public.sla_business_hours
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticketing_updated_at();

DROP TRIGGER IF EXISTS set_sla_holidays_updated_at ON public.sla_holidays;
CREATE TRIGGER set_sla_holidays_updated_at
    BEFORE UPDATE ON public.sla_holidays
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticketing_updated_at();

DROP TRIGGER IF EXISTS set_ticket_response_metrics_updated_at ON public.ticket_response_metrics;
CREATE TRIGGER set_ticket_response_metrics_updated_at
    BEFORE UPDATE ON public.ticket_response_metrics
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticketing_updated_at();

-- ============================================
-- 8. FUNCTION: Calculate Business Hours Between Two Timestamps
-- Only counts hours within working days and business hours
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_business_hours_seconds(
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS INTEGER AS $$
DECLARE
    v_current_time TIMESTAMPTZ;
    v_total_seconds INTEGER := 0;
    v_day_of_week INTEGER;
    v_business_hours RECORD;
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

        -- Get business hours for this day
        SELECT * INTO v_business_hours
        FROM public.sla_business_hours
        WHERE day_of_week = v_day_of_week;

        -- Check if it's a holiday
        SELECT EXISTS(
            SELECT 1 FROM public.sla_holidays
            WHERE holiday_date = v_current_time::DATE
        ) INTO v_is_holiday;

        -- Only count if it's a working day and not a holiday
        IF v_business_hours.is_working_day AND NOT v_is_holiday THEN
            -- Calculate working hours for this day
            v_day_start := DATE_TRUNC('day', v_current_time) + v_business_hours.start_time::INTERVAL;
            v_day_end := DATE_TRUNC('day', v_current_time) + v_business_hours.end_time::INTERVAL;

            -- Clamp to the actual range
            v_work_start := GREATEST(v_current_time, v_day_start);
            v_work_end := LEAST(p_end_time, v_day_end);

            -- Add seconds if there's overlap
            IF v_work_start < v_work_end THEN
                v_total_seconds := v_total_seconds + EXTRACT(EPOCH FROM (v_work_end - v_work_start))::INTEGER;
            END IF;
        END IF;

        -- Move to next day
        v_current_time := DATE_TRUNC('day', v_current_time) + INTERVAL '1 day';
    END LOOP;

    RETURN v_total_seconds;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.calculate_business_hours_seconds IS 'Calculates business hours (in seconds) between two timestamps';

-- ============================================
-- 9. FUNCTION: Record Response Exchange
-- Called when a comment is added to track response time
-- ============================================

CREATE OR REPLACE FUNCTION public.record_response_exchange(
    p_ticket_id UUID,
    p_responder_user_id UUID,
    p_comment_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_ticket public.tickets;
    v_responder_type response_owner;
    v_previous_response RECORD;
    v_raw_seconds INTEGER;
    v_business_seconds INTEGER;
    v_exchange_number INTEGER;
    v_new_pending_from response_owner;
BEGIN
    -- Get ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Ticket not found');
    END IF;

    -- Determine responder type
    IF p_responder_user_id = v_ticket.created_by THEN
        v_responder_type := 'creator';
        v_new_pending_from := 'assignee';
    ELSE
        v_responder_type := 'assignee';
        v_new_pending_from := 'creator';
    END IF;

    -- Get the FIRST response from the other party since last response by current party
    -- This implements the "gap calculation" requirement
    SELECT re.responded_at, re.id
    INTO v_previous_response
    FROM public.ticket_response_exchanges re
    WHERE re.ticket_id = p_ticket_id
    AND re.responder_type != v_responder_type
    ORDER BY re.responded_at DESC
    LIMIT 1;

    -- If no previous response from other party, use ticket creation time for assignee's first response
    IF v_previous_response IS NULL THEN
        IF v_responder_type = 'assignee' THEN
            -- Assignee's first response - measure from ticket creation
            v_raw_seconds := EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at))::INTEGER;
            v_business_seconds := public.calculate_business_hours_seconds(v_ticket.created_at, NOW());
        ELSE
            -- Creator responding first (shouldn't happen normally)
            v_raw_seconds := 0;
            v_business_seconds := 0;
        END IF;
    ELSE
        -- Calculate from last response of other party
        v_raw_seconds := EXTRACT(EPOCH FROM (NOW() - v_previous_response.responded_at))::INTEGER;
        v_business_seconds := public.calculate_business_hours_seconds(v_previous_response.responded_at, NOW());
    END IF;

    -- Get exchange number
    SELECT COALESCE(MAX(exchange_number), 0) + 1
    INTO v_exchange_number
    FROM public.ticket_response_exchanges
    WHERE ticket_id = p_ticket_id;

    -- Insert response exchange record
    INSERT INTO public.ticket_response_exchanges (
        ticket_id,
        responder_user_id,
        responder_type,
        comment_id,
        previous_response_at,
        responded_at,
        raw_response_seconds,
        business_response_seconds,
        exchange_number
    ) VALUES (
        p_ticket_id,
        p_responder_user_id,
        v_responder_type,
        p_comment_id,
        COALESCE(v_previous_response.responded_at, v_ticket.created_at),
        NOW(),
        v_raw_seconds,
        v_business_seconds,
        v_exchange_number
    );

    -- Update ticket pending_response_from
    UPDATE public.tickets
    SET pending_response_from = v_new_pending_from
    WHERE id = p_ticket_id;

    -- Update metrics
    PERFORM public.update_ticket_response_metrics(p_ticket_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'responder_type', v_responder_type,
        'raw_seconds', v_raw_seconds,
        'business_seconds', v_business_seconds,
        'exchange_number', v_exchange_number
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_response_exchange IS 'Records a response exchange and calculates response time';

-- ============================================
-- 10. FUNCTION: Update Ticket Response Metrics
-- Recalculates aggregated metrics for a ticket
-- ============================================

CREATE OR REPLACE FUNCTION public.update_ticket_response_metrics(
    p_ticket_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_ticket public.tickets;
    v_creator_metrics RECORD;
    v_assignee_metrics RECORD;
    v_first_quote RECORD;
BEGIN
    -- Get ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RETURN;
    END IF;

    -- Calculate creator metrics
    SELECT
        COUNT(*) as total_responses,
        COALESCE(AVG(raw_response_seconds), 0)::INTEGER as avg_raw,
        COALESCE(AVG(business_response_seconds), 0)::INTEGER as avg_business
    INTO v_creator_metrics
    FROM public.ticket_response_exchanges
    WHERE ticket_id = p_ticket_id
    AND responder_type = 'creator';

    -- Calculate assignee metrics
    SELECT
        COUNT(*) as total_responses,
        COALESCE(AVG(raw_response_seconds), 0)::INTEGER as avg_raw,
        COALESCE(AVG(business_response_seconds), 0)::INTEGER as avg_business,
        MIN(raw_response_seconds) FILTER (WHERE exchange_number = 1 OR previous_response_at = (SELECT created_at FROM public.tickets WHERE id = p_ticket_id)) as first_raw,
        MIN(business_response_seconds) FILTER (WHERE exchange_number = 1 OR previous_response_at = (SELECT created_at FROM public.tickets WHERE id = p_ticket_id)) as first_business
    INTO v_assignee_metrics
    FROM public.ticket_response_exchanges
    WHERE ticket_id = p_ticket_id
    AND responder_type = 'assignee';

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
        v_assignee_metrics.first_raw,
        v_assignee_metrics.first_business,
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

COMMENT ON FUNCTION public.update_ticket_response_metrics IS 'Updates aggregated response metrics for a ticket';

-- ============================================
-- 11. RPC: Get Ticket SLA Details
-- Returns comprehensive SLA info for a ticket
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_get_ticket_sla_details(
    p_ticket_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_sla_tracking public.ticket_sla_tracking;
    v_metrics public.ticket_response_metrics;
    v_exchanges JSONB;
    v_ticket_age_seconds INTEGER;
    v_ticket_age_business_seconds INTEGER;
    v_is_sla_breached BOOLEAN;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Ticket not found');
    END IF;

    -- Get SLA tracking
    SELECT * INTO v_sla_tracking
    FROM public.ticket_sla_tracking
    WHERE ticket_id = p_ticket_id;

    -- Get response metrics
    SELECT * INTO v_metrics
    FROM public.ticket_response_metrics
    WHERE ticket_id = p_ticket_id;

    -- Get response exchanges
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', re.id,
            'responder_type', re.responder_type,
            'responded_at', re.responded_at,
            'raw_response_seconds', re.raw_response_seconds,
            'business_response_seconds', re.business_response_seconds,
            'exchange_number', re.exchange_number,
            'responder', jsonb_build_object(
                'user_id', p.user_id,
                'name', p.name
            )
        ) ORDER BY re.exchange_number
    ), '[]'::jsonb) INTO v_exchanges
    FROM public.ticket_response_exchanges re
    JOIN public.profiles p ON p.user_id = re.responder_user_id
    WHERE re.ticket_id = p_ticket_id;

    -- Calculate ticket age
    v_ticket_age_seconds := EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at))::INTEGER;
    v_ticket_age_business_seconds := public.calculate_business_hours_seconds(v_ticket.created_at, NOW());

    -- Check SLA breach (first response)
    v_is_sla_breached := FALSE;
    IF v_sla_tracking IS NOT NULL AND v_sla_tracking.first_response_at IS NULL THEN
        IF v_ticket_age_business_seconds > (v_sla_tracking.first_response_sla_hours * 3600) THEN
            v_is_sla_breached := TRUE;
        END IF;
    ELSIF v_sla_tracking IS NOT NULL AND v_sla_tracking.first_response_met = FALSE THEN
        v_is_sla_breached := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'ticket_code', v_ticket.ticket_code,
        'status', v_ticket.status,
        'pending_response_from', v_ticket.pending_response_from,
        'created_at', v_ticket.created_at,
        'created_by', v_ticket.created_by,
        'assigned_to', v_ticket.assigned_to,

        -- SLA Tracking
        'sla', jsonb_build_object(
            'first_response_sla_hours', COALESCE(v_sla_tracking.first_response_sla_hours, 4),
            'first_response_at', v_sla_tracking.first_response_at,
            'first_response_met', v_sla_tracking.first_response_met,
            'resolution_sla_hours', COALESCE(v_sla_tracking.resolution_sla_hours, 48),
            'resolution_at', v_sla_tracking.resolution_at,
            'resolution_met', v_sla_tracking.resolution_met,
            'is_breached', v_is_sla_breached
        ),

        -- Ticket Age
        'age', jsonb_build_object(
            'total_seconds', v_ticket_age_seconds,
            'business_seconds', v_ticket_age_business_seconds,
            'formatted', public.format_duration(v_ticket_age_seconds)
        ),

        -- Response Metrics
        'metrics', CASE WHEN v_metrics IS NOT NULL THEN jsonb_build_object(
            'creator', jsonb_build_object(
                'total_responses', v_metrics.creator_total_responses,
                'avg_response_seconds', v_metrics.creator_avg_response_seconds,
                'avg_business_response_seconds', v_metrics.creator_avg_business_response_seconds,
                'avg_formatted', public.format_duration(v_metrics.creator_avg_business_response_seconds)
            ),
            'assignee', jsonb_build_object(
                'total_responses', v_metrics.assignee_total_responses,
                'avg_response_seconds', v_metrics.assignee_avg_response_seconds,
                'avg_business_response_seconds', v_metrics.assignee_avg_business_response_seconds,
                'avg_formatted', public.format_duration(v_metrics.assignee_avg_business_response_seconds),
                'first_response_seconds', v_metrics.assignee_first_response_seconds,
                'first_response_business_seconds', v_metrics.assignee_first_response_business_seconds,
                'first_response_formatted', public.format_duration(v_metrics.assignee_first_response_business_seconds)
            ),
            'quote', jsonb_build_object(
                'time_to_first_quote_seconds', v_metrics.time_to_first_quote_seconds,
                'time_to_first_quote_business_seconds', v_metrics.time_to_first_quote_business_seconds,
                'time_to_first_quote_formatted', public.format_duration(v_metrics.time_to_first_quote_business_seconds)
            ),
            'resolution', jsonb_build_object(
                'time_to_resolution_seconds', v_metrics.time_to_resolution_seconds,
                'time_to_resolution_business_seconds', v_metrics.time_to_resolution_business_seconds,
                'time_to_resolution_formatted', public.format_duration(v_metrics.time_to_resolution_business_seconds)
            )
        ) ELSE NULL END,

        -- Response Exchanges History
        'exchanges', v_exchanges
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.rpc_get_ticket_sla_details IS 'Returns comprehensive SLA details for a ticket';

-- ============================================
-- 12. HELPER FUNCTION: Format Duration
-- Formats seconds into human readable string
-- ============================================

CREATE OR REPLACE FUNCTION public.format_duration(
    p_seconds INTEGER
)
RETURNS TEXT AS $$
DECLARE
    v_days INTEGER;
    v_hours INTEGER;
    v_minutes INTEGER;
    v_result TEXT := '';
BEGIN
    IF p_seconds IS NULL THEN
        RETURN 'N/A';
    END IF;

    v_days := p_seconds / 86400;
    v_hours := (p_seconds % 86400) / 3600;
    v_minutes := (p_seconds % 3600) / 60;

    IF v_days > 0 THEN
        v_result := v_days || 'd ';
    END IF;

    IF v_hours > 0 OR v_days > 0 THEN
        v_result := v_result || v_hours || 'h ';
    END IF;

    v_result := v_result || v_minutes || 'm';

    RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.format_duration IS 'Formats seconds into human readable duration string';

-- ============================================
-- 13. RLS POLICIES
-- ============================================

-- SLA Business Hours - Only superadmin can modify
ALTER TABLE public.sla_business_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view business hours" ON public.sla_business_hours;
CREATE POLICY "Authenticated users can view business hours" ON public.sla_business_hours
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Superadmin can manage business hours" ON public.sla_business_hours;
CREATE POLICY "Superadmin can manage business hours" ON public.sla_business_hours
    FOR ALL TO authenticated
    USING (public.is_ticketing_admin(auth.uid()))
    WITH CHECK (public.is_ticketing_admin(auth.uid()));

-- SLA Holidays - Only superadmin can modify
ALTER TABLE public.sla_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view holidays" ON public.sla_holidays;
CREATE POLICY "Authenticated users can view holidays" ON public.sla_holidays
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Superadmin can manage holidays" ON public.sla_holidays;
CREATE POLICY "Superadmin can manage holidays" ON public.sla_holidays
    FOR ALL TO authenticated
    USING (public.is_ticketing_admin(auth.uid()))
    WITH CHECK (public.is_ticketing_admin(auth.uid()));

-- Response Exchanges - Based on ticket access
ALTER TABLE public.ticket_response_exchanges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view response exchanges for their tickets" ON public.ticket_response_exchanges;
CREATE POLICY "Users can view response exchanges for their tickets" ON public.ticket_response_exchanges
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
            )
        )
    );

-- Response Metrics - Based on ticket access
ALTER TABLE public.ticket_response_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view response metrics for their tickets" ON public.ticket_response_metrics;
CREATE POLICY "Users can view response metrics for their tickets" ON public.ticket_response_metrics
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
            )
        )
    );

-- ============================================
-- 14. GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON public.sla_business_hours TO authenticated;
GRANT SELECT ON public.sla_holidays TO authenticated;
GRANT SELECT ON public.ticket_response_exchanges TO authenticated;
GRANT SELECT ON public.ticket_response_metrics TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_business_hours_seconds(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_response_exchange(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ticket_response_metrics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_ticket_sla_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.format_duration(INTEGER) TO authenticated;
