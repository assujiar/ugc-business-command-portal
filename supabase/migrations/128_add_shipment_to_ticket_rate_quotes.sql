-- Migration: Add shipment reference to ticket_rate_quotes
-- Purpose: Support multi-shipment costing by linking operational costs to specific shipments

-- Add shipment columns to ticket_rate_quotes
ALTER TABLE public.ticket_rate_quotes
ADD COLUMN IF NOT EXISTS shipment_detail_id TEXT REFERENCES public.shipment_details(shipment_detail_id),
ADD COLUMN IF NOT EXISTS shipment_label TEXT;

-- Add index for shipment lookups
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_shipment
ON public.ticket_rate_quotes(shipment_detail_id)
WHERE shipment_detail_id IS NOT NULL;

-- Update the rpc_ticket_create_quote function to accept shipment info
CREATE OR REPLACE FUNCTION public.rpc_ticket_create_quote(
    p_ticket_id TEXT,
    p_amount NUMERIC,
    p_currency TEXT DEFAULT 'IDR',
    p_valid_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_terms TEXT DEFAULT NULL,
    p_rate_structure TEXT DEFAULT 'bundling',
    p_items JSONB DEFAULT '[]'::JSONB,
    p_shipment_detail_id TEXT DEFAULT NULL,
    p_shipment_label TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ticket_code TEXT;
    v_quote_id TEXT;
    v_quote_number TEXT;
    v_next_sequence INTEGER;
    v_actor_user_id TEXT;
    v_item JSONB;
    v_item_id TEXT;
BEGIN
    -- Get actor user
    v_actor_user_id := auth.uid();
    IF v_actor_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Get ticket code for quote number generation
    SELECT ticket_code INTO v_ticket_code
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ticket not found');
    END IF;

    -- Get next sequence number for this ticket's quotes
    SELECT COALESCE(MAX(
        CASE
            WHEN quote_number ~ '-Q[0-9]+$'
            THEN SUBSTRING(quote_number FROM '-Q([0-9]+)$')::INTEGER
            ELSE 0
        END
    ), 0) + 1 INTO v_next_sequence
    FROM public.ticket_rate_quotes
    WHERE ticket_id = p_ticket_id;

    -- Generate quote number
    v_quote_number := v_ticket_code || '-Q' || LPAD(v_next_sequence::TEXT, 3, '0');

    -- Generate quote ID
    v_quote_id := 'QUO-' || gen_random_uuid()::TEXT;

    -- Insert quote with shipment info
    INSERT INTO public.ticket_rate_quotes (
        id,
        ticket_id,
        quote_number,
        amount,
        currency,
        valid_until,
        terms,
        rate_structure,
        shipment_detail_id,
        shipment_label,
        created_by,
        created_at
    ) VALUES (
        v_quote_id,
        p_ticket_id,
        v_quote_number,
        p_amount,
        p_currency,
        COALESCE(p_valid_until, NOW() + INTERVAL '7 days'),
        p_terms,
        p_rate_structure,
        p_shipment_detail_id,
        p_shipment_label,
        v_actor_user_id,
        NOW()
    );

    -- Insert breakdown items if rate_structure is breakdown
    IF p_rate_structure = 'breakdown' AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            v_item_id := 'ITEM-' || gen_random_uuid()::TEXT;
            INSERT INTO public.ticket_rate_quote_items (
                id,
                quote_id,
                component_type,
                component_name,
                description,
                cost_amount,
                quantity,
                unit,
                sort_order,
                created_at
            ) VALUES (
                v_item_id,
                v_quote_id,
                v_item->>'component_type',
                COALESCE(v_item->>'component_name', v_item->>'component_type'),
                v_item->>'description',
                COALESCE((v_item->>'cost_amount')::NUMERIC, 0),
                (v_item->>'quantity')::INTEGER,
                v_item->>'unit',
                COALESCE((v_item->>'sort_order')::INTEGER, 0),
                NOW()
            );
        END LOOP;
    END IF;

    -- Update ticket status to in_progress if currently open
    UPDATE public.tickets
    SET status = 'in_progress',
        updated_at = NOW()
    WHERE id = p_ticket_id
    AND status = 'open';

    -- Record event
    INSERT INTO public.ticket_events (
        id,
        ticket_id,
        event_type,
        actor_user_id,
        old_value,
        new_value,
        created_at
    ) VALUES (
        'EVT-' || gen_random_uuid()::TEXT,
        p_ticket_id,
        'quote_created',
        v_actor_user_id,
        NULL,
        jsonb_build_object(
            'quote_id', v_quote_id,
            'quote_number', v_quote_number,
            'amount', p_amount,
            'currency', p_currency,
            'rate_structure', p_rate_structure,
            'shipment_detail_id', p_shipment_detail_id,
            'shipment_label', p_shipment_label
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', v_quote_id,
        'quote_number', v_quote_number
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_ticket_create_quote(TEXT, NUMERIC, TEXT, TIMESTAMP WITH TIME ZONE, TEXT, TEXT, JSONB, TEXT, TEXT) TO authenticated;

-- Comment
COMMENT ON COLUMN public.ticket_rate_quotes.shipment_detail_id IS 'Reference to specific shipment this cost is for (multi-shipment support)';
COMMENT ON COLUMN public.ticket_rate_quotes.shipment_label IS 'Label of the shipment for display purposes';
