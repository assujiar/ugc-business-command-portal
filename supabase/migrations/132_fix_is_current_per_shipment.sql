-- ============================================
-- Migration: 132_fix_is_current_per_shipment.sql
--
-- PURPOSE: Fix is_current constraint to be per shipment instead of per ticket
--
-- ISSUE:
-- The current unique constraint `idx_ticket_rate_quotes_one_current_per_ticket`
-- only allows ONE `is_current = TRUE` per ticket_id. But with multi-shipment
-- support, each ticket can have multiple shipments, and each shipment should
-- have its own current cost.
--
-- SOLUTION:
-- 1. Drop the old unique index on (ticket_id) WHERE is_current = TRUE
-- 2. Create new unique index on (ticket_id, shipment_detail_id) WHERE is_current = TRUE
-- 3. Update trigger fn_supersede_previous_quotes to filter by shipment_detail_id
-- 4. Update trigger fn_supersede_link_quotes to filter by shipment_detail_id
-- 5. Backfill is_current = TRUE for latest cost per (ticket, shipment) combination
--
-- FLOW:
-- 1 ticket → N shipments → each shipment has 1 current cost
-- When creating quotation, system uses ALL costs where is_current = TRUE for that ticket
-- ============================================

-- ============================================
-- PART 1: DROP OLD INDEX AND CREATE NEW ONE
-- ============================================

-- Drop the old unique index (one current per ticket)
DROP INDEX IF EXISTS idx_ticket_rate_quotes_one_current_per_ticket;

-- Create new unique index (one current per ticket+shipment combination)
-- This allows multiple is_current = TRUE records per ticket, but only ONE per shipment
CREATE UNIQUE INDEX idx_ticket_rate_quotes_one_current_per_shipment
    ON public.ticket_rate_quotes (ticket_id, shipment_detail_id)
    WHERE is_current = TRUE AND shipment_detail_id IS NOT NULL;

COMMENT ON INDEX idx_ticket_rate_quotes_one_current_per_shipment IS
'Enforces that only one ticket_rate_quote can be current (is_current=TRUE) per (ticket_id, shipment_detail_id) combination.
This supports multi-shipment tickets where each shipment needs its own current cost.';

-- Also create index for tickets without shipment_detail_id (legacy single-cost tickets)
-- This maintains backward compatibility for old tickets
CREATE UNIQUE INDEX idx_ticket_rate_quotes_one_current_per_ticket_no_shipment
    ON public.ticket_rate_quotes (ticket_id)
    WHERE is_current = TRUE AND shipment_detail_id IS NULL;

COMMENT ON INDEX idx_ticket_rate_quotes_one_current_per_ticket_no_shipment IS
'Enforces that only one ticket_rate_quote can be current for tickets without shipment_detail_id (legacy support).';

-- ============================================
-- PART 2: UPDATE TRIGGER fn_supersede_previous_quotes
-- Now filters by shipment_detail_id to only supersede costs for same shipment
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_supersede_previous_quotes()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_current = TRUE AND NEW.ticket_id IS NOT NULL THEN
        -- Advisory lock to serialize per-ticket inserts (prevents race conditions)
        PERFORM pg_advisory_xact_lock(hashtext(NEW.ticket_id::text)::bigint);

        -- Mark previous current quotes for the SAME SHIPMENT as superseded
        -- FIX: Added shipment_detail_id filter to support multi-shipment
        IF NEW.shipment_detail_id IS NOT NULL THEN
            -- Multi-shipment: Only supersede costs for the same shipment
            UPDATE public.ticket_rate_quotes
            SET
                is_current = FALSE,
                superseded_by_id = NEW.id,
                superseded_at = NOW(),
                updated_at = NOW()
            WHERE ticket_id = NEW.ticket_id
            AND shipment_detail_id = NEW.shipment_detail_id
            AND is_current = TRUE
            AND id != NEW.id;  -- Don't supersede self
        ELSE
            -- Legacy (no shipment): Supersede all current quotes without shipment_detail_id
            UPDATE public.ticket_rate_quotes
            SET
                is_current = FALSE,
                superseded_by_id = NEW.id,
                superseded_at = NOW(),
                updated_at = NOW()
            WHERE ticket_id = NEW.ticket_id
            AND shipment_detail_id IS NULL
            AND is_current = TRUE
            AND id != NEW.id;  -- Don't supersede self
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_supersede_previous_quotes IS
'BEFORE INSERT trigger that marks previous current quotes as superseded.
Uses advisory lock to prevent race conditions with concurrent inserts.

FIX in migration 132:
- Now filters by shipment_detail_id to support multi-shipment tickets
- Each shipment can have its own current cost without affecting other shipments
- Maintains backward compatibility for tickets without shipment_detail_id';

-- ============================================
-- PART 3: UPDATE TRIGGER fn_supersede_link_quotes
-- Now filters by shipment_detail_id when setting superseded_by_id
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_supersede_link_quotes()
RETURNS TRIGGER AS $$
DECLARE
    v_previous_quote_id UUID;
BEGIN
    IF NEW.is_current = TRUE AND NEW.ticket_id IS NOT NULL THEN
        -- Find the previous quote that was just superseded (for the SAME SHIPMENT)
        -- FIX: Added shipment_detail_id filter to support multi-shipment
        IF NEW.shipment_detail_id IS NOT NULL THEN
            -- Multi-shipment: Find previous cost for same shipment
            SELECT id INTO v_previous_quote_id
            FROM public.ticket_rate_quotes
            WHERE ticket_id = NEW.ticket_id
            AND shipment_detail_id = NEW.shipment_detail_id
            AND is_current = FALSE
            AND superseded_by_id = NEW.id
            ORDER BY created_at DESC
            LIMIT 1;
        ELSE
            -- Legacy (no shipment): Find previous cost without shipment_detail_id
            SELECT id INTO v_previous_quote_id
            FROM public.ticket_rate_quotes
            WHERE ticket_id = NEW.ticket_id
            AND shipment_detail_id IS NULL
            AND is_current = FALSE
            AND superseded_by_id = NEW.id
            ORDER BY created_at DESC
            LIMIT 1;
        END IF;

        -- Log for debugging (can be removed in production)
        IF v_previous_quote_id IS NOT NULL THEN
            RAISE NOTICE 'Quote % superseded quote % for shipment %', NEW.id, v_previous_quote_id, NEW.shipment_detail_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_supersede_link_quotes IS
'AFTER INSERT trigger that logs the supersede relationship.

FIX in migration 132:
- Now filters by shipment_detail_id to support multi-shipment tickets
- Only finds previous costs for the same shipment';

-- ============================================
-- PART 4: BACKFILL is_current FOR MULTI-SHIPMENT SCENARIOS
-- Set is_current = TRUE for the latest cost per (ticket, shipment) combination
-- ============================================

-- First, reset all is_current to FALSE
UPDATE public.ticket_rate_quotes
SET is_current = FALSE
WHERE is_current = TRUE;

-- Then, set is_current = TRUE for the latest submitted cost per (ticket, shipment)
-- Using DISTINCT ON to get only the latest per combination
WITH latest_costs AS (
    SELECT DISTINCT ON (ticket_id, COALESCE(shipment_detail_id, 'NONE'))
        id,
        ticket_id,
        shipment_detail_id,
        status,
        created_at
    FROM public.ticket_rate_quotes
    WHERE status = 'submitted'
    ORDER BY ticket_id, COALESCE(shipment_detail_id, 'NONE'), created_at DESC
)
UPDATE public.ticket_rate_quotes trq
SET is_current = TRUE
FROM latest_costs lc
WHERE trq.id = lc.id;

-- Also handle 'sent_to_customer' status as current if no 'submitted' exists
-- This handles the case where cost was already sent but not yet accepted/rejected
WITH latest_sent_costs AS (
    SELECT DISTINCT ON (ticket_id, COALESCE(shipment_detail_id, 'NONE'))
        id,
        ticket_id,
        shipment_detail_id,
        status,
        created_at
    FROM public.ticket_rate_quotes
    WHERE status = 'sent_to_customer'
    AND ticket_id NOT IN (
        -- Exclude tickets that already have submitted costs for this shipment
        SELECT DISTINCT ticket_id
        FROM public.ticket_rate_quotes
        WHERE is_current = TRUE
    )
    ORDER BY ticket_id, COALESCE(shipment_detail_id, 'NONE'), created_at DESC
)
UPDATE public.ticket_rate_quotes trq
SET is_current = TRUE
FROM latest_sent_costs lc
WHERE trq.id = lc.id
AND NOT EXISTS (
    -- Don't override if already set as current for this shipment
    SELECT 1 FROM public.ticket_rate_quotes
    WHERE ticket_id = trq.ticket_id
    AND COALESCE(shipment_detail_id, 'NONE') = COALESCE(trq.shipment_detail_id, 'NONE')
    AND is_current = TRUE
);

-- ============================================
-- PART 5: CREATE HELPER FUNCTION TO GET CURRENT COSTS FOR TICKET
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_get_current_costs_for_ticket(
    p_ticket_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_costs JSONB;
BEGIN
    -- Get all current costs for this ticket (one per shipment)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', trq.id,
            'quote_number', trq.quote_number,
            'amount', trq.amount,
            'currency', trq.currency,
            'status', trq.status,
            'rate_structure', trq.rate_structure,
            'shipment_detail_id', trq.shipment_detail_id,
            'shipment_label', trq.shipment_label,
            'created_at', trq.created_at,
            'is_current', trq.is_current
        ) ORDER BY trq.shipment_label, trq.created_at DESC
    ), '[]'::jsonb) INTO v_costs
    FROM public.ticket_rate_quotes trq
    WHERE trq.ticket_id = p_ticket_id
    AND trq.is_current = TRUE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'costs', v_costs,
        'costs_count', jsonb_array_length(v_costs)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_get_current_costs_for_ticket IS
'Returns all current (is_current = TRUE) costs for a ticket.
With multi-shipment support, this returns one cost per shipment.';

GRANT EXECUTE ON FUNCTION public.fn_get_current_costs_for_ticket(UUID) TO authenticated;

-- ============================================
-- PART 6: UPDATE fn_resolve_all_shipment_costs TO USE is_current
-- Now returns costs based on is_current flag instead of just status
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

    -- Get ALL CURRENT operational costs for this ticket
    -- FIX: Now uses is_current = TRUE to identify active costs per shipment
    -- Also filter for status = 'submitted' to ensure only usable costs
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
            'created_by', trq.created_by,
            'is_current', trq.is_current
        ) ORDER BY
            -- Order by shipment label for consistent display
            trq.shipment_label,
            trq.created_at DESC
    ), '[]'::jsonb) INTO v_costs
    FROM public.ticket_rate_quotes trq
    WHERE trq.ticket_id = v_effective_ticket_id
    AND trq.is_current = TRUE
    AND trq.status = 'submitted';  -- Only submitted costs are usable

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
        -- Check if all shipments have current costs
        'all_shipments_costed', (
            CASE
                WHEN v_shipment_count = 0 THEN TRUE
                WHEN v_shipment_count > 0 THEN (
                    SELECT COUNT(DISTINCT trq.shipment_detail_id) >= v_shipment_count
                    FROM public.ticket_rate_quotes trq
                    WHERE trq.ticket_id = v_effective_ticket_id
                    AND trq.is_current = TRUE
                    AND trq.status = 'submitted'
                    AND trq.shipment_detail_id IS NOT NULL
                )
                ELSE FALSE
            END
        ),
        'missing_shipments', (
            -- List shipment_detail_ids that don't have current costs yet
            SELECT COALESCE(jsonb_agg(sd.shipment_detail_id), '[]'::jsonb)
            FROM public.shipment_details sd
            WHERE (sd.lead_id = v_ticket.lead_id OR sd.opportunity_id = v_ticket.opportunity_id)
            AND sd.shipment_detail_id NOT IN (
                SELECT trq.shipment_detail_id
                FROM public.ticket_rate_quotes trq
                WHERE trq.ticket_id = v_effective_ticket_id
                AND trq.is_current = TRUE
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
'Multi-shipment cost resolution: Returns ALL current operational costs for a ticket.

FIX in migration 132:
- Now uses is_current = TRUE to identify active costs per shipment
- Combined with status = "submitted" filter for usable costs
- Each shipment has exactly one current cost

Returns:
- success: boolean
- costs: array of cost objects with shipment_detail_id (only current ones)
- costs_count: number of current costs found
- shipment_count: number of shipments in ticket
- all_shipments_costed: boolean - true if all shipments have current costs
- missing_shipments: array of shipment_detail_ids without current costs';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.fn_supersede_previous_quotes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_supersede_link_quotes() TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- Multi-Shipment is_current Fix:
--
-- ISSUE:
-- The unique constraint only allowed ONE is_current = TRUE per ticket_id.
-- With multi-shipment support, each shipment needs its own current cost.
--
-- SOLUTION:
-- 1. Changed unique index from (ticket_id) to (ticket_id, shipment_detail_id)
-- 2. Updated trigger fn_supersede_previous_quotes to filter by shipment_detail_id
-- 3. Updated trigger fn_supersede_link_quotes to filter by shipment_detail_id
-- 4. Backfilled is_current = TRUE for latest cost per (ticket, shipment)
-- 5. Updated fn_resolve_all_shipment_costs to use is_current flag
--
-- DATA MODEL:
-- - 1 ticket_id → N shipment_detail_ids
-- - 1 shipment_detail_id → 1 is_current = TRUE cost
-- - 1 quotation → N costs (one per shipment, all with is_current = TRUE)
--
-- FLOW EXAMPLE (2-shipment quotation):
-- 1. Ops submits costs for Shipment 1 and Shipment 2
--    → cost_A (Shipment 1, is_current=TRUE)
--    → cost_B (Shipment 2, is_current=TRUE)
-- 2. Sales creates quotation using both current costs
-- 3. Customer rejects quotation
--    → Both costs become revise_requested
--    → Trigger marks them as is_current=FALSE when new costs are submitted
-- 4. Ops submits revised costs
--    → cost_A2 (Shipment 1, is_current=TRUE) - supersedes cost_A
--    → cost_B2 (Shipment 2, is_current=TRUE) - supersedes cost_B
-- 5. Sales creates new quotation using cost_A2 and cost_B2
-- ============================================
