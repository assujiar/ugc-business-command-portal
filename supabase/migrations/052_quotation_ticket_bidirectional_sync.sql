-- ============================================
-- Migration: 052_quotation_ticket_bidirectional_sync.sql
-- Bidirectional sync between customer quotations and RFQ tickets
--
-- Features:
-- 1. When quotation is sent → ticket status becomes 'pending' (sent to customer)
-- 2. When quotation is accepted → ticket status becomes 'closed' with outcome 'won'
-- 3. When quotation is rejected → ticket status becomes 'need_adjustment'
-- 4. When ticket is marked 'won' → active quotation becomes 'accepted'
-- 5. When ticket is marked 'lost' → active quotation becomes 'rejected'
-- 6. Quote sent from ticket checks if quotation exists
-- ============================================

-- ============================================
-- ADD NEW EVENT TYPES FOR QUOTATION TRACKING
-- ============================================

-- Alter ticket_event_type enum to add new types if not exists
DO $$
BEGIN
    -- Add 'customer_quotation_sent' if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'customer_quotation_sent' AND enumtypid = 'ticket_event_type'::regtype) THEN
        ALTER TYPE ticket_event_type ADD VALUE IF NOT EXISTS 'customer_quotation_sent';
    END IF;

    -- Add 'customer_quotation_accepted' if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'customer_quotation_accepted' AND enumtypid = 'ticket_event_type'::regtype) THEN
        ALTER TYPE ticket_event_type ADD VALUE IF NOT EXISTS 'customer_quotation_accepted';
    END IF;

    -- Add 'customer_quotation_rejected' if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'customer_quotation_rejected' AND enumtypid = 'ticket_event_type'::regtype) THEN
        ALTER TYPE ticket_event_type ADD VALUE IF NOT EXISTS 'customer_quotation_rejected';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Ignore if already exists
        NULL;
END $$;

-- ============================================
-- FUNCTION: Sync quotation status to ticket
-- Called when customer quotation status changes
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
    SELECT cq.*, t.id as ticket_id, t.status as ticket_status, t.created_by as ticket_creator
    INTO v_quotation
    FROM public.customer_quotations cq
    JOIN public.tickets t ON t.id = cq.ticket_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
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

COMMENT ON FUNCTION public.sync_quotation_to_ticket IS 'Syncs quotation status changes to associated ticket';

-- ============================================
-- FUNCTION: Sync ticket outcome to quotation
-- Called when ticket is marked won/lost
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_ticket_to_quotation(
    p_ticket_id UUID,
    p_outcome TEXT -- 'won' or 'lost'
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
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

    -- Update all active (non-draft, non-expired, non-accepted, non-rejected) quotations for this ticket
    -- Primarily update 'sent' status quotations
    UPDATE public.customer_quotations
    SET
        status = v_new_status,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id
    AND status IN ('sent', 'draft') -- Only update active quotations
    RETURNING * INTO v_quotation;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

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

COMMENT ON FUNCTION public.sync_ticket_to_quotation IS 'Syncs ticket won/lost outcome to associated quotations';

-- ============================================
-- UPDATE RPC: MARK WON - now syncs quotation
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

    -- Update metrics
    PERFORM public.update_ticket_response_metrics(p_ticket_id);

    -- SYNC: Update associated quotations to 'accepted'
    v_sync_result := public.sync_ticket_to_quotation(p_ticket_id, 'won');

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

COMMENT ON FUNCTION public.rpc_ticket_mark_won IS 'Creator marks ticket as won and syncs quotations to accepted';

-- ============================================
-- UPDATE RPC: MARK LOST - now syncs quotation
-- ============================================

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

    -- Update metrics
    PERFORM public.update_ticket_response_metrics(p_ticket_id);

    -- SYNC: Update associated quotations to 'rejected'
    v_sync_result := public.sync_ticket_to_quotation(p_ticket_id, 'lost');

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

COMMENT ON FUNCTION public.rpc_ticket_mark_lost IS 'Creator marks ticket as lost and syncs quotations to rejected';

-- ============================================
-- UPDATE RPC: QUOTE SENT TO CUSTOMER
-- Now checks for quotation and syncs
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
        'response_exchange', v_exchange_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_quote_sent_to_customer IS 'Creator marks quote as sent to customer - requires customer quotation to exist';

-- ============================================
-- FUNCTION: Get quotation status for ticket
-- Helper function to check if ticket has quotation
-- ============================================

CREATE OR REPLACE FUNCTION public.get_ticket_quotation_status(
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

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object(
            'has_quotation', FALSE,
            'quotation_count', 0
        );
    END IF;

    RETURN jsonb_build_object(
        'has_quotation', TRUE,
        'quotation_count', v_count,
        'active_quotation', jsonb_build_object(
            'id', v_quotation.id,
            'quotation_number', v_quotation.quotation_number,
            'status', v_quotation.status,
            'total_selling_rate', v_quotation.total_selling_rate,
            'currency', v_quotation.currency,
            'created_at', v_quotation.created_at,
            'sent_at', v_quotation.sent_at
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_ticket_quotation_status IS 'Gets quotation status for a ticket';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.sync_quotation_to_ticket(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_ticket_to_quotation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ticket_quotation_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_mark_won(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_mark_lost(UUID, TEXT, VARCHAR, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_quote_sent_to_customer(UUID, TEXT) TO authenticated;
