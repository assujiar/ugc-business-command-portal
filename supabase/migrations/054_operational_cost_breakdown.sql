-- ============================================
-- Migration: Add rate_structure and breakdown items for operational costs
-- This allows ops users to submit costs as bundling (single total) or breakdown (itemized)
-- ============================================

-- Add rate_structure column to ticket_rate_quotes
ALTER TABLE public.ticket_rate_quotes
ADD COLUMN IF NOT EXISTS rate_structure VARCHAR(20) DEFAULT 'bundling' CHECK (rate_structure IN ('bundling', 'breakdown'));

COMMENT ON COLUMN public.ticket_rate_quotes.rate_structure IS 'Cost structure type: bundling (single total) or breakdown (itemized components)';

-- ============================================
-- TICKET RATE QUOTE ITEMS TABLE
-- Breakdown items for operational costs
-- ============================================
CREATE TABLE IF NOT EXISTS public.ticket_rate_quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES public.ticket_rate_quotes(id) ON DELETE CASCADE,
    component_type VARCHAR(100) NOT NULL,
    component_name VARCHAR(255),
    description TEXT,
    cost_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    quantity DECIMAL(10, 2),
    unit VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.ticket_rate_quote_items IS 'Breakdown items for operational cost quotes (without margin/selling rate)';

-- Create indexes for ticket_rate_quote_items
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quote_items_quote_id ON public.ticket_rate_quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quote_items_component_type ON public.ticket_rate_quote_items(component_type);

-- Enable RLS on the new table
ALTER TABLE public.ticket_rate_quote_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ticket_rate_quote_items
-- Ops/Admin can manage items (using existing helper functions)
DROP POLICY IF EXISTS "ticket_rate_quote_items_ops_all" ON public.ticket_rate_quote_items;
CREATE POLICY "ticket_rate_quote_items_ops_all" ON public.ticket_rate_quote_items
FOR ALL
TO authenticated
USING (
    public.is_ticketing_admin(auth.uid()) OR public.is_ticketing_ops(auth.uid())
);

-- Users can view items for quotes on their tickets
DROP POLICY IF EXISTS "ticket_rate_quote_items_view" ON public.ticket_rate_quote_items;
CREATE POLICY "ticket_rate_quote_items_view" ON public.ticket_rate_quote_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.ticket_rate_quotes q
        JOIN public.tickets t ON t.id = q.ticket_id
        WHERE q.id = ticket_rate_quote_items.quote_id
        AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
    )
);

-- ============================================
-- UPDATE RPC FUNCTION to handle breakdown items
-- Drop old function with different signature first
-- ============================================
DROP FUNCTION IF EXISTS public.rpc_ticket_create_quote(UUID, DECIMAL, VARCHAR, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.rpc_ticket_create_quote(
    p_ticket_id UUID,
    p_amount DECIMAL,
    p_currency VARCHAR DEFAULT 'IDR',
    p_valid_until DATE DEFAULT NULL,
    p_terms TEXT DEFAULT NULL,
    p_rate_structure VARCHAR DEFAULT 'bundling',
    p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_quote_id UUID;
    v_quote_number VARCHAR(30);
    v_ticket_code VARCHAR(20);
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

    -- Get ticket code for quote number generation
    SELECT ticket_code INTO v_ticket_code
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

    -- Insert the quote
    INSERT INTO public.ticket_rate_quotes (
        ticket_id,
        quote_number,
        amount,
        currency,
        valid_until,
        terms,
        rate_structure,
        status,
        created_by
    ) VALUES (
        p_ticket_id,
        v_quote_number,
        p_amount,
        p_currency,
        p_valid_until,
        p_terms,
        p_rate_structure,
        'draft',
        v_actor_user_id
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
                COALESCE((v_item->>'sort_order')::INTEGER, i)
            );
        END LOOP;
    END IF;

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
        v_actor_user_id,
        jsonb_build_object(
            'quote_id', v_quote_id,
            'quote_number', v_quote_number,
            'amount', p_amount,
            'currency', p_currency,
            'rate_structure', p_rate_structure
        ),
        'Operational cost created: ' || v_quote_number
    );

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', v_quote_id,
        'quote_number', v_quote_number
    );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.rpc_ticket_create_quote TO authenticated;
