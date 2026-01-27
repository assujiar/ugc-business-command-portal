-- ============================================
-- Migration: 092_quotation_must_use_latest_operational_cost.sql
--
-- PURPOSE: Fix BUG #9 - Quotation dibuat harus pakai operational cost terbaru
-- (ticket_rate_quotes status submitted)
--
-- ISSUES FIXED:
-- 1. Server-side guard to ensure quotation always uses latest submitted operational cost
-- 2. If operational_cost_id is missing or not latest, resolve to latest submitted
-- 3. Reject creation if no submitted cost exists for RFQ tickets
--
-- FLOW:
-- 1. API route calls fn_resolve_latest_operational_cost()
-- 2. Function finds latest ticket_rate_quotes with status='submitted' for the ticket
-- 3. Returns the cost_id or NULL if none found
-- 4. API route can then decide: use it, or return error if required but missing
-- ============================================

-- ============================================
-- 1. CREATE: Function to resolve latest submitted operational cost
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

    -- If no effective ticket found, can't resolve operational cost
    IF v_effective_ticket_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'resolved', FALSE,
            'message', 'No ticket found to resolve operational cost',
            'operational_cost_id', NULL,
            'is_latest', NULL
        );
    END IF;

    -- Get ticket info
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = v_effective_ticket_id;

    -- Find latest SUBMITTED operational cost for this ticket
    -- Only consider 'submitted' status as valid for quotation creation
    SELECT * INTO v_latest_cost
    FROM public.ticket_rate_quotes
    WHERE ticket_id = v_effective_ticket_id
    AND status = 'submitted'
    ORDER BY created_at DESC
    LIMIT 1;

    -- If no submitted cost found
    IF v_latest_cost IS NULL THEN
        -- Check if ticket is RFQ type - cost is required
        IF v_ticket.ticket_type = 'RFQ' THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', 'No submitted operational cost available for this RFQ ticket. Ops must submit cost first.',
                'error_code', 'NO_SUBMITTED_COST',
                'ticket_id', v_effective_ticket_id,
                'ticket_type', v_ticket.ticket_type
            );
        END IF;

        -- For non-RFQ tickets, cost is optional
        RETURN jsonb_build_object(
            'success', TRUE,
            'resolved', FALSE,
            'message', 'No submitted operational cost found (optional for non-RFQ)',
            'operational_cost_id', NULL,
            'is_latest', NULL,
            'ticket_id', v_effective_ticket_id,
            'ticket_type', v_ticket.ticket_type
        );
    END IF;

    -- If provided_cost_id was given, check if it's the latest
    IF p_provided_cost_id IS NOT NULL THEN
        SELECT * INTO v_provided_cost
        FROM public.ticket_rate_quotes
        WHERE id = p_provided_cost_id;

        IF v_provided_cost IS NULL THEN
            -- Provided cost doesn't exist, use latest
            RETURN jsonb_build_object(
                'success', TRUE,
                'resolved', TRUE,
                'message', 'Provided cost_id not found, using latest submitted cost',
                'operational_cost_id', v_latest_cost.id,
                'is_latest', TRUE,
                'provided_cost_id', p_provided_cost_id,
                'provided_cost_exists', FALSE,
                'latest_cost', jsonb_build_object(
                    'id', v_latest_cost.id,
                    'status', v_latest_cost.status,
                    'total_cost', v_latest_cost.total_cost,
                    'currency', v_latest_cost.currency,
                    'created_at', v_latest_cost.created_at,
                    'created_by', v_latest_cost.created_by
                )
            );
        END IF;

        -- Check if provided cost is the latest
        IF p_provided_cost_id = v_latest_cost.id THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'resolved', TRUE,
                'message', 'Provided cost_id is the latest submitted cost',
                'operational_cost_id', v_latest_cost.id,
                'is_latest', TRUE,
                'provided_cost_id', p_provided_cost_id,
                'latest_cost', jsonb_build_object(
                    'id', v_latest_cost.id,
                    'status', v_latest_cost.status,
                    'total_cost', v_latest_cost.total_cost,
                    'currency', v_latest_cost.currency,
                    'created_at', v_latest_cost.created_at,
                    'created_by', v_latest_cost.created_by
                )
            );
        ELSE
            -- Provided cost is stale, override with latest
            RETURN jsonb_build_object(
                'success', TRUE,
                'resolved', TRUE,
                'message', 'Provided cost_id is stale, overriding with latest submitted cost',
                'operational_cost_id', v_latest_cost.id,
                'is_latest', TRUE,
                'was_stale', TRUE,
                'provided_cost_id', p_provided_cost_id,
                'provided_cost_status', v_provided_cost.status,
                'provided_cost_created_at', v_provided_cost.created_at,
                'latest_cost', jsonb_build_object(
                    'id', v_latest_cost.id,
                    'status', v_latest_cost.status,
                    'total_cost', v_latest_cost.total_cost,
                    'currency', v_latest_cost.currency,
                    'created_at', v_latest_cost.created_at,
                    'created_by', v_latest_cost.created_by
                )
            );
        END IF;
    END IF;

    -- No cost_id provided, return latest
    RETURN jsonb_build_object(
        'success', TRUE,
        'resolved', TRUE,
        'message', 'Using latest submitted operational cost',
        'operational_cost_id', v_latest_cost.id,
        'is_latest', TRUE,
        'latest_cost', jsonb_build_object(
            'id', v_latest_cost.id,
            'status', v_latest_cost.status,
            'total_cost', v_latest_cost.total_cost,
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

COMMENT ON FUNCTION public.fn_resolve_latest_operational_cost IS
'BUG #9 Fix: Resolves the latest submitted operational cost for quotation creation.

Behavior:
- If ticket_id provided: finds latest submitted cost for that ticket
- If lead_id/opportunity_id provided: finds linked ticket, then cost
- If provided_cost_id is given:
  - Validates it exists
  - Checks if it''s the latest
  - If stale, returns latest with was_stale=true flag
- For RFQ tickets: returns error if no submitted cost found
- For non-RFQ tickets: cost is optional

Returns:
- success: boolean
- operational_cost_id: UUID or null
- is_latest: boolean
- was_stale: boolean (if provided cost was overridden)
- latest_cost: object with cost details';

-- ============================================
-- 2. CREATE: View for latest operational costs per ticket
-- Useful for UI to show correct default
-- ============================================

CREATE OR REPLACE VIEW public.v_latest_operational_costs AS
SELECT DISTINCT ON (ticket_id)
    trq.id,
    trq.ticket_id,
    trq.status,
    trq.total_cost,
    trq.currency,
    trq.rate_structure,
    trq.created_at,
    trq.created_by,
    p.name AS created_by_name,
    t.ticket_code,
    t.ticket_type
FROM public.ticket_rate_quotes trq
JOIN public.tickets t ON t.id = trq.ticket_id
LEFT JOIN public.profiles p ON p.user_id = trq.created_by
WHERE trq.status = 'submitted'
ORDER BY trq.ticket_id, trq.created_at DESC;

COMMENT ON VIEW public.v_latest_operational_costs IS
'BUG #9 Fix: Shows the latest submitted operational cost per ticket.
UI should use this to default-select the correct cost for quotation creation.';

-- ============================================
-- 3. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.fn_resolve_latest_operational_cost(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT SELECT ON public.v_latest_operational_costs TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- BUG #9 Fix: Quotation must use latest submitted operational cost:
--
-- 1. NEW fn_resolve_latest_operational_cost():
--    - Server-side validation for operational_cost_id
--    - Resolves to latest if not provided or stale
--    - Returns error for RFQ tickets without submitted cost
--    - Returns info about cost override for logging
--
-- 2. NEW v_latest_operational_costs view:
--    - Shows latest submitted cost per ticket
--    - UI can query this to default-select correct cost
--
-- API Route (customer-quotations/route.ts) should:
-- 1. Call fn_resolve_latest_operational_cost() before insert
-- 2. Use returned operational_cost_id (may differ from provided)
-- 3. Return 400 error if RFQ ticket has no submitted cost
-- 4. Log if cost was overridden (was_stale=true)
-- ============================================
