-- ============================================
-- Migration: 135_fix_accept_opportunity_id_type_regression.sql
--
-- PURPOSE: Fix regression in mark_accepted opportunity_id type
--
-- ISSUE:
-- Migration 118 correctly fixed v_derived_opportunity_id and v_effective_opportunity_id
-- from UUID to TEXT because customer_quotations.opportunity_id is TEXT type.
--
-- Migration 134 accidentally regressed this by redeclaring them as UUID:
--   v_derived_opportunity_id UUID := NULL;
--   v_effective_opportunity_id UUID := NULL;
--
-- This causes: "Invalid input syntax for type uuid: 'OPP20260129...'"
-- when trying to assign TEXT to UUID variable.
--
-- SOLUTION:
-- Change v_derived_opportunity_id and v_effective_opportunity_id back to TEXT.
-- Also retain the v_return_ticket_status fix from migration 134.
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
    -- FIX: opportunity_id is TEXT, not UUID (migration 118 fix, regressed in 134)
    v_derived_opportunity_id TEXT := NULL;
    v_effective_opportunity_id TEXT := NULL;
    v_stage_changed BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_multi_cost_count INTEGER := 0;
    -- Ticket status for return (safe from NULL) - from migration 134
    v_return_ticket_status TEXT := NULL;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

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

    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'accept');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

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

    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'accepted');
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

    -- 1. UPDATE QUOTATION STATUS
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
                expected_value = COALESCE(v_quotation.total_selling_rate, expected_value),
                close_date = CURRENT_DATE,
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
                AND pu.update_type = 'stage_change'
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (
                    opportunity_id, update_type, old_value, new_value, updated_by, notes, created_at
                ) VALUES (
                    v_effective_opportunity_id,
                    'stage_change',
                    v_old_opp_stage::TEXT,
                    v_new_opp_stage::TEXT,
                    v_actor_id,
                    '[' || v_correlation_id || '] Deal closed won - quotation ' || v_quotation.quotation_number || ' accepted',
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

            IF v_opportunity.account_id IS NOT NULL THEN
                UPDATE public.accounts
                SET
                    status = 'active_account'::account_status,
                    updated_at = NOW()
                WHERE account_id = v_opportunity.account_id
                AND status != 'active_account';
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
                closed_by = v_actor_id,
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

    -- 5. UPDATE OPERATIONAL COST
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = 'accepted'::quote_status,
            updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
    END IF;

    -- 5b. UPDATE ALL OPERATIONAL COSTS (MULTI-SHIPMENT)
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'accepted'::quote_status,
            updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids)
        AND trq.status IN ('submitted', 'sent_to_customer');

        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    -- Return success (using v_return_ticket_status to avoid NULL reference)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO authenticated;


-- ============================================
-- SUMMARY
-- ============================================
-- Fix: Regression in mark_accepted where opportunity_id variables
-- were declared as UUID instead of TEXT.
--
-- Migration 118 had correctly fixed this, but migration 134
-- accidentally reverted it when adding the v_return_ticket_status fix.
--
-- This migration restores the TEXT type while keeping the
-- v_return_ticket_status fix from migration 134.
-- ============================================
