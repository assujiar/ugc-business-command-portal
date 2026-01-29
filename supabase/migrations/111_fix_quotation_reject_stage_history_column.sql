-- ============================================
-- Migration: 111_fix_quotation_reject_stage_history_column.sql
--
-- PURPOSE: Fix bug in quotation rejection flow where pipeline_updates
-- and stage_history records are not created.
--
-- ROOT CAUSE:
-- The IF NOT EXISTS check in rpc_customer_quotation_mark_rejected uses
-- osh.created_at but the opportunity_stage_history table has changed_at column.
-- This causes the query to fail, preventing the INSERT from happening.
--
-- FIX:
-- - Change osh.created_at to osh.changed_at in the IF NOT EXISTS check
-- - Keep pu.created_at as-is (pipeline_updates table has created_at)
-- - Keep act.created_at as-is (activities table has created_at)
--
-- IDEMPOTENCY: Safe to re-run (DROP + CREATE)
-- ============================================

-- ============================================
-- PART 0: Drop all existing overloads to prevent "function name is not unique" errors
-- ============================================

DO $$
DECLARE
    v_proc RECORD;
BEGIN
    -- Drop all overloads of rpc_customer_quotation_mark_rejected
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'rpc_customer_quotation_mark_rejected'
    LOOP
        RAISE NOTICE '[111] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;

    -- Drop all overloads of rpc_customer_quotation_mark_sent
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'rpc_customer_quotation_mark_sent'
    LOOP
        RAISE NOTICE '[111] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;

    -- Drop all overloads of rpc_customer_quotation_mark_accepted
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'rpc_customer_quotation_mark_accepted'
    LOOP
        RAISE NOTICE '[111] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;
END $$;

-- ============================================
-- FIX: rpc_customer_quotation_mark_rejected
-- Change osh.created_at to osh.changed_at
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
    v_resolved_opp RECORD;
    v_old_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_new_opp_stage opportunity_stage := NULL;
    v_effective_opportunity_id TEXT := NULL;
    v_actor_id UUID;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_pipeline_updated BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
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
    SELECT cq.* INTO v_quotation
    FROM public.customer_quotations cq
    WHERE cq.id = p_quotation_id
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
    UPDATE public.customer_quotations cq_upd
    SET
        status = 'rejected'::customer_quotation_status,
        rejection_reason = p_reason_type::TEXT,
        updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id
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

    -- 3. RESOLVE OPPORTUNITY (with auto-creation if needed)
    SELECT resolved.* INTO v_resolved_opp
    FROM public.fn_resolve_or_create_opportunity(p_quotation_id, v_actor_id) resolved;

    IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
        v_effective_opportunity_id := v_resolved_opp.opportunity_id;

        -- Fetch full opportunity record
        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        -- Refresh quotation to get updated opportunity_id
        SELECT cq.* INTO v_quotation
        FROM public.customer_quotations cq
        WHERE cq.id = p_quotation_id;
    END IF;

    IF v_opportunity IS NOT NULL THEN
        v_old_opp_stage := v_opportunity.stage;

        -- Transition to Negotiation if in Quote Sent, Discovery, or Prospecting
        IF v_opportunity.stage IN ('Quote Sent', 'Discovery', 'Prospecting') THEN
            UPDATE public.opportunities opp_upd
            SET
                stage = 'Negotiation'::opportunity_stage,
                quotation_status = 'rejected',
                competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id
            RETURNING * INTO v_opportunity;

            v_new_opp_stage := 'Negotiation'::opportunity_stage;
            v_pipeline_updated := TRUE;

            -- Prepare messages for audit records
            v_activity_subject := 'Auto: Quotation Rejected → Stage moved to Negotiation';
            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT || '. Pipeline stage auto-updated for re-negotiation.';
            v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' rejected - moved to negotiation. Reason: ' || p_reason_type::TEXT;

            -- ============================================
            -- FIX: Use changed_at instead of created_at for opportunity_stage_history
            -- The opportunity_stage_history table has changed_at, not created_at
            -- ============================================
            IF NOT EXISTS (
                SELECT 1 FROM public.opportunity_stage_history osh
                WHERE osh.opportunity_id = v_effective_opportunity_id
                AND osh.new_stage = 'Negotiation'::opportunity_stage
                AND osh.from_stage = v_old_opp_stage
                AND osh.changed_at > NOW() - INTERVAL '1 minute'
            ) THEN
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
                    v_effective_opportunity_id,
                    v_old_opp_stage,
                    'Negotiation'::opportunity_stage,
                    v_actor_id,
                    'quotation_rejected',
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    v_old_opp_stage,
                    'Negotiation'::opportunity_stage
                );
                v_stage_history_inserted := TRUE;
            END IF;

            -- Insert pipeline_updates (idempotent)
            -- pipeline_updates table HAS created_at column, so this is correct
            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.new_stage = 'Negotiation'::opportunity_stage
                AND pu.old_stage = v_old_opp_stage
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (
                    opportunity_id,
                    notes,
                    approach_method,
                    old_stage,
                    new_stage,
                    updated_by,
                    updated_at
                ) VALUES (
                    v_effective_opportunity_id,
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    'Email'::approach_method,
                    v_old_opp_stage,
                    'Negotiation'::opportunity_stage,
                    v_actor_id,
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;
            END IF;

            -- Insert activity record (idempotent)
            -- activities table HAS created_at column, so this is correct
            IF NOT EXISTS (
                SELECT 1 FROM public.activities act
                WHERE act.related_opportunity_id = v_effective_opportunity_id
                AND act.subject = v_activity_subject
                AND act.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
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
                ) VALUES (
                    'Note'::activity_type_v2,
                    v_activity_subject,
                    '[' || v_correlation_id || '] ' || v_activity_description,
                    'Completed'::activity_status,
                    CURRENT_DATE,
                    NOW(),
                    v_effective_opportunity_id,
                    v_quotation.lead_id,
                    COALESCE(v_actor_id, v_quotation.created_by),
                    COALESCE(v_actor_id, v_quotation.created_by)
                );
                v_activities_inserted := TRUE;
            END IF;
        ELSIF v_opportunity.stage = 'Negotiation' THEN
            -- Already in Negotiation, still update quotation_status and create activity
            UPDATE public.opportunities opp_upd
            SET
                quotation_status = 'rejected',
                competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

            -- Create activity for visibility even without stage change
            v_activity_subject := 'Quotation Rejected (Already in Negotiation)';
            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT || '. Opportunity already in Negotiation stage.';

            IF NOT EXISTS (
                SELECT 1 FROM public.activities act
                WHERE act.related_opportunity_id = v_effective_opportunity_id
                AND act.subject = v_activity_subject
                AND act.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
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
                ) VALUES (
                    'Note'::activity_type_v2,
                    v_activity_subject,
                    '[' || v_correlation_id || '] ' || v_activity_description,
                    'Completed'::activity_status,
                    CURRENT_DATE,
                    NOW(),
                    v_effective_opportunity_id,
                    v_quotation.lead_id,
                    COALESCE(v_actor_id, v_quotation.created_by),
                    COALESCE(v_actor_id, v_quotation.created_by)
                );
                v_activities_inserted := TRUE;
            END IF;

            v_pipeline_updated := TRUE;
        ELSE
            -- Just update quotation status, don't change stage if already past Negotiation
            UPDATE public.opportunities opp_upd
            SET
                quotation_status = 'rejected',
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
        END IF;
    END IF;

    -- 4. UPDATE TICKET STATUS (if linked) -> need_adjustment
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.status INTO v_old_ticket_status
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        FOR UPDATE;

        -- Update ticket to need_adjustment
        UPDATE public.tickets t_upd
        SET
            status = 'need_adjustment'::ticket_status,
            pending_response_from = 'assignee',
            updated_at = NOW()
        WHERE t_upd.id = v_quotation.ticket_id
        AND t_upd.status NOT IN ('closed', 'resolved')
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
        UPDATE public.leads ld
        SET
            quotation_status = 'rejected',
            updated_at = NOW()
        WHERE ld.lead_id = v_quotation.lead_id;
    END IF;

    -- 6. UPDATE OPERATIONAL COST (if linked) -> revise_requested
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'revise_requested'::quote_status,
            updated_at = NOW()
        WHERE trq.id = v_quotation.operational_cost_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'rejection_reason', p_reason_type::TEXT,
        'opportunity_id', COALESCE(v_effective_opportunity_id, v_quotation.opportunity_id),
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
        'ticket_id', v_quotation.ticket_id,
        'ticket_status', COALESCE(v_ticket.status::TEXT, v_old_ticket_status::TEXT),
        'pipeline_updated', v_pipeline_updated,
        'stage_history_inserted', v_stage_history_inserted,
        'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_rejected IS
'Atomically marks quotation as rejected with state machine validation and syncs to opportunity (Negotiation), ticket (need_adjustment), lead, and operational cost.

FIX in migration 111:
- Changed osh.created_at to osh.changed_at (opportunity_stage_history uses changed_at, not created_at)
- Added detailed return values: stage_history_inserted, pipeline_updates_inserted, activities_inserted
- All column references fully qualified to avoid ambiguity errors.';

-- ============================================
-- Also fix rpc_customer_quotation_mark_sent for consistency
-- Same bug exists there
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_mark_sent(
    p_quotation_id UUID,
    p_sent_via TEXT,
    p_sent_to TEXT,
    p_actor_user_id UUID,
    p_correlation_id TEXT DEFAULT NULL,
    p_allow_autocreate BOOLEAN DEFAULT TRUE
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_ticket RECORD;
    v_lead RECORD;
    v_resolved_opp RECORD;
    v_old_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_new_opp_stage opportunity_stage := NULL;
    v_effective_opportunity_id TEXT := NULL;
    v_is_resend BOOLEAN := FALSE;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_pipeline_updated BOOLEAN := FALSE;
    v_opportunity_auto_created BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    -- Start by locking the quotation
    SELECT cq.* INTO v_quotation
    FROM public.customer_quotations cq
    WHERE cq.id = p_quotation_id
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
    UPDATE public.customer_quotations cq_upd
    SET
        status = 'sent'::customer_quotation_status,
        sent_via = COALESCE(p_sent_via, cq_upd.sent_via),
        sent_to = COALESCE(p_sent_to, cq_upd.sent_to),
        sent_at = COALESCE(cq_upd.sent_at, NOW()),
        updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. RESOLVE OPPORTUNITY (with auto-creation if needed) - skip on resend
    IF NOT v_is_resend THEN
        -- Use the helper function to resolve/create opportunity
        -- Pass p_allow_autocreate to control whether new opportunities can be created
        SELECT resolved.* INTO v_resolved_opp
        FROM public.fn_resolve_or_create_opportunity(p_quotation_id, p_actor_user_id, p_allow_autocreate) resolved;

        -- Check if there was an error (e.g., orphan opportunity, autocreate not allowed)
        IF v_resolved_opp.error_code IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', COALESCE(v_resolved_opp.error_message, 'Failed to resolve opportunity'),
                'error_code', v_resolved_opp.error_code,
                'quotation_id', v_quotation.id,
                'quotation_number', v_quotation.quotation_number,
                'correlation_id', v_correlation_id
            );
        END IF;

        IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_resolved_opp.opportunity_id;
            v_opportunity_auto_created := v_resolved_opp.was_created;

            -- Fetch full opportunity record
            SELECT opp.* INTO v_opportunity
            FROM public.opportunities opp
            WHERE opp.opportunity_id = v_effective_opportunity_id
            FOR UPDATE;

            -- Refresh quotation to get updated opportunity_id
            SELECT cq.* INTO v_quotation
            FROM public.customer_quotations cq
            WHERE cq.id = p_quotation_id;
        END IF;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- FIX: Include 'Negotiation' for revised quotations after rejection
            IF v_opportunity.stage IN ('Prospecting', 'Discovery', 'Negotiation') THEN
                UPDATE public.opportunities opp_upd
                SET
                    stage = 'Quote Sent'::opportunity_stage,
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    quotation_count = COALESCE(opp_upd.quotation_count, 0) + 1,
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Quote Sent'::opportunity_stage;
                v_pipeline_updated := TRUE;

                -- Prepare messages for audit records
                v_activity_subject := 'Auto: Quotation Sent → Stage moved to Quote Sent';
                v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system') || '. Pipeline stage auto-updated.';
                v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system');

                -- ============================================
                -- FIX: Use changed_at instead of created_at for opportunity_stage_history
                -- ============================================
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.new_stage = 'Quote Sent'::opportunity_stage
                    AND osh.from_stage = v_old_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (
                        opportunity_id,
                        from_stage,
                        to_stage,
                        changed_by,
                        notes,
                        old_stage,
                        new_stage
                    ) VALUES (
                        v_effective_opportunity_id,
                        v_old_opp_stage,
                        'Quote Sent'::opportunity_stage,
                        p_actor_user_id,
                        '[' || v_correlation_id || '] ' || v_pipeline_notes,
                        v_old_opp_stage,
                        'Quote Sent'::opportunity_stage
                    );
                    v_stage_history_inserted := TRUE;
                END IF;

                -- Insert pipeline_updates (idempotent)
                IF NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates pu
                    WHERE pu.opportunity_id = v_effective_opportunity_id
                    AND pu.new_stage = 'Quote Sent'::opportunity_stage
                    AND pu.old_stage = v_old_opp_stage
                    AND pu.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.pipeline_updates (
                        opportunity_id,
                        notes,
                        approach_method,
                        old_stage,
                        new_stage,
                        updated_by,
                        updated_at
                    ) VALUES (
                        v_effective_opportunity_id,
                        '[' || v_correlation_id || '] ' || v_pipeline_notes,
                        'Email'::approach_method,
                        v_old_opp_stage,
                        'Quote Sent'::opportunity_stage,
                        p_actor_user_id,
                        NOW()
                    );
                    v_pipeline_updates_inserted := TRUE;
                END IF;

                -- Insert activity record (idempotent)
                IF NOT EXISTS (
                    SELECT 1 FROM public.activities act
                    WHERE act.related_opportunity_id = v_effective_opportunity_id
                    AND act.subject = v_activity_subject
                    AND act.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
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
                    ) VALUES (
                        'Note'::activity_type_v2,
                        v_activity_subject,
                        '[' || v_correlation_id || '] ' || v_activity_description,
                        'Completed'::activity_status,
                        CURRENT_DATE,
                        NOW(),
                        v_effective_opportunity_id,
                        v_quotation.lead_id,
                        COALESCE(p_actor_user_id, v_quotation.created_by),
                        COALESCE(p_actor_user_id, v_quotation.created_by)
                    );
                    v_activities_inserted := TRUE;
                END IF;
            ELSE
                -- Just update quotation status on opportunity, don't change stage
                UPDATE public.opportunities opp_upd
                SET
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
            END IF;
        END IF;
    END IF;

    -- 3. UPDATE TICKET STATUS (if linked)
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.status INTO v_old_ticket_status
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        FOR UPDATE;

        -- Update ticket to waiting_customer (Cost sent, awaiting feedback) - idempotent
        UPDATE public.tickets t_upd
        SET
            status = 'waiting_customer'::ticket_status,
            pending_response_from = 'creator',
            updated_at = NOW()
        WHERE t_upd.id = v_quotation.ticket_id
        AND t_upd.status NOT IN ('closed', 'resolved', 'waiting_customer')
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

    -- 4. UPDATE LEAD (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        IF v_is_resend THEN
            UPDATE public.leads ld
            SET
                quotation_status = 'sent',
                latest_quotation_id = v_quotation.id,
                updated_at = NOW()
            WHERE ld.lead_id = v_quotation.lead_id;
        ELSE
            UPDATE public.leads ld
            SET
                quotation_status = 'sent',
                latest_quotation_id = v_quotation.id,
                quotation_count = COALESCE(ld.quotation_count, 0) + 1,
                updated_at = NOW()
            WHERE ld.lead_id = v_quotation.lead_id;
        END IF;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (if linked)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'sent_to_customer'::quote_status,
            updated_at = NOW()
        WHERE trq.id = v_quotation.operational_cost_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'opportunity_id', COALESCE(v_effective_opportunity_id, v_quotation.opportunity_id),
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
        'ticket_id', v_quotation.ticket_id,
        'ticket_status', v_ticket.status,
        'is_resend', v_is_resend,
        'pipeline_updated', v_pipeline_updated,
        'opportunity_auto_created', v_opportunity_auto_created,
        'stage_history_inserted', v_stage_history_inserted,
        'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS
'Atomically marks quotation as sent and syncs to opportunity (Quote Sent), ticket (waiting_customer), lead, and operational cost.

FIX in migration 111:
- Changed osh.created_at to osh.changed_at (opportunity_stage_history uses changed_at, not created_at)
- Added detailed return values: stage_history_inserted, pipeline_updates_inserted, activities_inserted
- All column references fully qualified to avoid ambiguity errors.';

-- ============================================
-- Also fix rpc_customer_quotation_mark_accepted for consistency
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
    v_new_opp_stage opportunity_stage := NULL;
    v_actor_id UUID;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_derived_opportunity_id UUID := NULL;
    v_effective_opportunity_id UUID := NULL;
    v_stage_changed BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
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

    -- AUTHORIZATION: Check if actor can accept this quotation
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'accept');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
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

    -- ============================================
    -- Enhanced opportunity_id derivation
    -- Chain: quotation.opportunity_id -> lead.opportunity_id -> ticket.opportunity_id
    -- ============================================

    -- Start with quotation's direct opportunity_id
    v_effective_opportunity_id := v_quotation.opportunity_id;

    -- Try to derive from lead if quotation has lead_id
    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id
        FROM public.leads
        WHERE lead_id = v_quotation.lead_id
        AND opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
        END IF;
    END IF;

    -- Try to derive from ticket if quotation has ticket_id
    IF v_effective_opportunity_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        AND opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
        END IF;
    END IF;

    -- 1. UPDATE QUOTATION STATUS
    -- Also update opportunity_id if derived
    UPDATE public.customer_quotations
    SET
        status = 'accepted'::customer_quotation_status,
        opportunity_id = COALESCE(v_effective_opportunity_id, opportunity_id),
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. UPDATE OPPORTUNITY STAGE -> Closed Won
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_effective_opportunity_id
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
                WHERE opportunity_id = v_effective_opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Closed Won'::opportunity_stage;
                v_stage_changed := TRUE;

                -- ============================================
                -- FIX: Use changed_at instead of created_at for opportunity_stage_history
                -- ============================================
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.new_stage = 'Closed Won'::opportunity_stage
                    AND osh.from_stage = v_old_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
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
                        v_effective_opportunity_id,
                        v_old_opp_stage,
                        'Closed Won'::opportunity_stage,
                        v_actor_id,
                        'quotation_accepted',
                        '[' || v_correlation_id || '] Auto-closed: Customer accepted quotation ' || v_quotation.quotation_number || '. Deal value: ' || COALESCE(v_quotation.total_selling_rate::TEXT, 'N/A'),
                        v_old_opp_stage,
                        'Closed Won'::opportunity_stage
                    );
                    v_stage_history_inserted := TRUE;
                END IF;

                -- Insert pipeline_updates
                IF NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates pu
                    WHERE pu.opportunity_id = v_effective_opportunity_id
                    AND pu.new_stage = 'Closed Won'::opportunity_stage
                    AND pu.old_stage = v_old_opp_stage
                    AND pu.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.pipeline_updates (
                        opportunity_id,
                        notes,
                        approach_method,
                        old_stage,
                        new_stage,
                        updated_by,
                        updated_at
                    ) VALUES (
                        v_effective_opportunity_id,
                        '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' accepted. Deal closed successfully! Value: ' || COALESCE(v_quotation.total_selling_rate::TEXT, 'N/A') || ' ' || COALESCE(v_quotation.currency, 'IDR'),
                        'Email'::approach_method,
                        v_old_opp_stage,
                        'Closed Won'::opportunity_stage,
                        v_actor_id,
                        NOW()
                    );
                    v_pipeline_updates_inserted := TRUE;
                END IF;

                -- Insert activities
                IF NOT EXISTS (
                    SELECT 1 FROM public.activities act
                    WHERE act.related_opportunity_id = v_effective_opportunity_id
                    AND act.subject LIKE '%' || v_quotation.quotation_number || '%'
                    AND act.subject LIKE '%Accepted%'
                    AND act.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
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
                    ) VALUES (
                        'Note'::activity_type_v2,
                        'Deal Won - Quotation ' || v_quotation.quotation_number || ' Accepted',
                        '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' accepted by customer. Deal closed successfully! Value: ' || COALESCE(v_quotation.total_selling_rate::TEXT, 'N/A') || ' ' || COALESCE(v_quotation.currency, 'IDR'),
                        'Completed'::activity_status,
                        CURRENT_DATE,
                        NOW(),
                        v_effective_opportunity_id,
                        v_quotation.lead_id,
                        v_actor_id,
                        v_actor_id
                    );
                    v_activities_inserted := TRUE;
                END IF;

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
                WHERE opportunity_id = v_effective_opportunity_id;
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

        -- Record response exchange for SLA tracking
        BEGIN
            PERFORM public.record_response_exchange(
                v_quotation.ticket_id,
                v_actor_id,
                NULL  -- No comment_id for this action
            );
        EXCEPTION
            WHEN OTHERS THEN
                -- Log but don't fail the main transaction
                RAISE WARNING 'Failed to record response exchange: %', SQLERRM;
        END;
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
        'opportunity_id', v_effective_opportunity_id,
        'derived_opportunity_id', v_derived_opportunity_id,
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
        'stage_changed', v_stage_changed,
        'deal_value', v_quotation.total_selling_rate,
        'ticket_id', v_quotation.ticket_id,
        'ticket_status', COALESCE(v_ticket.status::TEXT, 'closed'),
        'close_outcome', 'won',
        'stage_history_inserted', v_stage_history_inserted,
        'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_accepted IS
'Atomically marks quotation as accepted and closes the deal.

FIX in migration 111:
- Changed osh.created_at to osh.changed_at (opportunity_stage_history uses changed_at, not created_at)
- Added detailed return values: stage_history_inserted, pipeline_updates_inserted, activities_inserted

Syncs to opportunity (Closed Won), ticket (closed/won), account (active_account),
lead, and operational cost (accepted).
Includes state machine validation and correlation_id for observability.';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- Fixed bug where pipeline_updates and stage_history records were not created
-- when quotation was rejected/sent/accepted.
--
-- ROOT CAUSE:
-- The IF NOT EXISTS check used osh.created_at but the opportunity_stage_history
-- table has changed_at column (not created_at). This caused the query to fail.
--
-- FIX:
-- Changed osh.created_at to osh.changed_at in all three RPC functions:
-- - rpc_customer_quotation_mark_rejected
-- - rpc_customer_quotation_mark_sent
-- - rpc_customer_quotation_mark_accepted
--
-- Also added detailed return values to help diagnose future issues:
-- - stage_history_inserted: TRUE if stage history record was created
-- - pipeline_updates_inserted: TRUE if pipeline update record was created
-- - activities_inserted: TRUE if activity record was created
-- ============================================
