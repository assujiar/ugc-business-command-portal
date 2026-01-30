-- Migration: Add shipment reference to ticket_rate_quotes
-- Purpose: Support multi-shipment costing by linking operational costs to specific shipments

-- Add shipment columns to ticket_rate_quotes
ALTER TABLE public.ticket_rate_quotes
ADD COLUMN IF NOT EXISTS shipment_detail_id VARCHAR REFERENCES public.shipment_details(shipment_detail_id),
ADD COLUMN IF NOT EXISTS shipment_label VARCHAR;

-- Add index for shipment lookups
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_shipment
ON public.ticket_rate_quotes(shipment_detail_id)
WHERE shipment_detail_id IS NOT NULL;

-- Drop any incorrectly typed function overloads that may have been created
-- (from previous migration attempts with wrong parameter types)
DROP FUNCTION IF EXISTS public.rpc_ticket_create_quote(TEXT, NUMERIC, TEXT, TIMESTAMP WITH TIME ZONE, TEXT, TEXT, JSONB, TEXT, TEXT);

-- Update the rpc_ticket_create_quote function to accept shipment info
-- IMPORTANT: Must match existing function signature types (UUID, DECIMAL, VARCHAR, DATE)
CREATE OR REPLACE FUNCTION public.rpc_ticket_create_quote(
    p_ticket_id UUID,
    p_amount DECIMAL,
    p_currency VARCHAR DEFAULT 'IDR',
    p_valid_until DATE DEFAULT NULL,
    p_terms TEXT DEFAULT NULL,
    p_rate_structure VARCHAR DEFAULT 'bundling',
    p_items JSONB DEFAULT '[]'::jsonb,
    p_shipment_detail_id VARCHAR DEFAULT NULL,
    p_shipment_label VARCHAR DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_quote_id UUID;
    v_quote_number VARCHAR(30);
    v_ticket_code VARCHAR(20);
    v_ticket_created_at TIMESTAMPTZ;
    v_ticket_first_response_at TIMESTAMPTZ;
    v_sequence INTEGER;
    v_actor_user_id UUID;
    v_item JSONB;
    i INTEGER;
BEGIN
    -- Get current user
    v_actor_user_id := auth.uid();

    -- Validate user is ops or admin
    IF NOT public.is_ticketing_admin(v_actor_user_id) AND NOT public.is_ticketing_ops(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only ops/admin can create quotes');
    END IF;

    -- Get ticket info for quote number generation and SLA tracking
    SELECT ticket_code, created_at, first_response_at
    INTO v_ticket_code, v_ticket_created_at, v_ticket_first_response_at
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ticket not found');
    END IF;

    -- Get next sequence number for this ticket's quotes
    SELECT COALESCE(MAX(
        CAST(
            SUBSTRING(quote_number FROM LENGTH(v_ticket_code) + 5) AS INTEGER
        )
    ), 0) + 1 INTO v_sequence
    FROM public.ticket_rate_quotes
    WHERE ticket_id = p_ticket_id;

    -- Generate quote number: QT-[TICKET_CODE]-XXX
    v_quote_number := 'QT-' || v_ticket_code || '-' || LPAD(v_sequence::TEXT, 3, '0');

    -- Set default valid_until if not provided (14 days from now)
    IF p_valid_until IS NULL THEN
        p_valid_until := CURRENT_DATE + INTERVAL '14 days';
    END IF;

    -- Insert the quote with status = 'submitted' (not 'draft')
    INSERT INTO public.ticket_rate_quotes (
        ticket_id,
        quote_number,
        amount,
        currency,
        valid_until,
        terms,
        rate_structure,
        status,
        created_by,
        shipment_detail_id,
        shipment_label
    ) VALUES (
        p_ticket_id,
        v_quote_number,
        p_amount,
        p_currency,
        p_valid_until,
        p_terms,
        p_rate_structure,
        'submitted',
        v_actor_user_id,
        p_shipment_detail_id,
        p_shipment_label
    )
    RETURNING id INTO v_quote_id;

    -- Insert breakdown items if rate_structure is 'breakdown'
    IF p_rate_structure = 'breakdown' AND jsonb_array_length(p_items) > 0 THEN
        FOR i IN 0..jsonb_array_length(p_items) - 1 LOOP
            v_item := p_items->i;
            INSERT INTO public.ticket_rate_quote_items (
                quote_id,
                component_type,
                component_name,
                description,
                cost_amount,
                quantity,
                unit,
                sort_order
            ) VALUES (
                v_quote_id,
                v_item->>'component_type',
                v_item->>'component_name',
                v_item->>'description',
                COALESCE((v_item->>'cost_amount')::DECIMAL, 0),
                CASE WHEN v_item->>'quantity' IS NOT NULL THEN (v_item->>'quantity')::DECIMAL ELSE NULL END,
                v_item->>'unit',
                i + 1
            );
        END LOOP;
    END IF;

    -- Create event for quote submission
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'quote_created',
        v_actor_user_id,
        jsonb_build_object(
            'quote_id', v_quote_id,
            'quote_number', v_quote_number,
            'amount', p_amount,
            'currency', p_currency,
            'rate_structure', p_rate_structure,
            'status', 'submitted',
            'shipment_detail_id', p_shipment_detail_id,
            'shipment_label', p_shipment_label
        ),
        CASE
            WHEN p_shipment_label IS NOT NULL THEN 'Operational cost ' || v_quote_number || ' submitted for ' || p_shipment_label
            ELSE 'Operational cost ' || v_quote_number || ' submitted'
        END
    );

    -- Update ticket status
    UPDATE public.tickets
    SET
        status = 'need_response',
        pending_response_from = 'creator',
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- =====================================================
    -- FIRST RESPONSE TRACKING (SLA)
    -- Cost submission by assignee (ops) counts as first response
    -- =====================================================
    IF v_ticket_first_response_at IS NULL THEN
        -- Update ticket_sla_tracking
        UPDATE public.ticket_sla_tracking
        SET
            first_response_at = NOW(),
            first_response_met = EXTRACT(EPOCH FROM (NOW() - v_ticket_created_at)) / 3600 <= first_response_sla_hours,
            updated_at = NOW()
        WHERE ticket_id = p_ticket_id
        AND first_response_at IS NULL;

        -- Update tickets table
        UPDATE public.tickets
        SET first_response_at = NOW()
        WHERE id = p_ticket_id
        AND first_response_at IS NULL;
    END IF;

    -- Record response exchange for SLA tracking
    -- This tracks the assignee's response (cost submission) in the exchange log
    PERFORM public.record_response_exchange(p_ticket_id, v_actor_user_id, NULL);

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', v_quote_id,
        'quote_number', v_quote_number,
        'status', 'submitted',
        'shipment_detail_id', p_shipment_detail_id,
        'shipment_label', p_shipment_label
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant permissions for both old and new function signatures
GRANT EXECUTE ON FUNCTION public.rpc_ticket_create_quote(UUID, DECIMAL, VARCHAR, DATE, TEXT, VARCHAR, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_create_quote(UUID, DECIMAL, VARCHAR, DATE, TEXT, VARCHAR, JSONB, VARCHAR, VARCHAR) TO authenticated;

-- Comment
COMMENT ON COLUMN public.ticket_rate_quotes.shipment_detail_id IS 'Reference to specific shipment this cost is for (multi-shipment support)';
COMMENT ON COLUMN public.ticket_rate_quotes.shipment_label IS 'Label of the shipment for display purposes';
