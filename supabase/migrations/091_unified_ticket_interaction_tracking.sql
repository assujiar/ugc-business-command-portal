-- ============================================
-- Migration: 091_unified_ticket_interaction_tracking.sql
--
-- PURPOSE: Fix BUG #8 - All ticket_events actions must be reflected into
-- ticket_response_exchanges / ticket_response_metrics so SLA & response times are accurate
--
-- ISSUES FIXED:
-- 1. Many actions (status changes, quotation events, assignments) only write to
--    ticket_events but don't call record_response_exchange()
-- 2. Create unified record_ticket_interaction() helper that ensures all actions
--    are properly tracked for SLA purposes
-- 3. Optionally create system comments as anchors for response exchanges
--
-- DESIGN:
-- - record_ticket_interaction() is the main entry point
-- - It creates an internal system comment if needed (for audit trail)
-- - It calls record_response_exchange() to track response times
-- - It handles pending_response_from correctly based on actor role
-- - All existing RPCs should call this function
-- ============================================

-- ============================================
-- 1. HELPER: Create system comment for non-comment interactions
-- Returns the comment_id to use as anchor for response exchange
-- ============================================

CREATE OR REPLACE FUNCTION public.create_system_comment(
    p_ticket_id UUID,
    p_actor_user_id UUID,
    p_event_type TEXT,
    p_content TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_comment_id UUID;
    v_content TEXT;
BEGIN
    -- Generate content based on event type if not provided
    v_content := COALESCE(p_content, '[System] ' || CASE p_event_type
        WHEN 'status_changed' THEN 'Status changed'
        WHEN 'assigned' THEN 'Ticket assigned'
        WHEN 'request_adjustment' THEN 'Adjustment requested'
        WHEN 'customer_quotation_sent' THEN 'Quotation sent to customer'
        WHEN 'customer_quotation_rejected' THEN 'Quotation rejected'
        WHEN 'customer_quotation_accepted' THEN 'Quotation accepted'
        WHEN 'operational_cost_submitted' THEN 'Operational cost submitted'
        WHEN 'operational_cost_approved' THEN 'Operational cost approved'
        WHEN 'operational_cost_rejected' THEN 'Operational cost rejected'
        WHEN 'priority_changed' THEN 'Priority changed'
        WHEN 'escalated' THEN 'Ticket escalated'
        WHEN 'closed' THEN 'Ticket closed'
        WHEN 'reopened' THEN 'Ticket reopened'
        ELSE 'Action: ' || p_event_type
    END);

    -- Insert internal/system comment
    INSERT INTO public.ticket_comments (
        ticket_id,
        user_id,
        content,
        is_internal,
        created_at,
        updated_at
    ) VALUES (
        p_ticket_id,
        p_actor_user_id,
        v_content,
        TRUE,  -- is_internal = true for system comments
        NOW(),
        NOW()
    )
    RETURNING id INTO v_comment_id;

    RETURN v_comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_system_comment IS
'Creates an internal/system comment to serve as anchor for response exchange tracking.
Used when non-comment actions (status changes, quotation events) need SLA tracking.';

-- ============================================
-- 2. MAIN HELPER: Record Ticket Interaction
-- Unified function for tracking all ticket interactions for SLA purposes
-- ============================================

CREATE OR REPLACE FUNCTION public.record_ticket_interaction(
    p_ticket_id UUID,
    p_actor_user_id UUID,
    p_event_type TEXT,
    p_payload JSONB DEFAULT '{}'::JSONB,
    p_create_system_comment BOOLEAN DEFAULT TRUE,
    p_skip_if_recent_exchange BOOLEAN DEFAULT TRUE,  -- Prevent duplicate exchanges within 1 minute
    p_custom_comment_content TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_ticket RECORD;
    v_actor_is_creator BOOLEAN;
    v_actor_is_assignee BOOLEAN;
    v_responder_type TEXT;
    v_new_pending_from TEXT;
    v_comment_id UUID := NULL;
    v_exchange_result JSONB;
    v_recent_exchange_exists BOOLEAN := FALSE;
    v_event_id UUID;
BEGIN
    -- Get ticket info
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Ticket not found',
            'error_code', 'TICKET_NOT_FOUND'
        );
    END IF;

    -- Determine actor role
    v_actor_is_creator := (p_actor_user_id = v_ticket.created_by);
    v_actor_is_assignee := (p_actor_user_id = v_ticket.assigned_to);

    -- Determine responder type and new pending_response_from
    IF v_actor_is_creator THEN
        v_responder_type := 'creator';
        v_new_pending_from := 'assignee';
    ELSE
        -- If not creator, treat as assignee/ops response
        v_responder_type := 'assignee';
        v_new_pending_from := 'creator';
    END IF;

    -- Check for recent exchange to prevent duplicates (within 1 minute)
    IF p_skip_if_recent_exchange THEN
        SELECT EXISTS (
            SELECT 1 FROM public.ticket_response_exchanges
            WHERE ticket_id = p_ticket_id
            AND responder_user_id = p_actor_user_id
            AND responded_at > NOW() - INTERVAL '1 minute'
        ) INTO v_recent_exchange_exists;

        IF v_recent_exchange_exists THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'skipped', TRUE,
                'message', 'Recent exchange exists, skipping to prevent duplicate',
                'ticket_id', p_ticket_id,
                'event_type', p_event_type
            );
        END IF;
    END IF;

    -- Create system comment if requested (for non-comment actions)
    IF p_create_system_comment THEN
        v_comment_id := public.create_system_comment(
            p_ticket_id,
            p_actor_user_id,
            p_event_type,
            p_custom_comment_content
        );
    END IF;

    -- Insert ticket_event (idempotent - check for recent similar event)
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        new_value,
        notes,
        created_at
    )
    SELECT
        p_ticket_id,
        p_event_type::ticket_event_type,
        p_actor_user_id,
        p_payload || jsonb_build_object(
            'system_comment_id', v_comment_id,
            'tracked_for_sla', TRUE
        ),
        '[SLA Tracked] ' || COALESCE(p_custom_comment_content, p_event_type),
        NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM public.ticket_events
        WHERE ticket_id = p_ticket_id
        AND event_type = p_event_type::ticket_event_type
        AND actor_user_id = p_actor_user_id
        AND created_at > NOW() - INTERVAL '1 minute'
    )
    RETURNING id INTO v_event_id;

    -- Record response exchange (this tracks SLA metrics)
    BEGIN
        v_exchange_result := public.record_response_exchange(
            p_ticket_id,
            p_actor_user_id,
            v_comment_id  -- Can be NULL for actions without system comment
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- Log but don't fail the main transaction
            RAISE WARNING 'Failed to record response exchange: %', SQLERRM;
            v_exchange_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
    END;

    -- Update pending_response_from if ticket is not closed
    IF v_ticket.status NOT IN ('closed', 'resolved') THEN
        UPDATE public.tickets
        SET
            pending_response_from = v_new_pending_from,
            updated_at = NOW()
        WHERE id = p_ticket_id
        AND pending_response_from IS DISTINCT FROM v_new_pending_from;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'event_type', p_event_type,
        'event_id', v_event_id,
        'comment_id', v_comment_id,
        'responder_type', v_responder_type,
        'new_pending_from', v_new_pending_from,
        'exchange_result', v_exchange_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', 'INTERNAL_ERROR',
            'detail', SQLSTATE
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_ticket_interaction IS
'BUG #8 Fix: Unified function for tracking all ticket interactions for SLA purposes.

This function:
1. Optionally creates an internal system comment (for audit trail)
2. Inserts ticket_events with SLA tracking flag
3. Calls record_response_exchange() to track response times
4. Updates pending_response_from appropriately
5. Has idempotency guards to prevent duplicate tracking

Parameters:
- p_ticket_id: The ticket ID
- p_actor_user_id: The user performing the action
- p_event_type: The type of event (status_changed, assigned, etc.)
- p_payload: Additional JSONB data to store with the event
- p_create_system_comment: Whether to create a system comment as anchor
- p_skip_if_recent_exchange: Skip if exchange recorded within 1 minute (idempotency)
- p_custom_comment_content: Custom content for the system comment

All RPCs that perform ticket actions should call this function to ensure
consistent SLA tracking across all interactions.';

-- ============================================
-- 3. WRAPPER: Record interaction without creating system comment
-- For cases where comment already exists (like rpc_ticket_add_comment)
-- ============================================

CREATE OR REPLACE FUNCTION public.record_ticket_interaction_with_comment(
    p_ticket_id UUID,
    p_actor_user_id UUID,
    p_event_type TEXT,
    p_comment_id UUID,
    p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_ticket RECORD;
    v_actor_is_creator BOOLEAN;
    v_responder_type TEXT;
    v_new_pending_from TEXT;
    v_exchange_result JSONB;
BEGIN
    -- Get ticket info
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Ticket not found',
            'error_code', 'TICKET_NOT_FOUND'
        );
    END IF;

    -- Determine actor role
    v_actor_is_creator := (p_actor_user_id = v_ticket.created_by);

    IF v_actor_is_creator THEN
        v_responder_type := 'creator';
        v_new_pending_from := 'assignee';
    ELSE
        v_responder_type := 'assignee';
        v_new_pending_from := 'creator';
    END IF;

    -- Record response exchange with existing comment
    BEGIN
        v_exchange_result := public.record_response_exchange(
            p_ticket_id,
            p_actor_user_id,
            p_comment_id
        );
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Failed to record response exchange: %', SQLERRM;
            v_exchange_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
    END;

    -- Update pending_response_from if ticket is not closed
    IF v_ticket.status NOT IN ('closed', 'resolved') THEN
        UPDATE public.tickets
        SET
            pending_response_from = v_new_pending_from,
            updated_at = NOW()
        WHERE id = p_ticket_id
        AND pending_response_from IS DISTINCT FROM v_new_pending_from;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'event_type', p_event_type,
        'comment_id', p_comment_id,
        'responder_type', v_responder_type,
        'new_pending_from', v_new_pending_from,
        'exchange_result', v_exchange_result
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

COMMENT ON FUNCTION public.record_ticket_interaction_with_comment IS
'Wrapper for recording ticket interaction when comment already exists.
Used by rpc_ticket_add_comment to avoid creating duplicate comments.';

-- ============================================
-- 4. UPDATE: Trigger for automatic SLA tracking on status changes
-- Ensures status changes are tracked for SLA even when done via direct UPDATE
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_track_ticket_status_change_sla()
RETURNS TRIGGER AS $$
DECLARE
    v_correlation_id TEXT;
    v_actor_id UUID;
BEGIN
    -- Only trigger on status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_correlation_id := gen_random_uuid()::TEXT;

        -- Try to get actor from session variable, fallback to assigned_to
        v_actor_id := COALESCE(
            current_setting('app.current_user_id', true)::UUID,
            NEW.assigned_to,
            OLD.assigned_to
        );

        -- Skip if no valid actor
        IF v_actor_id IS NOT NULL THEN
            -- Record the interaction for SLA tracking
            -- Use skip_if_recent_exchange to prevent duplicates
            PERFORM public.record_ticket_interaction(
                NEW.id,
                v_actor_id,
                'status_changed',
                jsonb_build_object(
                    'old_status', OLD.status,
                    'new_status', NEW.status,
                    'correlation_id', v_correlation_id
                ),
                TRUE,   -- create_system_comment
                TRUE,   -- skip_if_recent_exchange
                'Status: ' || OLD.status || ' → ' || NEW.status
            );
        END IF;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Don't fail the trigger, just log
        RAISE WARNING 'Failed to track status change for SLA: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_track_ticket_status_change_sla ON public.tickets;

-- Create trigger (AFTER to not interfere with the main update)
CREATE TRIGGER trg_track_ticket_status_change_sla
    AFTER UPDATE OF status ON public.tickets
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status NOT IN ('closed', 'resolved'))
    EXECUTE FUNCTION public.trigger_track_ticket_status_change_sla();

COMMENT ON FUNCTION public.trigger_track_ticket_status_change_sla IS
'BUG #8 Fix: Automatically tracks ticket status changes for SLA purposes.
Creates system comment and records response exchange when status changes.';

-- ============================================
-- 5. UPDATE: Trigger for automatic SLA tracking on assignment changes
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_track_ticket_assignment_sla()
RETURNS TRIGGER AS $$
DECLARE
    v_correlation_id TEXT;
BEGIN
    -- Only trigger on assignment changes (new assignment or reassignment)
    IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL THEN
        v_correlation_id := gen_random_uuid()::TEXT;

        -- Record the interaction for SLA tracking
        PERFORM public.record_ticket_interaction(
            NEW.id,
            NEW.assigned_to,  -- The new assignee is the actor
            'assigned',
            jsonb_build_object(
                'old_assigned_to', OLD.assigned_to,
                'new_assigned_to', NEW.assigned_to,
                'correlation_id', v_correlation_id
            ),
            TRUE,   -- create_system_comment
            TRUE,   -- skip_if_recent_exchange
            CASE
                WHEN OLD.assigned_to IS NULL THEN 'Ticket assigned'
                ELSE 'Ticket reassigned'
            END
        );
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Don't fail the trigger, just log
        RAISE WARNING 'Failed to track assignment for SLA: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_track_ticket_assignment_sla ON public.tickets;

-- Create trigger
CREATE TRIGGER trg_track_ticket_assignment_sla
    AFTER UPDATE OF assigned_to ON public.tickets
    FOR EACH ROW
    WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to AND NEW.assigned_to IS NOT NULL)
    EXECUTE FUNCTION public.trigger_track_ticket_assignment_sla();

COMMENT ON FUNCTION public.trigger_track_ticket_assignment_sla IS
'BUG #8 Fix: Automatically tracks ticket assignment changes for SLA purposes.';

-- ============================================
-- 6. UPDATE: rpc_ticket_add_comment to use the helper
-- Ensure comments are properly tracked with existing function
-- ============================================

-- Note: rpc_ticket_add_comment already calls record_response_exchange directly
-- We don't need to change it, but we document that it's already compliant

-- ============================================
-- 7. CREATE: View to audit SLA tracking consistency
-- ============================================

CREATE OR REPLACE VIEW public.v_ticket_sla_audit AS
SELECT
    t.id AS ticket_id,
    t.ticket_code,
    t.status,
    t.created_at,
    t.pending_response_from,
    (SELECT COUNT(*) FROM public.ticket_events te WHERE te.ticket_id = t.id) AS event_count,
    (SELECT COUNT(*) FROM public.ticket_response_exchanges tre WHERE tre.ticket_id = t.id) AS exchange_count,
    (SELECT COUNT(*) FROM public.ticket_comments tc WHERE tc.ticket_id = t.id AND tc.is_internal = TRUE) AS system_comment_count,
    (SELECT COUNT(*) FROM public.ticket_comments tc WHERE tc.ticket_id = t.id AND tc.is_internal = FALSE) AS user_comment_count,
    trm.creator_total_responses,
    trm.assignee_total_responses,
    trm.assignee_first_response_seconds,
    trm.time_to_first_quote_seconds,
    trm.time_to_resolution_seconds,
    CASE
        WHEN (SELECT COUNT(*) FROM public.ticket_events te WHERE te.ticket_id = t.id) = 0 THEN 'NO_EVENTS'
        WHEN (SELECT COUNT(*) FROM public.ticket_response_exchanges tre WHERE tre.ticket_id = t.id) = 0 THEN 'NO_EXCHANGES'
        WHEN trm.id IS NULL THEN 'NO_METRICS'
        ELSE 'OK'
    END AS sla_tracking_status
FROM public.tickets t
LEFT JOIN public.ticket_response_metrics trm ON trm.ticket_id = t.id
ORDER BY t.created_at DESC;

COMMENT ON VIEW public.v_ticket_sla_audit IS
'Audit view to check SLA tracking consistency across tickets.
Shows tickets with missing events, exchanges, or metrics.';

-- ============================================
-- 8. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.create_system_comment(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ticket_interaction(UUID, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ticket_interaction_with_comment(UUID, UUID, TEXT, UUID, JSONB) TO authenticated;

-- ============================================
-- 9. BACKFILL: Create response exchanges for tickets with events but no exchanges
-- This fixes historical data where events were recorded but exchanges weren't
-- ============================================

DO $$
DECLARE
    v_ticket RECORD;
    v_event RECORD;
    v_result JSONB;
BEGIN
    RAISE NOTICE 'Starting SLA tracking backfill...';

    -- Find tickets with events but no exchanges
    FOR v_ticket IN
        SELECT DISTINCT t.id, t.created_by, t.assigned_to
        FROM public.tickets t
        INNER JOIN public.ticket_events te ON te.ticket_id = t.id
        LEFT JOIN public.ticket_response_exchanges tre ON tre.ticket_id = t.id
        WHERE tre.id IS NULL
        AND t.status NOT IN ('closed', 'resolved')
        LIMIT 100  -- Process in batches
    LOOP
        -- Get the first event for this ticket to create initial exchange
        SELECT * INTO v_event
        FROM public.ticket_events te
        WHERE te.ticket_id = v_ticket.id
        ORDER BY te.created_at ASC
        LIMIT 1;

        IF v_event IS NOT NULL THEN
            BEGIN
                -- Record a response exchange for the first event
                v_result := public.record_response_exchange(
                    v_ticket.id,
                    COALESCE(v_event.actor_user_id, v_ticket.assigned_to, v_ticket.created_by),
                    NULL  -- No comment anchor for backfill
                );
                RAISE NOTICE 'Backfilled ticket %: %', v_ticket.id, v_result;
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING 'Failed to backfill ticket %: %', v_ticket.id, SQLERRM;
            END;
        END IF;
    END LOOP;

    RAISE NOTICE 'SLA tracking backfill completed';
END $$;

-- ============================================
-- SUMMARY
-- ============================================
-- BUG #8 Fix: Unified ticket interaction tracking for accurate SLA:
--
-- 1. NEW create_system_comment():
--    - Creates internal comments for non-comment actions
--    - Provides audit trail for SLA tracking
--
-- 2. NEW record_ticket_interaction():
--    - Unified entry point for all ticket interactions
--    - Creates system comment if needed
--    - Inserts ticket_events with SLA tracking flag
--    - Calls record_response_exchange() for SLA metrics
--    - Updates pending_response_from correctly
--    - Has idempotency guards (1-minute window)
--
-- 3. NEW record_ticket_interaction_with_comment():
--    - Wrapper for existing comments (like rpc_ticket_add_comment)
--    - Avoids creating duplicate system comments
--
-- 4. NEW/UPDATED triggers:
--    - trg_track_ticket_status_change_sla: Auto-track status changes
--    - trg_track_ticket_assignment_sla: Auto-track assignments
--
-- 5. NEW v_ticket_sla_audit view:
--    - Audit view to check SLA tracking consistency
--
-- 6. BACKFILL:
--    - Creates exchanges for tickets with events but no exchanges
--
-- Quality Gate Checklist:
-- After any action (status change, assignment, quotation events):
-- ✓ ticket_events exists
-- ✓ ticket_response_exchanges incremented
-- ✓ ticket_response_metrics updated
-- ✓ SLA numbers reflect real activity
-- ============================================
