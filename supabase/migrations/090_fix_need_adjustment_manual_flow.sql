-- ============================================
-- Migration: 090_fix_need_adjustment_manual_flow.sql
--
-- PURPOSE: Fix BUG #7 - Need Adjustment / Request Adjustment must work manually
--
-- ISSUES FIXED:
-- 1. Create unified rpc_ticket_set_need_adjustment for manual adjustment requests
-- 2. Works for both creator→ops and ops→creator scenarios
-- 3. When ops submits revised cost, auto-update ticket status back
-- 4. Integrate with response exchange tracking (SLA/BUG #8)
--
-- USAGE:
-- - Creator requesting adjustment: pending_response_from = 'assignee'
-- - Ops requesting more info: pending_response_from = 'creator'
-- ============================================

-- ============================================
-- 1. CREATE: Unified RPC for manual need_adjustment
-- Simpler than rpc_ticket_request_adjustment (no mandatory reason_type)
-- Works for both RFQ and GEN tickets, regardless of quotation existence
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_set_need_adjustment(
    p_ticket_id UUID,
    p_notes TEXT DEFAULT NULL,
    p_actor_role_mode TEXT DEFAULT 'creator',  -- 'creator' or 'ops'
    p_actor_user_id UUID DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_ticket RECORD;
    v_old_status ticket_status;
    v_actor_id UUID;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_pending_response_from TEXT;
    v_event_type ticket_event_type;
    v_exchange_result JSONB;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    -- Get actor user id
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Validate actor_role_mode
    IF p_actor_role_mode NOT IN ('creator', 'ops') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Invalid actor_role_mode. Must be "creator" or "ops"',
            'error_code', 'VALIDATION_ERROR',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Determine pending_response_from based on actor role mode
    -- If creator requests adjustment → ops needs to respond (assignee)
    -- If ops requests more info → creator needs to respond
    IF p_actor_role_mode = 'creator' THEN
        v_pending_response_from := 'assignee';
        v_event_type := 'request_adjustment'::ticket_event_type;
    ELSE
        v_pending_response_from := 'creator';
        v_event_type := 'request_adjustment'::ticket_event_type;
    END IF;

    -- Lock the ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF v_ticket IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Ticket not found',
            'error_code', 'TICKET_NOT_FOUND',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- AUTHORIZATION: Check if actor can modify this ticket
    v_auth_check := fn_check_ticket_authorization(p_ticket_id, v_actor_id, 'request adjustment on');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    v_old_status := v_ticket.status;

    -- IDEMPOTENCY: If already in need_adjustment with same pending_response_from, return success
    IF v_ticket.status = 'need_adjustment' AND v_ticket.pending_response_from = v_pending_response_from THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'ticket_id', p_ticket_id,
            'old_status', v_old_status,
            'new_status', v_ticket.status,
            'pending_response_from', v_ticket.pending_response_from,
            'is_idempotent', TRUE,
            'message', 'Ticket was already in need_adjustment status with same pending_response_from. No changes made.',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- STATE MACHINE: Validate transition using centralized rules
    IF v_ticket.status != 'need_adjustment' THEN
        v_transition_check := fn_validate_ticket_transition(v_ticket.status::TEXT, 'need_adjustment');
        IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', v_transition_check->>'error',
                'error_code', v_transition_check->>'error_code',
                'correlation_id', v_correlation_id
            );
        END IF;
    END IF;

    -- 1. UPDATE TICKET STATUS -> need_adjustment
    UPDATE public.tickets
    SET
        status = 'need_adjustment'::ticket_status,
        pending_response_from = v_pending_response_from,
        updated_at = NOW()
    WHERE id = p_ticket_id
    RETURNING * INTO v_ticket;

    -- 2. CREATE TICKET EVENT
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        old_value,
        new_value,
        notes,
        created_at
    ) VALUES (
        p_ticket_id,
        v_event_type,
        v_actor_id,
        jsonb_build_object(
            'ticket_status', v_old_status,
            'pending_response_from', v_ticket.pending_response_from
        ),
        jsonb_build_object(
            'ticket_status', 'need_adjustment',
            'pending_response_from', v_pending_response_from,
            'actor_role_mode', p_actor_role_mode,
            'correlation_id', v_correlation_id
        ),
        '[' || v_correlation_id || '] ' || CASE
            WHEN p_actor_role_mode = 'creator' THEN 'Customer/Creator requested adjustment'
            ELSE 'Ops requested more information from customer'
        END || COALESCE(': ' || p_notes, ''),
        NOW()
    );

    -- 3. RECORD RESPONSE EXCHANGE for SLA tracking (BUG #8 integration)
    BEGIN
        v_exchange_result := public.record_response_exchange(
            p_ticket_id,
            v_actor_id,
            NULL  -- No comment_id for this action
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- Log but don't fail the main transaction
            RAISE WARNING 'Failed to record response exchange: %', SQLERRM;
            v_exchange_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
    END;

    -- 4. UPDATE OPPORTUNITY TO NEGOTIATION (if linked and in Quote Sent)
    IF v_ticket.opportunity_id IS NOT NULL THEN
        UPDATE public.opportunities
        SET
            stage = 'Negotiation'::opportunity_stage,
            updated_at = NOW()
        WHERE opportunity_id = v_ticket.opportunity_id
        AND stage = 'Quote Sent';

        -- Create stage history if stage changed
        IF FOUND THEN
            INSERT INTO public.opportunity_stage_history (
                opportunity_id,
                from_stage,
                to_stage,
                changed_by,
                reason,
                notes,
                old_stage,
                new_stage
            ) VALUES (
                v_ticket.opportunity_id,
                'Quote Sent'::opportunity_stage,
                'Negotiation'::opportunity_stage,
                v_actor_id,
                'manual_adjustment_requested',
                '[' || v_correlation_id || '] Auto-updated: Manual adjustment requested on ticket',
                'Quote Sent'::opportunity_stage,
                'Negotiation'::opportunity_stage
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'old_status', v_old_status,
        'new_status', v_ticket.status,
        'pending_response_from', v_pending_response_from,
        'actor_role_mode', p_actor_role_mode,
        'response_exchange', v_exchange_result,
        'correlation_id', v_correlation_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', 'INTERNAL_ERROR',
            'detail', SQLSTATE,
            'correlation_id', v_correlation_id
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_set_need_adjustment IS
'Unified RPC for manual need_adjustment status changes.

BUG #7 Fix - Works for both creator→ops and ops→creator scenarios:
- p_actor_role_mode = "creator": Creator requests adjustment → pending_response_from = assignee
- p_actor_role_mode = "ops": Ops requests more info → pending_response_from = creator

Features:
- Works for both RFQ and GEN tickets
- Does not require quotation to exist (manual adjustment)
- Inserts ticket_events with full audit trail
- Records response exchange for SLA tracking (BUG #8)
- Updates opportunity to Negotiation if linked and in Quote Sent
- State machine validation and correlation_id for observability';

-- ============================================
-- 2. CREATE: Trigger to auto-update ticket when ops submits revised cost
-- When ticket_rate_quotes status changes to 'submitted', update ticket
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_sync_cost_submission_to_ticket()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket RECORD;
    v_correlation_id TEXT;
BEGIN
    -- Only trigger when status changes TO 'submitted'
    IF NEW.status = 'submitted' AND (OLD.status IS NULL OR OLD.status != 'submitted') THEN
        -- Get the linked ticket
        SELECT * INTO v_ticket
        FROM public.tickets
        WHERE id = NEW.ticket_id;

        -- Only update if ticket exists and is in need_adjustment status
        IF v_ticket IS NOT NULL AND v_ticket.status = 'need_adjustment' THEN
            v_correlation_id := gen_random_uuid()::TEXT;

            -- Update ticket status to waiting_customer (cost submitted, awaiting customer response)
            UPDATE public.tickets
            SET
                status = 'waiting_customer'::ticket_status,
                pending_response_from = 'creator',
                updated_at = NOW()
            WHERE id = NEW.ticket_id;

            -- Create ticket event for the status change
            INSERT INTO public.ticket_events (
                ticket_id,
                event_type,
                actor_user_id,
                old_value,
                new_value,
                notes,
                created_at
            ) VALUES (
                NEW.ticket_id,
                'status_changed'::ticket_event_type,
                NEW.created_by,
                jsonb_build_object(
                    'ticket_status', v_ticket.status,
                    'pending_response_from', v_ticket.pending_response_from
                ),
                jsonb_build_object(
                    'ticket_status', 'waiting_customer',
                    'pending_response_from', 'creator',
                    'rate_quote_id', NEW.id,
                    'rate_quote_status', NEW.status,
                    'triggered_by', 'cost_submitted',
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Revised cost submitted by ops - Ticket status auto-updated to waiting_customer',
                NOW()
            );

            -- Record response exchange for SLA tracking
            BEGIN
                PERFORM public.record_response_exchange(
                    NEW.ticket_id,
                    NEW.created_by,
                    NULL  -- No comment_id
                );
            EXCEPTION
                WHEN OTHERS THEN
                    -- Log but don't fail
                    RAISE WARNING 'Failed to record response exchange on cost submission: %', SQLERRM;
            END;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists (to avoid duplicates)
DROP TRIGGER IF EXISTS trg_sync_cost_submission_to_ticket ON public.ticket_rate_quotes;

-- Create trigger on ticket_rate_quotes
CREATE TRIGGER trg_sync_cost_submission_to_ticket
    AFTER INSERT OR UPDATE OF status ON public.ticket_rate_quotes
    FOR EACH ROW
    WHEN (NEW.ticket_id IS NOT NULL AND NEW.status = 'submitted')
    EXECUTE FUNCTION public.trigger_sync_cost_submission_to_ticket();

COMMENT ON FUNCTION public.trigger_sync_cost_submission_to_ticket IS
'BUG #7 Fix: Auto-updates ticket status when ops submits revised cost.

When ticket_rate_quotes status becomes "submitted":
- If ticket is in need_adjustment status, auto-update to waiting_customer
- Flips pending_response_from to creator
- Creates ticket_event for audit trail
- Records response exchange for SLA tracking';

-- ============================================
-- 3. UPDATE: Enhance rpc_ticket_request_adjustment to also record response exchange
-- The existing RPC in migration 078 needs response exchange tracking
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_request_adjustment(
    p_ticket_id UUID,
    p_reason_type operational_cost_rejection_reason_type,
    p_competitor_name TEXT DEFAULT NULL,
    p_competitor_amount NUMERIC DEFAULT NULL,
    p_customer_budget NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'IDR',
    p_notes TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_ticket RECORD;
    v_old_status ticket_status;
    v_rate_quote RECORD;
    v_actor_id UUID;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_is_already_need_adjustment BOOLEAN := FALSE;
    v_exchange_result JSONB;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    -- Get actor user id
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Lock the ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF v_ticket IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Ticket not found',
            'error_code', 'TICKET_NOT_FOUND',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- AUTHORIZATION: Check if actor can request adjustment on this ticket
    v_auth_check := fn_check_ticket_authorization(p_ticket_id, v_actor_id, 'request adjustment on');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    v_old_status := v_ticket.status;

    -- IDEMPOTENCY: If already in need_adjustment, return success without duplicating events
    IF v_ticket.status = 'need_adjustment' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'ticket_id', p_ticket_id,
            'old_status', v_old_status,
            'new_status', v_ticket.status,
            'is_idempotent', TRUE,
            'message', 'Ticket was already in need_adjustment status. No changes made.',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- STATE MACHINE: Validate transition using centralized rules
    v_transition_check := fn_validate_ticket_transition(v_ticket.status::TEXT, 'need_adjustment');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- 1. UPDATE TICKET STATUS -> need_adjustment
    UPDATE public.tickets
    SET
        status = 'need_adjustment'::ticket_status,
        pending_response_from = 'assignee',
        updated_at = NOW()
    WHERE id = p_ticket_id
    RETURNING * INTO v_ticket;

    -- 2. FIND AND UPDATE LATEST OPERATIONAL COST
    SELECT * INTO v_rate_quote
    FROM public.ticket_rate_quotes
    WHERE ticket_id = p_ticket_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_rate_quote IS NOT NULL THEN
        -- Update rate quote status to revise_requested
        UPDATE public.ticket_rate_quotes
        SET
            status = 'revise_requested'::quote_status,
            updated_at = NOW()
        WHERE id = v_rate_quote.id
        RETURNING * INTO v_rate_quote;

        -- Record rejection reason
        INSERT INTO public.operational_cost_rejection_reasons (
            operational_cost_id,
            reason_type,
            suggested_amount,
            currency,
            notes,
            created_by,
            created_at
        ) VALUES (
            v_rate_quote.id,
            p_reason_type,
            p_customer_budget,
            COALESCE(p_currency, v_rate_quote.currency, 'IDR'),
            COALESCE(p_notes, '') || CASE
                WHEN p_competitor_name IS NOT NULL THEN ' | Competitor: ' || p_competitor_name
                ELSE ''
            END || CASE
                WHEN p_competitor_amount IS NOT NULL THEN ' | Competitor Price: ' || p_competitor_amount::TEXT
                ELSE ''
            END,
            v_actor_id,
            NOW()
        );
    END IF;

    -- 3. CREATE TICKET EVENTS
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        old_value,
        new_value,
        notes,
        created_at
    ) VALUES (
        p_ticket_id,
        'request_adjustment'::ticket_event_type,
        v_actor_id,
        jsonb_build_object('ticket_status', v_old_status),
        jsonb_build_object(
            'ticket_status', 'need_adjustment',
            'rate_quote_id', v_rate_quote.id,
            'rate_quote_status', COALESCE(v_rate_quote.status::TEXT, NULL),
            'reason_type', p_reason_type::TEXT,
            'competitor_name', p_competitor_name,
            'competitor_amount', p_competitor_amount,
            'customer_budget', p_customer_budget,
            'correlation_id', v_correlation_id
        ),
        '[' || v_correlation_id || '] Rate adjustment requested. Reason: ' || p_reason_type::TEXT || COALESCE(' - ' || p_notes, ''),
        NOW()
    );

    -- ============================================
    -- FIX BUG #7: Record response exchange for SLA tracking
    -- ============================================
    BEGIN
        v_exchange_result := public.record_response_exchange(
            p_ticket_id,
            v_actor_id,
            NULL  -- No comment_id for this action
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- Log but don't fail the main transaction
            RAISE WARNING 'Failed to record response exchange: %', SQLERRM;
            v_exchange_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
    END;

    -- 4. UPDATE OPPORTUNITY TO NEGOTIATION (if linked and in Quote Sent)
    IF v_ticket.opportunity_id IS NOT NULL THEN
        UPDATE public.opportunities
        SET
            stage = 'Negotiation'::opportunity_stage,
            updated_at = NOW()
        WHERE opportunity_id = v_ticket.opportunity_id
        AND stage = 'Quote Sent';

        -- Create stage history if stage changed
        IF FOUND THEN
            INSERT INTO public.opportunity_stage_history (
                opportunity_id,
                from_stage,
                to_stage,
                changed_by,
                reason,
                notes,
                old_stage,
                new_stage
            ) VALUES (
                v_ticket.opportunity_id,
                'Quote Sent'::opportunity_stage,
                'Negotiation'::opportunity_stage,
                v_actor_id,
                'adjustment_requested',
                '[' || v_correlation_id || '] Auto-updated: Rate adjustment requested on ticket',
                'Quote Sent'::opportunity_stage,
                'Negotiation'::opportunity_stage
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'ticket_id', p_ticket_id,
        'old_status', v_old_status,
        'new_status', v_ticket.status,
        'rate_quote_id', v_rate_quote.id,
        'rate_quote_status', v_rate_quote.status,
        'reason_type', p_reason_type::TEXT,
        'response_exchange', v_exchange_result,
        'correlation_id', v_correlation_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', 'INTERNAL_ERROR',
            'detail', SQLSTATE,
            'correlation_id', v_correlation_id
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_ticket_request_adjustment IS
'Atomically moves ticket to need_adjustment status with structured rejection reason.

BUG #7 Fix enhancements:
- Now records response exchange for SLA tracking (integrates with BUG #8)
- Returns response_exchange result in response

Features:
- State machine validation
- Updates linked operational cost to revise_requested
- Records rejection reason with competitor/budget info
- Creates ticket_events for audit trail
- Correlation_id for observability';

-- ============================================
-- 4. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_ticket_set_need_adjustment(UUID, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- BUG #7 Fix: Need Adjustment / Request Adjustment now works manually:
--
-- 1. NEW rpc_ticket_set_need_adjustment:
--    - Unified RPC for manual adjustment requests
--    - p_actor_role_mode determines pending_response_from
--    - Works for both RFQ and GEN tickets
--    - Does not require quotation or rejection reason
--
-- 2. NEW trigger trg_sync_cost_submission_to_ticket:
--    - When ops submits revised cost (status='submitted')
--    - Auto-updates ticket from need_adjustment to waiting_customer
--    - Flips pending_response_from to creator
--    - Records response exchange for SLA
--
-- 3. UPDATED rpc_ticket_request_adjustment:
--    - Now records response exchange (BUG #8 integration)
--    - Returns response_exchange in result
--
-- Status Flow:
--   [waiting_customer] → (creator requests adjustment) → [need_adjustment, pending=assignee]
--   [need_adjustment] → (ops submits revised cost) → [waiting_customer, pending=creator]
--   [any] → (ops requests info) → [need_adjustment, pending=creator]
-- ============================================
