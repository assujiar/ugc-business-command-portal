-- ============================================
-- Migration: 129_multi_shipment_cost_support.sql
--
-- PURPOSE: Fix multi-shipment cost submission and quotation bug
--
-- ISSUES FIXED:
-- 1. When multiple shipments exist in a ticket, each shipment should have its own cost
-- 2. All shipment costs are "active" costs, not just the latest one
-- 3. Customer quotation should use costs from ALL shipments, not just the latest
-- 4. Support batch cost submission (all shipments in one submit action)
--
-- SOLUTION:
-- 1. Create fn_resolve_all_shipment_costs - returns all active costs grouped by shipment
-- 2. Create rpc_batch_create_shipment_costs - batch submit costs for multiple shipments
-- 3. Add operational_cost_ids (array) to customer_quotations for multi-cost linking
-- ============================================

-- ============================================
-- 1. ADD operational_cost_ids COLUMN TO customer_quotations
-- ============================================

-- Add column to store multiple operational cost IDs (for multi-shipment support)
ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS operational_cost_ids UUID[] DEFAULT '{}';

COMMENT ON COLUMN public.customer_quotations.operational_cost_ids IS
'Array of operational cost IDs linked to this quotation (one per shipment). Replaces single operational_cost_id for multi-shipment tickets.';

-- ============================================
-- 2. CREATE FUNCTION: fn_resolve_all_shipment_costs
-- Returns all submitted costs for a ticket, grouped by shipment_detail_id
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_resolve_all_shipment_costs(
    p_ticket_id UUID DEFAULT NULL,
    p_lead_id TEXT DEFAULT NULL,
    p_opportunity_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_effective_ticket_id UUID;
    v_ticket RECORD;
    v_costs JSONB;
    v_shipment_count INT;
    v_costs_count INT;
BEGIN
    -- First, resolve effective ticket_id
    v_effective_ticket_id := p_ticket_id;

    -- If no ticket_id but lead_id provided, try to find linked ticket
    IF v_effective_ticket_id IS NULL AND p_lead_id IS NOT NULL THEN
        SELECT t.id INTO v_effective_ticket_id
        FROM public.tickets t
        WHERE t.lead_id = p_lead_id
        ORDER BY t.created_at DESC
        LIMIT 1;
    END IF;

    -- If no ticket_id but opportunity_id provided, try to find linked ticket
    IF v_effective_ticket_id IS NULL AND p_opportunity_id IS NOT NULL THEN
        SELECT t.id INTO v_effective_ticket_id
        FROM public.tickets t
        WHERE t.opportunity_id = p_opportunity_id
        ORDER BY t.created_at DESC
        LIMIT 1;
    END IF;

    -- If no effective ticket found, can't resolve operational costs
    IF v_effective_ticket_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'resolved', FALSE,
            'message', 'No ticket found to resolve operational costs',
            'costs', '[]'::jsonb,
            'costs_count', 0
        );
    END IF;

    -- Get ticket info
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = v_effective_ticket_id;

    -- Get shipment count from shipment_details table
    SELECT COUNT(*) INTO v_shipment_count
    FROM public.shipment_details sd
    WHERE sd.lead_id = v_ticket.lead_id
       OR sd.opportunity_id = v_ticket.opportunity_id;

    -- Get ALL submitted operational costs for this ticket
    -- Group by shipment_detail_id to support multi-shipment
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', trq.id,
            'quote_number', trq.quote_number,
            'amount', trq.amount,
            'currency', trq.currency,
            'status', trq.status,
            'rate_structure', trq.rate_structure,
            'valid_until', trq.valid_until,
            'shipment_detail_id', trq.shipment_detail_id,
            'shipment_label', trq.shipment_label,
            'created_at', trq.created_at,
            'created_by', trq.created_by
        ) ORDER BY
            -- Order: shipments with ID first (grouped), then by created_at
            CASE WHEN trq.shipment_detail_id IS NOT NULL THEN 0 ELSE 1 END,
            trq.created_at DESC
    ), '[]'::jsonb) INTO v_costs
    FROM public.ticket_rate_quotes trq
    WHERE trq.ticket_id = v_effective_ticket_id
    AND trq.status = 'submitted';

    v_costs_count := jsonb_array_length(v_costs);

    -- For RFQ tickets with multiple shipments, validate all shipments have costs
    IF v_ticket.ticket_type = 'RFQ' AND v_shipment_count > 0 AND v_costs_count = 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'No submitted operational costs available for this RFQ ticket. Ops must submit cost first.',
            'error_code', 'NO_SUBMITTED_COST',
            'ticket_id', v_effective_ticket_id,
            'ticket_type', v_ticket.ticket_type,
            'shipment_count', v_shipment_count
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'resolved', TRUE,
        'ticket_id', v_effective_ticket_id,
        'ticket_type', v_ticket.ticket_type,
        'shipment_count', v_shipment_count,
        'costs_count', v_costs_count,
        'costs', v_costs,
        -- Check if all shipments have costs (for validation warning)
        'all_shipments_costed', (
            CASE
                WHEN v_shipment_count = 0 THEN TRUE
                WHEN v_shipment_count > 0 THEN (
                    SELECT COUNT(DISTINCT trq.shipment_detail_id) >= v_shipment_count
                    FROM public.ticket_rate_quotes trq
                    WHERE trq.ticket_id = v_effective_ticket_id
                    AND trq.status = 'submitted'
                    AND trq.shipment_detail_id IS NOT NULL
                )
                ELSE FALSE
            END
        ),
        'missing_shipments', (
            -- List shipment_detail_ids that don't have costs yet
            SELECT COALESCE(jsonb_agg(sd.shipment_detail_id), '[]'::jsonb)
            FROM public.shipment_details sd
            WHERE (sd.lead_id = v_ticket.lead_id OR sd.opportunity_id = v_ticket.opportunity_id)
            AND sd.shipment_detail_id NOT IN (
                SELECT trq.shipment_detail_id
                FROM public.ticket_rate_quotes trq
                WHERE trq.ticket_id = v_effective_ticket_id
                AND trq.status = 'submitted'
                AND trq.shipment_detail_id IS NOT NULL
            )
        )
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', 'INTERNAL_ERROR'
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_resolve_all_shipment_costs IS
'Multi-shipment cost resolution: Returns ALL submitted operational costs for a ticket.
Unlike fn_resolve_latest_operational_cost (which returns only ONE latest), this function
returns all costs grouped by shipment_detail_id to support multi-shipment tickets.

Returns:
- success: boolean
- costs: array of cost objects with shipment_detail_id
- costs_count: number of costs found
- shipment_count: number of shipments in ticket
- all_shipments_costed: boolean - true if all shipments have costs
- missing_shipments: array of shipment_detail_ids without costs';

GRANT EXECUTE ON FUNCTION public.fn_resolve_all_shipment_costs(UUID, TEXT, TEXT) TO authenticated;

-- ============================================
-- 3. CREATE FUNCTION: rpc_batch_create_shipment_costs
-- Batch create costs for multiple shipments in one transaction
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_batch_create_shipment_costs(
    p_ticket_id UUID,
    p_shipment_costs JSONB,
    p_currency VARCHAR DEFAULT 'IDR',
    p_valid_until DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ticket_code VARCHAR(20);
    v_ticket_created_at TIMESTAMPTZ;
    v_ticket_first_response_at TIMESTAMPTZ;
    v_actor_user_id UUID;
    v_shipment_cost JSONB;
    v_quote_id UUID;
    v_quote_number VARCHAR(30);
    v_sequence INTEGER;
    v_results JSONB := '[]'::jsonb;
    v_item JSONB;
    v_items JSONB;
    i INTEGER;
    j INTEGER;
    v_total_amount DECIMAL;
    v_shipment_detail_id VARCHAR;
    v_shipment_label VARCHAR;
    v_rate_structure VARCHAR;
    v_amount DECIMAL;
    v_is_first_response BOOLEAN := FALSE;
BEGIN
    -- Get current user
    v_actor_user_id := auth.uid();

    -- Validate user is ops or admin
    IF NOT public.is_ticketing_admin(v_actor_user_id) AND NOT public.is_ticketing_ops(v_actor_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only ops/admin can create quotes');
    END IF;

    -- Get ticket info
    SELECT ticket_code, created_at, first_response_at
    INTO v_ticket_code, v_ticket_created_at, v_ticket_first_response_at
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ticket not found');
    END IF;

    -- Check if this is the first cost submission (for first response tracking)
    v_is_first_response := v_ticket_first_response_at IS NULL;

    -- Set default valid_until if not provided (14 days from now)
    IF p_valid_until IS NULL THEN
        p_valid_until := CURRENT_DATE + INTERVAL '14 days';
    END IF;

    -- Process each shipment cost
    FOR i IN 0..jsonb_array_length(p_shipment_costs) - 1 LOOP
        v_shipment_cost := p_shipment_costs->i;

        v_shipment_detail_id := v_shipment_cost->>'shipment_detail_id';
        v_shipment_label := v_shipment_cost->>'shipment_label';
        v_rate_structure := COALESCE(v_shipment_cost->>'rate_structure', 'bundling');
        v_items := COALESCE(v_shipment_cost->'items', '[]'::jsonb);

        -- Calculate amount
        IF v_rate_structure = 'breakdown' AND jsonb_array_length(v_items) > 0 THEN
            v_amount := 0;
            FOR j IN 0..jsonb_array_length(v_items) - 1 LOOP
                v_amount := v_amount + COALESCE((v_items->j->>'cost_amount')::DECIMAL, 0);
            END LOOP;
        ELSE
            v_amount := COALESCE((v_shipment_cost->>'amount')::DECIMAL, 0);
        END IF;

        -- Skip if amount is 0 or invalid
        IF v_amount <= 0 THEN
            CONTINUE;
        END IF;

        -- Get next sequence number for this ticket's quotes
        SELECT COALESCE(MAX(
            CAST(
                SUBSTRING(quote_number FROM LENGTH(v_ticket_code) + 5) AS INTEGER
            )
        ), 0) + 1 INTO v_sequence
        FROM public.ticket_rate_quotes
        WHERE ticket_id = p_ticket_id;

        -- Generate quote number
        v_quote_number := 'QT-' || v_ticket_code || '-' || LPAD(v_sequence::TEXT, 3, '0');

        -- Insert the quote
        INSERT INTO public.ticket_rate_quotes (
            ticket_id,
            quote_number,
            amount,
            currency,
            valid_until,
            rate_structure,
            status,
            created_by,
            shipment_detail_id,
            shipment_label
        ) VALUES (
            p_ticket_id,
            v_quote_number,
            v_amount,
            p_currency,
            p_valid_until,
            v_rate_structure,
            'submitted',
            v_actor_user_id,
            v_shipment_detail_id,
            v_shipment_label
        )
        RETURNING id INTO v_quote_id;

        -- Insert breakdown items if rate_structure is 'breakdown'
        IF v_rate_structure = 'breakdown' AND jsonb_array_length(v_items) > 0 THEN
            FOR j IN 0..jsonb_array_length(v_items) - 1 LOOP
                v_item := v_items->j;
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
                    j + 1
                );
            END LOOP;
        END IF;

        -- Add to results
        v_results := v_results || jsonb_build_object(
            'quote_id', v_quote_id,
            'quote_number', v_quote_number,
            'amount', v_amount,
            'shipment_detail_id', v_shipment_detail_id,
            'shipment_label', v_shipment_label,
            'status', 'submitted'
        );
    END LOOP;

    -- Validate that at least one cost was created
    IF jsonb_array_length(v_results) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No valid costs to create. Please provide at least one shipment with a valid amount.'
        );
    END IF;

    -- Create event for batch quote submission
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
            'batch', TRUE,
            'costs_count', jsonb_array_length(v_results),
            'costs', v_results
        ),
        'Batch operational cost submitted for ' || jsonb_array_length(v_results)::TEXT || ' shipment(s)'
    );

    -- Update ticket status
    UPDATE public.tickets
    SET
        status = 'need_response',
        pending_response_from = 'creator',
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- FIRST RESPONSE TRACKING (SLA)
    IF v_is_first_response THEN
        UPDATE public.ticket_sla_tracking
        SET
            first_response_at = NOW(),
            first_response_met = EXTRACT(EPOCH FROM (NOW() - v_ticket_created_at)) / 3600 <= first_response_sla_hours,
            updated_at = NOW()
        WHERE ticket_id = p_ticket_id
        AND first_response_at IS NULL;

        UPDATE public.tickets
        SET first_response_at = NOW()
        WHERE id = p_ticket_id
        AND first_response_at IS NULL;
    END IF;

    -- Record response exchange for SLA tracking
    PERFORM public.record_response_exchange(p_ticket_id, v_actor_user_id, NULL);

    RETURN jsonb_build_object(
        'success', true,
        'batch', true,
        'costs_count', jsonb_array_length(v_results),
        'costs', v_results
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.rpc_batch_create_shipment_costs IS
'Batch create operational costs for multiple shipments in one transaction.

Parameters:
- p_ticket_id: The ticket UUID
- p_shipment_costs: JSONB array of shipment cost objects:
  [{
    "shipment_detail_id": "...",
    "shipment_label": "...",
    "amount": 1000000,
    "rate_structure": "bundling" or "breakdown",
    "items": [...] // for breakdown mode
  }, ...]
- p_currency: Currency code (default IDR)
- p_valid_until: Validity date (default 14 days from now)

Returns:
- success: boolean
- batch: true
- costs_count: number of costs created
- costs: array of created cost objects with quote_id, quote_number, etc.';

GRANT EXECUTE ON FUNCTION public.rpc_batch_create_shipment_costs(UUID, JSONB, VARCHAR, DATE) TO authenticated;

-- ============================================
-- 4. CREATE VIEW: v_shipment_costs_by_ticket
-- Consolidated view of all shipment costs for easy querying
-- ============================================

CREATE OR REPLACE VIEW public.v_shipment_costs_by_ticket AS
SELECT
    t.id AS ticket_id,
    t.ticket_code,
    t.lead_id,
    t.opportunity_id,
    jsonb_agg(
        jsonb_build_object(
            'cost_id', trq.id,
            'quote_number', trq.quote_number,
            'amount', trq.amount,
            'currency', trq.currency,
            'status', trq.status,
            'rate_structure', trq.rate_structure,
            'shipment_detail_id', trq.shipment_detail_id,
            'shipment_label', trq.shipment_label,
            'valid_until', trq.valid_until,
            'created_at', trq.created_at
        ) ORDER BY trq.created_at DESC
    ) FILTER (WHERE trq.id IS NOT NULL) AS costs,
    COUNT(trq.id) FILTER (WHERE trq.status = 'submitted') AS submitted_costs_count,
    SUM(trq.amount) FILTER (WHERE trq.status = 'submitted') AS total_submitted_amount
FROM public.tickets t
LEFT JOIN public.ticket_rate_quotes trq ON trq.ticket_id = t.id
WHERE t.ticket_type = 'RFQ'
GROUP BY t.id, t.ticket_code, t.lead_id, t.opportunity_id;

COMMENT ON VIEW public.v_shipment_costs_by_ticket IS
'View showing all operational costs per ticket, aggregated as JSONB array.
Includes total submitted amount for easy quotation creation.';

GRANT SELECT ON public.v_shipment_costs_by_ticket TO authenticated;

-- ============================================
-- 5. UPDATE: fn_resolve_latest_operational_cost
-- Add flag to indicate multi-shipment scenario
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_resolve_latest_operational_cost(
    p_ticket_id UUID DEFAULT NULL,
    p_lead_id TEXT DEFAULT NULL,
    p_opportunity_id TEXT DEFAULT NULL,
    p_provided_cost_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_latest_cost RECORD;
    v_ticket RECORD;
    v_provided_cost RECORD;
    v_effective_ticket_id UUID;
    v_shipment_count INT;
    v_all_costs_count INT;
BEGIN
    -- First, resolve effective ticket_id
    v_effective_ticket_id := p_ticket_id;

    IF v_effective_ticket_id IS NULL AND p_lead_id IS NOT NULL THEN
        SELECT t.id INTO v_effective_ticket_id
        FROM public.tickets t
        WHERE t.lead_id = p_lead_id
        ORDER BY t.created_at DESC
        LIMIT 1;
    END IF;

    IF v_effective_ticket_id IS NULL AND p_opportunity_id IS NOT NULL THEN
        SELECT t.id INTO v_effective_ticket_id
        FROM public.tickets t
        WHERE t.opportunity_id = p_opportunity_id
        ORDER BY t.created_at DESC
        LIMIT 1;
    END IF;

    IF v_effective_ticket_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'resolved', FALSE,
            'message', 'No ticket found to resolve operational cost',
            'operational_cost_id', NULL,
            'is_latest', NULL,
            'is_multi_shipment', FALSE
        );
    END IF;

    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = v_effective_ticket_id;

    -- Count shipments and costs for multi-shipment detection
    SELECT COUNT(*) INTO v_shipment_count
    FROM public.shipment_details sd
    WHERE sd.lead_id = v_ticket.lead_id
       OR sd.opportunity_id = v_ticket.opportunity_id;

    SELECT COUNT(*) INTO v_all_costs_count
    FROM public.ticket_rate_quotes trq
    WHERE trq.ticket_id = v_effective_ticket_id
    AND trq.status = 'submitted';

    -- Find latest SUBMITTED operational cost
    SELECT * INTO v_latest_cost
    FROM public.ticket_rate_quotes
    WHERE ticket_id = v_effective_ticket_id
    AND status = 'submitted'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_latest_cost IS NULL THEN
        IF v_ticket.ticket_type = 'RFQ' THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', 'No submitted operational cost available for this RFQ ticket. Ops must submit cost first.',
                'error_code', 'NO_SUBMITTED_COST',
                'ticket_id', v_effective_ticket_id,
                'ticket_type', v_ticket.ticket_type,
                'is_multi_shipment', v_shipment_count > 1
            );
        END IF;

        RETURN jsonb_build_object(
            'success', TRUE,
            'resolved', FALSE,
            'message', 'No submitted operational cost found (optional for non-RFQ)',
            'operational_cost_id', NULL,
            'is_latest', NULL,
            'ticket_id', v_effective_ticket_id,
            'ticket_type', v_ticket.ticket_type,
            'is_multi_shipment', v_shipment_count > 1
        );
    END IF;

    -- If multi-shipment scenario, return info about all costs
    IF v_shipment_count > 1 OR v_all_costs_count > 1 THEN
        -- For multi-shipment, recommend using fn_resolve_all_shipment_costs instead
        RETURN jsonb_build_object(
            'success', TRUE,
            'resolved', TRUE,
            'message', 'Multi-shipment ticket detected. Consider using fn_resolve_all_shipment_costs for complete cost resolution.',
            'operational_cost_id', v_latest_cost.id,
            'is_latest', TRUE,
            'is_multi_shipment', TRUE,
            'shipment_count', v_shipment_count,
            'all_costs_count', v_all_costs_count,
            'latest_cost', jsonb_build_object(
                'id', v_latest_cost.id,
                'status', v_latest_cost.status,
                'amount', v_latest_cost.amount,
                'currency', v_latest_cost.currency,
                'shipment_detail_id', v_latest_cost.shipment_detail_id,
                'shipment_label', v_latest_cost.shipment_label,
                'created_at', v_latest_cost.created_at,
                'created_by', v_latest_cost.created_by
            )
        );
    END IF;

    -- Standard single-shipment handling
    IF p_provided_cost_id IS NOT NULL THEN
        SELECT * INTO v_provided_cost
        FROM public.ticket_rate_quotes
        WHERE id = p_provided_cost_id;

        IF v_provided_cost IS NULL THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'resolved', TRUE,
                'message', 'Provided cost_id not found, using latest submitted cost',
                'operational_cost_id', v_latest_cost.id,
                'is_latest', TRUE,
                'is_multi_shipment', FALSE,
                'provided_cost_id', p_provided_cost_id,
                'provided_cost_exists', FALSE
            );
        END IF;

        IF p_provided_cost_id = v_latest_cost.id THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'resolved', TRUE,
                'message', 'Provided cost_id is the latest submitted cost',
                'operational_cost_id', v_latest_cost.id,
                'is_latest', TRUE,
                'is_multi_shipment', FALSE,
                'provided_cost_id', p_provided_cost_id
            );
        ELSE
            RETURN jsonb_build_object(
                'success', TRUE,
                'resolved', TRUE,
                'message', 'Provided cost_id is stale, overriding with latest submitted cost',
                'operational_cost_id', v_latest_cost.id,
                'is_latest', TRUE,
                'is_multi_shipment', FALSE,
                'was_stale', TRUE,
                'provided_cost_id', p_provided_cost_id,
                'provided_cost_status', v_provided_cost.status,
                'provided_cost_created_at', v_provided_cost.created_at
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'resolved', TRUE,
        'message', 'Using latest submitted operational cost',
        'operational_cost_id', v_latest_cost.id,
        'is_latest', TRUE,
        'is_multi_shipment', FALSE,
        'latest_cost', jsonb_build_object(
            'id', v_latest_cost.id,
            'status', v_latest_cost.status,
            'amount', v_latest_cost.amount,
            'currency', v_latest_cost.currency,
            'created_at', v_latest_cost.created_at,
            'created_by', v_latest_cost.created_by
        )
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', 'INTERNAL_ERROR'
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SUMMARY
-- ============================================
-- Multi-Shipment Cost Support:
--
-- 1. NEW column: customer_quotations.operational_cost_ids UUID[]
--    - Stores array of cost IDs for multi-shipment quotations
--
-- 2. NEW fn_resolve_all_shipment_costs():
--    - Returns ALL submitted costs for a ticket
--    - Groups by shipment_detail_id
--    - Validates all shipments have costs
--
-- 3. NEW rpc_batch_create_shipment_costs():
--    - Batch create costs for multiple shipments
--    - Single transaction for atomicity
--    - Proper SLA tracking
--
-- 4. NEW v_shipment_costs_by_ticket view:
--    - Easy query for all costs per ticket
--    - Includes aggregated totals
--
-- 5. UPDATED fn_resolve_latest_operational_cost():
--    - Now detects multi-shipment scenarios
--    - Returns is_multi_shipment flag
--    - Recommends using fn_resolve_all_shipment_costs for multi-shipment
-- ============================================
