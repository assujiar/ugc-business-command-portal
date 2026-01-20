-- ============================================
-- Ticketing Module - RPC Functions
-- Atomic operations for ticket workflows
-- ============================================

-- ============================================
-- TICKET CODE GENERATION FUNCTION
-- Format: [TYPE][DEPT]ddmmyyxxx
-- Examples: RFQDOM200126001, GENMKT150126002
-- Uses transaction-safe locking for sequence
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_ticket_code(
    p_ticket_type ticket_type,
    p_department ticketing_department
)
RETURNS VARCHAR(20) AS $$
DECLARE
    v_date_key VARCHAR(6);
    v_sequence INTEGER;
    v_ticket_code VARCHAR(20);
BEGIN
    -- Generate date key in ddmmyy format
    v_date_key := TO_CHAR(CURRENT_DATE, 'DDMMYY');

    -- Lock and get/increment sequence atomically
    INSERT INTO public.ticket_sequences (ticket_type, department, date_key, last_sequence)
    VALUES (p_ticket_type, p_department, v_date_key, 1)
    ON CONFLICT (ticket_type, department, date_key)
    DO UPDATE SET
        last_sequence = public.ticket_sequences.last_sequence + 1,
        updated_at = NOW()
    RETURNING last_sequence INTO v_sequence;

    -- Generate ticket code: TYPE + DEPT + DDMMYY + XXX (3-digit sequence)
    v_ticket_code := p_ticket_type::TEXT || p_department::TEXT || v_date_key || LPAD(v_sequence::TEXT, 3, '0');

    RETURN v_ticket_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.generate_ticket_code IS 'Generates unique ticket code with format [TYPE][DEPT]ddmmyyxxx';

-- ============================================
-- GENERATE QUOTE NUMBER FUNCTION
-- Format: QT-[TICKET_CODE]-XXX
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_ticket_quote_number(
    p_ticket_id UUID
)
RETURNS VARCHAR(30) AS $$
DECLARE
    v_ticket_code VARCHAR(20);
    v_quote_count INTEGER;
    v_quote_number VARCHAR(30);
BEGIN
    -- Get ticket code
    SELECT ticket_code INTO v_ticket_code
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket_code IS NULL THEN
        RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
    END IF;

    -- Count existing quotes for this ticket
    SELECT COUNT(*) + 1 INTO v_quote_count
    FROM public.ticket_rate_quotes
    WHERE ticket_id = p_ticket_id;

    -- Generate quote number
    v_quote_number := 'QT-' || v_ticket_code || '-' || LPAD(v_quote_count::TEXT, 3, '0');

    RETURN v_quote_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.generate_ticket_quote_number IS 'Generates unique quote number based on ticket code';

-- ============================================
-- RPC: CREATE TICKET (ATOMIC)
-- Creates ticket with auto-generated code and SLA tracking
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_create(
    p_ticket_type ticket_type,
    p_subject VARCHAR(255),
    p_description TEXT,
    p_department ticketing_department,
    p_priority ticket_priority DEFAULT 'medium',
    p_account_id UUID DEFAULT NULL,
    p_contact_id UUID DEFAULT NULL,
    p_rfq_data JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket_code VARCHAR(20);
    v_ticket public.tickets;
    v_sla_config public.ticketing_sla_config;
BEGIN
    -- Get current user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check permissions
    IF NOT public.can_access_ticketing(v_user_id) THEN
        RAISE EXCEPTION 'Access denied: User cannot access ticketing';
    END IF;

    -- Generate ticket code
    v_ticket_code := public.generate_ticket_code(p_ticket_type, p_department);

    -- Insert ticket
    INSERT INTO public.tickets (
        ticket_code,
        ticket_type,
        subject,
        description,
        department,
        created_by,
        priority,
        account_id,
        contact_id,
        rfq_data,
        status
    ) VALUES (
        v_ticket_code,
        p_ticket_type,
        p_subject,
        p_description,
        p_department,
        v_user_id,
        p_priority,
        p_account_id,
        p_contact_id,
        p_rfq_data,
        'open'
    ) RETURNING * INTO v_ticket;

    -- Get SLA config for this department and ticket type
    SELECT * INTO v_sla_config
    FROM public.ticketing_sla_config
    WHERE department = p_department
    AND ticket_type = p_ticket_type;

    -- Create SLA tracking record
    IF v_sla_config IS NOT NULL THEN
        INSERT INTO public.ticket_sla_tracking (
            ticket_id,
            first_response_sla_hours,
            resolution_sla_hours
        ) VALUES (
            v_ticket.id,
            v_sla_config.first_response_hours,
            v_sla_config.resolution_hours
        );
    ELSE
        -- Use defaults if no config found
        INSERT INTO public.ticket_sla_tracking (
            ticket_id,
            first_response_sla_hours,
            resolution_sla_hours
        ) VALUES (
            v_ticket.id,
            4,   -- Default 4 hours first response
            48   -- Default 48 hours resolution
        );
    END IF;

    -- Create audit event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        v_ticket.id,
        'created',
        v_user_id,
        jsonb_build_object(
            'ticket_code', v_ticket.ticket_code,
            'ticket_type', v_ticket.ticket_type,
            'subject', v_ticket.subject,
            'department', v_ticket.department,
            'priority', v_ticket.priority
        ),
        'Ticket created'
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', v_ticket.id,
        'ticket_code', v_ticket.ticket_code
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_create IS 'Creates a ticket atomically with auto-generated code and SLA tracking';

-- ============================================
-- RPC: ASSIGN TICKET (ATOMIC + RACE-SAFE)
-- Assigns ticket to user with history tracking
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_assign(
    p_ticket_id UUID,
    p_assigned_to UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_old_assignee UUID;
BEGIN
    -- Get current user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check permissions (only ops/admin can assign)
    IF NOT (public.is_ticketing_admin(v_user_id) OR public.is_ticketing_ops(v_user_id)) THEN
        RAISE EXCEPTION 'Access denied: Only Ops or Admin can assign tickets';
    END IF;

    -- Lock and get ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF v_ticket IS NULL THEN
        RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
    END IF;

    v_old_assignee := v_ticket.assigned_to;

    -- Update ticket
    UPDATE public.tickets
    SET
        assigned_to = p_assigned_to,
        status = CASE WHEN status = 'open' THEN 'in_progress'::ticket_status ELSE status END,
        updated_at = NOW()
    WHERE id = p_ticket_id
    RETURNING * INTO v_ticket;

    -- Record assignment history
    INSERT INTO public.ticket_assignments (
        ticket_id,
        assigned_to,
        assigned_by,
        notes
    ) VALUES (
        p_ticket_id,
        p_assigned_to,
        v_user_id,
        p_notes
    );

    -- Create audit event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        old_value,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        CASE WHEN v_old_assignee IS NULL THEN 'assigned'::ticket_event_type ELSE 'reassigned'::ticket_event_type END,
        v_user_id,
        CASE WHEN v_old_assignee IS NOT NULL THEN jsonb_build_object('assigned_to', v_old_assignee) ELSE NULL END,
        jsonb_build_object('assigned_to', p_assigned_to),
        p_notes
    );

    -- Update SLA first response if this is the first assignment
    IF v_old_assignee IS NULL THEN
        UPDATE public.ticket_sla_tracking
        SET
            first_response_at = NOW(),
            first_response_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= first_response_sla_hours,
            updated_at = NOW()
        WHERE ticket_id = p_ticket_id
        AND first_response_at IS NULL;

        UPDATE public.tickets
        SET first_response_at = NOW()
        WHERE id = p_ticket_id
        AND first_response_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', v_ticket.id,
        'assigned_to', p_assigned_to
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_assign IS 'Assigns ticket to user atomically with race-safe locking';

-- ============================================
-- RPC: TRANSITION TICKET STATUS (ATOMIC)
-- Changes ticket status with validation and audit
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_transition(
    p_ticket_id UUID,
    p_new_status ticket_status,
    p_notes TEXT DEFAULT NULL,
    p_close_outcome ticket_close_outcome DEFAULT NULL,
    p_close_reason TEXT DEFAULT NULL,
    p_competitor_name VARCHAR(255) DEFAULT NULL,
    p_competitor_cost DECIMAL(15,2) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_old_status ticket_status;
    v_allowed_transitions TEXT[];
BEGIN
    -- Get current user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock and get ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF v_ticket IS NULL THEN
        RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
    END IF;

    v_old_status := v_ticket.status;

    -- Define allowed transitions (state machine)
    CASE v_old_status
        WHEN 'open' THEN
            v_allowed_transitions := ARRAY['in_progress', 'pending', 'closed'];
        WHEN 'need_response' THEN
            v_allowed_transitions := ARRAY['in_progress', 'waiting_customer', 'resolved', 'closed'];
        WHEN 'in_progress' THEN
            v_allowed_transitions := ARRAY['need_response', 'waiting_customer', 'need_adjustment', 'pending', 'resolved', 'closed'];
        WHEN 'waiting_customer' THEN
            v_allowed_transitions := ARRAY['in_progress', 'need_adjustment', 'resolved', 'closed'];
        WHEN 'need_adjustment' THEN
            v_allowed_transitions := ARRAY['in_progress', 'resolved', 'closed'];
        WHEN 'pending' THEN
            v_allowed_transitions := ARRAY['open', 'in_progress', 'resolved', 'closed'];
        WHEN 'resolved' THEN
            v_allowed_transitions := ARRAY['closed', 'in_progress']; -- Can reopen
        WHEN 'closed' THEN
            v_allowed_transitions := ARRAY['open']; -- Can reopen
        ELSE
            v_allowed_transitions := ARRAY[]::TEXT[];
    END CASE;

    -- Validate transition
    IF NOT (p_new_status::TEXT = ANY(v_allowed_transitions)) THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', v_old_status, p_new_status;
    END IF;

    -- Update ticket
    UPDATE public.tickets
    SET
        status = p_new_status,
        updated_at = NOW(),
        resolved_at = CASE WHEN p_new_status = 'resolved' AND resolved_at IS NULL THEN NOW() ELSE resolved_at END,
        closed_at = CASE WHEN p_new_status = 'closed' THEN NOW() ELSE closed_at END,
        close_outcome = COALESCE(p_close_outcome, close_outcome),
        close_reason = COALESCE(p_close_reason, close_reason),
        competitor_name = COALESCE(p_competitor_name, competitor_name),
        competitor_cost = COALESCE(p_competitor_cost, competitor_cost)
    WHERE id = p_ticket_id
    RETURNING * INTO v_ticket;

    -- Create audit event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        old_value,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        CASE
            WHEN p_new_status = 'resolved' THEN 'resolved'::ticket_event_type
            WHEN p_new_status = 'closed' THEN 'closed'::ticket_event_type
            WHEN v_old_status = 'closed' AND p_new_status = 'open' THEN 'reopened'::ticket_event_type
            ELSE 'status_changed'::ticket_event_type
        END,
        v_user_id,
        jsonb_build_object('status', v_old_status),
        jsonb_build_object(
            'status', p_new_status,
            'close_outcome', p_close_outcome,
            'close_reason', p_close_reason
        ),
        p_notes
    );

    -- Update SLA resolution tracking
    IF p_new_status IN ('resolved', 'closed') THEN
        UPDATE public.ticket_sla_tracking
        SET
            resolution_at = NOW(),
            resolution_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= resolution_sla_hours,
            updated_at = NOW()
        WHERE ticket_id = p_ticket_id
        AND resolution_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', v_ticket.id,
        'old_status', v_old_status,
        'new_status', p_new_status
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_transition IS 'Transitions ticket status with validation and audit trail';

-- ============================================
-- RPC: ADD COMMENT (ATOMIC)
-- Adds comment to ticket with event tracking
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_add_comment(
    p_ticket_id UUID,
    p_content TEXT,
    p_is_internal BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_comment public.ticket_comments;
    v_response_time INTEGER;
    v_last_comment_at TIMESTAMPTZ;
BEGIN
    -- Get current user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if user can create internal comments
    IF p_is_internal AND NOT (public.is_ticketing_admin(v_user_id) OR public.is_ticketing_ops(v_user_id)) THEN
        RAISE EXCEPTION 'Only Ops or Admin can create internal comments';
    END IF;

    -- Get ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
    END IF;

    -- Calculate response time (for non-internal comments)
    IF NOT p_is_internal THEN
        SELECT created_at INTO v_last_comment_at
        FROM public.ticket_comments
        WHERE ticket_id = p_ticket_id
        AND is_internal = FALSE
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_last_comment_at IS NOT NULL THEN
            v_response_time := EXTRACT(EPOCH FROM (NOW() - v_last_comment_at))::INTEGER;
        ELSE
            v_response_time := EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at))::INTEGER;
        END IF;
    END IF;

    -- Insert comment
    INSERT INTO public.ticket_comments (
        ticket_id,
        user_id,
        content,
        is_internal,
        response_time_seconds,
        response_direction
    ) VALUES (
        p_ticket_id,
        v_user_id,
        p_content,
        p_is_internal,
        v_response_time,
        CASE WHEN v_user_id = v_ticket.created_by THEN 'inbound' ELSE 'outbound' END
    ) RETURNING * INTO v_comment;

    -- Create audit event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'comment_added',
        v_user_id,
        jsonb_build_object(
            'comment_id', v_comment.id,
            'is_internal', p_is_internal
        ),
        CASE WHEN p_is_internal THEN 'Internal note added' ELSE 'Comment added' END
    );

    -- Update SLA first response if this is the first response from ops
    IF NOT p_is_internal AND v_user_id != v_ticket.created_by THEN
        UPDATE public.ticket_sla_tracking
        SET
            first_response_at = NOW(),
            first_response_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= first_response_sla_hours,
            updated_at = NOW()
        WHERE ticket_id = p_ticket_id
        AND first_response_at IS NULL;

        UPDATE public.tickets
        SET first_response_at = NOW()
        WHERE id = p_ticket_id
        AND first_response_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'comment_id', v_comment.id,
        'ticket_id', p_ticket_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_add_comment IS 'Adds comment to ticket atomically with response time tracking';

-- ============================================
-- RPC: CREATE RATE QUOTE (ATOMIC)
-- Creates rate quote for RFQ ticket
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_create_quote(
    p_ticket_id UUID,
    p_amount DECIMAL(15,2),
    p_currency VARCHAR(3),
    p_valid_until DATE,
    p_terms TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_quote_number VARCHAR(30);
    v_quote public.ticket_rate_quotes;
BEGIN
    -- Get current user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check permissions (only ops/admin can create quotes)
    IF NOT (public.is_ticketing_admin(v_user_id) OR public.is_ticketing_ops(v_user_id)) THEN
        RAISE EXCEPTION 'Access denied: Only Ops or Admin can create quotes';
    END IF;

    -- Get ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
    END IF;

    -- Verify ticket is RFQ type
    IF v_ticket.ticket_type != 'RFQ' THEN
        RAISE EXCEPTION 'Quotes can only be created for RFQ tickets';
    END IF;

    -- Generate quote number
    v_quote_number := public.generate_ticket_quote_number(p_ticket_id);

    -- Insert quote
    INSERT INTO public.ticket_rate_quotes (
        ticket_id,
        quote_number,
        amount,
        currency,
        valid_until,
        terms,
        status,
        created_by
    ) VALUES (
        p_ticket_id,
        v_quote_number,
        p_amount,
        p_currency,
        p_valid_until,
        p_terms,
        'draft',
        v_user_id
    ) RETURNING * INTO v_quote;

    -- Create audit event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'quote_created',
        v_user_id,
        jsonb_build_object(
            'quote_id', v_quote.id,
            'quote_number', v_quote.quote_number,
            'amount', v_quote.amount,
            'currency', v_quote.currency
        ),
        'Rate quote created'
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'quote_id', v_quote.id,
        'quote_number', v_quote.quote_number
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_create_quote IS 'Creates rate quote for RFQ ticket atomically';

-- ============================================
-- RPC: GET DASHBOARD SUMMARY
-- Returns aggregated metrics for ticketing dashboard
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticketing_dashboard_summary(
    p_department ticketing_department DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_result JSONB;
    v_total INTEGER;
    v_open INTEGER;
    v_in_progress INTEGER;
    v_pending INTEGER;
    v_resolved INTEGER;
    v_closed INTEGER;
    v_by_department JSONB;
    v_by_status JSONB;
    v_by_priority JSONB;
BEGIN
    -- Get current user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT public.can_access_ticketing(v_user_id) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Count by status
    IF public.is_ticketing_admin(v_user_id) THEN
        -- Admin sees all
        SELECT COUNT(*) INTO v_total FROM public.tickets WHERE (p_department IS NULL OR department = p_department);
        SELECT COUNT(*) INTO v_open FROM public.tickets WHERE status = 'open' AND (p_department IS NULL OR department = p_department);
        SELECT COUNT(*) INTO v_in_progress FROM public.tickets WHERE status = 'in_progress' AND (p_department IS NULL OR department = p_department);
        SELECT COUNT(*) INTO v_pending FROM public.tickets WHERE status = 'pending' AND (p_department IS NULL OR department = p_department);
        SELECT COUNT(*) INTO v_resolved FROM public.tickets WHERE status = 'resolved' AND (p_department IS NULL OR department = p_department);
        SELECT COUNT(*) INTO v_closed FROM public.tickets WHERE status = 'closed' AND (p_department IS NULL OR department = p_department);

        -- By department
        SELECT COALESCE(jsonb_agg(jsonb_build_object('department', department::TEXT, 'count', cnt)), '[]'::jsonb)
        INTO v_by_department
        FROM (
            SELECT department, COUNT(*) as cnt
            FROM public.tickets
            WHERE p_department IS NULL OR department = p_department
            GROUP BY department
            ORDER BY cnt DESC
        ) t;

        -- By priority
        SELECT COALESCE(jsonb_agg(jsonb_build_object('priority', priority::TEXT, 'count', cnt)), '[]'::jsonb)
        INTO v_by_priority
        FROM (
            SELECT priority, COUNT(*) as cnt
            FROM public.tickets
            WHERE p_department IS NULL OR department = p_department
            GROUP BY priority
            ORDER BY
                CASE priority
                    WHEN 'urgent' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    WHEN 'low' THEN 4
                END
        ) t;
    ELSE
        -- Others see their relevant tickets
        SELECT COUNT(*) INTO v_total FROM public.tickets WHERE (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);
        SELECT COUNT(*) INTO v_open FROM public.tickets WHERE status = 'open' AND (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);
        SELECT COUNT(*) INTO v_in_progress FROM public.tickets WHERE status = 'in_progress' AND (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);
        SELECT COUNT(*) INTO v_pending FROM public.tickets WHERE status = 'pending' AND (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);
        SELECT COUNT(*) INTO v_resolved FROM public.tickets WHERE status = 'resolved' AND (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);
        SELECT COUNT(*) INTO v_closed FROM public.tickets WHERE status = 'closed' AND (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);

        v_by_department := '[]'::jsonb;

        SELECT COALESCE(jsonb_agg(jsonb_build_object('priority', priority::TEXT, 'count', cnt)), '[]'::jsonb)
        INTO v_by_priority
        FROM (
            SELECT priority, COUNT(*) as cnt
            FROM public.tickets
            WHERE (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department)
            GROUP BY priority
        ) t;
    END IF;

    -- Build by status
    v_by_status := jsonb_build_array(
        jsonb_build_object('status', 'open', 'count', v_open),
        jsonb_build_object('status', 'in_progress', 'count', v_in_progress),
        jsonb_build_object('status', 'pending', 'count', v_pending),
        jsonb_build_object('status', 'resolved', 'count', v_resolved),
        jsonb_build_object('status', 'closed', 'count', v_closed)
    );

    -- Build result
    v_result := jsonb_build_object(
        'total_tickets', v_total,
        'open_tickets', v_open,
        'in_progress_tickets', v_in_progress,
        'pending_tickets', v_pending,
        'resolved_tickets', v_resolved,
        'closed_tickets', v_closed,
        'tickets_by_department', v_by_department,
        'tickets_by_status', v_by_status,
        'tickets_by_priority', v_by_priority
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.rpc_ticketing_dashboard_summary IS 'Returns dashboard summary metrics for ticketing';

-- ============================================
-- GRANT EXECUTE PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.generate_ticket_code(ticket_type, ticketing_department) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_ticket_quote_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_create(ticket_type, VARCHAR, TEXT, ticketing_department, ticket_priority, UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_assign(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_transition(UUID, ticket_status, TEXT, ticket_close_outcome, TEXT, VARCHAR, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_add_comment(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_create_quote(UUID, DECIMAL, VARCHAR, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticketing_dashboard_summary(ticketing_department) TO authenticated;
