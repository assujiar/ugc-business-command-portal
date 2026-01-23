-- ============================================
-- Migration: 071_refactor_lead_account_schema.sql
--
-- COMPREHENSIVE REFACTORING OF LEAD-TO-ACCOUNT FLOW
--
-- This migration addresses:
-- 1. Terminology standardization (event types consistency)
-- 2. Remove duplicate/overlapping triggers
-- 3. Consolidate sync functions into single entry point
-- 4. Fix operational cost status mapping
-- 5. Ensure bidirectional links work correctly
-- 6. Add missing event types
--
-- Flow: Lead → Pipeline/Opportunity ↔ Ticket ↔ Operational Cost ↔ Customer Quotation
-- ============================================

-- ============================================
-- PART 1: STANDARDIZE EVENT TYPES
-- ============================================

-- Add missing event types to ticket_event_type enum
DO $$
BEGIN
    -- Add 'request_adjustment' if not exists (used in ticket adjustment flow)
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'request_adjustment' AND enumtypid = 'ticket_event_type'::regtype) THEN
        ALTER TYPE ticket_event_type ADD VALUE 'request_adjustment';
    END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Document the standardized event types:
-- STANDARD EVENT TYPES FOR CUSTOMER QUOTATIONS:
--   'customer_quotation_created'   - When customer quotation is created
--   'customer_quotation_sent'      - When customer quotation is sent to customer
--   'customer_quotation_accepted'  - When customer quotation is accepted
--   'customer_quotation_rejected'  - When customer quotation is rejected
--
-- LEGACY EVENT TYPE (still supported for backwards compatibility):
--   'quote_sent_to_customer'       - Legacy: used for operational cost quotes
--
-- OTHER EVENT TYPES:
--   'request_adjustment'           - When rate adjustment is requested

COMMENT ON TYPE ticket_event_type IS
'Ticket event types for audit trail:
- created, assigned, reassigned: ticket lifecycle
- status_changed, priority_changed: ticket updates
- comment_added, attachment_added: content additions
- quote_created, quote_sent: operational cost (RFQ) events
- customer_quotation_created/sent/accepted/rejected: customer quotation events
- quote_sent_to_customer: legacy event for ops cost sent to customer
- request_adjustment: rate adjustment requested
- resolved, closed, reopened: ticket resolution';

-- ============================================
-- PART 2: REMOVE DUPLICATE TRIGGERS
-- ============================================

-- Remove the old trigger that syncs quotation status to operational cost directly
-- (This is now handled by sync_quotation_to_all via sync_quotation_to_operational_cost)
DROP TRIGGER IF EXISTS trigger_sync_quotation_status ON public.customer_quotations;

-- Remove the duplicate quotation status change trigger if it conflicts
-- We'll recreate a single authoritative trigger
DROP TRIGGER IF EXISTS trg_sync_quotation_status_change ON public.customer_quotations;

-- Remove redundant operational cost update trigger on quotation create
-- (This is now handled in the API layer with explicit sync)
DROP TRIGGER IF EXISTS trigger_update_cost_on_quotation_create ON public.customer_quotations;

-- ============================================
-- PART 3: CREATE SINGLE AUTHORITATIVE SYNC FUNCTION
-- ============================================

-- Drop old functions to avoid ambiguity
DROP FUNCTION IF EXISTS public.sync_quotation_status_to_cost() CASCADE;
DROP FUNCTION IF EXISTS public.update_cost_on_quotation_create() CASCADE;

-- Create the master sync function that handles ALL entity synchronization
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

    -- 1. Sync to operational cost FIRST (explicit sync, not relying on trigger)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        v_cost_result := public.sync_quotation_to_operational_cost(p_quotation_id, p_new_status);
    END IF;

    -- 2. Sync to ticket if directly linked
    IF v_quotation.ticket_id IS NOT NULL THEN
        v_ticket_result := public.sync_quotation_to_ticket(p_quotation_id, p_new_status, p_actor_user_id);

        -- Also get ticket's lead/opportunity links for propagation
        SELECT lead_id, opportunity_id INTO v_propagated_lead_id, v_propagated_opportunity_id
        FROM public.tickets
        WHERE id = v_quotation.ticket_id;
    END IF;

    -- 3. Sync to lead if directly linked OR via ticket
    IF v_quotation.lead_id IS NOT NULL THEN
        v_lead_result := public.sync_quotation_to_lead(p_quotation_id, p_new_status, p_actor_user_id);
    ELSIF v_propagated_lead_id IS NOT NULL THEN
        -- Update lead quotation status via propagation from ticket
        UPDATE public.leads
        SET
            quotation_status = p_new_status,
            latest_quotation_id = p_quotation_id,
            updated_at = NOW()
        WHERE lead_id = v_propagated_lead_id;
        v_lead_result := jsonb_build_object('success', TRUE, 'synced', TRUE, 'lead_id', v_propagated_lead_id, 'propagated', TRUE);
    END IF;

    -- 4. Sync to opportunity if directly linked OR via ticket
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
            latest_quotation_id = p_quotation_id,
            updated_at = NOW()
        WHERE opportunity_id = v_propagated_opportunity_id;

        -- Auto-transition opportunity stage for propagated updates with stage history
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

COMMENT ON FUNCTION public.sync_quotation_to_all IS
'Master sync function that propagates quotation status to all linked entities:
- Operational Cost (ticket_rate_quotes)
- Ticket (updates status based on quotation status)
- Lead (updates quotation_status, directly or via ticket)
- Opportunity (updates quotation_status and auto-transitions stages)

This is the SINGLE authoritative entry point for quotation status sync.
All triggers and API calls should use this function for consistency.';

-- ============================================
-- PART 4: FIX OPERATIONAL COST SYNC FUNCTION
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
    -- STANDARDIZED MAPPING:
    --   quotation 'draft'    → cost stays as is (no change)
    --   quotation 'sent'     → cost 'sent_to_customer'
    --   quotation 'accepted' → cost 'accepted'
    --   quotation 'rejected' → cost 'rejected' (NOT 'revise_requested')
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

COMMENT ON FUNCTION public.sync_quotation_to_operational_cost IS
'Syncs quotation status to linked operational cost (ticket_rate_quotes).
Status mapping:
- sent → sent_to_customer
- accepted → accepted
- rejected → rejected (standardized, NOT revise_requested)';

-- ============================================
-- PART 5: FIX TICKET SYNC FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_quotation_to_ticket(
    p_quotation_id UUID,
    p_new_status TEXT,
    p_actor_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_ticket RECORD;
    v_event_type TEXT;
    v_event_notes TEXT;
BEGIN
    -- Get quotation with ticket info
    SELECT cq.*, t.id as ticket_id, t.status as ticket_status, t.created_by as ticket_creator,
           t.lead_id as ticket_lead_id, t.opportunity_id as ticket_opportunity_id
    INTO v_quotation
    FROM public.customer_quotations cq
    JOIN public.tickets t ON t.id = cq.ticket_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL OR v_quotation.ticket_id IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'synced', FALSE, 'message', 'No ticket linked');
    END IF;

    -- Handle different quotation status changes
    CASE p_new_status
        WHEN 'sent' THEN
            -- Quotation sent → Ticket status = 'pending' (sent to customer)
            UPDATE public.tickets
            SET
                status = 'pending',
                pending_response_from = 'creator',
                updated_at = NOW()
            WHERE id = v_quotation.ticket_id
            AND status NOT IN ('closed', 'resolved');

            v_event_type := 'customer_quotation_sent';  -- STANDARD event type
            v_event_notes := 'Customer quotation ' || v_quotation.quotation_number || ' sent to customer';

        WHEN 'accepted' THEN
            -- Quotation accepted → Ticket status = 'closed' with outcome 'won'
            UPDATE public.tickets
            SET
                status = 'closed',
                close_outcome = 'won',
                close_reason = 'Customer accepted quotation ' || v_quotation.quotation_number,
                closed_at = NOW(),
                resolved_at = COALESCE(resolved_at, NOW()),
                updated_at = NOW()
            WHERE id = v_quotation.ticket_id
            AND status != 'closed';

            v_event_type := 'customer_quotation_accepted';  -- STANDARD event type
            v_event_notes := 'Customer quotation ' || v_quotation.quotation_number || ' accepted - Ticket marked as won';

            -- Update SLA resolution tracking
            UPDATE public.ticket_sla_tracking
            SET
                resolution_at = NOW(),
                updated_at = NOW()
            WHERE ticket_id = v_quotation.ticket_id
            AND resolution_at IS NULL;

        WHEN 'rejected' THEN
            -- Quotation rejected → Ticket status = 'need_adjustment'
            UPDATE public.tickets
            SET
                status = 'need_adjustment',
                pending_response_from = 'assignee',
                updated_at = NOW()
            WHERE id = v_quotation.ticket_id
            AND status NOT IN ('closed', 'resolved');

            v_event_type := 'customer_quotation_rejected';  -- STANDARD event type
            v_event_notes := 'Customer quotation ' || v_quotation.quotation_number || ' rejected - Requesting rate adjustment';

        ELSE
            -- No sync needed for other statuses (draft, expired)
            RETURN jsonb_build_object('success', TRUE, 'synced', FALSE, 'message', 'No sync needed for status: ' || p_new_status);
    END CASE;

    -- Create audit event with STANDARD event type
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        v_quotation.ticket_id,
        v_event_type::ticket_event_type,
        p_actor_user_id,
        jsonb_build_object(
            'quotation_id', p_quotation_id,
            'quotation_number', v_quotation.quotation_number,
            'quotation_status', p_new_status,
            'total_selling_rate', v_quotation.total_selling_rate,
            'currency', v_quotation.currency
        ),
        v_event_notes
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'synced', TRUE,
        'ticket_id', v_quotation.ticket_id,
        'quotation_status', p_new_status,
        'event_type', v_event_type
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_quotation_to_ticket IS
'Syncs quotation status to linked ticket. Uses STANDARD event types:
- customer_quotation_sent (not quote_sent_to_customer)
- customer_quotation_accepted
- customer_quotation_rejected';

-- ============================================
-- PART 6: FIX OPPORTUNITY SYNC WITH STAGE HISTORY
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

    -- Update opportunity with quotation status and latest_quotation_id
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
                    'Auto-closed: Customer quotation accepted (Deal value: ' || COALESCE(v_quotation.quotation_amount::TEXT, 'N/A') || ')'
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

COMMENT ON FUNCTION public.sync_quotation_to_opportunity IS
'Syncs quotation status to opportunity. Auto-transitions stages:
- sent → Quote Sent (from Prospecting/Discovery)
- rejected → Negotiation (from Quote Sent)
- accepted → Closed Won (sets deal_value)
Creates stage history entries for all auto-transitions.';

-- ============================================
-- PART 7: FIX LEAD SYNC FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_quotation_to_lead(
    p_quotation_id UUID,
    p_new_status TEXT,
    p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_lead RECORD;
BEGIN
    -- Get quotation with lead info
    SELECT cq.*, l.lead_id, l.triage_status
    INTO v_quotation
    FROM public.customer_quotations cq
    LEFT JOIN public.leads l ON l.lead_id = cq.lead_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Only sync if quotation has a lead_id
    IF v_quotation.lead_id IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'synced', FALSE, 'message', 'No lead linked');
    END IF;

    -- Update lead with quotation status and latest_quotation_id
    UPDATE public.leads
    SET
        quotation_status = p_new_status,
        latest_quotation_id = p_quotation_id,
        updated_at = NOW()
    WHERE lead_id = v_quotation.lead_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'synced', TRUE,
        'lead_id', v_quotation.lead_id,
        'quotation_status', p_new_status
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_quotation_to_lead IS
'Syncs quotation status to linked lead. Updates:
- quotation_status
- latest_quotation_id';

-- ============================================
-- PART 8: FIX REQUEST ADJUSTMENT FUNCTION
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

    -- Explicitly sync to operational cost (use 'rejected' NOT 'revise_requested')
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

        -- Create ticket event with STANDARD event type
        INSERT INTO public.ticket_events (
            ticket_id,
            event_type,
            actor_user_id,
            new_value,
            notes
        ) VALUES (
            v_quotation.ticket_id,
            'customer_quotation_rejected',  -- STANDARD event type
            p_actor_user_id,
            jsonb_build_object(
                'quotation_id', p_quotation_id,
                'quotation_number', v_quotation.quotation_number,
                'reason', p_reason,
                'action', 'adjustment_requested'
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

    -- If opportunity linked, move to Negotiation stage with stage history
    IF v_quotation.opportunity_id IS NOT NULL THEN
        -- Get current stage for history
        DECLARE
            v_old_stage TEXT;
        BEGIN
            SELECT stage INTO v_old_stage
            FROM public.opportunities
            WHERE opportunity_id = v_quotation.opportunity_id;

            IF v_old_stage NOT IN ('Closed Won', 'Closed Lost', 'Negotiation') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Negotiation',
                    quotation_status = 'rejected',
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;

                -- Create stage history entry
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    old_stage,
                    new_stage,
                    changed_by,
                    notes
                ) VALUES (
                    v_quotation.opportunity_id,
                    v_old_stage,
                    'Negotiation',
                    p_actor_user_id,
                    'Auto-updated: Customer requested quotation adjustment'
                );
            ELSE
                -- Just update quotation_status
                UPDATE public.opportunities
                SET
                    quotation_status = 'rejected',
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;
            END IF;
        END;
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

COMMENT ON FUNCTION public.request_quotation_adjustment IS
'Marks quotation as rejected and triggers adjustment in all linked entities.
Uses STANDARD event type customer_quotation_rejected.
Maps operational cost status to rejected (NOT revise_requested).';

-- ============================================
-- PART 9: FIX TICKET WIN/LOST SYNC FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_ticket_to_quotation(
    p_ticket_id UUID,
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
    WHERE id = p_ticket_id;

    -- Update all active quotations for this ticket
    UPDATE public.customer_quotations
    SET
        status = v_new_status,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id
    AND status IN ('sent', 'draft')
    RETURNING * INTO v_quotation;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Also update linked operational costs
    UPDATE public.ticket_rate_quotes
    SET
        status = CASE v_new_status
            WHEN 'accepted' THEN 'accepted'::quote_status
            WHEN 'rejected' THEN 'rejected'::quote_status
        END,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id
    AND status IN ('sent', 'sent_to_customer', 'submitted');

    -- Also update quotation status on linked lead
    IF v_ticket.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET
            quotation_status = v_new_status,
            updated_at = NOW()
        WHERE lead_id = v_ticket.lead_id;
    END IF;

    -- Also update quotation status on linked opportunity
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
Also updates lead and opportunity quotation_status if linked.';

-- ============================================
-- PART 10: FIX MARK WON/LOST FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_mark_won(
    p_ticket_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_sync_result JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Only creator or admin can mark won
    IF v_ticket.created_by != v_user_id AND NOT public.is_ticketing_admin(v_user_id) THEN
        RAISE EXCEPTION 'Only ticket creator can mark as won';
    END IF;

    -- Update ticket
    UPDATE public.tickets
    SET
        status = 'closed',
        close_outcome = 'won',
        close_reason = p_notes,
        closed_at = NOW(),
        resolved_at = COALESCE(resolved_at, NOW()),
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Create audit event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'closed',
        v_user_id,
        jsonb_build_object('status', 'closed', 'outcome', 'won'),
        COALESCE(p_notes, 'Ticket won')
    );

    -- Update SLA resolution tracking
    UPDATE public.ticket_sla_tracking
    SET
        resolution_at = NOW(),
        resolution_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= resolution_sla_hours,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id
    AND resolution_at IS NULL;

    -- Update metrics if function exists
    BEGIN
        PERFORM public.update_ticket_response_metrics(p_ticket_id);
    EXCEPTION WHEN undefined_function THEN
        -- Function doesn't exist, skip
        NULL;
    END;

    -- SYNC: Update associated quotations and entities to 'accepted'
    v_sync_result := public.sync_ticket_to_quotation(p_ticket_id, 'won');

    -- Also sync opportunity to Closed Won if linked
    IF v_ticket.opportunity_id IS NOT NULL THEN
        -- Get current stage
        DECLARE
            v_old_stage TEXT;
        BEGIN
            SELECT stage INTO v_old_stage FROM public.opportunities WHERE opportunity_id = v_ticket.opportunity_id;

            IF v_old_stage NOT IN ('Closed Won', 'Closed Lost') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Closed Won',
                    closed_at = NOW(),
                    updated_at = NOW()
                WHERE opportunity_id = v_ticket.opportunity_id;

                -- Create stage history
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    old_stage,
                    new_stage,
                    changed_by,
                    notes
                ) VALUES (
                    v_ticket.opportunity_id,
                    v_old_stage,
                    'Closed Won',
                    v_user_id,
                    'Auto-closed: Ticket marked as won'
                );
            END IF;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'outcome', 'won',
        'quotation_sync', v_sync_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_ticket_mark_lost(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_competitor_name VARCHAR(255) DEFAULT NULL,
    p_competitor_cost DECIMAL(15,2) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_sync_result JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    -- Only creator or admin can mark lost
    IF v_ticket.created_by != v_user_id AND NOT public.is_ticketing_admin(v_user_id) THEN
        RAISE EXCEPTION 'Only ticket creator can mark as lost';
    END IF;

    -- Update ticket
    UPDATE public.tickets
    SET
        status = 'closed',
        close_outcome = 'lost',
        close_reason = p_reason,
        competitor_name = p_competitor_name,
        competitor_cost = p_competitor_cost,
        closed_at = NOW(),
        resolved_at = COALESCE(resolved_at, NOW()),
        updated_at = NOW()
    WHERE id = p_ticket_id;

    -- Create audit event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes
    ) VALUES (
        p_ticket_id,
        'closed',
        v_user_id,
        jsonb_build_object(
            'status', 'closed',
            'outcome', 'lost',
            'competitor_name', p_competitor_name,
            'competitor_cost', p_competitor_cost
        ),
        COALESCE(p_reason, 'Ticket lost')
    );

    -- Update SLA resolution tracking
    UPDATE public.ticket_sla_tracking
    SET
        resolution_at = NOW(),
        resolution_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= resolution_sla_hours,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id
    AND resolution_at IS NULL;

    -- Update metrics if function exists
    BEGIN
        PERFORM public.update_ticket_response_metrics(p_ticket_id);
    EXCEPTION WHEN undefined_function THEN
        -- Function doesn't exist, skip
        NULL;
    END;

    -- SYNC: Update associated quotations and entities to 'rejected'
    v_sync_result := public.sync_ticket_to_quotation(p_ticket_id, 'lost');

    -- Also sync opportunity to Closed Lost if linked
    IF v_ticket.opportunity_id IS NOT NULL THEN
        -- Get current stage
        DECLARE
            v_old_stage TEXT;
        BEGIN
            SELECT stage INTO v_old_stage FROM public.opportunities WHERE opportunity_id = v_ticket.opportunity_id;

            IF v_old_stage NOT IN ('Closed Won', 'Closed Lost') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Closed Lost',
                    lost_reason = p_reason,
                    competitor = p_competitor_name,
                    competitor_price = p_competitor_cost,
                    closed_at = NOW(),
                    updated_at = NOW()
                WHERE opportunity_id = v_ticket.opportunity_id;

                -- Create stage history
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    old_stage,
                    new_stage,
                    changed_by,
                    notes
                ) VALUES (
                    v_ticket.opportunity_id,
                    v_old_stage,
                    'Closed Lost',
                    v_user_id,
                    'Auto-closed: Ticket marked as lost' || COALESCE(' - ' || p_reason, '')
                );
            END IF;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'outcome', 'lost',
        'quotation_sync', v_sync_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 11: RECREATE SINGLE AUTHORITATIVE TRIGGER
-- ============================================

-- Create a single trigger for quotation status changes
-- This trigger ONLY fires when status actually changes and calls the master sync
CREATE OR REPLACE FUNCTION public.trigger_sync_quotation_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger when status changes to sent, accepted, or rejected
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('sent', 'accepted', 'rejected') THEN
        -- Call the master sync function
        PERFORM public.sync_quotation_to_all(NEW.id, NEW.status::TEXT, COALESCE(NEW.created_by, auth.uid()));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the single authoritative trigger
DROP TRIGGER IF EXISTS trg_quotation_status_sync ON public.customer_quotations;
CREATE TRIGGER trg_quotation_status_sync
    AFTER UPDATE OF status ON public.customer_quotations
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('sent', 'accepted', 'rejected'))
    EXECUTE FUNCTION public.trigger_sync_quotation_on_status_change();

COMMENT ON TRIGGER trg_quotation_status_sync ON public.customer_quotations IS
'Single authoritative trigger for quotation status sync.
Fires when status changes to sent/accepted/rejected.
Calls sync_quotation_to_all for unified sync.';

-- ============================================
-- PART 12: ENSURE ID PROPAGATION TRIGGERS EXIST
-- ============================================

-- Keep the ID propagation triggers (these are essential for bidirectional links)
-- They only run on INSERT and propagate IDs down the chain

-- Ticket INSERT: Inherit lead_id from opportunity.source_lead_id
CREATE OR REPLACE FUNCTION public.propagate_lead_id_on_ticket_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_opportunity RECORD;
BEGIN
    -- If opportunity_id is set but lead_id is not, inherit from opportunity.source_lead_id
    IF NEW.opportunity_id IS NOT NULL AND NEW.lead_id IS NULL THEN
        SELECT source_lead_id INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = NEW.opportunity_id;

        IF v_opportunity IS NOT NULL AND v_opportunity.source_lead_id IS NOT NULL THEN
            NEW.lead_id := v_opportunity.source_lead_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_propagate_lead_on_ticket_insert ON public.tickets;
CREATE TRIGGER trigger_propagate_lead_on_ticket_insert
    BEFORE INSERT ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.propagate_lead_id_on_ticket_insert();

-- Quotation INSERT: Inherit lead_id and opportunity_id from ticket
CREATE OR REPLACE FUNCTION public.propagate_ids_on_quotation_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket RECORD;
    v_opportunity RECORD;
BEGIN
    -- If ticket_id is set, inherit lead_id and opportunity_id from ticket
    IF NEW.ticket_id IS NOT NULL THEN
        SELECT lead_id, opportunity_id INTO v_ticket
        FROM public.tickets
        WHERE id = NEW.ticket_id;

        IF v_ticket IS NOT NULL THEN
            NEW.lead_id := COALESCE(NEW.lead_id, v_ticket.lead_id);
            NEW.opportunity_id := COALESCE(NEW.opportunity_id, v_ticket.opportunity_id);
        END IF;
    END IF;

    -- If still no lead_id but has opportunity_id, get from opportunity.source_lead_id
    IF NEW.opportunity_id IS NOT NULL AND NEW.lead_id IS NULL THEN
        SELECT source_lead_id INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = NEW.opportunity_id;

        IF v_opportunity IS NOT NULL AND v_opportunity.source_lead_id IS NOT NULL THEN
            NEW.lead_id := v_opportunity.source_lead_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_propagate_ids_on_quotation_insert ON public.customer_quotations;
CREATE TRIGGER trigger_propagate_ids_on_quotation_insert
    BEFORE INSERT ON public.customer_quotations
    FOR EACH ROW
    EXECUTE FUNCTION public.propagate_ids_on_quotation_insert();

-- Operational Cost INSERT: Inherit lead_id and opportunity_id from ticket
CREATE OR REPLACE FUNCTION public.propagate_ids_on_operational_cost_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket RECORD;
BEGIN
    -- If ticket_id is set, inherit lead_id and opportunity_id from ticket
    IF NEW.ticket_id IS NOT NULL THEN
        SELECT lead_id, opportunity_id INTO v_ticket
        FROM public.tickets
        WHERE id = NEW.ticket_id;

        IF v_ticket IS NOT NULL THEN
            NEW.lead_id := COALESCE(NEW.lead_id, v_ticket.lead_id);
            NEW.opportunity_id := COALESCE(NEW.opportunity_id, v_ticket.opportunity_id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_propagate_ids_on_cost_insert ON public.ticket_rate_quotes;
CREATE TRIGGER trigger_propagate_ids_on_cost_insert
    BEFORE INSERT ON public.ticket_rate_quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.propagate_ids_on_operational_cost_insert();

-- Link quotation to operational cost (bidirectional link)
CREATE OR REPLACE FUNCTION public.link_quotation_to_operational_cost()
RETURNS TRIGGER AS $$
BEGIN
    -- When quotation is created with operational_cost_id, update the operational cost
    IF NEW.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET customer_quotation_id = NEW.id
        WHERE id = NEW.operational_cost_id
        AND customer_quotation_id IS NULL;  -- Only if not already linked
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_link_quotation_to_cost ON public.customer_quotations;
CREATE TRIGGER trigger_link_quotation_to_cost
    AFTER INSERT ON public.customer_quotations
    FOR EACH ROW
    EXECUTE FUNCTION public.link_quotation_to_operational_cost();

-- ============================================
-- PART 13: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.sync_quotation_to_all(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_quotation_to_ticket(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_quotation_to_lead(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_quotation_to_opportunity(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_quotation_to_operational_cost(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_ticket_to_quotation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_quotation_adjustment(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_mark_won(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_mark_lost(UUID, TEXT, VARCHAR, DECIMAL) TO authenticated;

-- ============================================
-- PART 14: UPDATE QUOTATION COUNT ON LEADS/OPPORTUNITIES
-- ============================================

-- Function to update quotation count
CREATE OR REPLACE FUNCTION public.update_entity_quotation_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Update lead quotation count
    IF NEW.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET quotation_count = (
            SELECT COUNT(*) FROM public.customer_quotations WHERE lead_id = NEW.lead_id
        )
        WHERE lead_id = NEW.lead_id;
    END IF;

    -- Update opportunity quotation count
    IF NEW.opportunity_id IS NOT NULL THEN
        UPDATE public.opportunities
        SET quotation_count = (
            SELECT COUNT(*) FROM public.customer_quotations WHERE opportunity_id = NEW.opportunity_id
        )
        WHERE opportunity_id = NEW.opportunity_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_quotation_count ON public.customer_quotations;
CREATE TRIGGER trigger_update_quotation_count
    AFTER INSERT ON public.customer_quotations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_entity_quotation_count();

-- ============================================
-- SUMMARY OF CHANGES
-- ============================================

/*
REFACTORING SUMMARY:

1. EVENT TYPE STANDARDIZATION:
   - STANDARD: customer_quotation_created, customer_quotation_sent,
               customer_quotation_accepted, customer_quotation_rejected
   - LEGACY (kept for backwards compat): quote_sent_to_customer
   - ADDED: request_adjustment

2. TRIGGER CONSOLIDATION:
   - REMOVED: trigger_sync_quotation_status (duplicate)
   - REMOVED: trg_sync_quotation_status_change (replaced)
   - REMOVED: trigger_update_cost_on_quotation_create (handled in sync)
   - KEPT: trg_quotation_status_sync (single authoritative trigger)
   - KEPT: ID propagation triggers (for bidirectional links)

3. SYNC FUNCTION ARCHITECTURE:
   - MASTER: sync_quotation_to_all() - single entry point
   - CALLED BY MASTER:
     * sync_quotation_to_operational_cost()
     * sync_quotation_to_ticket()
     * sync_quotation_to_lead()
     * sync_quotation_to_opportunity()
   - REVERSE SYNC: sync_ticket_to_quotation() (ticket won/lost)

4. OPERATIONAL COST STATUS MAPPING (STANDARDIZED):
   - quotation 'sent' → cost 'sent_to_customer'
   - quotation 'accepted' → cost 'accepted'
   - quotation 'rejected' → cost 'rejected' (NOT 'revise_requested')

5. OPPORTUNITY STAGE AUTO-TRANSITIONS:
   - quotation 'sent' → stage 'Quote Sent'
   - quotation 'rejected' → stage 'Negotiation'
   - quotation 'accepted' → stage 'Closed Won' + deal_value

6. ALL AUTO-TRANSITIONS CREATE STAGE HISTORY ENTRIES

7. BIDIRECTIONAL ID PROPAGATION:
   - opportunity.source_lead_id → ticket.lead_id
   - ticket.lead_id/opportunity_id → quotation
   - ticket.lead_id/opportunity_id → operational_cost
   - quotation ↔ operational_cost (bidirectional link)
*/
