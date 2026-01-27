-- ============================================
-- Migration: 096_fix_duplicate_response_exchanges.sql
--
-- PURPOSE: Fix Paket 07 - Duplicate response exchanges
--
-- ISSUE: RPCs (rpc_ticket_request_adjustment, rpc_ticket_set_need_adjustment)
-- directly call record_response_exchange(), then trigger
-- mirror_ticket_event_to_response_tables ALSO calls record_response_exchange()
-- when the ticket_events row is inserted. This creates duplicate entries.
--
-- FIX: Update mirror trigger to skip record_response_exchange for events
-- that already call it in the RPC (request_adjustment event type)
-- ============================================

CREATE OR REPLACE FUNCTION public.mirror_ticket_event_to_response_tables()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket RECORD;
    v_comment_id UUID;
    v_comment_content TEXT;
    v_responder_role VARCHAR(20);
    v_response_time_seconds INTEGER;
    v_last_response_at TIMESTAMPTZ;
BEGIN
    -- Skip if this is a comment_added event (already handled by rpc_ticket_add_comment)
    IF NEW.event_type = 'comment_added' THEN
        RETURN NEW;
    END IF;

    -- Get ticket info
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = NEW.ticket_id;

    IF v_ticket IS NULL THEN
        RETURN NEW;
    END IF;

    -- Determine responder role based on actor vs ticket creator/assignee
    IF NEW.actor_user_id = v_ticket.created_by THEN
        v_responder_role := 'creator';
    ELSIF NEW.actor_user_id = v_ticket.assigned_to THEN
        v_responder_role := 'assignee';
    ELSIF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = NEW.actor_user_id
        AND role = 'Admin'
    ) THEN
        v_responder_role := 'admin';
    ELSE
        v_responder_role := 'ops';
    END IF;

    -- Calculate response time from last response
    SELECT MAX(responded_at) INTO v_last_response_at
    FROM public.ticket_responses
    WHERE ticket_id = NEW.ticket_id;

    IF v_last_response_at IS NOT NULL THEN
        v_response_time_seconds := EXTRACT(EPOCH FROM (NEW.created_at - v_last_response_at))::INTEGER;
    ELSE
        v_response_time_seconds := EXTRACT(EPOCH FROM (NEW.created_at - v_ticket.created_at))::INTEGER;
    END IF;

    -- Generate comment content from event
    v_comment_content := CASE NEW.event_type::TEXT
        WHEN 'status_changed' THEN
            'Status changed from ' || COALESCE((NEW.old_value->>'status')::TEXT, 'unknown') ||
            ' to ' || COALESCE((NEW.new_value->>'status')::TEXT, 'unknown')
        WHEN 'assigned' THEN
            'Ticket assigned'
        WHEN 'reassigned' THEN
            'Ticket reassigned'
        WHEN 'priority_changed' THEN
            'Priority changed from ' || COALESCE((NEW.old_value->>'priority')::TEXT, 'unknown') ||
            ' to ' || COALESCE((NEW.new_value->>'priority')::TEXT, 'unknown')
        WHEN 'request_adjustment' THEN
            'Adjustment requested' || COALESCE(': ' || NEW.notes, '')
        WHEN 'cost_submitted' THEN
            'Operational cost submitted'
        WHEN 'cost_sent_to_customer' THEN
            'Cost sent to customer'
        WHEN 'customer_quotation_created' THEN
            'Customer quotation created: ' || COALESCE((NEW.new_value->>'quotation_number')::TEXT, '')
        WHEN 'customer_quotation_sent' THEN
            'Customer quotation sent: ' || COALESCE((NEW.new_value->>'quotation_number')::TEXT, '')
        WHEN 'customer_quotation_rejected' THEN
            'Customer quotation rejected: ' || COALESCE((NEW.new_value->>'quotation_number')::TEXT, '')
        WHEN 'customer_quotation_accepted' THEN
            'Customer quotation accepted: ' || COALESCE((NEW.new_value->>'quotation_number')::TEXT, '')
        WHEN 'won' THEN
            'Ticket marked as won'
        WHEN 'lost' THEN
            'Ticket marked as lost' || COALESCE(': ' || NEW.notes, '')
        WHEN 'closed' THEN
            'Ticket closed'
        WHEN 'reopened' THEN
            'Ticket reopened'
        ELSE
            'Event: ' || NEW.event_type::TEXT || COALESCE(' - ' || NEW.notes, '')
    END;

    -- Append notes if available and not already included
    IF NEW.notes IS NOT NULL AND v_comment_content NOT LIKE '%' || NEW.notes || '%' THEN
        v_comment_content := v_comment_content || ' | Notes: ' || NEW.notes;
    END IF;

    -- Create auto-generated comment (only for significant events)
    -- Skip for events that don't need visible comments
    IF NEW.event_type::TEXT NOT IN ('escalation_timer_started', 'escalation_timer_stopped', 'sla_checked') THEN
        INSERT INTO public.ticket_comments (
            ticket_id,
            user_id,
            content,
            is_internal,
            response_time_seconds,
            response_direction,
            source_event_id
        ) VALUES (
            NEW.ticket_id,
            COALESCE(NEW.actor_user_id, v_ticket.created_by),
            '[Auto] ' || v_comment_content,
            TRUE,  -- Auto-generated comments are internal by default
            v_response_time_seconds,
            CASE WHEN COALESCE(NEW.actor_user_id, v_ticket.created_by) = v_ticket.created_by
                 THEN 'inbound' ELSE 'outbound' END,
            NEW.id
        )
        RETURNING id INTO v_comment_id;
    END IF;

    -- Create ticket_responses entry for SLA tracking
    INSERT INTO public.ticket_responses (
        ticket_id,
        user_id,
        responder_role,
        ticket_stage,
        responded_at,
        response_time_seconds,
        comment_id
    ) VALUES (
        NEW.ticket_id,
        COALESCE(NEW.actor_user_id, v_ticket.created_by),
        v_responder_role,
        v_ticket.status::TEXT,
        NEW.created_at,
        v_response_time_seconds,
        v_comment_id
    );

    -- FIX Paket 07: Skip record_response_exchange for events that already call it in RPC
    -- request_adjustment events are handled by rpc_ticket_request_adjustment and rpc_ticket_set_need_adjustment
    -- which already call record_response_exchange() directly
    IF NEW.event_type::TEXT NOT IN ('request_adjustment') THEN
        -- Record response exchange for analytics
        PERFORM public.record_response_exchange(
            NEW.ticket_id,
            COALESCE(NEW.actor_user_id, v_ticket.created_by),
            v_comment_id
        );
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the original insert
        RAISE WARNING 'Error mirroring ticket event to response tables: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.mirror_ticket_event_to_response_tables IS
'Trigger function that mirrors ticket_events to ticket_comments, ticket_responses, and ticket_response_exchanges.
This ensures SLA/response time analytics are complete for all ticket actions, not just comments.

FIX Paket 07: Skips record_response_exchange for request_adjustment events because the RPC functions
(rpc_ticket_request_adjustment, rpc_ticket_set_need_adjustment) already call record_response_exchange()
directly. Still creates ticket_comments and ticket_responses for audit trail.

Skips:
- comment_added events (already handled by rpc_ticket_add_comment)
- escalation_timer_started/stopped, sla_checked events (no visible comment needed)';

-- ============================================
-- CLEANUP: Remove existing duplicate response exchanges
-- This fixes historical data that was duplicated before this migration
-- ============================================

-- Delete duplicate response exchanges within 5 second windows
-- Keep the first one (earliest) for each unique (ticket_id, responder_type, time_bucket)
WITH duplicates AS (
    SELECT
        id,
        ticket_id,
        responder_type,
        responded_at,
        ROW_NUMBER() OVER (
            PARTITION BY ticket_id, responder_type,
                         -- Group by 5-second buckets
                         DATE_TRUNC('minute', responded_at),
                         FLOOR(EXTRACT(SECOND FROM responded_at) / 5)
            ORDER BY responded_at ASC, id ASC
        ) as rn
    FROM public.ticket_response_exchanges
)
DELETE FROM public.ticket_response_exchanges
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- Log how many duplicates were removed
DO $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
        RAISE NOTICE 'Removed % duplicate response exchange entries', v_deleted_count;
    END IF;
END $$;

-- Trigger metrics recalculation for all affected tickets
-- by setting updated_at to old timestamp (will be refreshed on next query)
UPDATE public.ticket_response_metrics trm
SET updated_at = NOW()
WHERE EXISTS (
    SELECT 1 FROM public.ticket_response_exchanges tre
    WHERE tre.ticket_id = trm.ticket_id
);

-- ============================================
-- SUMMARY
-- ============================================
-- Fixed: mirror_ticket_event_to_response_tables no longer calls record_response_exchange
-- for request_adjustment events (already called by RPC)
--
-- Cleanup: Removed duplicate response_exchange entries from historical data
-- ============================================
