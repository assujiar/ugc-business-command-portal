-- =====================================================
-- Migration 172: Fix mark_accepted account column name
-- =====================================================
--
-- ROOT CAUSE: Migration 159 changed the correct column reference
-- `account_status` (from migration 136) to `status` (wrong).
-- The accounts table column is `account_status`, not `status`.
--
-- This was hidden because migration 159's UUID type bug
-- prevented the function from reaching the account section.
-- Migration 171 fixed the UUID bug, exposing this column bug.
--
-- The wrong column name triggers "column status does not exist",
-- which is caught by EXCEPTION WHEN OTHERS and rolls back the
-- ENTIRE transaction — including:
--   - Quotation status update (reverted to 'sent')
--   - Opportunity stage change (not set to 'Closed Won')
--   - Activity/pipeline_updates/stage_history inserts
--   - Ticket close (never reached, code after the exception)
--
-- FIX: Replace direct `UPDATE accounts SET status = ...` with
-- `sync_opportunity_to_account(opp_id, 'won')` which:
--   1. Uses correct column name `account_status`
--   2. Handles full lifecycle (calon→new, failed→new, etc.)
--   3. Sets transaction dates properly
--   4. Wrapped in nested BEGIN..EXCEPTION to prevent cascade
-- =====================================================


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
    -- [171] FIX: TEXT not UUID - opportunity_id is TEXT like "OPP2026021268704A"
    v_derived_opportunity_id TEXT := NULL;
    v_effective_opportunity_id TEXT := NULL;
    v_effective_lead_id TEXT := NULL;
    v_stage_changed BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_multi_cost_count INTEGER := 0;
    -- [172] NEW: account sync result
    v_account_sync_result JSONB;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    RAISE NOTICE '[172][%] rpc_customer_quotation_mark_accepted started for quotation_id=%', v_correlation_id, p_quotation_id;

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

    -- AUTHORIZATION
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'accept');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- IDEMPOTENCY
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

    -- STATE MACHINE
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'accepted');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- [171] FIX: Derive opportunity_id (all TEXT, not UUID)
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

    RAISE NOTICE '[172][%] Derived opportunity_id=%', v_correlation_id, v_effective_opportunity_id;

    -- [171] FIX: Derive effective lead_id
    v_effective_lead_id := v_quotation.lead_id;

    -- Lock and read opportunity BEFORE quotation UPDATE
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            -- Derive lead_id from opportunity if not set
            IF v_effective_lead_id IS NULL AND v_opportunity.source_lead_id IS NOT NULL THEN
                v_effective_lead_id := v_opportunity.source_lead_id;
                RAISE NOTICE '[172][%] Derived lead_id from opportunity.source_lead_id=%', v_correlation_id, v_effective_lead_id;
            END IF;
            RAISE NOTICE '[172][%] Opportunity PRE-LOCKED: stage=%', v_correlation_id, v_old_opp_stage;
        END IF;
    END IF;

    -- Also try to derive lead_id from ticket if still null
    IF v_effective_lead_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT lead_id INTO v_effective_lead_id FROM public.tickets WHERE id = v_quotation.ticket_id AND lead_id IS NOT NULL;
    END IF;

    -- Set GUC flag to prevent AFTER UPDATE trigger interference
    PERFORM set_config('app.in_quotation_rpc', 'true', true);

    -- 1. UPDATE QUOTATION STATUS
    UPDATE public.customer_quotations
    SET
        status = 'accepted'::customer_quotation_status,
        accepted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    RAISE NOTICE '[172][%] Quotation updated to accepted', v_correlation_id;

    -- 2. UPDATE OPPORTUNITY -> Closed Won
    IF v_effective_opportunity_id IS NOT NULL AND v_opportunity IS NOT NULL THEN
        v_new_opp_stage := 'Closed Won'::opportunity_stage;

        UPDATE public.opportunities
        SET
            stage = v_new_opp_stage,
            estimated_value = COALESCE(v_quotation.total_selling_rate, estimated_value),
            closed_at = NOW(),
            updated_at = NOW()
        WHERE opportunity_id = v_effective_opportunity_id;

        v_stage_changed := v_old_opp_stage IS DISTINCT FROM v_new_opp_stage;

        RAISE NOTICE '[172][%] Opportunity updated: % -> %, stage_changed=%', v_correlation_id, v_old_opp_stage, v_new_opp_stage, v_stage_changed;

        -- Insert stage history with ALL 4 columns
        IF v_stage_changed THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.opportunity_stage_history osh
                WHERE osh.opportunity_id = v_effective_opportunity_id
                AND osh.new_stage = v_new_opp_stage
                AND osh.changed_at > NOW() - INTERVAL '2 minutes'
            ) THEN
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id, from_stage, to_stage, old_stage, new_stage, changed_by, notes, changed_at
                ) VALUES (
                    v_effective_opportunity_id,
                    v_old_opp_stage,
                    v_new_opp_stage,
                    v_old_opp_stage,
                    v_new_opp_stage,
                    v_actor_id,
                    '[' || v_correlation_id || '] Deal won - quotation accepted',
                    NOW()
                );
                v_stage_history_inserted := TRUE;
                RAISE NOTICE '[172][%] Stage history inserted: % -> %', v_correlation_id, v_old_opp_stage, v_new_opp_stage;
            END IF;
        END IF;

        -- Insert pipeline update
        IF NOT EXISTS (
            SELECT 1 FROM public.pipeline_updates pu
            WHERE pu.opportunity_id = v_effective_opportunity_id
            AND pu.new_stage = v_new_opp_stage
            AND pu.updated_at > NOW() - INTERVAL '2 minutes'
        ) THEN
            INSERT INTO public.pipeline_updates (
                opportunity_id, approach_method, old_stage, new_stage, updated_by, notes, updated_at
            ) VALUES (
                v_effective_opportunity_id,
                'Email'::approach_method,
                v_old_opp_stage,
                v_new_opp_stage,
                v_actor_id,
                '[' || v_correlation_id || '] Deal closed won - quotation ' || v_quotation.quotation_number || ' accepted',
                NOW()
            );
            v_pipeline_updates_inserted := TRUE;
            RAISE NOTICE '[172][%] Pipeline update inserted: % -> %', v_correlation_id, v_old_opp_stage, v_new_opp_stage;
        END IF;

        -- [171] FIX: Activity subject uses "Pipeline Update:" format
        v_activity_subject := 'Pipeline Update: ' || v_old_opp_stage::TEXT || ' → Closed Won';
        v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' accepted. Deal value: ' || COALESCE(v_quotation.currency, 'IDR') || ' ' || COALESCE(v_quotation.total_selling_rate::TEXT, '0');

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
            v_effective_lead_id,
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

        -- [172] FIX: Use sync_opportunity_to_account for proper account lifecycle
        -- Previously used wrong column name (SET status = ...) instead of (SET account_status = ...)
        -- and set 'active_account' directly instead of 'new_account' for first deal.
        -- sync_opportunity_to_account handles: calon→new, failed→new, passive→new, lost→new,
        -- new/active→update last_transaction_date only.
        -- Wrapped in nested BEGIN..EXCEPTION to prevent rollback of outer transaction.
        IF v_opportunity.account_id IS NOT NULL THEN
            BEGIN
                v_account_sync_result := public.sync_opportunity_to_account(v_effective_opportunity_id, 'won');
                RAISE NOTICE '[172][%] Account sync result: %', v_correlation_id, v_account_sync_result;
            EXCEPTION WHEN OTHERS THEN
                -- Account sync failure should NOT roll back the entire acceptance
                RAISE WARNING '[172][%] Account sync failed (non-fatal): % (SQLSTATE: %)', v_correlation_id, SQLERRM, SQLSTATE;
                v_account_sync_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
            END;
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

            RAISE NOTICE '[172][%] Ticket closed: % -> closed (won)', v_correlation_id, v_old_ticket_status;

            INSERT INTO public.ticket_events (
                ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at
            ) VALUES (
                v_quotation.ticket_id,
                'status_changed'::ticket_event_type,
                v_actor_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object('status', 'closed', 'close_outcome', 'won', 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Ticket closed - quotation accepted',
                NOW()
            );

            INSERT INTO public.ticket_events (
                ticket_id, event_type, actor_user_id, new_value, notes, created_at
            ) VALUES (
                v_quotation.ticket_id,
                'closed'::ticket_event_type,
                v_actor_id,
                jsonb_build_object('close_outcome', 'won', 'triggered_by', 'quotation_accepted', 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Ticket auto-closed due to quotation acceptance',
                NOW()
            );

            UPDATE public.ticket_sla_tracking
            SET resolution_at = COALESCE(resolution_at, NOW()), updated_at = NOW()
            WHERE ticket_id = v_quotation.ticket_id AND resolution_at IS NULL;

            BEGIN
                PERFORM public.record_response_exchange(v_quotation.ticket_id, v_actor_id, NULL);
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE WARNING '[172][%] Failed to record response exchange: %', v_correlation_id, SQLERRM;
            END;
        END IF;
    END IF;

    -- 4. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET quotation_status = 'accepted', updated_at = NOW()
        WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (SINGLE)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET status = 'accepted'::quote_status, updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
    END IF;

    -- 5b. UPDATE ALL OPERATIONAL COSTS (MULTI-SHIPMENT)
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq
        SET status = 'accepted'::quote_status, updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids)
        AND trq.status IN ('submitted', 'sent_to_customer');
        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    RAISE NOTICE '[172][%] rpc_customer_quotation_mark_accepted completed successfully', v_correlation_id;

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
        'multi_shipment_costs_updated', v_multi_cost_count,
        'lead_id', v_effective_lead_id,
        'account_sync_result', v_account_sync_result,
        'correlation_id', v_correlation_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[172][%] rpc_customer_quotation_mark_accepted FAILED: % (SQLSTATE: %)', v_correlation_id, SQLERRM, SQLSTATE;
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_accepted IS
'Migration 172: Fixed account column name bug (SET status → SET account_status via sync_opportunity_to_account).
This was the root cause of all 4 acceptance bugs: wrong column name caused EXCEPTION WHEN OTHERS
which rolled back the entire transaction (quotation, opportunity, activity, ticket updates).
Uses sync_opportunity_to_account for proper lifecycle: calon→new_account on first deal.
Wrapped in nested BEGIN..EXCEPTION to prevent cascade rollback.
Preserves all migration 171 fixes (TEXT opportunity_id, lead_id derivation, Pipeline Update subject).';


-- Re-grant permissions (same signature)
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO service_role;


-- ============================================
-- SUMMARY
-- ============================================
-- Migration 172 fixes:
--
-- ROOT CAUSE: `UPDATE accounts SET status = 'active_account'`
-- should be `SET account_status = 'new_account'` (column name).
--
-- The wrong column name caused "column status does not exist"
-- error, caught by EXCEPTION WHEN OTHERS, which rolled back:
--   1. Quotation status (not set to 'accepted')
--   2. Opportunity stage (not set to 'Closed Won')
--   3. Stage history, pipeline_updates, activity (all rolled back)
--   4. Ticket closure (never reached - code after account UPDATE)
--
-- FIX: Replace direct UPDATE with sync_opportunity_to_account()
-- which uses correct column name AND handles full lifecycle:
--   calon_account → new_account (first deal)
--   failed_account → new_account (reactivation)
--   passive_account → new_account (reactivation)
--   lost_account → new_account (reactivation)
--   new_account/active_account → update transaction date only
--
-- Account sync wrapped in nested BEGIN..EXCEPTION to prevent
-- any account-related issues from rolling back the main transaction.
-- ============================================
