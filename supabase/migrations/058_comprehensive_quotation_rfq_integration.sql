-- ============================================
-- Migration: 058_comprehensive_quotation_rfq_integration.sql
-- Comprehensive integration between Customer Quotations, RFQ Tickets,
-- Leads, and Pipeline/Opportunities
--
-- Features:
-- 1. Bidirectional sync between all entities
-- 2. Ticket linked to Lead/Opportunity propagates quotation sync
-- 3. Request adjustment triggers correct status on all linked entities
-- 4. Recreate quotation functionality
-- 5. Quote sent from ticket validates quotation existence
-- ============================================

-- ============================================
-- UPDATE: sync_quotation_to_ticket to also propagate to lead/opportunity
-- when ticket has those links
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

            v_event_type := 'customer_quotation_sent';
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

            v_event_type := 'customer_quotation_accepted';
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

            v_event_type := 'customer_quotation_rejected';
            v_event_notes := 'Customer quotation ' || v_quotation.quotation_number || ' rejected - Requesting rate adjustment';

        ELSE
            -- No sync needed for other statuses (draft, expired)
            RETURN jsonb_build_object('success', TRUE, 'synced', FALSE, 'message', 'No sync needed for status: ' || p_new_status);
    END CASE;

    -- Create audit event
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

-- ============================================
-- UPDATE: sync_quotation_to_all to include all linked entities
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
-- UPDATE: sync_ticket_to_quotation to also sync to lead/opportunity
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

    -- Update all active (non-draft, non-expired, non-accepted, non-rejected) quotations for this ticket
    UPDATE public.customer_quotations
    SET
        status = v_new_status,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id
    AND status IN ('sent', 'draft')
    RETURNING * INTO v_quotation;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

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

-- ============================================
-- UPDATE: request_quotation_adjustment to trigger request adjustment
-- on linked ticket and move opportunity to Negotiation
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
        updated_at = NOW()
    WHERE id = p_quotation_id;

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
        'ticket_adjustment_result', v_ticket_result,
        'reason', p_reason
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- NEW: Function to check if quotation exists for ticket
-- before allowing "sent to customer" action
-- ============================================

CREATE OR REPLACE FUNCTION public.check_ticket_has_quotation(
    p_ticket_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_count INTEGER;
BEGIN
    -- Count quotations for this ticket
    SELECT COUNT(*) INTO v_count
    FROM public.customer_quotations
    WHERE ticket_id = p_ticket_id;

    IF v_count = 0 THEN
        RETURN jsonb_build_object(
            'has_quotation', FALSE,
            'quotation_count', 0,
            'message', 'No customer quotation found. Please create a customer quotation first.'
        );
    END IF;

    -- Get the latest/active quotation
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE ticket_id = p_ticket_id
    ORDER BY
        CASE status
            WHEN 'sent' THEN 1
            WHEN 'draft' THEN 2
            WHEN 'accepted' THEN 3
            ELSE 4
        END,
        created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'has_quotation', TRUE,
        'quotation_count', v_count,
        'active_quotation', jsonb_build_object(
            'id', v_quotation.id,
            'quotation_number', v_quotation.quotation_number,
            'status', v_quotation.status,
            'total_selling_rate', v_quotation.total_selling_rate,
            'currency', v_quotation.currency,
            'sequence_number', v_quotation.sequence_number
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE: rpc_ticket_quote_sent_to_customer
-- Add better validation and sync
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_quote_sent_to_customer(
    p_ticket_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_quotation RECORD;
    v_has_quotation BOOLEAN;
    v_sent_count INTEGER;
    v_exchange_result JSONB;
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

    -- Only creator can mark as sent to customer
    IF v_ticket.created_by != v_user_id AND NOT public.is_ticketing_admin(v_user_id) THEN
        RAISE EXCEPTION 'Only ticket creator can mark as sent to customer';
    END IF;

    -- Check if customer quotation exists for this ticket
    SELECT EXISTS(
        SELECT 1 FROM public.customer_quotations
        WHERE ticket_id = p_ticket_id
    ) INTO v_has_quotation;

    -- Get the active quotation (preferably sent or draft)
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE ticket_id = p_ticket_id
    ORDER BY
        CASE status
            WHEN 'sent' THEN 1
            WHEN 'draft' THEN 2
            ELSE 3
        END,
        created_at DESC
    LIMIT 1;

    -- If no quotation exists, return error asking user to create one first
    IF NOT v_has_quotation THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'No customer quotation found for this ticket. Please create a customer quotation first.',
            'needs_quotation', TRUE,
            'ticket_id', p_ticket_id
        );
    END IF;

    -- If quotation is draft, mark it as sent
    IF v_quotation.status = 'draft' THEN
        UPDATE public.customer_quotations
        SET
            status = 'sent',
            sent_at = NOW(),
            updated_at = NOW()
        WHERE id = v_quotation.id;

        -- Sync to all linked entities
        v_sync_result := public.sync_quotation_to_all(v_quotation.id, 'sent', v_user_id);
    END IF;

    -- Count sent events for this ticket
    SELECT COUNT(*) INTO v_sent_count
    FROM public.ticket_events
    WHERE ticket_id = p_ticket_id
    AND event_type = 'quote_sent_to_customer';

    -- Update ticket status
    UPDATE public.tickets
    SET
        status = 'pending',
        pending_response_from = 'creator',
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
        'quote_sent_to_customer',
        v_user_id,
        jsonb_build_object(
            'status', 'pending',
            'sent_count', v_sent_count + 1,
            'quotation_id', v_quotation.id,
            'quotation_number', v_quotation.quotation_number
        ),
        COALESCE(p_notes, 'Customer quotation ' || v_quotation.quotation_number || ' sent to end customer')
    );

    -- Record response exchange
    v_exchange_result := public.record_response_exchange(p_ticket_id, v_user_id, NULL);

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'new_status', 'pending',
        'sent_count', v_sent_count + 1,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'response_exchange', v_exchange_result,
        'sync_result', v_sync_result
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
-- NEW: Function to get quotation label (1st, 2nd, etc.)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_quotation_sequence_label(
    p_sequence_number INTEGER
)
RETURNS TEXT AS $$
BEGIN
    RETURN CASE p_sequence_number
        WHEN 1 THEN '1st'
        WHEN 2 THEN '2nd'
        WHEN 3 THEN '3rd'
        ELSE p_sequence_number || 'th'
    END || ' Customer Quotation';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- Add lead_id and opportunity_id columns to tickets if not exists
-- for propagation support
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'tickets'
                   AND column_name = 'lead_id') THEN
        ALTER TABLE public.tickets ADD COLUMN lead_id TEXT REFERENCES public.leads(lead_id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public'
                   AND table_name = 'tickets'
                   AND column_name = 'opportunity_id') THEN
        ALTER TABLE public.tickets ADD COLUMN opportunity_id TEXT REFERENCES public.opportunities(opportunity_id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_tickets_lead_id ON public.tickets(lead_id);
CREATE INDEX IF NOT EXISTS idx_tickets_opportunity_id ON public.tickets(opportunity_id);

-- ============================================
-- TRIGGER: Auto-sync when quotation status changes
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_sync_quotation_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger when status changes to sent, accepted, or rejected
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('sent', 'accepted', 'rejected') THEN
        PERFORM public.sync_quotation_to_all(NEW.id, NEW.status, NEW.created_by);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_sync_quotation_status_change ON customer_quotations;

-- Create trigger
CREATE TRIGGER trg_sync_quotation_status_change
    AFTER UPDATE ON public.customer_quotations
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('sent', 'accepted', 'rejected'))
    EXECUTE FUNCTION public.trigger_sync_quotation_status_change();

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.sync_quotation_to_ticket(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_quotation_to_all(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_ticket_to_quotation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_quotation_adjustment(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ticket_has_quotation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_quote_sent_to_customer(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quotation_sequence_label(INTEGER) TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON FUNCTION public.sync_quotation_to_all IS 'Master sync function that propagates quotation status to ticket, lead, and opportunity';
COMMENT ON FUNCTION public.request_quotation_adjustment IS 'Marks quotation as rejected and triggers adjustment in linked ticket/opportunity';
COMMENT ON FUNCTION public.check_ticket_has_quotation IS 'Checks if a ticket has an associated customer quotation';
COMMENT ON FUNCTION public.get_quotation_sequence_label IS 'Returns human-readable sequence label (1st, 2nd, etc.)';
COMMENT ON TRIGGER trg_sync_quotation_status_change ON customer_quotations IS 'Auto-sync quotation status changes to all linked entities';
