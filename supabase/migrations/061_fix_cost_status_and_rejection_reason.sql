-- ============================================
-- Migration: 061_fix_cost_status_and_rejection_reason.sql
-- 1. Fix quote_status enum for operational cost (submitted, sent_to_customer, accepted, rejected)
-- 2. Add rejection_reason to customer_quotations
-- 3. Fix sync function mapping
-- ============================================

-- ============================================
-- 1. Add missing quote_status enum values
-- Flow: submitted → sent_to_customer → accepted/rejected
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'submitted' AND enumtypid = 'quote_status'::regtype) THEN
        ALTER TYPE quote_status ADD VALUE 'submitted';
    END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- sent_to_customer already added in migration 060, but add if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'sent_to_customer' AND enumtypid = 'quote_status'::regtype) THEN
        ALTER TYPE quote_status ADD VALUE 'sent_to_customer';
    END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ============================================
-- 2. Add rejection_reason to customer_quotations
-- ============================================

ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN public.customer_quotations.rejection_reason IS 'Reason for quotation rejection by customer';

-- ============================================
-- 3. Fix sync function: quotation status → operational cost status
-- Mapping:
--   quotation 'draft' → cost stays as is
--   quotation 'sent' → cost 'sent_to_customer'
--   quotation 'accepted' → cost 'accepted'
--   quotation 'rejected' → cost 'rejected'
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_quotation_status_to_cost()
RETURNS TRIGGER AS $$
BEGIN
    -- When quotation status changes, update operational cost status if linked
    IF NEW.operational_cost_id IS NOT NULL AND OLD.status IS DISTINCT FROM NEW.status THEN
        -- Map quotation status to cost status
        UPDATE public.ticket_rate_quotes
        SET
            status = CASE NEW.status::TEXT
                WHEN 'sent' THEN 'sent_to_customer'::quote_status
                WHEN 'accepted' THEN 'accepted'::quote_status
                WHEN 'rejected' THEN 'rejected'::quote_status
                ELSE status
            END,
            updated_at = NOW()
        WHERE id = NEW.operational_cost_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_sync_quotation_status ON public.customer_quotations;
CREATE TRIGGER trigger_sync_quotation_status
    AFTER UPDATE OF status ON public.customer_quotations
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.sync_quotation_status_to_cost();

-- ============================================
-- 4. Update operational cost status when first submitted
-- Change default from 'draft' to 'submitted' when operation submits
-- ============================================

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
        created_by
    ) VALUES (
        p_ticket_id,
        v_quote_number,
        p_amount,
        p_currency,
        p_valid_until,
        p_terms,
        p_rate_structure,
        'submitted',  -- Changed from 'draft' to 'submitted'
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
            'status', 'submitted'
        ),
        'Operational cost ' || v_quote_number || ' submitted'
    );

    -- Update ticket status
    UPDATE public.tickets
    SET
        status = 'need_response',
        pending_response_from = 'creator',
        updated_at = NOW()
    WHERE id = p_ticket_id;

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', v_quote_id,
        'quote_number', v_quote_number,
        'status', 'submitted'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.rpc_ticket_create_quote(UUID, DECIMAL, VARCHAR, DATE, TEXT, VARCHAR, JSONB) TO authenticated;

-- ============================================
-- 5. Update sync when quotation is created (not just status change)
-- When customer quotation is created, update cost status to 'sent_to_customer'
-- ============================================

CREATE OR REPLACE FUNCTION public.update_cost_on_quotation_create()
RETURNS TRIGGER AS $$
BEGIN
    -- When customer quotation is created and linked to operational cost
    IF NEW.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = 'sent_to_customer'::quote_status,
            updated_at = NOW()
        WHERE id = NEW.operational_cost_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_cost_on_quotation_create ON public.customer_quotations;
CREATE TRIGGER trigger_update_cost_on_quotation_create
    AFTER INSERT ON public.customer_quotations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_cost_on_quotation_create();

COMMENT ON FUNCTION public.update_cost_on_quotation_create() IS 'Updates operational cost status to sent_to_customer when customer quotation is created';
