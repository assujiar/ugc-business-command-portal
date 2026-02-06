-- ============================================
-- Migration: 136_add_accepted_rejected_at_columns.sql
--
-- PURPOSE: Fix "column accepted_at/rejected_at does not exist" error
--          by adding the missing columns to customer_quotations table
--
-- ROOT CAUSE:
-- The customer_quotations table (migration 050) was created WITHOUT
-- accepted_at and rejected_at columns. However, multiple RPC functions
-- (migrations 131, 133, 134) referenced these columns, causing errors
-- when accepting or rejecting quotations.
--
-- Migration 135 attempted to fix this by removing column references,
-- but the error persisted. This migration takes the definitive approach:
-- ADD the columns that were originally planned (per BLUEPRINT doc).
--
-- CHANGES:
-- 1. ALTER TABLE: Add accepted_at and rejected_at columns
-- 2. BACKFILL: Set timestamps for existing accepted/rejected quotations
-- 3. RECREATE: rpc_customer_quotation_mark_accepted (with all fixes)
-- 4. RECREATE: rpc_customer_quotation_mark_rejected (with all fixes)
-- 5. INDEX: Add index on accepted_at and rejected_at for query performance
--
-- FIXES INCLUDED:
-- - accepted_at / rejected_at columns now exist (fixes column not found)
-- - opportunity_id variables are TEXT, not UUID (fixes uuid parse error)
-- - v_return_ticket_status safe variable (fixes v_ticket not assigned)
-- - pipeline_updates: uses correct columns (approach_method, old_stage, new_stage)
-- - quotation_rejection_reasons: correct table name (not customer_quotation_)
-- - opportunities: uses estimated_value (not expected_value), closed_at (not close_date)
-- - accounts: uses account_status column (not status)
-- - tickets: removed non-existent closed_by column
-- - pending_response_from: uses 'assignee' (not 'ops' which is not in enum)
-- ============================================


-- ============================================
-- 1. ADD MISSING COLUMNS
-- ============================================

ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;


-- ============================================
-- 2. BACKFILL EXISTING DATA
-- ============================================

-- For quotations already accepted, set accepted_at = updated_at
UPDATE public.customer_quotations
SET accepted_at = updated_at
WHERE status = 'accepted'
AND accepted_at IS NULL;

-- For quotations already rejected, set rejected_at = updated_at
UPDATE public.customer_quotations
SET rejected_at = updated_at
WHERE status = 'rejected'
AND rejected_at IS NULL;


-- ============================================
-- 3. ADD INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_customer_quotations_accepted_at
ON public.customer_quotations(accepted_at)
WHERE accepted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_quotations_rejected_at
ON public.customer_quotations(rejected_at)
WHERE rejected_at IS NOT NULL;


-- ============================================
-- 4. RECREATE: rpc_customer_quotation_mark_accepted
--
-- All fixes consolidated:
-- - accepted_at column now exists and is used
-- - opportunity_id variables are TEXT (not UUID)
-- - v_return_ticket_status prevents NULL reference
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
    -- FIX: opportunity_id is TEXT, not UUID (format: "OPP20260129608534")
    v_derived_opportunity_id TEXT := NULL;
    v_effective_opportunity_id TEXT := NULL;
    v_stage_changed BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_multi_cost_count INTEGER := 0;
    -- FIX: Safe ticket status variable (prevents v_ticket not assigned error)
    v_return_ticket_status TEXT := NULL;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Lock quotation for update
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

    -- Authorization check
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'accept');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Idempotency: already accepted
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

    -- State machine validation
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'accepted');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Derive opportunity_id (TEXT type, not UUID)
    v_effective_opportunity_id := v_quotation.opportunity_id;

    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id
        FROM public.leads
        WHERE lead_id = v_quotation.lead_id
        AND opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
        END IF;
    END IF;

    IF v_effective_opportunity_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        AND opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
        END IF;
    END IF;

    -- 1. UPDATE QUOTATION STATUS (accepted_at column now exists)
    UPDATE public.customer_quotations
    SET
        status = 'accepted'::customer_quotation_status,
        accepted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. UPDATE OPPORTUNITY -> Closed Won
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            v_new_opp_stage := 'Closed Won'::opportunity_stage;

            UPDATE public.opportunities
            SET
                stage = v_new_opp_stage,
                estimated_value = COALESCE(v_quotation.total_selling_rate, estimated_value),
                closed_at = NOW(),
                updated_at = NOW()
            WHERE opportunity_id = v_effective_opportunity_id;

            v_stage_changed := v_old_opp_stage IS DISTINCT FROM v_new_opp_stage;

            IF v_stage_changed THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.old_stage = v_old_opp_stage
                    AND osh.new_stage = v_new_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (
                        opportunity_id, old_stage, new_stage, changed_by, notes, changed_at
                    ) VALUES (
                        v_effective_opportunity_id,
                        v_old_opp_stage,
                        v_new_opp_stage,
                        v_actor_id,
                        '[' || v_correlation_id || '] Deal won - quotation accepted',
                        NOW()
                    );
                    v_stage_history_inserted := TRUE;
                END IF;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.old_stage = v_old_opp_stage
                AND pu.new_stage = v_new_opp_stage
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (
                    opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at
                ) VALUES (
                    v_effective_opportunity_id,
                    '[' || v_correlation_id || '] Deal closed won - quotation ' || v_quotation.quotation_number || ' accepted',
                    'Email'::approach_method,
                    v_old_opp_stage,
                    v_new_opp_stage,
                    v_actor_id,
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;
            END IF;

            v_activity_subject := 'Deal Won: ' || v_quotation.quotation_number;
            v_activity_description := 'Quotation accepted. Deal value: ' || COALESCE(v_quotation.currency, 'IDR') || ' ' || COALESCE(v_quotation.total_selling_rate::TEXT, '0');

            INSERT INTO public.activities (
                related_opportunity_id,
                related_lead_id,
                related_account_id,
                owner_user_id,
                created_by,
                activity_type,
                subject,
                description,
                status,
                due_date,
                completed_at,
                created_at,
                updated_at
            ) VALUES (
                v_effective_opportunity_id,
                v_quotation.lead_id,
                v_opportunity.account_id,
                v_actor_id,
                v_actor_id,
                'Email'::activity_type_v2,
                v_activity_subject,
                v_activity_description,
                'Completed'::activity_status,
                CURRENT_DATE,
                NOW(),
                NOW(),
                NOW()
            );
            v_activities_inserted := TRUE;

            -- Update account to active
            IF v_opportunity.account_id IS NOT NULL THEN
                UPDATE public.accounts
                SET
                    account_status = 'active_account'::account_status,
                    updated_at = NOW()
                WHERE account_id = v_opportunity.account_id
                AND account_status != 'active_account';
            END IF;
        END IF;
    END IF;

    -- 3. UPDATE TICKET -> closed
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT * INTO v_ticket
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        FOR UPDATE;

        IF v_ticket IS NOT NULL THEN
            v_old_ticket_status := v_ticket.status;

            UPDATE public.tickets
            SET
                status = 'closed'::ticket_status,
                close_outcome = 'won',
                closed_at = NOW(),
                updated_at = NOW()
            WHERE id = v_quotation.ticket_id
            RETURNING * INTO v_ticket;

            v_return_ticket_status := v_ticket.status::TEXT;

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
                'status_changed'::ticket_event_type,
                v_actor_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object(
                    'status', 'closed',
                    'close_outcome', 'won',
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Ticket closed - quotation accepted',
                NOW()
            );

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

            UPDATE public.ticket_sla_tracking
            SET
                resolution_at = COALESCE(resolution_at, NOW()),
                updated_at = NOW()
            WHERE ticket_id = v_quotation.ticket_id
            AND resolution_at IS NULL;

            BEGIN
                PERFORM public.record_response_exchange(
                    v_quotation.ticket_id,
                    v_actor_id,
                    NULL
                );
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING 'Failed to record response exchange: %', SQLERRM;
            END;
        END IF;
    END IF;

    -- 4. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET
            quotation_status = 'accepted',
            updated_at = NOW()
        WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (single)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = 'accepted'::quote_status,
            updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
    END IF;

    -- 5b. UPDATE ALL OPERATIONAL COSTS (multi-shipment)
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'accepted'::quote_status,
            updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids)
        AND trq.status IN ('submitted', 'sent_to_customer');

        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    -- Return success
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
        'ticket_status', v_return_ticket_status,
        'close_outcome', 'won',
        'stage_history_inserted', v_stage_history_inserted,
        'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted,
        'multi_shipment_costs_updated', v_multi_cost_count,
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- 5. RECREATE: rpc_customer_quotation_mark_rejected
--
-- All fixes consolidated:
-- - rejected_at column now exists and is used
-- - opportunity_id variables are TEXT (not UUID)
-- - v_return_ticket_status prevents NULL reference
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
    -- FIX: opportunity_id is TEXT, not UUID
    v_effective_opportunity_id TEXT := NULL;
    v_derived_opportunity_id TEXT := NULL;
    v_pipeline_updated BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_quotation_sequence INTEGER := 1;
    v_sequence_label TEXT := '';
    v_previous_rejected_count INTEGER := 0;
    v_multi_cost_count INTEGER := 0;
    -- FIX: Safe ticket status variable
    v_return_ticket_status TEXT := NULL;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Lock quotation for update
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

    -- Authorization check
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'reject');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Idempotency: already rejected
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

    -- State machine validation
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'rejected');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Derive opportunity_id (TEXT type)
    v_effective_opportunity_id := v_quotation.opportunity_id;

    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT ld.opportunity_id INTO v_derived_opportunity_id
        FROM public.leads ld
        WHERE ld.lead_id = v_quotation.lead_id
        AND ld.opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
        END IF;
    END IF;

    IF v_effective_opportunity_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.opportunity_id INTO v_derived_opportunity_id
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        AND t.opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
        END IF;
    END IF;

    -- 1. UPDATE QUOTATION STATUS (rejected_at column now exists)
    UPDATE public.customer_quotations cq_upd
    SET
        status = 'rejected'::customer_quotation_status,
        rejected_at = NOW(),
        rejection_reason = p_reason_type::TEXT,
        updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- Insert rejection reason record
    INSERT INTO public.quotation_rejection_reasons (
        quotation_id,
        reason_type,
        competitor_name,
        competitor_amount,
        customer_budget,
        currency,
        notes,
        created_by
    ) VALUES (
        p_quotation_id,
        p_reason_type,
        p_competitor_name,
        p_competitor_amount,
        p_customer_budget,
        p_currency,
        p_notes,
        v_actor_id
    );

    -- Calculate quotation sequence for this opportunity
    SELECT COUNT(*) INTO v_quotation_sequence
    FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id
    AND cq2.id != p_quotation_id
    AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;

    SELECT COUNT(*) INTO v_previous_rejected_count
    FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id
    AND cq2.id != p_quotation_id
    AND cq2.status = 'rejected';

    v_sequence_label := CASE v_quotation_sequence
        WHEN 1 THEN '1st'
        WHEN 2 THEN '2nd'
        WHEN 3 THEN '3rd'
        ELSE v_quotation_sequence::TEXT || 'th'
    END;

    -- 2. UPDATE OPPORTUNITY -> Negotiation
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            v_new_opp_stage := 'Negotiation'::opportunity_stage;

            IF v_opportunity.stage NOT IN ('Negotiation', 'Closed Won', 'Closed Lost') THEN
                UPDATE public.opportunities opp_upd
                SET
                    stage = v_new_opp_stage,
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

                v_pipeline_updated := TRUE;
            ELSE
                v_new_opp_stage := v_opportunity.stage;
            END IF;

            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.old_stage = v_old_opp_stage
                    AND osh.new_stage = v_new_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (
                        opportunity_id, old_stage, new_stage, changed_by, notes, changed_at
                    ) VALUES (
                        v_effective_opportunity_id,
                        v_old_opp_stage,
                        v_new_opp_stage,
                        v_actor_id,
                        '[' || v_correlation_id || '] Stage changed due to quotation rejection',
                        NOW()
                    );
                    v_stage_history_inserted := TRUE;
                END IF;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.old_stage = v_old_opp_stage
                AND pu.new_stage = COALESCE(v_new_opp_stage, v_old_opp_stage)
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (
                    opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at
                ) VALUES (
                    v_effective_opportunity_id,
                    '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected by customer',
                    'Email'::approach_method,
                    v_old_opp_stage,
                    COALESCE(v_new_opp_stage, v_old_opp_stage),
                    v_actor_id,
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;
            END IF;

            v_activity_subject := v_sequence_label || ' Quotation Rejected';
            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                v_activity_subject := v_activity_subject || ' → Stage moved to ' || v_new_opp_stage::TEXT;
            END IF;

            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected. Reason: ' || p_reason_type::TEXT;
            IF p_competitor_name IS NOT NULL THEN
                v_activity_description := v_activity_description || '. Competitor: ' || p_competitor_name;
            END IF;
            IF p_competitor_amount IS NOT NULL THEN
                v_activity_description := v_activity_description || '. Competitor price: ' || p_currency || ' ' || p_competitor_amount::TEXT;
            END IF;

            INSERT INTO public.activities (
                related_opportunity_id,
                related_lead_id,
                related_account_id,
                owner_user_id,
                created_by,
                activity_type,
                subject,
                description,
                status,
                due_date,
                completed_at,
                created_at,
                updated_at
            ) VALUES (
                v_effective_opportunity_id,
                v_quotation.lead_id,
                v_opportunity.account_id,
                v_actor_id,
                v_actor_id,
                'Email'::activity_type_v2,
                v_activity_subject,
                v_activity_description,
                'Completed'::activity_status,
                CURRENT_DATE,
                NOW(),
                NOW(),
                NOW()
            );
            v_activities_inserted := TRUE;
        END IF;
    END IF;

    -- 3. UPDATE TICKET -> need_adjustment
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.* INTO v_ticket
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        FOR UPDATE;

        IF v_ticket IS NOT NULL THEN
            v_old_ticket_status := v_ticket.status;

            UPDATE public.tickets t_upd
            SET
                status = 'need_adjustment'::ticket_status,
                pending_response_from = 'assignee',
                updated_at = NOW()
            WHERE t_upd.id = v_quotation.ticket_id
            RETURNING * INTO v_ticket;

            v_return_ticket_status := v_ticket.status::TEXT;

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
                'status_changed'::ticket_event_type,
                v_actor_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object(
                    'status', 'need_adjustment',
                    'rejection_reason', p_reason_type::TEXT,
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Quotation rejected: ' || p_reason_type::TEXT,
                NOW()
            );

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
    END IF;

    -- 4. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads ld
        SET
            quotation_status = 'rejected',
            updated_at = NOW()
        WHERE ld.lead_id = v_quotation.lead_id;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (single)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'revise_requested'::quote_status,
            updated_at = NOW()
        WHERE trq.id = v_quotation.operational_cost_id;
    END IF;

    -- 5b. UPDATE ALL OPERATIONAL COSTS (multi-shipment)
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'revise_requested'::quote_status,
            updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids)
        AND trq.status IN ('submitted', 'sent_to_customer');

        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    -- Return success
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
        'ticket_status', v_return_ticket_status,
        'pipeline_updated', v_pipeline_updated,
        'stage_history_inserted', v_stage_history_inserted,
        'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted,
        'quotation_sequence', v_quotation_sequence,
        'sequence_label', v_sequence_label,
        'previous_rejected_count', v_previous_rejected_count,
        'multi_shipment_costs_updated', v_multi_cost_count,
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- 6. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;


-- ============================================
-- SUMMARY
-- ============================================
-- This migration definitively fixes the "column accepted_at/rejected_at
-- does not exist" error by ADDING these columns to the table.
--
-- Previous approach (migration 135) tried to remove column references
-- from the RPC functions, but the error persisted.
--
-- This migration takes the opposite approach: add the columns that
-- were originally planned (per BLUEPRINT doc) so ALL function versions
-- work correctly.
--
-- Changes:
-- 1. Added accepted_at TIMESTAMPTZ column to customer_quotations
-- 2. Added rejected_at TIMESTAMPTZ column to customer_quotations
-- 3. Backfilled existing accepted/rejected quotations with timestamps
-- 4. Recreated mark_accepted with all fixes:
--    - TEXT opp_id, safe ticket status, correct pipeline_updates columns,
--    - correct opportunities columns (estimated_value, closed_at),
--    - correct accounts column (account_status), removed closed_by
-- 5. Recreated mark_rejected with all fixes:
--    - TEXT opp_id, safe ticket status, correct pipeline_updates columns,
--    - correct table name (quotation_rejection_reasons),
--    - correct pending_response_from enum value ('assignee')
-- 6. Added partial indexes on accepted_at and rejected_at
-- ============================================
