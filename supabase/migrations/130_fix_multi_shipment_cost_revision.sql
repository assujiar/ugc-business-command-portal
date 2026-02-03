-- ============================================
-- Migration: 130_fix_multi_shipment_cost_revision.sql
--
-- PURPOSE: Fix cost revision flow for multi-shipment scenarios
--
-- ISSUE:
-- When a quotation is rejected and ops submits a revised cost,
-- the new cost should be used instead of the old rejected cost.
-- For multi-shipment, we need to return only the LATEST submitted
-- cost per shipment_detail_id, not ALL submitted costs.
--
-- SOLUTION:
-- Update fn_resolve_all_shipment_costs to deduplicate by shipment_detail_id,
-- returning only the most recent submitted cost per shipment.
-- ============================================

-- ============================================
-- 1. UPDATE FUNCTION: fn_resolve_all_shipment_costs
-- Now deduplicates by shipment_detail_id, keeping only latest per shipment
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

    -- Get LATEST submitted operational cost per shipment_detail_id
    -- Uses DISTINCT ON to deduplicate: for each shipment, keep only the most recent submitted cost
    -- This ensures that after a cost revision, only the new cost is returned
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', deduped.id,
            'quote_number', deduped.quote_number,
            'amount', deduped.amount,
            'currency', deduped.currency,
            'status', deduped.status,
            'rate_structure', deduped.rate_structure,
            'valid_until', deduped.valid_until,
            'shipment_detail_id', deduped.shipment_detail_id,
            'shipment_label', deduped.shipment_label,
            'created_at', deduped.created_at,
            'created_by', deduped.created_by
        ) ORDER BY
            -- Order: shipments with ID first (grouped by shipment), then by created_at DESC
            CASE WHEN deduped.shipment_detail_id IS NOT NULL THEN 0 ELSE 1 END,
            deduped.created_at DESC
    ), '[]'::jsonb) INTO v_costs
    FROM (
        -- Subquery with DISTINCT ON to get latest cost per shipment
        SELECT DISTINCT ON (COALESCE(trq.shipment_detail_id, 'NO_SHIPMENT'))
            trq.id,
            trq.quote_number,
            trq.amount,
            trq.currency,
            trq.status,
            trq.rate_structure,
            trq.valid_until,
            trq.shipment_detail_id,
            trq.shipment_label,
            trq.created_at,
            trq.created_by
        FROM public.ticket_rate_quotes trq
        WHERE trq.ticket_id = v_effective_ticket_id
        AND trq.status = 'submitted'
        -- Order by shipment_detail_id first, then by created_at DESC to get the latest
        ORDER BY COALESCE(trq.shipment_detail_id, 'NO_SHIPMENT'), trq.created_at DESC
    ) AS deduped;

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
                    -- Count distinct shipments that have submitted costs (using DISTINCT ON logic)
                    SELECT COUNT(DISTINCT COALESCE(trq.shipment_detail_id, 'NO_SHIPMENT')) >= v_shipment_count
                    FROM public.ticket_rate_quotes trq
                    WHERE trq.ticket_id = v_effective_ticket_id
                    AND trq.status = 'submitted'
                    AND trq.shipment_detail_id IS NOT NULL
                )
                ELSE FALSE
            END
        ),
        'missing_shipments', (
            -- List shipment_detail_ids that don't have submitted costs yet
            SELECT COALESCE(jsonb_agg(sd.shipment_detail_id), '[]'::jsonb)
            FROM public.shipment_details sd
            WHERE (sd.lead_id = v_ticket.lead_id OR sd.opportunity_id = v_ticket.opportunity_id)
            AND sd.shipment_detail_id NOT IN (
                SELECT DISTINCT trq.shipment_detail_id
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
'Multi-shipment cost resolution with revision support.

Returns LATEST submitted operational cost per shipment_detail_id.
This ensures that after a cost is rejected and revised, only the new
(revised) cost is returned - not the old rejected one.

Key behavior:
- Filters to status = "submitted" only (excludes rejected/revise_requested)
- Deduplicates by shipment_detail_id using DISTINCT ON
- For each shipment, returns only the most recently created submitted cost
- Supports multi-shipment tickets with proper cost tracking

Returns:
- success: boolean
- costs: array of LATEST cost objects per shipment (deduplicated)
- costs_count: number of unique shipment costs
- shipment_count: number of shipments in ticket
- all_shipments_costed: boolean - true if all shipments have costs
- missing_shipments: array of shipment_detail_ids without costs';

-- ============================================
-- 2. UPDATE VIEW: v_shipment_costs_by_ticket
-- Also update to only show latest submitted cost per shipment
-- ============================================

CREATE OR REPLACE VIEW public.v_shipment_costs_by_ticket AS
WITH latest_costs AS (
    -- Get only the latest submitted cost per shipment per ticket
    SELECT DISTINCT ON (ticket_id, COALESCE(shipment_detail_id, 'NO_SHIPMENT'))
        id,
        ticket_id,
        quote_number,
        amount,
        currency,
        status,
        rate_structure,
        shipment_detail_id,
        shipment_label,
        valid_until,
        created_at
    FROM public.ticket_rate_quotes
    WHERE status = 'submitted'
    ORDER BY ticket_id, COALESCE(shipment_detail_id, 'NO_SHIPMENT'), created_at DESC
)
SELECT
    t.id AS ticket_id,
    t.ticket_code,
    t.lead_id,
    t.opportunity_id,
    jsonb_agg(
        jsonb_build_object(
            'cost_id', lc.id,
            'quote_number', lc.quote_number,
            'amount', lc.amount,
            'currency', lc.currency,
            'status', lc.status,
            'rate_structure', lc.rate_structure,
            'shipment_detail_id', lc.shipment_detail_id,
            'shipment_label', lc.shipment_label,
            'valid_until', lc.valid_until,
            'created_at', lc.created_at
        ) ORDER BY lc.created_at DESC
    ) FILTER (WHERE lc.id IS NOT NULL) AS costs,
    COUNT(lc.id) AS submitted_costs_count,
    SUM(lc.amount) AS total_submitted_amount
FROM public.tickets t
LEFT JOIN latest_costs lc ON lc.ticket_id = t.id
WHERE t.ticket_type = 'RFQ'
GROUP BY t.id, t.ticket_code, t.lead_id, t.opportunity_id;

COMMENT ON VIEW public.v_shipment_costs_by_ticket IS
'View showing LATEST operational cost per shipment per ticket (deduplicated).
After a cost revision, only the new cost is shown - not the old rejected one.
Includes total submitted amount for easy quotation creation.';

-- ============================================
-- SUMMARY
-- ============================================
-- Multi-Shipment Cost Revision Fix:
--
-- BEFORE: fn_resolve_all_shipment_costs returned ALL submitted costs
--   - If a shipment had multiple submitted costs (after revision),
--     all would be returned causing duplicate costs in quotations
--
-- AFTER: fn_resolve_all_shipment_costs returns LATEST submitted cost per shipment
--   - Uses DISTINCT ON (shipment_detail_id) ORDER BY created_at DESC
--   - Only the most recent submitted cost per shipment is returned
--   - Rejected costs (status = 'revise_requested') are excluded
--   - New revised costs replace old ones automatically
--
-- FLOW:
--   1. Ops submits cost for Shipment A -> Cost A1 (submitted)
--   2. Sales creates quotation using Cost A1
--   3. Customer rejects quotation -> Cost A1 becomes 'revise_requested'
--   4. Ops submits revised cost for Shipment A -> Cost A2 (submitted)
--   5. Sales creates new quotation -> Only Cost A2 is used (Cost A1 excluded)
-- ============================================
