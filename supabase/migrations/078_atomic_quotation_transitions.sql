-- ============================================
-- Migration: 078_atomic_quotation_transitions.sql
--
-- PURPOSE: Create atomic RPCs for quotation transitions that ensure
-- pipeline/opportunity, ticket, and quotation status are ALL updated
-- in a SINGLE transaction. This prevents the "pipeline stuck at Discovery"
-- bug where quotation.status becomes 'sent' but opportunity.stage stays
-- at 'Discovery' due to non-atomic operations.
--
-- FIXES:
-- 1. Pipeline doesn't auto-update after quotation sent
-- 2. Quotation rejected doesn't move pipeline to Negotiation
-- 3. Quotation accepted doesn't close the pipeline
-- 4. Ticket status not updating with quotation transitions
-- 5. Missing /accept endpoint (now handled by RPC)
--
-- SSOT: opportunity_stage uses Title Case: 'Quote Sent', 'Negotiation', 'Closed Won'
--
-- STATE MACHINE RULES:
-- - Quotation: draft -> sent -> (rejected | accepted)
--   * rejected: Can only happen from sent or draft
--   * accepted: Can only happen from sent
--   * Once accepted: CANNOT be rejected (409 Conflict)
--   * Once rejected: Can be resent (draft a new quotation)
--
-- - Opportunity Stage: Prospecting -> Discovery -> Quote Sent -> Negotiation -> (Closed Won | Closed Lost)
--   * Once closed: Cannot reopen (409 Conflict)
--
-- - Ticket (RFQ): open -> in_progress -> waiting_customer -> need_adjustment -> resolved -> closed
--   * Once closed: Cannot reopen (409 Conflict)
-- ============================================

-- ============================================
-- 0. STATE MACHINE HELPER: Validate Quotation Transitions
-- Centralizes all valid state transitions for quotations
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_validate_quotation_transition(
    p_current_status TEXT,
    p_target_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_valid_transitions JSONB;
BEGIN
    -- Define valid state machine transitions for customer_quotations
    -- Format: { "current_status": ["allowed_target_1", "allowed_target_2"] }
    v_valid_transitions := '{
        "draft": ["sent", "rejected"],
        "sent": ["rejected", "accepted"],
        "rejected": [],
        "accepted": []
    }'::JSONB;

    -- Check if current status exists in state machine
    IF NOT v_valid_transitions ? p_current_status THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Unknown current status: ' || p_current_status,
            'error_code', 'INVALID_STATUS'
        );
    END IF;

    -- Check if target status is allowed from current status
    IF v_valid_transitions->p_current_status @> to_jsonb(p_target_status) THEN
        RETURN jsonb_build_object('valid', TRUE);
    END IF;

    -- Specific conflict messages for terminal states
    IF p_current_status = 'accepted' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quotation already accepted. Cannot transition to ' || p_target_status || '. Create a new quotation instead.',
            'error_code', 'CONFLICT_ALREADY_ACCEPTED'
        );
    END IF;

    IF p_current_status = 'rejected' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quotation already rejected. Cannot transition to ' || p_target_status || '. Create a new quotation or revision instead.',
            'error_code', 'CONFLICT_ALREADY_REJECTED'
        );
    END IF;

    -- Generic invalid transition
    RETURN jsonb_build_object(
        'valid', FALSE,
        'error', 'Invalid transition from ' || p_current_status || ' to ' || p_target_status,
        'error_code', 'INVALID_STATUS_TRANSITION'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.fn_validate_quotation_transition IS 'State machine validator for quotation status transitions. Returns conflict (409-worthy) for terminal states.';

-- ============================================
-- 0b. STATE MACHINE HELPER: Validate Opportunity Stage Transitions
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_validate_opportunity_transition(
    p_current_stage TEXT,
    p_target_stage TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_valid_transitions JSONB;
BEGIN
    -- Define valid state machine transitions for opportunities
    v_valid_transitions := '{
        "Prospecting": ["Discovery", "Quote Sent", "Closed Lost", "On Hold"],
        "Discovery": ["Quote Sent", "Negotiation", "Closed Lost", "On Hold"],
        "Quote Sent": ["Negotiation", "Closed Won", "Closed Lost", "On Hold"],
        "Negotiation": ["Quote Sent", "Closed Won", "Closed Lost", "On Hold"],
        "On Hold": ["Prospecting", "Discovery", "Quote Sent", "Negotiation", "Closed Lost"],
        "Closed Won": [],
        "Closed Lost": []
    }'::JSONB;

    -- Check if current stage exists
    IF NOT v_valid_transitions ? p_current_stage THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Unknown current stage: ' || p_current_stage,
            'error_code', 'INVALID_STAGE'
        );
    END IF;

    -- Check if target stage is allowed
    IF v_valid_transitions->p_current_stage @> to_jsonb(p_target_stage) THEN
        RETURN jsonb_build_object('valid', TRUE);
    END IF;

    -- Specific conflict messages for terminal states
    IF p_current_stage IN ('Closed Won', 'Closed Lost') THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Opportunity already closed as ' || p_current_stage || '. Cannot reopen or transition.',
            'error_code', 'CONFLICT_OPPORTUNITY_CLOSED'
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', FALSE,
        'error', 'Invalid stage transition from ' || p_current_stage || ' to ' || p_target_stage,
        'error_code', 'INVALID_STAGE_TRANSITION'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.fn_validate_opportunity_transition IS 'State machine validator for opportunity stage transitions. Returns conflict (409-worthy) for closed states.';

-- ============================================
-- 0c. STATE MACHINE HELPER: Validate Ticket Status Transitions (RFQ)
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_validate_ticket_transition(
    p_current_status TEXT,
    p_target_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_valid_transitions JSONB;
BEGIN
    -- Define valid state machine transitions for tickets (RFQ flow)
    v_valid_transitions := '{
        "open": ["in_progress", "waiting_customer", "need_adjustment", "on_hold", "closed"],
        "in_progress": ["waiting_customer", "need_adjustment", "waiting_vendor", "on_hold", "resolved", "closed"],
        "waiting_customer": ["in_progress", "need_adjustment", "resolved", "closed"],
        "waiting_vendor": ["in_progress", "need_adjustment", "waiting_customer", "on_hold", "closed"],
        "need_adjustment": ["in_progress", "waiting_customer", "waiting_vendor", "on_hold", "closed"],
        "on_hold": ["open", "in_progress", "waiting_customer", "waiting_vendor", "need_adjustment", "closed"],
        "resolved": ["closed", "in_progress"],
        "closed": []
    }'::JSONB;

    -- Check if current status exists
    IF NOT v_valid_transitions ? p_current_status THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Unknown current status: ' || p_current_status,
            'error_code', 'INVALID_STATUS'
        );
    END IF;

    -- Check if target status is allowed
    IF v_valid_transitions->p_current_status @> to_jsonb(p_target_status) THEN
        RETURN jsonb_build_object('valid', TRUE);
    END IF;

    -- Specific conflict message for closed tickets
    IF p_current_status = 'closed' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Ticket already closed. Cannot reopen or transition.',
            'error_code', 'CONFLICT_TICKET_CLOSED'
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', FALSE,
        'error', 'Invalid ticket transition from ' || p_current_status || ' to ' || p_target_status,
        'error_code', 'INVALID_STATUS_TRANSITION'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.fn_validate_ticket_transition IS 'State machine validator for ticket status transitions. Returns conflict (409-worthy) for closed tickets.';

-- ============================================
-- 1. ATOMIC RPC: Mark Quotation as SENT
-- Updates quotation -> opportunity -> ticket in ONE transaction
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_mark_sent(
    p_quotation_id UUID,
    p_sent_via TEXT,
    p_sent_to TEXT,
    p_actor_user_id UUID,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_ticket RECORD;
    v_old_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_new_opp_stage opportunity_stage := NULL;
    v_is_resend BOOLEAN := FALSE;
    v_transition_check JSONB;
    v_correlation_id TEXT;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    -- Start by locking the quotation
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id
    FOR UPDATE;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Quotation not found',
            'error_code', 'QUOTATION_NOT_FOUND',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- IDEMPOTENCY: If already sent, this is a resend - don't duplicate events/history
    IF v_quotation.status = 'sent' THEN
        v_is_resend := TRUE;
    END IF;

    -- STATE MACHINE: Validate transition using centralized rules
    IF NOT v_is_resend THEN
        v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'sent');
        IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', v_transition_check->>'error',
                'error_code', v_transition_check->>'error_code',
                'correlation_id', v_correlation_id
            );
        END IF;
    END IF;

    -- 1. UPDATE QUOTATION STATUS (always update sent_via/sent_to for resends)
    UPDATE public.customer_quotations
    SET
        status = 'sent'::customer_quotation_status,
        sent_via = COALESCE(p_sent_via, sent_via),
        sent_to = COALESCE(p_sent_to, sent_to),
        sent_at = COALESCE(sent_at, NOW()),
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. UPDATE OPPORTUNITY STAGE (if linked) - skip on resend
    IF v_quotation.opportunity_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_quotation.opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- Only transition if in early stages
            IF v_opportunity.stage IN ('Prospecting', 'Discovery') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Quote Sent'::opportunity_stage,
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    quotation_count = COALESCE(quotation_count, 0) + 1,
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Quote Sent'::opportunity_stage;

                -- Create stage history entry (AUDIT TRAIL - only on first send)
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    from_stage,
                    to_stage,
                    changed_by,
                    notes,
                    old_stage,
                    new_stage
                ) VALUES (
                    v_quotation.opportunity_id,
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage,
                    p_actor_user_id,
                    'Auto-updated: Quotation sent to customer via ' || COALESCE(p_sent_via, 'system'),
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage
                );
            ELSE
                -- Just update quotation status, don't change stage
                UPDATE public.opportunities
                SET
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;
            END IF;
        END IF;
    END IF;

    -- 3. UPDATE TICKET STATUS (if linked) - skip event on resend
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT status INTO v_old_ticket_status
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        FOR UPDATE;

        -- Update ticket to waiting_customer (Cost sent, awaiting feedback) - idempotent
        UPDATE public.tickets
        SET
            status = 'waiting_customer'::ticket_status,
            pending_response_from = 'creator',
            updated_at = NOW()
        WHERE id = v_quotation.ticket_id
        AND status NOT IN ('closed', 'resolved', 'waiting_customer')
        RETURNING * INTO v_ticket;

        -- Create ticket event (AUDIT TRAIL - only on first send, not resend)
        IF NOT v_is_resend THEN
            INSERT INTO public.ticket_events (
            ticket_id,
            event_type,
            actor_user_id,
            old_value,
            new_value,
            notes,
            created_at
        ) VALUES (
            v_quotation.ticket_id,
            'customer_quotation_sent'::ticket_event_type,
            p_actor_user_id,
            jsonb_build_object('ticket_status', v_old_ticket_status),
            jsonb_build_object(
                'ticket_status', 'waiting_customer',
                'quotation_id', v_quotation.id,
                'quotation_number', v_quotation.quotation_number,
                'quotation_status', 'sent',
                'sent_via', p_sent_via,
                'sent_to', p_sent_to,
                'correlation_id', v_correlation_id
            ),
            '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system'),
            NOW()
        );
        END IF;
    END IF;

    -- 4. UPDATE LEAD (if linked) - skip quotation_count increment on resend
    IF v_quotation.lead_id IS NOT NULL THEN
        IF v_is_resend THEN
            -- Just update latest_quotation_id, don't increment count
            UPDATE public.leads
            SET
                quotation_status = 'sent',
                latest_quotation_id = v_quotation.id,
                updated_at = NOW()
            WHERE lead_id = v_quotation.lead_id;
        ELSE
            UPDATE public.leads
            SET
                quotation_status = 'sent',
                latest_quotation_id = v_quotation.id,
                quotation_count = COALESCE(quotation_count, 0) + 1,
                updated_at = NOW()
            WHERE lead_id = v_quotation.lead_id;
        END IF;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (if linked)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = 'sent_to_customer'::quote_status,
            updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'opportunity_id', v_quotation.opportunity_id,
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
        'ticket_id', v_quotation.ticket_id,
        'ticket_status', v_ticket.status,
        'is_resend', v_is_resend,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS 'Atomically marks quotation as sent and syncs to opportunity (Quote Sent), ticket (waiting_customer), lead, and operational cost in a single transaction. Includes state machine validation and correlation_id for observability.';

-- ============================================
-- 2. ATOMIC RPC: Mark Quotation as REJECTED
-- Updates quotation -> opportunity -> ticket in ONE transaction
-- Requires rejection reason with conditional numeric validation
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_mark_rejected(
    p_quotation_id UUID,
    p_reason_type quotation_rejection_reason_type,
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
    v_quotation RECORD;
    v_opportunity RECORD;
    v_ticket RECORD;
    v_old_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_new_opp_stage opportunity_stage := NULL;
    v_actor_id UUID;
    v_transition_check JSONB;
    v_correlation_id TEXT;
    v_is_already_rejected BOOLEAN := FALSE;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    -- Get actor user id
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Validate required numeric fields for specific reasons
    IF p_reason_type = 'kompetitor_lebih_murah' AND p_competitor_amount IS NULL AND p_competitor_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Competitor name or amount is required when reason is "kompetitor_lebih_murah"',
            'error_code', 'VALIDATION_ERROR',
            'field_errors', jsonb_build_object('competitor_amount', 'Required for this reason'),
            'correlation_id', v_correlation_id
        );
    END IF;

    IF p_reason_type = 'budget_customer_tidak_cukup' AND p_customer_budget IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Customer budget is required when reason is "budget_customer_tidak_cukup"',
            'error_code', 'VALIDATION_ERROR',
            'field_errors', jsonb_build_object('customer_budget', 'Required for this reason'),
            'correlation_id', v_correlation_id
        );
    END IF;

    IF p_reason_type = 'tarif_tidak_masuk' AND p_competitor_amount IS NULL AND p_customer_budget IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Either competitor amount or customer budget is required when reason is "tarif_tidak_masuk"',
            'error_code', 'VALIDATION_ERROR',
            'field_errors', jsonb_build_object('competitor_amount', 'Either this or customer_budget required'),
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Lock the quotation
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id
    FOR UPDATE;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Quotation not found',
            'error_code', 'QUOTATION_NOT_FOUND',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- IDEMPOTENCY: If already rejected, return success without duplicating events
    IF v_quotation.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'quotation_id', v_quotation.id,
            'quotation_number', v_quotation.quotation_number,
            'quotation_status', v_quotation.status,
            'is_idempotent', TRUE,
            'message', 'Quotation was already rejected. No changes made.',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- STATE MACHINE: Validate transition using centralized rules
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'rejected');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- 1. UPDATE QUOTATION STATUS
    UPDATE public.customer_quotations
    SET
        status = 'rejected'::customer_quotation_status,
        rejection_reason = p_reason_type::TEXT,
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. INSERT REJECTION REASON RECORD
    INSERT INTO public.quotation_rejection_reasons (
        quotation_id,
        reason_type,
        competitor_name,
        competitor_amount,
        customer_budget,
        currency,
        notes,
        created_by,
        created_at
    ) VALUES (
        p_quotation_id,
        p_reason_type,
        p_competitor_name,
        p_competitor_amount,
        p_customer_budget,
        COALESCE(p_currency, v_quotation.currency, 'IDR'),
        p_notes,
        v_actor_id,
        NOW()
    );

    -- 3. UPDATE OPPORTUNITY STAGE (if linked)
    IF v_quotation.opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_quotation.opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- Transition to Negotiation if in Quote Sent, Discovery, or Prospecting
            IF v_opportunity.stage IN ('Quote Sent', 'Discovery', 'Prospecting') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Negotiation'::opportunity_stage,
                    quotation_status = 'rejected',
                    competitor = COALESCE(p_competitor_name, competitor),
                    competitor_price = COALESCE(p_competitor_amount, competitor_price),
                    customer_budget = COALESCE(p_customer_budget, customer_budget),
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Negotiation'::opportunity_stage;

                -- Create stage history entry
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
                    v_quotation.opportunity_id,
                    v_old_opp_stage,
                    'Negotiation'::opportunity_stage,
                    v_actor_id,
                    'quotation_rejected',
                    'Auto-updated: Quotation rejected by customer. Reason: ' || p_reason_type::TEXT,
                    v_old_opp_stage,
                    'Negotiation'::opportunity_stage
                );
            ELSE
                -- Just update quotation status, don't change stage if already past Negotiation
                UPDATE public.opportunities
                SET
                    quotation_status = 'rejected',
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;
            END IF;
        END IF;
    END IF;

    -- 4. UPDATE TICKET STATUS (if linked) -> need_adjustment
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT status INTO v_old_ticket_status
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        FOR UPDATE;

        -- Update ticket to need_adjustment
        UPDATE public.tickets
        SET
            status = 'need_adjustment'::ticket_status,
            pending_response_from = 'assignee',
            updated_at = NOW()
        WHERE id = v_quotation.ticket_id
        AND status NOT IN ('closed', 'resolved')
        RETURNING * INTO v_ticket;

        -- Create ticket event for rejection
        INSERT INTO public.ticket_events (
            ticket_id,
            event_type,
            actor_user_id,
            old_value,
            new_value,
            notes,
            created_at
        ) VALUES (
            v_quotation.ticket_id,
            'customer_quotation_rejected'::ticket_event_type,
            v_actor_id,
            jsonb_build_object('ticket_status', v_old_ticket_status),
            jsonb_build_object(
                'ticket_status', 'need_adjustment',
                'quotation_id', v_quotation.id,
                'quotation_number', v_quotation.quotation_number,
                'quotation_status', 'rejected',
                'rejection_reason', p_reason_type::TEXT,
                'competitor_name', p_competitor_name,
                'competitor_amount', p_competitor_amount,
                'customer_budget', p_customer_budget,
                'correlation_id', v_correlation_id
            ),
            '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT,
            NOW()
        );

        -- Create request_adjustment event
        INSERT INTO public.ticket_events (
            ticket_id,
            event_type,
            actor_user_id,
            new_value,
            notes,
            created_at
        ) VALUES (
            v_quotation.ticket_id,
            'request_adjustment'::ticket_event_type,
            v_actor_id,
            jsonb_build_object(
                'reason', p_reason_type::TEXT,
                'triggered_by', 'quotation_rejection',
                'correlation_id', v_correlation_id
            ),
            '[' || v_correlation_id || '] Rate adjustment requested due to quotation rejection',
            NOW()
        );
    END IF;

    -- 5. UPDATE LEAD (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET
            quotation_status = 'rejected',
            updated_at = NOW()
        WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 6. UPDATE OPERATIONAL COST (if linked) -> revise_requested
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = 'revise_requested'::quote_status,
            updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'rejection_reason', p_reason_type::TEXT,
        'opportunity_id', v_quotation.opportunity_id,
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
        'ticket_id', v_quotation.ticket_id,
        'ticket_status', COALESCE(v_ticket.status::TEXT, v_old_ticket_status::TEXT),
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_rejected IS 'Atomically marks quotation as rejected with state machine validation, records rejection reason, and syncs to opportunity (Negotiation), ticket (need_adjustment), lead, and operational cost (revise_requested). Includes idempotency guard and correlation_id for observability.';

-- ============================================
-- 3. ATOMIC RPC: Mark Quotation as ACCEPTED
-- Updates quotation -> opportunity -> ticket -> account in ONE transaction
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_mark_accepted(
    p_quotation_id UUID,
    p_actor_user_id UUID DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_ticket RECORD;
    v_old_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_actor_id UUID;
    v_transition_check JSONB;
    v_correlation_id TEXT;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    -- Get actor user id
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Lock the quotation
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id
    FOR UPDATE;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Quotation not found',
            'error_code', 'QUOTATION_NOT_FOUND',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- IDEMPOTENCY: If already accepted, return success without duplicating events
    IF v_quotation.status = 'accepted' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'quotation_id', v_quotation.id,
            'quotation_number', v_quotation.quotation_number,
            'quotation_status', v_quotation.status,
            'is_idempotent', TRUE,
            'message', 'Quotation was already accepted. No changes made.',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- STATE MACHINE: Validate transition using centralized rules
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'accepted');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- 1. UPDATE QUOTATION STATUS
    UPDATE public.customer_quotations
    SET
        status = 'accepted'::customer_quotation_status,
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. UPDATE OPPORTUNITY STAGE -> Closed Won
    IF v_quotation.opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_quotation.opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- Only close if not already closed
            IF v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Closed Won'::opportunity_stage,
                    quotation_status = 'accepted',
                    deal_value = v_quotation.total_selling_rate,
                    closed_at = COALESCE(closed_at, NOW()),
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id
                RETURNING * INTO v_opportunity;

                -- Create stage history entry
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
                    v_quotation.opportunity_id,
                    v_old_opp_stage,
                    'Closed Won'::opportunity_stage,
                    v_actor_id,
                    'quotation_accepted',
                    'Auto-closed: Customer accepted quotation ' || v_quotation.quotation_number,
                    v_old_opp_stage,
                    'Closed Won'::opportunity_stage
                );

                -- Update linked account to active_account (if calon_account)
                IF v_opportunity.account_id IS NOT NULL THEN
                    UPDATE public.accounts
                    SET
                        account_status = 'active_account',
                        is_active = TRUE,
                        first_deal_date = COALESCE(first_deal_date, NOW()),
                        first_transaction_date = COALESCE(first_transaction_date, NOW()),
                        last_transaction_date = NOW(),
                        updated_at = NOW()
                    WHERE account_id = v_opportunity.account_id
                    AND account_status IN ('calon_account', 'prospect');
                END IF;
            ELSE
                -- Just update quotation status, don't change stage
                UPDATE public.opportunities
                SET
                    quotation_status = 'accepted',
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;
            END IF;
        END IF;
    END IF;

    -- 3. UPDATE TICKET STATUS -> closed (won)
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT status INTO v_old_ticket_status
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        FOR UPDATE;

        -- Update ticket to closed with won outcome
        UPDATE public.tickets
        SET
            status = 'closed'::ticket_status,
            close_outcome = 'won'::ticket_close_outcome,
            close_reason = 'Customer accepted quotation ' || v_quotation.quotation_number,
            closed_at = COALESCE(closed_at, NOW()),
            resolved_at = COALESCE(resolved_at, NOW()),
            pending_response_from = NULL,
            updated_at = NOW()
        WHERE id = v_quotation.ticket_id
        AND status != 'closed'
        RETURNING * INTO v_ticket;

        -- Create ticket event for acceptance
        INSERT INTO public.ticket_events (
            ticket_id,
            event_type,
            actor_user_id,
            old_value,
            new_value,
            notes,
            created_at
        ) VALUES (
            v_quotation.ticket_id,
            'customer_quotation_accepted'::ticket_event_type,
            v_actor_id,
            jsonb_build_object('ticket_status', v_old_ticket_status),
            jsonb_build_object(
                'ticket_status', 'closed',
                'close_outcome', 'won',
                'quotation_id', v_quotation.id,
                'quotation_number', v_quotation.quotation_number,
                'quotation_status', 'accepted',
                'deal_value', v_quotation.total_selling_rate,
                'correlation_id', v_correlation_id
            ),
            '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' accepted by customer - Ticket closed as WON',
            NOW()
        );

        -- Create closed event
        INSERT INTO public.ticket_events (
            ticket_id,
            event_type,
            actor_user_id,
            new_value,
            notes,
            created_at
        ) VALUES (
            v_quotation.ticket_id,
            'closed'::ticket_event_type,
            v_actor_id,
            jsonb_build_object(
                'close_outcome', 'won',
                'triggered_by', 'quotation_accepted',
                'correlation_id', v_correlation_id
            ),
            '[' || v_correlation_id || '] Ticket auto-closed due to quotation acceptance',
            NOW()
        );

        -- Update SLA resolution tracking
        UPDATE public.ticket_sla_tracking
        SET
            resolution_at = COALESCE(resolution_at, NOW()),
            updated_at = NOW()
        WHERE ticket_id = v_quotation.ticket_id
        AND resolution_at IS NULL;
    END IF;

    -- 4. UPDATE LEAD (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET
            quotation_status = 'accepted',
            updated_at = NOW()
        WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (if linked) -> accepted
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = 'accepted'::quote_status,
            updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'opportunity_id', v_quotation.opportunity_id,
        'old_stage', v_old_opp_stage,
        'new_stage', 'Closed Won',
        'deal_value', v_quotation.total_selling_rate,
        'ticket_id', v_quotation.ticket_id,
        'ticket_status', COALESCE(v_ticket.status::TEXT, 'closed'),
        'close_outcome', 'won',
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_accepted IS 'Atomically marks quotation as accepted with state machine validation and syncs to opportunity (Closed Won), ticket (closed/won), account (active_account), lead, and operational cost (accepted). Includes idempotency guard and correlation_id for observability.';

-- ============================================
-- 4. ATOMIC RPC: Ticket Request Adjustment
-- For cases where adjustment is requested directly on ticket (not via quotation rejection)
-- Updates ticket -> operational cost in ONE transaction
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
    v_correlation_id TEXT;
    v_is_already_need_adjustment BOOLEAN := FALSE;
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
                'Auto-updated: Rate adjustment requested on ticket',
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

COMMENT ON FUNCTION public.rpc_ticket_request_adjustment IS 'Atomically moves ticket to need_adjustment status with state machine validation and updates linked operational cost to revise_requested. Includes idempotency guard and correlation_id for observability.';

-- ============================================
-- 5. Extend operational_cost_rejection_reason_type enum
-- Add missing reason types for consistency with quotation rejection
-- ============================================

DO $$ BEGIN
    -- Add tarif_tidak_masuk if not exists
    ALTER TYPE operational_cost_rejection_reason_type ADD VALUE IF NOT EXISTS 'tarif_tidak_masuk';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    -- Add kompetitor_lebih_murah if not exists
    ALTER TYPE operational_cost_rejection_reason_type ADD VALUE IF NOT EXISTS 'kompetitor_lebih_murah';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    -- Add budget_customer_tidak_cukup if not exists
    ALTER TYPE operational_cost_rejection_reason_type ADD VALUE IF NOT EXISTS 'budget_customer_tidak_cukup';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 6. Add additional columns to operational_cost_rejection_reasons
-- For storing competitor info when relevant
-- ============================================

DO $$ BEGIN
    ALTER TABLE public.operational_cost_rejection_reasons
        ADD COLUMN IF NOT EXISTS competitor_name TEXT,
        ADD COLUMN IF NOT EXISTS competitor_amount NUMERIC(15, 2),
        ADD COLUMN IF NOT EXISTS customer_budget NUMERIC(15, 2);
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- ============================================
-- 7. GRANT PERMISSIONS
-- ============================================

-- Grant execute on state machine helper functions
GRANT EXECUTE ON FUNCTION public.fn_validate_quotation_transition(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_opportunity_transition(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_ticket_transition(TEXT, TEXT) TO authenticated;

-- Grant execute on atomic RPC functions (with correlation_id parameter)
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_request_adjustment(UUID, operational_cost_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ============================================
-- 8. BACKFILL: Fix existing mismatched data
-- Repair records where quotation.status doesn't match opportunity.stage
-- ============================================

-- 8a. Fix: Quotation 'sent' but opportunity still 'Discovery' or 'Prospecting'
UPDATE public.opportunities o
SET
    stage = 'Quote Sent'::opportunity_stage,
    quotation_status = 'sent',
    updated_at = NOW()
FROM public.customer_quotations cq
WHERE cq.opportunity_id = o.opportunity_id
AND cq.status = 'sent'
AND o.stage IN ('Discovery', 'Prospecting')
AND o.stage NOT IN ('Closed Won', 'Closed Lost', 'Quote Sent', 'Negotiation');

-- 8b. Fix: Quotation 'rejected' but opportunity still 'Quote Sent'
UPDATE public.opportunities o
SET
    stage = 'Negotiation'::opportunity_stage,
    quotation_status = 'rejected',
    updated_at = NOW()
FROM public.customer_quotations cq
WHERE cq.opportunity_id = o.opportunity_id
AND cq.status = 'rejected'
AND o.stage = 'Quote Sent';

-- 8c. Fix: Quotation 'accepted' but opportunity not 'Closed Won'
UPDATE public.opportunities o
SET
    stage = 'Closed Won'::opportunity_stage,
    quotation_status = 'accepted',
    deal_value = COALESCE(o.deal_value, cq.total_selling_rate),
    closed_at = COALESCE(o.closed_at, NOW()),
    updated_at = NOW()
FROM public.customer_quotations cq
WHERE cq.opportunity_id = o.opportunity_id
AND cq.status = 'accepted'
AND o.stage NOT IN ('Closed Won', 'Closed Lost');

-- 8d. Fix: Ticket should be 'waiting_customer' when quotation is 'sent'
UPDATE public.tickets t
SET
    status = 'waiting_customer'::ticket_status,
    pending_response_from = 'creator',
    updated_at = NOW()
FROM public.customer_quotations cq
WHERE cq.ticket_id = t.id
AND cq.status = 'sent'
AND t.status NOT IN ('closed', 'resolved', 'waiting_customer');

-- 8e. Fix: Ticket should be 'need_adjustment' when quotation is 'rejected'
UPDATE public.tickets t
SET
    status = 'need_adjustment'::ticket_status,
    pending_response_from = 'assignee',
    updated_at = NOW()
FROM public.customer_quotations cq
WHERE cq.ticket_id = t.id
AND cq.status = 'rejected'
AND t.status NOT IN ('closed', 'resolved', 'need_adjustment');

-- 8f. Fix: Ticket should be 'closed' when quotation is 'accepted'
UPDATE public.tickets t
SET
    status = 'closed'::ticket_status,
    close_outcome = 'won'::ticket_close_outcome,
    closed_at = COALESCE(t.closed_at, NOW()),
    resolved_at = COALESCE(t.resolved_at, NOW()),
    updated_at = NOW()
FROM public.customer_quotations cq
WHERE cq.ticket_id = t.id
AND cq.status = 'accepted'
AND t.status != 'closed';

-- ============================================
-- SUMMARY OF ATOMIC TRANSITIONS
-- ============================================
--
-- 1. rpc_customer_quotation_mark_sent:
--    - Quotation: draft -> sent
--    - Opportunity: Discovery/Prospecting -> Quote Sent
--    - Ticket: -> waiting_customer
--    - Operational Cost: -> sent_to_customer
--
-- 2. rpc_customer_quotation_mark_rejected:
--    - Quotation: sent -> rejected
--    - Opportunity: Quote Sent/Discovery/Prospecting -> Negotiation
--    - Ticket: -> need_adjustment
--    - Operational Cost: -> revise_requested
--    - Records rejection reason with validation
--
-- 3. rpc_customer_quotation_mark_accepted:
--    - Quotation: sent -> accepted
--    - Opportunity: -> Closed Won
--    - Ticket: -> closed (won)
--    - Account: calon_account -> active_account
--    - Operational Cost: -> accepted
--
-- 4. rpc_ticket_request_adjustment:
--    - Ticket: -> need_adjustment
--    - Operational Cost: -> revise_requested
--    - Opportunity (if linked): Quote Sent -> Negotiation
--    - Records rejection reason
-- ============================================
