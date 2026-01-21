-- ============================================
-- Migration: 049_auto_sync_cost_status_on_adjustment.sql
-- Auto-sync operational cost status when creator requests adjustment
-- When creator clicks "Request Adjustment", the latest cost status becomes "rejected"
-- ============================================

-- ============================================
-- UPDATE RPC: REQUEST ADJUSTMENT (creator action)
-- Now also rejects the latest operational cost
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
    v_latest_cost_id UUID;
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

    -- Find the latest sent operational cost and reject it
    SELECT id INTO v_latest_cost_id
    FROM public.ticket_rate_quotes
    WHERE ticket_id = p_ticket_id
    AND status = 'sent'
    ORDER BY created_at DESC
    LIMIT 1;

    -- If there's a sent cost, mark it as rejected
    IF v_latest_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = 'rejected',
            updated_at = NOW()
        WHERE id = v_latest_cost_id;

        -- Create event for cost rejection
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
            jsonb_build_object('cost_status', 'rejected', 'cost_id', v_latest_cost_id),
            'Operational cost rejected due to adjustment request'
        );
    END IF;

    -- Update ticket status
    UPDATE public.tickets
    SET
        status = 'need_adjustment',
        pending_response_from = 'assignee',
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Create audit event for adjustment request
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'request_adjustment',
        v_user_id,
        jsonb_build_object(
            'status', 'need_adjustment',
            'reason', p_reason,
            'rejected_cost_id', v_latest_cost_id
        ),
        COALESCE(p_reason, 'Adjustment requested by customer')
    );

    -- Record response exchange
    v_exchange_result := public.record_response_exchange(p_ticket_id, v_user_id, NULL);

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'new_status', 'need_adjustment',
        'rejected_cost_id', v_latest_cost_id,
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

COMMENT ON FUNCTION public.rpc_ticket_request_adjustment IS 'Creator requests price adjustment and auto-rejects the latest operational cost';

-- ============================================
-- GRANT PERMISSIONS (if needed)
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_ticket_request_adjustment(UUID, TEXT) TO authenticated;
