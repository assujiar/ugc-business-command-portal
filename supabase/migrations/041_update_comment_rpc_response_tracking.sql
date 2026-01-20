-- ============================================
-- Migration: 041_update_comment_rpc_response_tracking.sql
-- Update comment RPC to track response exchanges
-- ============================================

-- ============================================
-- UPDATE RPC: ADD COMMENT (ATOMIC)
-- Now also records response exchange for response time tracking
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
    v_exchange_result JSONB;
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

    -- Record response exchange for non-internal comments
    IF NOT p_is_internal THEN
        v_exchange_result := public.record_response_exchange(p_ticket_id, v_user_id, v_comment.id);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'comment_id', v_comment.id,
        'ticket_id', p_ticket_id,
        'response_exchange', v_exchange_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_add_comment IS 'Adds comment to ticket atomically with response time tracking and exchange recording';

-- ============================================
-- RPC: SUBMIT QUOTE (with response tracking)
-- Creates quote and records it as a response
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_submit_quote(
    p_ticket_id UUID,
    p_amount DECIMAL(15,2),
    p_currency VARCHAR(3) DEFAULT 'IDR',
    p_valid_until DATE DEFAULT NULL,
    p_terms TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_quote_number VARCHAR(30);
    v_quote public.ticket_rate_quotes;
    v_exchange_result JSONB;
BEGIN
    -- Get current user
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check permissions (only ops/admin can create quotes)
    IF NOT (public.is_ticketing_admin(v_user_id) OR public.is_ticketing_ops(v_user_id)) THEN
        RAISE EXCEPTION 'Access denied: Only Ops or Admin can submit quotes';
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

    -- Set default valid_until to 30 days if not provided
    IF p_valid_until IS NULL THEN
        p_valid_until := CURRENT_DATE + INTERVAL '30 days';
    END IF;

    -- Generate quote number
    v_quote_number := public.generate_ticket_quote_number(p_ticket_id);

    -- Insert quote with 'sent' status
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
        'sent',
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
        'quote_sent',
        v_user_id,
        jsonb_build_object(
            'quote_id', v_quote.id,
            'quote_number', v_quote.quote_number,
            'amount', v_quote.amount,
            'currency', v_quote.currency
        ),
        'Quote submitted to customer'
    );

    -- Update ticket status to waiting_customer
    UPDATE public.tickets
    SET
        status = 'waiting_customer',
        pending_response_from = 'creator',
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Record response exchange
    v_exchange_result := public.record_response_exchange(p_ticket_id, v_user_id, NULL);

    -- Update metrics for quote time
    PERFORM public.update_ticket_response_metrics(p_ticket_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'quote_id', v_quote.id,
        'quote_number', v_quote.quote_number,
        'response_exchange', v_exchange_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_submit_quote IS 'Submits quote to customer with response tracking';

-- ============================================
-- RPC: REQUEST ADJUSTMENT (creator action)
-- Requests price adjustment from department
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_request_adjustment(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_exchange_result JSONB;
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
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Only creator can request adjustment
    IF v_ticket.created_by != v_user_id THEN
        RAISE EXCEPTION 'Only ticket creator can request adjustment';
    END IF;

    -- Update ticket status
    UPDATE public.tickets
    SET
        status = 'need_adjustment',
        pending_response_from = 'assignee',
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Create audit event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'status_changed',
        v_user_id,
        jsonb_build_object('status', 'need_adjustment', 'reason', p_reason),
        COALESCE(p_reason, 'Adjustment requested by customer')
    );

    -- Record response exchange
    v_exchange_result := public.record_response_exchange(p_ticket_id, v_user_id, NULL);

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'new_status', 'need_adjustment',
        'response_exchange', v_exchange_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_request_adjustment IS 'Creator requests price adjustment';

-- ============================================
-- RPC: MARK QUOTE SENT TO CUSTOMER (creator action)
-- Creator marks that they sent quote to their customer
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_quote_sent_to_customer(
    p_ticket_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
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
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Only creator can mark quote sent
    IF v_ticket.created_by != v_user_id THEN
        RAISE EXCEPTION 'Only ticket creator can mark quote as sent to customer';
    END IF;

    -- Update ticket status to pending (waiting for customer decision)
    UPDATE public.tickets
    SET
        status = 'pending',
        pending_response_from = 'creator',
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Create audit event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'status_changed',
        v_user_id,
        jsonb_build_object('status', 'pending', 'action', 'quote_sent_to_customer'),
        COALESCE(p_notes, 'Quote forwarded to end customer')
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'new_status', 'pending'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_quote_sent_to_customer IS 'Creator marks quote as sent to their customer';

-- ============================================
-- RPC: MARK WON (creator action)
-- Creator marks ticket as won
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_mark_won(
    p_ticket_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
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
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Only creator can mark won
    IF v_ticket.created_by != v_user_id AND NOT public.is_ticketing_admin(v_user_id) THEN
        RAISE EXCEPTION 'Only ticket creator can mark as won';
    END IF;

    -- Update ticket
    UPDATE public.tickets
    SET
        status = 'closed',
        close_outcome = 'won',
        close_reason = p_notes,
        closed_at = NOW(),
        resolved_at = COALESCE(resolved_at, NOW()),
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Create audit event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'closed',
        v_user_id,
        jsonb_build_object('status', 'closed', 'outcome', 'won'),
        COALESCE(p_notes, 'Ticket won')
    );

    -- Update SLA resolution tracking
    UPDATE public.ticket_sla_tracking
    SET
        resolution_at = NOW(),
        resolution_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= resolution_sla_hours,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id
    AND resolution_at IS NULL;

    -- Update metrics
    PERFORM public.update_ticket_response_metrics(p_ticket_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'outcome', 'won'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_mark_won IS 'Creator marks ticket as won';

-- ============================================
-- RPC: MARK LOST (creator action)
-- Creator marks ticket as lost
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_mark_lost(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_competitor_name VARCHAR(255) DEFAULT NULL,
    p_competitor_cost DECIMAL(15,2) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
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
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Only creator can mark lost
    IF v_ticket.created_by != v_user_id AND NOT public.is_ticketing_admin(v_user_id) THEN
        RAISE EXCEPTION 'Only ticket creator can mark as lost';
    END IF;

    -- Update ticket
    UPDATE public.tickets
    SET
        status = 'closed',
        close_outcome = 'lost',
        close_reason = p_reason,
        competitor_name = p_competitor_name,
        competitor_cost = p_competitor_cost,
        closed_at = NOW(),
        resolved_at = COALESCE(resolved_at, NOW()),
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Create audit event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'closed',
        v_user_id,
        jsonb_build_object(
            'status', 'closed',
            'outcome', 'lost',
            'competitor_name', p_competitor_name,
            'competitor_cost', p_competitor_cost
        ),
        COALESCE(p_reason, 'Ticket lost')
    );

    -- Update SLA resolution tracking
    UPDATE public.ticket_sla_tracking
    SET
        resolution_at = NOW(),
        resolution_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= resolution_sla_hours,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id
    AND resolution_at IS NULL;

    -- Update metrics
    PERFORM public.update_ticket_response_metrics(p_ticket_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'outcome', 'lost'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_mark_lost IS 'Creator marks ticket as lost';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_ticket_submit_quote(UUID, DECIMAL, VARCHAR, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_request_adjustment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_quote_sent_to_customer(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_mark_won(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_mark_lost(UUID, TEXT, VARCHAR, DECIMAL) TO authenticated;
