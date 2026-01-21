-- =====================================================
-- Migration: 046_auto_status_on_response.sql
-- Auto-update ticket status based on responses
-- =====================================================
-- Status flow:
-- - open → in_progress (when Ops/assignee first responds)
-- - in_progress stays in_progress (during back-and-forth)
-- - Only Admin can manually close/resolve
-- =====================================================

-- Update rpc_ticket_add_comment to auto-change status
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
    v_is_assignee BOOLEAN;
    v_is_creator BOOLEAN;
    v_new_status ticket_status;
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

    -- Determine user relationship to ticket
    v_is_creator := (v_user_id = v_ticket.created_by);
    v_is_assignee := (v_user_id = v_ticket.assigned_to) OR public.is_ticketing_ops(v_user_id);

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
        CASE WHEN v_is_creator THEN 'inbound' ELSE 'outbound' END
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

    -- AUTO-STATUS CHANGE LOGIC (for non-internal comments only)
    IF NOT p_is_internal THEN
        v_new_status := v_ticket.status;

        -- If Ops/assignee responds to an "open" ticket → change to "in_progress"
        IF v_is_assignee AND NOT v_is_creator AND v_ticket.status = 'open' THEN
            v_new_status := 'in_progress';
        END IF;

        -- Update status if changed
        IF v_new_status != v_ticket.status THEN
            UPDATE public.tickets
            SET status = v_new_status, updated_at = NOW()
            WHERE id = p_ticket_id;

            -- Create status change event
            INSERT INTO public.ticket_events (
                ticket_id,
                event_type,
                actor_user_id,
                old_value,
                new_value,
                notes
            ) VALUES (
                p_ticket_id,
                'status_changed',
                v_user_id,
                to_jsonb(v_ticket.status::TEXT),
                to_jsonb(v_new_status::TEXT),
                'Status auto-changed based on response'
            );
        END IF;

        -- Update pending_response_from
        UPDATE public.tickets
        SET
            pending_response_from = CASE
                WHEN v_is_creator THEN 'assignee'::response_owner
                ELSE 'creator'::response_owner
            END,
            updated_at = NOW()
        WHERE id = p_ticket_id;
    END IF;

    -- Update SLA first response if this is the first response from ops
    IF NOT p_is_internal AND v_is_assignee AND NOT v_is_creator THEN
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
        'new_status', v_new_status,
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

COMMENT ON FUNCTION public.rpc_ticket_add_comment IS 'Adds comment with auto-status change: open→in_progress when Ops responds';
