-- ============================================
-- Migration 075: Comprehensive CRM & Ticketing Enhancements
--
-- This migration implements:
-- 1. Add origin_dept and target_dept to tickets table
-- 2. Create ticket_responses table for SLA tracking
-- 3. Enhanced RLS policies for department-based ticket access
-- 4. Marketing Manager pipeline visibility improvements
-- ============================================

-- ============================================
-- 1. ADD DEPARTMENT COLUMNS TO TICKETS TABLE
-- origin_dept: Department that created/originated the ticket
-- target_dept: Department responsible for resolving the ticket
-- ============================================

-- Add origin_dept column (department that created the ticket)
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS origin_dept ticketing_department;

-- Add target_dept column (department that should resolve the ticket)
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS target_dept ticketing_department;

-- Set default values for existing tickets (origin = target = department)
UPDATE public.tickets
SET origin_dept = department,
    target_dept = department
WHERE origin_dept IS NULL OR target_dept IS NULL;

-- Create index for department-based queries
CREATE INDEX IF NOT EXISTS idx_tickets_origin_dept ON public.tickets(origin_dept);
CREATE INDEX IF NOT EXISTS idx_tickets_target_dept ON public.tickets(target_dept);
CREATE INDEX IF NOT EXISTS idx_tickets_origin_target_dept ON public.tickets(origin_dept, target_dept);

-- ============================================
-- 2. CREATE TICKET_RESPONSES TABLE FOR SLA TRACKING
-- Tracks response times for both creator and assignee
-- ============================================

CREATE TABLE IF NOT EXISTS public.ticket_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(user_id),
    -- Role indicates whether responder is creator or assignee
    responder_role VARCHAR(20) NOT NULL CHECK (responder_role IN ('creator', 'assignee', 'ops', 'admin')),
    -- Stage of the ticket when response was made
    ticket_stage VARCHAR(50),
    -- Response timestamp
    responded_at TIMESTAMPTZ DEFAULT NOW(),
    -- Response time in seconds from previous action
    response_time_seconds INTEGER,
    -- Content of the response (optional, can be linked to comment)
    comment_id UUID REFERENCES public.ticket_comments(id) ON DELETE SET NULL,
    -- For tracking SLA compliance
    sla_target_seconds INTEGER,
    sla_met BOOLEAN,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ticket_responses IS 'Tracks response times for SLA calculation per ticket stage';
COMMENT ON COLUMN public.ticket_responses.responder_role IS 'Role of responder: creator, assignee, ops, or admin';
COMMENT ON COLUMN public.ticket_responses.sla_met IS 'Whether this response met the SLA target';

-- Create indexes for ticket_responses
CREATE INDEX IF NOT EXISTS idx_ticket_responses_ticket_id ON public.ticket_responses(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_responses_user_id ON public.ticket_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_responses_responder_role ON public.ticket_responses(responder_role);
CREATE INDEX IF NOT EXISTS idx_ticket_responses_responded_at ON public.ticket_responses(responded_at DESC);

-- ============================================
-- 3. ENABLE RLS ON TICKET_RESPONSES
-- ============================================

ALTER TABLE public.ticket_responses ENABLE ROW LEVEL SECURITY;

-- SELECT: Based on ticket access
DROP POLICY IF EXISTS "ticket_responses_select_policy" ON public.ticket_responses;
CREATE POLICY "ticket_responses_select_policy" ON public.ticket_responses
    FOR SELECT
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR public.is_ticketing_ops(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
            )
        )
    );

-- INSERT: Users with ticket access can add responses
DROP POLICY IF EXISTS "ticket_responses_insert_policy" ON public.ticket_responses;
CREATE POLICY "ticket_responses_insert_policy" ON public.ticket_responses
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR public.is_ticketing_ops(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
            )
        )
    );

-- ============================================
-- 4. ENHANCED RLS FOR DEPARTMENT-BASED ACCESS
-- Users can access tickets where their dept is origin OR target
-- ============================================

-- Drop and recreate tickets select policy with department-based access
DROP POLICY IF EXISTS "tickets_select_policy" ON public.tickets;
CREATE POLICY "tickets_select_policy" ON public.tickets
    FOR SELECT
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (
            -- Admin sees all
            public.is_ticketing_admin(auth.uid())
            -- Ops sees their department's tickets (origin or target)
            OR (
                public.is_ticketing_ops(auth.uid())
                AND (
                    origin_dept = public.get_user_ticketing_department(auth.uid())
                    OR target_dept = public.get_user_ticketing_department(auth.uid())
                    OR department = public.get_user_ticketing_department(auth.uid())
                )
            )
            -- Creator sees own tickets
            OR created_by = auth.uid()
            -- Assignee sees assigned tickets
            OR assigned_to = auth.uid()
        )
    );

-- ============================================
-- 5. FUNCTION TO RECORD TICKET RESPONSE
-- Automatically calculates SLA compliance
-- ============================================

CREATE OR REPLACE FUNCTION public.record_ticket_response(
    p_ticket_id UUID,
    p_user_id UUID,
    p_responder_role VARCHAR(20),
    p_comment_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_response_id UUID;
    v_ticket RECORD;
    v_last_response TIMESTAMPTZ;
    v_response_time_seconds INTEGER;
    v_sla_config RECORD;
    v_sla_target_seconds INTEGER;
    v_sla_met BOOLEAN;
BEGIN
    -- Get ticket info
    SELECT * INTO v_ticket FROM public.tickets WHERE id = p_ticket_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
    END IF;

    -- Get last response time for this ticket
    SELECT MAX(responded_at) INTO v_last_response
    FROM public.ticket_responses
    WHERE ticket_id = p_ticket_id;

    -- Calculate response time (from last response or ticket creation)
    IF v_last_response IS NOT NULL THEN
        v_response_time_seconds := EXTRACT(EPOCH FROM (NOW() - v_last_response))::INTEGER;
    ELSE
        v_response_time_seconds := EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at))::INTEGER;
    END IF;

    -- Get SLA config for this department/type
    SELECT * INTO v_sla_config
    FROM public.ticketing_sla_config
    WHERE department = v_ticket.department
    AND ticket_type = v_ticket.ticket_type;

    -- Calculate SLA target (first response)
    IF v_sla_config IS NOT NULL THEN
        v_sla_target_seconds := v_sla_config.first_response_hours * 3600;
        v_sla_met := (v_response_time_seconds <= v_sla_target_seconds);
    ELSE
        v_sla_target_seconds := NULL;
        v_sla_met := NULL;
    END IF;

    -- Insert response record
    INSERT INTO public.ticket_responses (
        ticket_id,
        user_id,
        responder_role,
        ticket_stage,
        response_time_seconds,
        comment_id,
        sla_target_seconds,
        sla_met
    ) VALUES (
        p_ticket_id,
        p_user_id,
        p_responder_role,
        v_ticket.status::VARCHAR,
        v_response_time_seconds,
        p_comment_id,
        v_sla_target_seconds,
        v_sla_met
    )
    RETURNING id INTO v_response_id;

    RETURN v_response_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_ticket_response IS 'Records a ticket response and calculates SLA compliance';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.record_ticket_response(UUID, UUID, VARCHAR, UUID) TO authenticated;

-- ============================================
-- 6. TRIGGER TO AUTO-RECORD RESPONSES ON COMMENTS
-- ============================================

CREATE OR REPLACE FUNCTION public.auto_record_response_on_comment()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket RECORD;
    v_responder_role VARCHAR(20);
BEGIN
    -- Get ticket info
    SELECT * INTO v_ticket FROM public.tickets WHERE id = NEW.ticket_id;

    -- Determine responder role
    IF NEW.user_id = v_ticket.created_by THEN
        v_responder_role := 'creator';
    ELSIF NEW.user_id = v_ticket.assigned_to THEN
        v_responder_role := 'assignee';
    ELSIF public.is_ticketing_admin(NEW.user_id) THEN
        v_responder_role := 'admin';
    ELSIF public.is_ticketing_ops(NEW.user_id) THEN
        v_responder_role := 'ops';
    ELSE
        v_responder_role := 'creator'; -- Default to creator for external comments
    END IF;

    -- Record the response
    PERFORM public.record_ticket_response(
        NEW.ticket_id,
        NEW.user_id,
        v_responder_role,
        NEW.id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on ticket_comments
DROP TRIGGER IF EXISTS trigger_auto_record_response ON public.ticket_comments;
CREATE TRIGGER trigger_auto_record_response
    AFTER INSERT ON public.ticket_comments
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_record_response_on_comment();

-- ============================================
-- 7. VIEW FOR SLA METRICS BY STAGE AND RESPONDER
-- ============================================

CREATE OR REPLACE VIEW public.v_sla_metrics AS
SELECT
    t.id AS ticket_id,
    t.ticket_code,
    t.ticket_type,
    t.department,
    t.origin_dept,
    t.target_dept,
    t.status,
    t.created_at AS ticket_created_at,
    -- First response metrics
    MIN(CASE WHEN tr.responder_role IN ('assignee', 'ops', 'admin')
        THEN tr.responded_at END) AS first_response_at,
    MIN(CASE WHEN tr.responder_role IN ('assignee', 'ops', 'admin')
        THEN tr.response_time_seconds END) AS first_response_seconds,
    -- Get sla_met from the row with earliest response (correlated subquery)
    (
        SELECT tr2.sla_met
        FROM public.ticket_responses tr2
        WHERE tr2.ticket_id = t.id
        AND tr2.responder_role IN ('assignee', 'ops', 'admin')
        ORDER BY tr2.responded_at ASC
        LIMIT 1
    ) AS first_response_sla_met,
    -- Average response times by role
    AVG(CASE WHEN tr.responder_role = 'creator'
        THEN tr.response_time_seconds END)::INTEGER AS avg_creator_response_seconds,
    AVG(CASE WHEN tr.responder_role = 'assignee'
        THEN tr.response_time_seconds END)::INTEGER AS avg_assignee_response_seconds,
    -- Total responses
    COUNT(tr.id) AS total_responses,
    COUNT(CASE WHEN tr.responder_role = 'creator' THEN 1 END) AS creator_responses,
    COUNT(CASE WHEN tr.responder_role IN ('assignee', 'ops', 'admin') THEN 1 END) AS ops_responses
FROM public.tickets t
LEFT JOIN public.ticket_responses tr ON t.id = tr.ticket_id
GROUP BY t.id, t.ticket_code, t.ticket_type, t.department, t.origin_dept, t.target_dept, t.status, t.created_at;

COMMENT ON VIEW public.v_sla_metrics IS 'SLA metrics view with response times by stage and responder role';

-- Create composite index for correlated subquery performance
CREATE INDEX IF NOT EXISTS idx_ticket_responses_ticket_responded_at
    ON public.ticket_responses(ticket_id, responded_at);

-- ============================================
-- 8. HELPER FUNCTION FOR MARKETING VISIBILITY
-- Returns true if user is original creator of opportunity
-- ============================================

CREATE OR REPLACE FUNCTION public.is_marketing_creator(
    p_user_id UUID,
    p_opportunity_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_original_creator_id UUID;
    v_user_role TEXT;
BEGIN
    -- Get user role
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE user_id = p_user_id AND is_active = TRUE;

    -- Check if user is marketing
    IF v_user_role NOT IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO') THEN
        RETURN FALSE;
    END IF;

    -- Get original creator from opportunity
    SELECT original_creator_id INTO v_original_creator_id
    FROM public.opportunities
    WHERE opportunity_id = p_opportunity_id;

    -- Marketing Manager and MACX can see all marketing-created pipelines
    IF v_user_role IN ('Marketing Manager', 'MACX') THEN
        -- Check if original creator is from marketing
        RETURN EXISTS (
            SELECT 1 FROM public.profiles
            WHERE user_id = v_original_creator_id
            AND role IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO')
        );
    END IF;

    -- Other marketing roles can only see their own created pipelines
    RETURN p_user_id = v_original_creator_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_marketing_creator(UUID, UUID) TO authenticated;

-- ============================================
-- 9. SET ORIGIN/TARGET DEPT ON TICKET INSERT
-- Auto-populate origin_dept based on creator's department
-- ============================================

CREATE OR REPLACE FUNCTION public.set_ticket_departments()
RETURNS TRIGGER AS $$
BEGIN
    -- Set origin_dept from creator's department if not provided
    IF NEW.origin_dept IS NULL THEN
        NEW.origin_dept := public.get_user_ticketing_department(NEW.created_by);
    END IF;

    -- Set target_dept from department if not provided
    IF NEW.target_dept IS NULL THEN
        NEW.target_dept := NEW.department;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-setting departments
DROP TRIGGER IF EXISTS trigger_set_ticket_departments ON public.tickets;
CREATE TRIGGER trigger_set_ticket_departments
    BEFORE INSERT ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.set_ticket_departments();

-- ============================================
-- 10. GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON public.v_sla_metrics TO authenticated;
