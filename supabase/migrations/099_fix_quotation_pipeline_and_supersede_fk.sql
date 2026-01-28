-- ============================================
-- Migration: 099_fix_quotation_pipeline_and_supersede_fk.sql
--
-- PURPOSE: Fix two critical issues:
--
-- ISSUE 1: Pipeline updates not created when quotation sent/rejected
-- ROOT CAUSE: The condition for creating pipeline_updates only checks for
-- 'Prospecting' or 'Discovery' stages. When a revised quotation is sent after
-- rejection (opportunity in 'Negotiation'), pipeline_updates are not created.
--
-- FIX: Extend the stage conditions to include 'Negotiation' for send,
-- and ensure pipeline_updates are created when stage actually changes.
--
-- ISSUE 2: Foreign key constraint violation on superseded_by_id
-- ROOT CAUSE: The BEFORE INSERT trigger in migration 097 tries to set
-- superseded_by_id = NEW.id before the new row is committed. The FK constraint
-- fails because NEW.id doesn't exist yet in the table.
--
-- FIX: Split into BEFORE INSERT (just set is_current=FALSE) and AFTER INSERT
-- (set superseded_by_id on old records) triggers.
--
-- IDEMPOTENCY: Safe to re-run
-- ============================================

-- ============================================
-- PART 1: FIX SUPERSEDE TRIGGER - Split into BEFORE and AFTER
-- ============================================

-- Drop the old trigger first
DROP TRIGGER IF EXISTS trg_supersede_previous_quotes ON public.ticket_rate_quotes;

-- BEFORE INSERT: Only mark old quotes as NOT current (don't set superseded_by_id yet)
CREATE OR REPLACE FUNCTION public.fn_supersede_previous_quotes_before()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_current = TRUE AND NEW.ticket_id IS NOT NULL THEN
        -- Advisory lock to serialize per-ticket inserts (prevents race conditions)
        PERFORM pg_advisory_xact_lock(hashtext(NEW.ticket_id::text)::bigint);

        -- Mark all previous current quotes for this ticket as NOT current
        -- NOTE: We don't set superseded_by_id here because NEW.id doesn't exist yet
        UPDATE public.ticket_rate_quotes
        SET
            is_current = FALSE,
            superseded_at = NOW(),
            updated_at = NOW()
        WHERE ticket_id = NEW.ticket_id
        AND is_current = TRUE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_supersede_previous_quotes_before IS
'BEFORE INSERT trigger that marks previous current quotes as is_current=FALSE.
Uses advisory lock to prevent race conditions. Does NOT set superseded_by_id
(that happens in AFTER INSERT trigger).';

CREATE TRIGGER trg_supersede_previous_quotes_before
    BEFORE INSERT ON public.ticket_rate_quotes
    FOR EACH ROW
    WHEN (NEW.is_current = TRUE)
    EXECUTE FUNCTION public.fn_supersede_previous_quotes_before();

-- AFTER INSERT: Now set superseded_by_id on old records (NEW.id exists now)
CREATE OR REPLACE FUNCTION public.fn_supersede_previous_quotes_after()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_current = TRUE AND NEW.ticket_id IS NOT NULL THEN
        -- Now NEW.id exists, so we can safely set the FK reference
        UPDATE public.ticket_rate_quotes
        SET superseded_by_id = NEW.id
        WHERE ticket_id = NEW.ticket_id
        AND is_current = FALSE
        AND superseded_by_id IS NULL
        AND superseded_at IS NOT NULL
        AND id != NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_supersede_previous_quotes_after IS
'AFTER INSERT trigger that sets superseded_by_id on old quotes to reference the new quote.
Runs after the INSERT so NEW.id is valid for FK constraint.';

DROP TRIGGER IF EXISTS trg_supersede_previous_quotes_after ON public.ticket_rate_quotes;
CREATE TRIGGER trg_supersede_previous_quotes_after
    AFTER INSERT ON public.ticket_rate_quotes
    FOR EACH ROW
    WHEN (NEW.is_current = TRUE)
    EXECUTE FUNCTION public.fn_supersede_previous_quotes_after();

-- ============================================
-- PART 2: FIX rpc_customer_quotation_mark_sent
-- Extend stage condition to include 'Negotiation' for revised quotations
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
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_pipeline_updated BOOLEAN := FALSE;
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

    -- AUTHORIZATION: Check if actor can send this quotation
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, p_actor_user_id, 'send');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
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

            -- FIX: Include 'Negotiation' for revised quotations after rejection
            IF v_opportunity.stage IN ('Prospecting', 'Discovery', 'Negotiation') THEN
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
                v_pipeline_updated := TRUE;

                -- Prepare messages for audit records
                v_activity_subject := 'Auto: Quotation Sent → Stage moved to Quote Sent';
                v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system') || '. Pipeline stage auto-updated.';
                v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system');

                -- Create stage history entry (AUDIT TRAIL - only on first send)
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    from_stage,
                    to_stage,
                    changed_by,
                    notes,
                    old_stage,
                    new_stage
                )
                SELECT
                    v_quotation.opportunity_id,
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage,
                    p_actor_user_id,
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history
                    WHERE opportunity_id = v_quotation.opportunity_id
                    AND new_stage = 'Quote Sent'::opportunity_stage
                    AND from_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Insert pipeline_updates (idempotent with NOT EXISTS guard)
                INSERT INTO public.pipeline_updates (
                    opportunity_id,
                    notes,
                    approach_method,
                    old_stage,
                    new_stage,
                    updated_by,
                    updated_at
                )
                SELECT
                    v_quotation.opportunity_id,
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    'Email'::approach_method,
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage,
                    p_actor_user_id,
                    NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates
                    WHERE opportunity_id = v_quotation.opportunity_id
                    AND new_stage = 'Quote Sent'::opportunity_stage
                    AND old_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Insert activity record (idempotent with NOT EXISTS guard)
                INSERT INTO public.activities (
                    activity_type,
                    subject,
                    description,
                    status,
                    due_date,
                    completed_at,
                    related_opportunity_id,
                    related_lead_id,
                    owner_user_id,
                    created_by
                )
                SELECT
                    'Note'::activity_type_v2,
                    v_activity_subject,
                    '[' || v_correlation_id || '] ' || v_activity_description,
                    'Completed'::activity_status,
                    CURRENT_DATE,
                    NOW(),
                    v_quotation.opportunity_id,
                    v_quotation.lead_id,
                    COALESCE(p_actor_user_id, v_quotation.created_by),
                    COALESCE(p_actor_user_id, v_quotation.created_by)
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.activities
                    WHERE related_opportunity_id = v_quotation.opportunity_id
                    AND subject = v_activity_subject
                    AND created_at > NOW() - INTERVAL '1 minute'
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
        'pipeline_updates_created', v_pipeline_updated,
        'activities_created', v_pipeline_updated,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS 'Atomically marks quotation as sent and syncs to opportunity (Quote Sent), ticket (waiting_customer), lead, and operational cost in a single transaction. Now includes Negotiation stage for revised quotations. Creates pipeline_updates and activities records. Includes state machine validation and correlation_id for observability.';

-- ============================================
-- PART 3: FIX rpc_customer_quotation_mark_rejected
-- Include 'Negotiation' stage for proper handling
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
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_is_already_rejected BOOLEAN := FALSE;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_pipeline_updated BOOLEAN := FALSE;
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

    -- AUTHORIZATION: Check if actor can reject this quotation
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'reject');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
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
            -- If already in Negotiation, still create pipeline_updates for visibility
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
                v_pipeline_updated := TRUE;

                -- Prepare messages for audit records
                v_activity_subject := 'Auto: Quotation Rejected → Stage moved to Negotiation';
                v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT || '. Pipeline stage auto-updated for re-negotiation.';
                v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' rejected - moved to negotiation. Reason: ' || p_reason_type::TEXT;

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
                )
                SELECT
                    v_quotation.opportunity_id,
                    v_old_opp_stage,
                    'Negotiation'::opportunity_stage,
                    v_actor_id,
                    'quotation_rejected',
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    v_old_opp_stage,
                    'Negotiation'::opportunity_stage
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history
                    WHERE opportunity_id = v_quotation.opportunity_id
                    AND new_stage = 'Negotiation'::opportunity_stage
                    AND from_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Insert pipeline_updates (idempotent)
                INSERT INTO public.pipeline_updates (
                    opportunity_id,
                    notes,
                    approach_method,
                    old_stage,
                    new_stage,
                    updated_by,
                    updated_at
                )
                SELECT
                    v_quotation.opportunity_id,
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    'Email'::approach_method,
                    v_old_opp_stage,
                    'Negotiation'::opportunity_stage,
                    v_actor_id,
                    NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates
                    WHERE opportunity_id = v_quotation.opportunity_id
                    AND new_stage = 'Negotiation'::opportunity_stage
                    AND old_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Insert activity record (idempotent)
                INSERT INTO public.activities (
                    activity_type,
                    subject,
                    description,
                    status,
                    due_date,
                    completed_at,
                    related_opportunity_id,
                    related_lead_id,
                    owner_user_id,
                    created_by
                )
                SELECT
                    'Note'::activity_type_v2,
                    v_activity_subject,
                    '[' || v_correlation_id || '] ' || v_activity_description,
                    'Completed'::activity_status,
                    CURRENT_DATE,
                    NOW(),
                    v_quotation.opportunity_id,
                    v_quotation.lead_id,
                    COALESCE(v_actor_id, v_quotation.created_by),
                    COALESCE(v_actor_id, v_quotation.created_by)
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.activities
                    WHERE related_opportunity_id = v_quotation.opportunity_id
                    AND subject = v_activity_subject
                    AND created_at > NOW() - INTERVAL '1 minute'
                );
            ELSIF v_opportunity.stage = 'Negotiation' THEN
                -- Already in Negotiation, still update quotation_status and create activity
                UPDATE public.opportunities
                SET
                    quotation_status = 'rejected',
                    competitor = COALESCE(p_competitor_name, competitor),
                    competitor_price = COALESCE(p_competitor_amount, competitor_price),
                    customer_budget = COALESCE(p_customer_budget, customer_budget),
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;

                -- Create activity for visibility even without stage change
                v_activity_subject := 'Quotation Rejected (Already in Negotiation)';
                v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT || '. Opportunity already in Negotiation stage.';

                INSERT INTO public.activities (
                    activity_type,
                    subject,
                    description,
                    status,
                    due_date,
                    completed_at,
                    related_opportunity_id,
                    related_lead_id,
                    owner_user_id,
                    created_by
                )
                SELECT
                    'Note'::activity_type_v2,
                    v_activity_subject,
                    '[' || v_correlation_id || '] ' || v_activity_description,
                    'Completed'::activity_status,
                    CURRENT_DATE,
                    NOW(),
                    v_quotation.opportunity_id,
                    v_quotation.lead_id,
                    COALESCE(v_actor_id, v_quotation.created_by),
                    COALESCE(v_actor_id, v_quotation.created_by)
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.activities
                    WHERE related_opportunity_id = v_quotation.opportunity_id
                    AND subject = v_activity_subject
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                v_pipeline_updated := TRUE;  -- Activity was created
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
        'pipeline_updates_created', v_pipeline_updated,
        'activities_created', v_pipeline_updated,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_rejected IS 'Atomically marks quotation as rejected with state machine validation, records rejection reason, and syncs to opportunity (Negotiation), ticket (need_adjustment), lead, and operational cost (revise_requested). Creates pipeline_updates and activities records. Includes idempotency guard and correlation_id for observability.';

-- ============================================
-- PART 4: GRANT PERMISSIONS (re-grant to ensure)
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- Fixed Issue 1: Pipeline updates not created for revised quotations
--   - rpc_customer_quotation_mark_sent: Now includes 'Negotiation' stage
--   - rpc_customer_quotation_mark_rejected: Creates activity even when already in Negotiation
--
-- Fixed Issue 2: Foreign key constraint on superseded_by_id
--   - Split trigger into BEFORE (is_current=FALSE) and AFTER (set superseded_by_id)
--   - BEFORE INSERT: Only sets is_current=FALSE on old quotes
--   - AFTER INSERT: Sets superseded_by_id on old quotes (NEW.id now exists)
-- ============================================
