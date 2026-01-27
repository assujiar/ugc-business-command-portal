-- ============================================
-- Migration: 082_fix_enum_text_type_mismatch.sql
--
-- PURPOSE: Fix Issue 3 - Reject quotation error: "status enum vs text" (SQLSTATE 42804)
--
-- ROOT CAUSE: Multiple functions declare variables as TEXT but assign them to
-- enum columns without proper casting. This causes PostgreSQL error 42804
-- "cannot use operator for type text with type customer_quotation_status"
--
-- AFFECTED FUNCTIONS:
-- 1. sync_ticket_to_quotation (migration 071)
-- 2. sync_opportunity_to_quotation (migration 072)
-- 3. rpc_sync_cost_status_to_quotation (migration 074)
-- 4. trigger_sync_ticket_status_to_quotation (migration 074)
--
-- FIX: Add explicit enum casting (::customer_quotation_status) when assigning
-- TEXT variables to enum columns
-- ============================================

-- ============================================
-- 1. FIX: sync_ticket_to_quotation
-- Original in migration 071, lines 800-877
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_ticket_to_quotation(
    p_ticket_id TEXT,
    p_outcome TEXT -- 'won' or 'lost'
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_ticket RECORD;
    v_new_status TEXT;
    v_updated_count INTEGER := 0;
BEGIN
    -- Determine new quotation status based on outcome
    IF p_outcome = 'won' THEN
        v_new_status := 'accepted';
    ELSIF p_outcome = 'lost' THEN
        v_new_status := 'rejected';
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid outcome: ' || p_outcome);
    END IF;

    -- Get ticket for lead/opportunity links
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id::UUID;

    -- Update all active quotations for this ticket
    -- FIX: Add explicit cast to customer_quotation_status enum
    UPDATE public.customer_quotations
    SET
        status = v_new_status::customer_quotation_status,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id::UUID
    AND status IN ('sent', 'draft')
    RETURNING * INTO v_quotation;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Also update linked operational costs (already has cast in original)
    UPDATE public.ticket_rate_quotes
    SET
        status = CASE v_new_status
            WHEN 'accepted' THEN 'accepted'::quote_status
            WHEN 'rejected' THEN 'rejected'::quote_status
        END,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id::UUID
    AND status IN ('sent', 'sent_to_customer', 'submitted');

    -- Also update quotation status on linked lead (TEXT column, no cast needed)
    IF v_ticket.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET
            quotation_status = v_new_status,
            updated_at = NOW()
        WHERE lead_id = v_ticket.lead_id;
    END IF;

    -- Also update quotation status on linked opportunity (TEXT column, no cast needed)
    IF v_ticket.opportunity_id IS NOT NULL THEN
        UPDATE public.opportunities
        SET
            quotation_status = v_new_status,
            updated_at = NOW()
        WHERE opportunity_id = v_ticket.opportunity_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'updated_count', v_updated_count,
        'new_status', v_new_status
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_ticket_to_quotation IS
'Syncs ticket won/lost outcome to all associated quotations and operational costs.
Also updates lead and opportunity quotation_status if linked.
Fixed: Added explicit enum cast for customer_quotation_status.';

-- ============================================
-- 2. FIX: sync_opportunity_to_quotation
-- Original in migration 072, lines 537-593
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_opportunity_to_quotation(
    p_opportunity_id TEXT,
    p_outcome TEXT -- 'won' or 'lost'
)
RETURNS JSONB AS $$
DECLARE
    v_opportunity RECORD;
    v_new_status TEXT;
    v_updated_count INTEGER := 0;
BEGIN
    -- Determine new quotation status based on outcome
    IF p_outcome = 'won' THEN
        v_new_status := 'accepted';
    ELSIF p_outcome = 'lost' THEN
        v_new_status := 'rejected';
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid outcome: ' || p_outcome);
    END IF;

    -- Get opportunity info
    SELECT * INTO v_opportunity
    FROM public.opportunities
    WHERE opportunity_id = p_opportunity_id;

    IF v_opportunity IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Opportunity not found');
    END IF;

    -- Update all active quotations for this opportunity
    -- FIX: Add explicit cast to customer_quotation_status enum
    UPDATE public.customer_quotations
    SET
        status = v_new_status::customer_quotation_status,
        updated_at = NOW()
    WHERE opportunity_id = p_opportunity_id
    AND status IN ('sent', 'draft');

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Also update linked operational costs (already has cast in original)
    UPDATE public.ticket_rate_quotes
    SET
        status = CASE v_new_status
            WHEN 'accepted' THEN 'accepted'::quote_status
            WHEN 'rejected' THEN 'rejected'::quote_status
        END,
        updated_at = NOW()
    WHERE opportunity_id = p_opportunity_id
    AND status IN ('sent', 'sent_to_customer', 'submitted');

    -- Also sync tickets linked to this opportunity
    PERFORM public.sync_opportunity_to_ticket(p_opportunity_id, p_outcome);

    RETURN jsonb_build_object(
        'success', TRUE,
        'updated_count', v_updated_count,
        'new_status', v_new_status
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_opportunity_to_quotation IS
'When opportunity is closed, update all linked quotations.
Fixed: Added explicit enum cast for customer_quotation_status.';

-- ============================================
-- 3. FIX: rpc_sync_cost_status_to_quotation
-- Original in migration 074, lines 18-104
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_sync_cost_status_to_quotation(
    p_cost_id UUID,
    p_new_status quote_status
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_quotation_status TEXT;
    v_updated_count INTEGER := 0;
BEGIN
    -- Map operational cost status to quotation status
    v_quotation_status := CASE p_new_status::TEXT
        WHEN 'sent_to_customer' THEN 'sent'
        WHEN 'accepted' THEN 'accepted'
        WHEN 'rejected' THEN 'rejected'
        ELSE NULL
    END;

    -- If no valid mapping, skip sync (e.g., 'draft', 'submitted' statuses)
    IF v_quotation_status IS NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'synced', FALSE,
            'message', 'No status mapping for: ' || p_new_status::TEXT
        );
    END IF;

    -- Find and update all quotations linked to this operational cost
    -- FIX: Add explicit cast to customer_quotation_status enum
    UPDATE public.customer_quotations
    SET
        status = v_quotation_status::customer_quotation_status,
        updated_at = NOW()
    WHERE operational_cost_id = p_cost_id
    AND status NOT IN ('accepted', 'rejected', 'expired')
    RETURNING * INTO v_quotation;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- If a quotation was updated, trigger full sync to propagate to other entities
    IF v_updated_count > 0 AND v_quotation IS NOT NULL THEN
        -- Sync to ticket, lead, opportunity (but not back to operational cost to avoid loop)
        IF v_quotation.ticket_id IS NOT NULL THEN
            PERFORM public.sync_quotation_to_ticket(v_quotation.id, v_quotation_status, v_quotation.created_by);
        END IF;

        -- quotation_status on leads/opportunities is TEXT, no cast needed
        IF v_quotation.lead_id IS NOT NULL THEN
            UPDATE public.leads
            SET quotation_status = v_quotation_status, updated_at = NOW()
            WHERE lead_id = v_quotation.lead_id;
        END IF;

        IF v_quotation.opportunity_id IS NOT NULL THEN
            UPDATE public.opportunities
            SET quotation_status = v_quotation_status, updated_at = NOW()
            WHERE opportunity_id = v_quotation.opportunity_id;

            -- Auto-transition opportunity stage
            IF v_quotation_status = 'sent' THEN
                UPDATE public.opportunities
                SET stage = 'Quote Sent', updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id
                AND stage IN ('Prospecting', 'Discovery');
            ELSIF v_quotation_status = 'rejected' THEN
                UPDATE public.opportunities
                SET stage = 'Negotiation', updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id
                AND stage = 'Quote Sent';
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'synced', v_updated_count > 0,
        'updated_count', v_updated_count,
        'new_quotation_status', v_quotation_status
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_sync_cost_status_to_quotation IS
'Syncs operational cost status changes to linked quotations.
Fixed: Added explicit enum cast for customer_quotation_status.';

-- ============================================
-- 4. FIX: trigger_sync_ticket_status_to_quotation
-- Original in migration 074, lines 249-336
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_sync_ticket_status_to_quotation()
RETURNS TRIGGER AS $$
DECLARE
    v_quotation_status TEXT;
    v_quotation RECORD;
BEGIN
    -- Map ticket status changes to quotation status
    -- Only handle meaningful status transitions
    IF NEW.status = 'closed' AND NEW.close_outcome IS NOT NULL THEN
        -- Ticket closed with outcome → sync to quotations
        IF NEW.close_outcome = 'won' THEN
            v_quotation_status := 'accepted';
        ELSIF NEW.close_outcome = 'lost' THEN
            v_quotation_status := 'rejected';
        ELSE
            -- Other outcomes (cancelled, etc.) → no quotation sync
            RETURN NEW;
        END IF;

        -- Update all active quotations for this ticket
        FOR v_quotation IN
            SELECT * FROM public.customer_quotations
            WHERE ticket_id = NEW.id
            AND status IN ('draft', 'sent')
        LOOP
            -- FIX: Add explicit cast to customer_quotation_status enum
            UPDATE public.customer_quotations
            SET status = v_quotation_status::customer_quotation_status, updated_at = NOW()
            WHERE id = v_quotation.id;

            -- Also update linked operational cost (already has cast in original)
            IF v_quotation.operational_cost_id IS NOT NULL THEN
                UPDATE public.ticket_rate_quotes
                SET
                    status = CASE v_quotation_status
                        WHEN 'accepted' THEN 'accepted'::quote_status
                        WHEN 'rejected' THEN 'rejected'::quote_status
                    END,
                    updated_at = NOW()
                WHERE id = v_quotation.operational_cost_id;
            END IF;
        END LOOP;

        -- Update linked lead and opportunity quotation_status (TEXT columns, no cast needed)
        IF NEW.lead_id IS NOT NULL THEN
            UPDATE public.leads
            SET quotation_status = v_quotation_status, updated_at = NOW()
            WHERE lead_id = NEW.lead_id;
        END IF;

        IF NEW.opportunity_id IS NOT NULL THEN
            UPDATE public.opportunities
            SET quotation_status = v_quotation_status, updated_at = NOW()
            WHERE opportunity_id = NEW.opportunity_id;
        END IF;

    ELSIF NEW.status = 'need_adjustment' AND OLD.status != 'need_adjustment' THEN
        -- Ticket moved to need_adjustment → quotation should be rejected (to create new version)
        v_quotation_status := 'rejected';

        -- FIX: Add explicit cast to customer_quotation_status enum
        UPDATE public.customer_quotations
        SET status = v_quotation_status::customer_quotation_status, updated_at = NOW()
        WHERE ticket_id = NEW.id
        AND status = 'sent';

        -- Update linked lead and opportunity (TEXT columns, no cast needed)
        IF NEW.lead_id IS NOT NULL THEN
            UPDATE public.leads
            SET quotation_status = v_quotation_status, updated_at = NOW()
            WHERE lead_id = NEW.lead_id;
        END IF;

        IF NEW.opportunity_id IS NOT NULL THEN
            UPDATE public.opportunities
            SET
                quotation_status = v_quotation_status,
                stage = CASE
                    WHEN stage = 'Quote Sent' THEN 'Negotiation'
                    ELSE stage
                END,
                updated_at = NOW()
            WHERE opportunity_id = NEW.opportunity_id
            AND stage NOT IN ('Closed Won', 'Closed Lost');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.trigger_sync_ticket_status_to_quotation IS
'Trigger function to sync ticket status changes to quotations.
Fixed: Added explicit enum cast for customer_quotation_status.';

-- ============================================
-- SUMMARY
-- ============================================
-- Fixed 4 functions that had TEXT to enum assignment issues:
-- 1. sync_ticket_to_quotation: status = v_new_status::customer_quotation_status
-- 2. sync_opportunity_to_quotation: status = v_new_status::customer_quotation_status
-- 3. rpc_sync_cost_status_to_quotation: status = v_quotation_status::customer_quotation_status
-- 4. trigger_sync_ticket_status_to_quotation: status = v_quotation_status::customer_quotation_status
--
-- Note: quotation_status on leads and opportunities tables are TEXT type,
-- so no casting is needed for those columns.
-- ============================================
