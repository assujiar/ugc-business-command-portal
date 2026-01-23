-- ============================================
-- Migration: 069_fix_stage_history_on_quotation_sync.sql
-- Fix: Create stage history entries when stage is auto-updated by quotation status sync
--
-- Problem:
-- When sync_quotation_to_opportunity auto-transitions the pipeline stage
-- (e.g., to 'Quote Sent' or 'Negotiation'), no opportunity_stage_history entry
-- is created. This causes the Pipeline Activity section to not show the transition.
--
-- Solution:
-- Add INSERT INTO opportunity_stage_history for 'sent' and 'rejected' cases,
-- similar to how 'accepted' case already does it.
-- ============================================

-- ============================================
-- Update sync_quotation_to_opportunity to create stage history entries
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_quotation_to_opportunity(
    p_quotation_id UUID,
    p_new_status TEXT,
    p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_new_stage TEXT;
BEGIN
    -- Get quotation with opportunity info
    SELECT cq.*, cq.total_selling_rate as quotation_amount, o.opportunity_id, o.stage
    INTO v_quotation
    FROM public.customer_quotations cq
    LEFT JOIN public.opportunities o ON o.opportunity_id = cq.opportunity_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Only sync if quotation has an opportunity_id
    IF v_quotation.opportunity_id IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'synced', FALSE, 'message', 'No opportunity linked');
    END IF;

    -- Update opportunity with quotation status
    UPDATE public.opportunities
    SET
        quotation_status = p_new_status,
        latest_quotation_id = p_quotation_id,
        updated_at = NOW()
    WHERE opportunity_id = v_quotation.opportunity_id;

    -- Auto-transition opportunity stage based on quotation status
    CASE p_new_status
        WHEN 'sent' THEN
            -- When quotation is sent, move to Quote Sent if not already past it
            IF v_quotation.stage IN ('Prospecting', 'Discovery') THEN
                UPDATE public.opportunities
                SET stage = 'Quote Sent', updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;
                v_new_stage := 'Quote Sent';

                -- Create stage history entry for the auto-transition
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    old_stage,
                    new_stage,
                    changed_by,
                    notes
                ) VALUES (
                    v_quotation.opportunity_id,
                    v_quotation.stage,
                    'Quote Sent',
                    p_actor_user_id,
                    'Auto-updated: Quotation sent to customer'
                );
            END IF;

        WHEN 'rejected' THEN
            -- When quotation is rejected, move to Negotiation for renegotiation
            IF v_quotation.stage = 'Quote Sent' THEN
                UPDATE public.opportunities
                SET stage = 'Negotiation', updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;
                v_new_stage := 'Negotiation';

                -- Create stage history entry for the auto-transition
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    old_stage,
                    new_stage,
                    changed_by,
                    notes
                ) VALUES (
                    v_quotation.opportunity_id,
                    v_quotation.stage,
                    'Negotiation',
                    p_actor_user_id,
                    'Auto-updated: Quotation rejected by customer'
                );
            END IF;

        WHEN 'accepted' THEN
            -- When quotation is accepted, auto-close as Won and set deal_value
            IF v_quotation.stage NOT IN ('Closed Won', 'Closed Lost') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Closed Won',
                    deal_value = v_quotation.quotation_amount,
                    closed_at = NOW(),
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;
                v_new_stage := 'Closed Won';

                -- Create stage history entry
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    old_stage,
                    new_stage,
                    changed_by,
                    notes
                ) VALUES (
                    v_quotation.opportunity_id,
                    v_quotation.stage,
                    'Closed Won',
                    p_actor_user_id,
                    'Auto-closed: Customer quotation accepted'
                );
            END IF;

        ELSE
            NULL;
    END CASE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'synced', TRUE,
        'opportunity_id', v_quotation.opportunity_id,
        'quotation_status', p_new_status,
        'new_stage', v_new_stage,
        'deal_value', v_quotation.quotation_amount
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Also update sync_quotation_to_all for propagated stage changes
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
    v_old_stage TEXT;
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
        -- Get current stage for history entry
        SELECT stage INTO v_old_stage
        FROM public.opportunities
        WHERE opportunity_id = v_propagated_opportunity_id;

        -- Update opportunity quotation status via propagation from ticket
        UPDATE public.opportunities
        SET
            quotation_status = p_new_status,
            updated_at = NOW()
        WHERE opportunity_id = v_propagated_opportunity_id;

        -- Auto-transition opportunity stage for propagated updates
        IF p_new_status = 'sent' THEN
            IF v_old_stage IN ('Prospecting', 'Discovery') THEN
                UPDATE public.opportunities
                SET stage = 'Quote Sent', updated_at = NOW()
                WHERE opportunity_id = v_propagated_opportunity_id;

                -- Create stage history entry
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    old_stage,
                    new_stage,
                    changed_by,
                    notes
                ) VALUES (
                    v_propagated_opportunity_id,
                    v_old_stage,
                    'Quote Sent',
                    p_actor_user_id,
                    'Auto-updated: Quotation sent to customer (propagated from ticket)'
                );
            END IF;
        ELSIF p_new_status = 'rejected' THEN
            IF v_old_stage = 'Quote Sent' THEN
                UPDATE public.opportunities
                SET stage = 'Negotiation', updated_at = NOW()
                WHERE opportunity_id = v_propagated_opportunity_id;

                -- Create stage history entry
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    old_stage,
                    new_stage,
                    changed_by,
                    notes
                ) VALUES (
                    v_propagated_opportunity_id,
                    v_old_stage,
                    'Negotiation',
                    p_actor_user_id,
                    'Auto-updated: Quotation rejected (propagated from ticket)'
                );
            END IF;
        ELSIF p_new_status = 'accepted' THEN
            -- Auto-close as Won and set deal_value for propagated opportunities
            IF v_old_stage NOT IN ('Closed Won', 'Closed Lost') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Closed Won',
                    deal_value = v_quotation.total_selling_rate,
                    closed_at = NOW(),
                    updated_at = NOW()
                WHERE opportunity_id = v_propagated_opportunity_id;

                -- Create stage history entry for propagated close
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    old_stage,
                    new_stage,
                    changed_by,
                    notes
                ) VALUES (
                    v_propagated_opportunity_id,
                    v_old_stage,
                    'Closed Won',
                    p_actor_user_id,
                    'Auto-closed: Customer quotation accepted (propagated from ticket)'
                );
            END IF;
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
-- Comments
-- ============================================

COMMENT ON FUNCTION public.sync_quotation_to_opportunity IS 'Syncs quotation status to opportunity. Auto-updates stage and creates stage history entries for tracking.';
COMMENT ON FUNCTION public.sync_quotation_to_all IS 'Syncs quotation status to all linked entities (ticket, lead, opportunity, operational cost). Creates stage history entries for auto-transitions.';
