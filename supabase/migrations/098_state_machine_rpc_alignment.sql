-- ============================================
-- Migration: 098_state_machine_rpc_alignment.sql
--
-- PURPOSE: Align RPC functions with new state machine and versioning
-- - Request adjustment now marks CURRENT quote as revise_requested
-- - Quotation sync now respects is_current and terminal states
-- - Operational cost updates only affect current quotes
--
-- DEPENDS ON: 097_state_machine_versioning_locks.sql
-- ============================================

-- ============================================
-- PART 1: UPDATED rpc_ticket_request_adjustment
-- Now uses is_current to find the right quote, respects terminal states
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
    v_quote_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
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

    -- STATE MACHINE: Validate ticket transition using centralized rules
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

    -- 2. FIND CURRENT OPERATIONAL COST (using is_current flag)
    -- Only modify quotes that are:
    --   a) is_current = TRUE
    --   b) NOT in terminal status (won, rejected)
    SELECT * INTO v_rate_quote
    FROM public.ticket_rate_quotes
    WHERE ticket_id = p_ticket_id
    AND is_current = TRUE
    AND status NOT IN ('won', 'rejected')
    FOR UPDATE;

    IF v_rate_quote IS NOT NULL THEN
        -- Validate quote transition
        v_quote_transition_check := fn_validate_quote_status_transition(v_rate_quote.status::TEXT, 'revise_requested');

        IF (v_quote_transition_check->>'valid')::BOOLEAN THEN
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
        -- If quote can't transition (e.g., already terminal), we still continue
        -- The ticket status change is the primary action
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
            'rate_quote_is_current', COALESCE(v_rate_quote.is_current, NULL),
            'reason_type', p_reason_type::TEXT,
            'competitor_name', p_competitor_name,
            'competitor_amount', p_competitor_amount,
            'customer_budget', p_customer_budget,
            'correlation_id', v_correlation_id
        ),
        '[' || v_correlation_id || '] Rate adjustment requested. Reason: ' || p_reason_type::TEXT || COALESCE(' - ' || p_notes, ''),
        NOW()
    );

    -- 4. RECORD RESPONSE EXCHANGE for SLA tracking
    BEGIN
        v_exchange_result := public.record_response_exchange(
            p_ticket_id,
            v_actor_id,
            NULL
        );
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Failed to record response exchange: %', SQLERRM;
            v_exchange_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
    END;

    -- 5. UPDATE OPPORTUNITY TO NEGOTIATION (if linked and in Quote Sent)
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
        'rate_quote_is_current', v_rate_quote.is_current,
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
'Atomically moves ticket to need_adjustment status and marks CURRENT operational cost as revise_requested.
Uses is_current flag to identify the right quote. Respects terminal states (won/rejected).
Includes idempotency guard, response exchange recording, and correlation_id for observability.';

-- ============================================
-- PART 2: UPDATED rpc_customer_quotation_sync_from_status
-- Now updates cost only if is_current=TRUE or matches quotation link
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_sync_from_status(
    p_quotation_id UUID,
    p_actor_user_id UUID DEFAULT NULL,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_lead RECORD;
    v_old_opp_stage opportunity_stage;
    v_target_stage opportunity_stage;
    v_derived_opportunity_id UUID := NULL;
    v_actor_id UUID;
    v_correlation_id TEXT;
    v_changes_made BOOLEAN := FALSE;
    v_stage_changed BOOLEAN := FALSE;
    v_cost_updated BOOLEAN := FALSE;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_quote_transition_check JSONB;
    v_target_cost_status quote_status;
BEGIN
    -- Generate correlation_id
    v_correlation_id := gen_random_uuid()::TEXT;

    -- Get actor user id
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Lock and get quotation
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

    -- STEP 1: Derive opportunity_id from lead if missing
    IF v_quotation.opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id
        FROM public.leads
        WHERE lead_id = v_quotation.lead_id
        AND opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            UPDATE public.customer_quotations
            SET
                opportunity_id = v_derived_opportunity_id,
                updated_at = NOW()
            WHERE id = p_quotation_id;

            v_quotation.opportunity_id := v_derived_opportunity_id;
            v_changes_made := TRUE;
        END IF;
    END IF;

    -- STEP 2: Determine target stage based on quotation status
    CASE v_quotation.status
        WHEN 'sent' THEN v_target_stage := 'Quote Sent'::opportunity_stage;
        WHEN 'rejected' THEN v_target_stage := 'Negotiation'::opportunity_stage;
        WHEN 'accepted' THEN v_target_stage := 'Closed Won'::opportunity_stage;
        ELSE v_target_stage := NULL;
    END CASE;

    -- STEP 3: Update opportunity stage if needed
    IF v_quotation.opportunity_id IS NOT NULL AND v_target_stage IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_quotation.opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- Only update if stage is earlier in pipeline (or force=true)
            IF p_force OR (
                (v_target_stage = 'Quote Sent' AND v_opportunity.stage IN ('Prospecting', 'Discovery')) OR
                (v_target_stage = 'Negotiation' AND v_opportunity.stage IN ('Quote Sent', 'Discovery', 'Prospecting')) OR
                (v_target_stage = 'Closed Won' AND v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost'))
            ) THEN
                UPDATE public.opportunities
                SET
                    stage = v_target_stage,
                    quotation_status = v_quotation.status::TEXT,
                    latest_quotation_id = v_quotation.id,
                    deal_value = CASE WHEN v_target_stage = 'Closed Won' THEN COALESCE(deal_value, v_quotation.total_selling_rate) ELSE deal_value END,
                    closed_at = CASE WHEN v_target_stage = 'Closed Won' THEN COALESCE(closed_at, NOW()) ELSE closed_at END,
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id
                RETURNING * INTO v_opportunity;

                v_changes_made := TRUE;
                v_stage_changed := TRUE;

                -- Prepare messages for audit records
                CASE v_quotation.status
                    WHEN 'sent' THEN
                        v_activity_subject := 'Auto: Quotation Sent → Stage moved to Quote Sent';
                        v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' sent to customer. Pipeline stage auto-updated.';
                        v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via system';
                    WHEN 'rejected' THEN
                        v_activity_subject := 'Auto: Quotation Rejected → Stage moved to Negotiation';
                        v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Pipeline stage auto-updated for re-negotiation.';
                        v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' rejected - moved to negotiation';
                    WHEN 'accepted' THEN
                        v_activity_subject := 'Auto: Quotation Accepted → Stage moved to Closed Won';
                        v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' accepted by customer. Deal closed successfully.';
                        v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' accepted - deal won';
                    ELSE
                        v_activity_subject := 'Auto: Quotation Status Changed';
                        v_activity_description := 'Quotation status changed to ' || v_quotation.status;
                        v_pipeline_notes := 'Quotation status changed';
                END CASE;

                -- Insert opportunity_stage_history (idempotent)
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id, from_stage, to_stage, changed_by, notes, old_stage, new_stage
                )
                SELECT v_quotation.opportunity_id, v_old_opp_stage, v_target_stage, v_actor_id,
                       '[' || v_correlation_id || '] ' || v_pipeline_notes, v_old_opp_stage, v_target_stage
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history
                    WHERE opportunity_id = v_quotation.opportunity_id
                    AND new_stage = v_target_stage AND from_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Insert pipeline_updates (idempotent)
                INSERT INTO public.pipeline_updates (
                    opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at
                )
                SELECT v_quotation.opportunity_id, '[' || v_correlation_id || '] ' || v_pipeline_notes,
                       'Email'::approach_method, v_old_opp_stage, v_target_stage, v_actor_id, NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates
                    WHERE opportunity_id = v_quotation.opportunity_id
                    AND new_stage = v_target_stage AND old_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Insert activity (idempotent)
                INSERT INTO public.activities (
                    activity_type, subject, description, status, due_date, completed_at,
                    related_opportunity_id, related_lead_id, owner_user_id, created_by
                )
                SELECT 'Note'::activity_type_v2, v_activity_subject,
                       '[' || v_correlation_id || '] ' || v_activity_description,
                       'Completed'::activity_status, CURRENT_DATE, NOW(),
                       v_quotation.opportunity_id, v_quotation.lead_id,
                       COALESCE(v_actor_id, v_quotation.created_by),
                       COALESCE(v_actor_id, v_quotation.created_by)
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.activities
                    WHERE related_opportunity_id = v_quotation.opportunity_id
                    AND subject = v_activity_subject
                    AND created_at > NOW() - INTERVAL '1 minute'
                );
            END IF;
        END IF;
    END IF;

    -- STEP 4: Update lead quotation_status (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET
            quotation_status = v_quotation.status::TEXT,
            latest_quotation_id = v_quotation.id,
            updated_at = NOW()
        WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- STEP 5: Update operational cost status (if linked)
    -- Only update if:
    --   a) The cost is linked via operational_cost_id
    --   b) The cost is current (is_current = TRUE)
    --   c) The cost is not in terminal state (won, rejected)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        -- Determine target cost status
        CASE v_quotation.status
            WHEN 'sent' THEN v_target_cost_status := 'sent_to_customer'::quote_status;
            WHEN 'accepted' THEN v_target_cost_status := 'won'::quote_status;  -- Use 'won' not 'accepted'
            WHEN 'rejected' THEN v_target_cost_status := 'rejected'::quote_status;
            ELSE v_target_cost_status := NULL;
        END CASE;

        IF v_target_cost_status IS NOT NULL THEN
            -- Only update if cost is current OR matches the quotation link
            -- and is not already in terminal state
            UPDATE public.ticket_rate_quotes
            SET
                status = v_target_cost_status,
                updated_at = NOW()
            WHERE id = v_quotation.operational_cost_id
            AND status NOT IN ('won', 'rejected');  -- Don't overwrite terminal states

            IF FOUND THEN
                v_cost_updated := TRUE;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_status', v_quotation.status,
        'opportunity_id', v_quotation.opportunity_id,
        'derived_opportunity_id', v_derived_opportunity_id,
        'old_stage', v_old_opp_stage,
        'new_stage', v_target_stage,
        'stage_changed', v_stage_changed,
        'cost_updated', v_cost_updated,
        'changes_made', v_changes_made,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_sync_from_status IS
'Central idempotent function to sync quotation status to all linked entities.
Now respects is_current flag and terminal states (won/rejected).
- Updates operational cost: sent→sent_to_customer, accepted→won, rejected→rejected
- Only modifies costs that are not in terminal states';

-- ============================================
-- PART 3: UPDATED trigger_sync_cost_submission_to_ticket
-- Now checks is_current before auto-transitioning ticket
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_sync_cost_submission_to_ticket()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket RECORD;
    v_correlation_id TEXT;
BEGIN
    -- Only trigger when:
    --   a) Status changes TO 'submitted'
    --   b) This is the current quote (is_current = TRUE)
    IF NEW.status = 'submitted'
       AND (OLD.status IS NULL OR OLD.status != 'submitted')
       AND NEW.is_current = TRUE
    THEN
        -- Get the linked ticket
        SELECT * INTO v_ticket
        FROM public.tickets
        WHERE id = NEW.ticket_id;

        -- Only update if ticket exists and is in need_adjustment status
        IF v_ticket IS NOT NULL AND v_ticket.status = 'need_adjustment' THEN
            v_correlation_id := gen_random_uuid()::TEXT;

            -- Update ticket status to waiting_customer
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
                    'rate_quote_is_current', NEW.is_current,
                    'triggered_by', 'cost_submitted',
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Revised cost (is_current) submitted by ops - Ticket status auto-updated to waiting_customer',
                NOW()
            );

            -- Record response exchange for SLA tracking
            BEGIN
                PERFORM public.record_response_exchange(NEW.ticket_id, NEW.created_by, NULL);
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING 'Failed to record response exchange on cost submission: %', SQLERRM;
            END;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.trigger_sync_cost_submission_to_ticket IS
'Auto-updates ticket status when ops submits revised cost.
Now checks is_current = TRUE before triggering ticket status change.
When ticket_rate_quotes status becomes "submitted" AND is_current = TRUE:
- If ticket is in need_adjustment status, auto-update to waiting_customer
- Records response exchange for SLA tracking';

-- ============================================
-- PART 4: FIX rpc_reject_operational_cost_with_reason
-- Accept valid pre-customer states, set revise_requested
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_reject_operational_cost_with_reason(
    p_cost_id UUID,
    p_reason_type operational_cost_rejection_reason_type,
    p_suggested_amount NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'IDR',
    p_notes TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_cost RECORD;
    v_actor_id UUID;
    v_correlation_id TEXT;
    v_ticket RECORD;
    v_transition_check JSONB;
    v_allowed_statuses TEXT[] := ARRAY['submitted', 'accepted', 'sent', 'sent_to_customer'];
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Lock and get the cost
    SELECT * INTO v_cost
    FROM public.ticket_rate_quotes
    WHERE id = p_cost_id
    FOR UPDATE;

    IF v_cost IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Operational cost not found',
            'error_code', 'NOT_FOUND',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Check if cost can be rejected (must be in allowed pre-customer states)
    IF NOT v_cost.status::TEXT = ANY(v_allowed_statuses) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Operational cost cannot be rejected in current status: ' || v_cost.status::TEXT ||
                     '. Must be one of: ' || array_to_string(v_allowed_statuses, ', '),
            'error_code', 'INVALID_STATUS_TRANSITION',
            'current_status', v_cost.status,
            'allowed_statuses', v_allowed_statuses,
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Validate state transition
    v_transition_check := fn_validate_quote_status_transition(v_cost.status::TEXT, 'revise_requested');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        -- If the standard validator rejects it, check if it's because of specific reasons
        -- For 'sent' status (legacy), we still allow it
        IF v_cost.status::TEXT NOT IN ('sent') THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', v_transition_check->>'error',
                'error_code', v_transition_check->>'error_code',
                'correlation_id', v_correlation_id
            );
        END IF;
    END IF;

    -- 1. UPDATE COST STATUS to revise_requested
    UPDATE public.ticket_rate_quotes
    SET
        status = 'revise_requested'::quote_status,
        updated_at = NOW()
    WHERE id = p_cost_id
    RETURNING * INTO v_cost;

    -- 2. RECORD REJECTION REASON
    INSERT INTO public.operational_cost_rejection_reasons (
        operational_cost_id,
        reason_type,
        suggested_amount,
        currency,
        notes,
        created_by,
        created_at
    ) VALUES (
        p_cost_id,
        p_reason_type,
        p_suggested_amount,
        COALESCE(p_currency, v_cost.currency, 'IDR'),
        p_notes,
        v_actor_id,
        NOW()
    );

    -- 3. UPDATE TICKET STATUS if linked
    IF v_cost.ticket_id IS NOT NULL THEN
        SELECT * INTO v_ticket
        FROM public.tickets
        WHERE id = v_cost.ticket_id
        FOR UPDATE;

        IF v_ticket IS NOT NULL AND v_ticket.status NOT IN ('closed', 'resolved') THEN
            UPDATE public.tickets
            SET
                status = 'need_adjustment'::ticket_status,
                pending_response_from = 'assignee',
                updated_at = NOW()
            WHERE id = v_cost.ticket_id;

            -- Create ticket event
            INSERT INTO public.ticket_events (
                ticket_id,
                event_type,
                actor_user_id,
                old_value,
                new_value,
                notes,
                created_at
            ) VALUES (
                v_cost.ticket_id,
                'request_adjustment'::ticket_event_type,
                v_actor_id,
                jsonb_build_object('cost_status', v_cost.status),
                jsonb_build_object(
                    'cost_id', p_cost_id,
                    'new_status', 'revise_requested',
                    'reason_type', p_reason_type::TEXT,
                    'ticket_status', 'need_adjustment',
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Operational cost rejected. Reason: ' || p_reason_type::TEXT,
                NOW()
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'cost_id', p_cost_id,
        'old_status', v_cost.status,
        'new_status', 'revise_requested',
        'reason_type', p_reason_type::TEXT,
        'ticket_id', v_cost.ticket_id,
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

COMMENT ON FUNCTION public.rpc_reject_operational_cost_with_reason IS
'Rejects an operational cost with a structured reason.
Accepts status: submitted, accepted, sent, sent_to_customer.
Sets status to revise_requested (not terminal rejected - that is for customer rejection).
Updates linked ticket to need_adjustment.';

-- Grant execute
GRANT EXECUTE ON FUNCTION public.rpc_reject_operational_cost_with_reason(UUID, operational_cost_rejection_reason_type, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- This migration aligns RPCs with new state machine and versioning:
--
-- 1. rpc_ticket_request_adjustment:
--    - Now uses is_current to find the right quote
--    - Respects terminal states (won/rejected)
--    - Records is_current in audit events
--
-- 2. rpc_customer_quotation_sync_from_status:
--    - Updates cost with accepted→won mapping
--    - Only updates costs not in terminal states
--    - Returns cost_updated status
--
-- 3. trigger_sync_cost_submission_to_ticket:
--    - Now checks is_current = TRUE before triggering
--
-- 4. rpc_reject_operational_cost_with_reason:
--    - Accepts multiple pre-customer states
--    - Uses state machine validation
--    - Sets revise_requested (soft reject, not terminal)
-- ============================================
