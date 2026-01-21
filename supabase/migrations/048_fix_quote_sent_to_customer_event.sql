-- ============================================
-- Migration: 048_fix_quote_sent_to_customer_event.sql
-- Fix quote_sent_to_customer to use proper event type
-- ============================================

-- ============================================
-- RPC: MARK QUOTE SENT TO CUSTOMER (creator action)
-- Creator marks that they sent quote to their customer
-- Can be done multiple times (once per quote sent)
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_quote_sent_to_customer(
    p_ticket_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_quote_count INTEGER;
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

    -- Count how many times quote has been sent to customer
    SELECT COUNT(*) INTO v_quote_count
    FROM public.ticket_events
    WHERE ticket_id = p_ticket_id
    AND event_type = 'quote_sent_to_customer';

    -- Update ticket status to pending (waiting for customer decision)
    UPDATE public.tickets
    SET
        status = 'pending',
        pending_response_from = 'creator',
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Create audit event with specific event type
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        old_value,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'quote_sent_to_customer',
        v_user_id,
        to_jsonb(v_ticket.status::TEXT),
        jsonb_build_object('status', 'pending', 'sent_count', v_quote_count + 1),
        COALESCE(p_notes, 'Quote forwarded to end customer')
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'new_status', 'pending',
        'sent_count', v_quote_count + 1
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_quote_sent_to_customer IS 'Creator marks quote as sent to their customer (can be done multiple times)';

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.rpc_ticket_quote_sent_to_customer(UUID, TEXT) TO authenticated;
