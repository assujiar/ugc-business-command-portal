-- ============================================
-- Migration: 064_fix_operational_cost_sync_on_rejection.sql
-- Fix: Operational cost status not updating when quotation is rejected
--
-- Issue: When quotation is rejected, the linked operational cost
-- (ticket_rate_quotes) status should also change to 'rejected' but
-- currently stays at 'sent_to_customer'
--
-- Solution: Add explicit sync to operational cost in sync_quotation_to_all
-- rather than relying solely on the trigger which may not fire in all cases
-- ============================================

-- ============================================
-- 1. Create function to sync quotation status to operational cost
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_quotation_to_operational_cost(
    p_quotation_id UUID,
    p_new_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_cost_status quote_status;
BEGIN
    -- Get quotation with operational cost link
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- If no operational cost linked, nothing to sync
    IF v_quotation.operational_cost_id IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'synced', FALSE, 'message', 'No operational cost linked');
    END IF;

    -- Map quotation status to operational cost status
    v_cost_status := CASE p_new_status
        WHEN 'sent' THEN 'sent_to_customer'::quote_status
        WHEN 'accepted' THEN 'accepted'::quote_status
        WHEN 'rejected' THEN 'rejected'::quote_status
        ELSE NULL
    END;

    -- If no valid mapping, skip sync
    IF v_cost_status IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'synced', FALSE, 'message', 'No status mapping for: ' || p_new_status);
    END IF;

    -- Update operational cost status
    UPDATE public.ticket_rate_quotes
    SET
        status = v_cost_status,
        updated_at = NOW()
    WHERE id = v_quotation.operational_cost_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'synced', TRUE,
        'operational_cost_id', v_quotation.operational_cost_id,
        'new_status', v_cost_status::TEXT
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. Update sync_quotation_to_all to include operational cost sync
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_quotation_to_all(
    p_quotation_id UUID,
    p_new_status TEXT,
    p_actor_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_ticket RECORD;
    v_ticket_result JSONB;
    v_lead_result JSONB;
    v_opportunity_result JSONB;
    v_cost_result JSONB;
    v_propagated_lead_id TEXT;
    v_propagated_opportunity_id TEXT;
BEGIN
    -- Get quotation with all relations
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Sync to operational cost (explicit sync, not relying on trigger)
    v_cost_result := public.sync_quotation_to_operational_cost(p_quotation_id, p_new_status);

    -- Sync to ticket if directly linked
    IF v_quotation.ticket_id IS NOT NULL THEN
        v_ticket_result := public.sync_quotation_to_ticket(p_quotation_id, p_new_status, p_actor_user_id);

        -- Also get ticket's lead/opportunity links for propagation
        SELECT lead_id, opportunity_id INTO v_propagated_lead_id, v_propagated_opportunity_id
        FROM public.tickets
        WHERE id = v_quotation.ticket_id;
    END IF;

    -- Sync to lead if directly linked OR via ticket
    IF v_quotation.lead_id IS NOT NULL THEN
        v_lead_result := public.sync_quotation_to_lead(p_quotation_id, p_new_status, p_actor_user_id);
    ELSIF v_propagated_lead_id IS NOT NULL THEN
        -- Update lead quotation status via propagation from ticket
        UPDATE public.leads
        SET
            quotation_status = p_new_status,
            updated_at = NOW()
        WHERE lead_id = v_propagated_lead_id;
        v_lead_result := jsonb_build_object('success', TRUE, 'synced', TRUE, 'lead_id', v_propagated_lead_id, 'propagated', TRUE);
    END IF;

    -- Sync to opportunity if directly linked OR via ticket
    IF v_quotation.opportunity_id IS NOT NULL THEN
        v_opportunity_result := public.sync_quotation_to_opportunity(p_quotation_id, p_new_status, p_actor_user_id);
    ELSIF v_propagated_opportunity_id IS NOT NULL THEN
        -- Update opportunity quotation status via propagation from ticket
        UPDATE public.opportunities
        SET
            quotation_status = p_new_status,
            updated_at = NOW()
        WHERE opportunity_id = v_propagated_opportunity_id;

        -- Auto-transition opportunity stage for propagated updates
        IF p_new_status = 'sent' THEN
            UPDATE public.opportunities
            SET stage = 'Quote Sent', updated_at = NOW()
            WHERE opportunity_id = v_propagated_opportunity_id
            AND stage IN ('Prospecting', 'Discovery');
        ELSIF p_new_status = 'rejected' THEN
            UPDATE public.opportunities
            SET stage = 'Negotiation', updated_at = NOW()
            WHERE opportunity_id = v_propagated_opportunity_id
            AND stage = 'Quote Sent';
        END IF;

        v_opportunity_result := jsonb_build_object('success', TRUE, 'synced', TRUE, 'opportunity_id', v_propagated_opportunity_id, 'propagated', TRUE);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', p_quotation_id,
        'new_status', p_new_status,
        'operational_cost_sync', v_cost_result,
        'ticket_sync', v_ticket_result,
        'lead_sync', v_lead_result,
        'opportunity_sync', v_opportunity_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Update request_quotation_adjustment to also sync operational cost
-- ============================================

CREATE OR REPLACE FUNCTION public.request_quotation_adjustment(
    p_quotation_id UUID,
    p_actor_user_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_ticket_result JSONB;
    v_cost_result JSONB;
BEGIN
    -- Get quotation info
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Mark quotation as rejected (to create new version)
    UPDATE public.customer_quotations
    SET
        status = 'rejected',
        rejection_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_quotation_id;

    -- Explicitly sync to operational cost
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = 'rejected'::quote_status,
            updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;

        v_cost_result := jsonb_build_object(
            'operational_cost_id', v_quotation.operational_cost_id,
            'status', 'rejected'
        );
    END IF;

    -- If there's a linked ticket, trigger request adjustment
    IF v_quotation.ticket_id IS NOT NULL THEN
        -- Update ticket status to need_adjustment
        UPDATE public.tickets
        SET
            status = 'need_adjustment',
            pending_response_from = 'assignee',
            updated_at = NOW()
        WHERE id = v_quotation.ticket_id
        AND status NOT IN ('closed', 'resolved');

        -- Create ticket event
        INSERT INTO public.ticket_events (
            ticket_id,
            event_type,
            actor_user_id,
            new_value,
            notes
        ) VALUES (
            v_quotation.ticket_id,
            'customer_quotation_rejected',
            p_actor_user_id,
            jsonb_build_object(
                'quotation_id', p_quotation_id,
                'quotation_number', v_quotation.quotation_number,
                'reason', p_reason
            ),
            COALESCE(p_reason, 'Customer quotation rejected - Rate adjustment requested')
        );

        v_ticket_result := jsonb_build_object('ticket_id', v_quotation.ticket_id, 'status', 'need_adjustment');
    END IF;

    -- If lead linked, update quotation status
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET
            quotation_status = 'rejected',
            updated_at = NOW()
        WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- If opportunity linked, move to Negotiation stage
    IF v_quotation.opportunity_id IS NOT NULL THEN
        UPDATE public.opportunities
        SET
            stage = 'Negotiation',
            quotation_status = 'rejected',
            updated_at = NOW()
        WHERE opportunity_id = v_quotation.opportunity_id
        AND stage NOT IN ('Closed Won', 'Closed Lost');
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', p_quotation_id,
        'operational_cost_result', v_cost_result,
        'ticket_adjustment_result', v_ticket_result,
        'reason', p_reason
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION public.sync_quotation_to_operational_cost(UUID, TEXT) TO authenticated;

-- ============================================
-- 5. Add comments
-- ============================================

COMMENT ON FUNCTION public.sync_quotation_to_operational_cost(UUID, TEXT) IS 'Syncs quotation status to linked operational cost (ticket_rate_quotes)';
COMMENT ON FUNCTION public.sync_quotation_to_all(UUID, TEXT, UUID) IS 'Master sync function that propagates quotation status to operational cost, ticket, lead, and opportunity';
