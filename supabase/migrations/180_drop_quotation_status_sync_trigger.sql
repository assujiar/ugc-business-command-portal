-- =====================================================
-- Migration 180: Drop trg_quotation_status_sync (Fix Double-Writer Problem)
-- =====================================================
--
-- ROOT CAUSE ANALYSIS:
--
-- The trigger `trg_quotation_status_sync` (AFTER UPDATE on customer_quotations)
-- and the RPCs (mark_rejected/mark_sent/mark_accepted) are BOTH trying to
-- update opportunity stage, create pipeline_updates, activities, and ticket events.
--
-- Even with the GUC flag mechanism (migration 151), there's a fundamental
-- architectural conflict: the trigger's `sync_quotation_to_all` chain can
-- modify opportunity.stage BEFORE the RPC reads it. When this happens:
--
--   1. Trigger fires, updates opportunity.stage to 'Negotiation'
--   2. RPC reads v_old_opp_stage = 'Negotiation' (already changed by trigger)
--   3. RPC determines v_new_opp_stage = 'Negotiation'
--   4. v_old_opp_stage = v_new_opp_stage → all logging blocks are SKIPPED:
--      - pipeline_updates: NOT inserted
--      - activities: NOT inserted
--      - stage_history: dedup check finds trigger's insert → SKIPPED
--      - ticket_events: may or may not be created depending on timing
--
-- EVIDENCE FROM PRODUCTION DATA:
--   - opportunities.stage = 'Negotiation' (trigger changed it)
--   - opportunity_stage_history has 'Quote Sent → Negotiation' (trigger inserted it)
--   - pipeline_updates: MISSING the 'Quote Sent → Negotiation' record
--   - activities: MISSING the rejection activity
--   - RPC return: old_stage = NULL (misleading)
--
-- FIX:
--   Drop the trigger entirely. RPCs are now the SOLE controller of all
--   quotation lifecycle transitions. The trigger was a leftover from the
--   original stateless design (migration 071) and is now superseded by
--   the state machine RPC architecture (migrations 151+).
--
-- Also: Restore mark_rejected from debug version (migration 179) back to
--   clean production version (based on migration 177) without debug fields.
-- =====================================================


-- =====================================================
-- PART 1: Drop the trigger
-- =====================================================
-- This is the core fix. Once the trigger is gone, RPCs will be the only
-- writer of stage transitions, and the race condition disappears.

DROP TRIGGER IF EXISTS trg_quotation_status_sync ON public.customer_quotations;

-- Drop the trigger function (no longer needed)
DROP FUNCTION IF EXISTS public.trigger_sync_quotation_on_status_change() CASCADE;


-- =====================================================
-- PART 2: Restore clean production mark_rejected
-- =====================================================
-- Migration 179 replaced mark_rejected with a debug version that includes
-- extra debug variables, information_schema queries, and debug SELECT tests.
-- This restores the clean version from migration 177 (always-sync probability).

DO $$
DECLARE
    v_proc RECORD;
BEGIN
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'rpc_customer_quotation_mark_rejected'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', v_proc.proc_sig);
    END LOOP;
END $$;

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
    v_effective_opportunity_id TEXT := NULL;
    v_derived_opportunity_id TEXT := NULL;
    v_effective_lead_id TEXT := NULL;
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
    v_return_ticket_status TEXT := NULL;
    v_ticket_events_created INTEGER := 0;
    v_ticket_comment_created BOOLEAN := FALSE;
    v_saved_ticket_id UUID := NULL;
    v_stage_prob INTEGER;
    v_stage_next_step TEXT;
    v_stage_days INTEGER;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Numeric validation
    IF p_reason_type = 'kompetitor_lebih_murah' AND p_competitor_amount IS NULL AND p_competitor_name IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Competitor name or amount required for kompetitor_lebih_murah',
            'error_code', 'VALIDATION_ERROR', 'correlation_id', v_correlation_id);
    END IF;
    IF p_reason_type = 'budget_customer_tidak_cukup' AND p_customer_budget IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Customer budget required for budget_customer_tidak_cukup',
            'error_code', 'VALIDATION_ERROR', 'correlation_id', v_correlation_id);
    END IF;
    IF p_reason_type = 'tarif_tidak_masuk' AND p_competitor_amount IS NULL AND p_customer_budget IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Either competitor amount or customer budget required for tarif_tidak_masuk',
            'error_code', 'VALIDATION_ERROR', 'correlation_id', v_correlation_id);
    END IF;

    -- Lock quotation
    SELECT cq.* INTO v_quotation FROM public.customer_quotations cq WHERE cq.id = p_quotation_id FOR UPDATE;
    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found', 'error_code', 'QUOTATION_NOT_FOUND', 'correlation_id', v_correlation_id);
    END IF;

    v_saved_ticket_id := v_quotation.ticket_id;

    -- Authorization check
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'reject');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object('success', FALSE, 'error', v_auth_check->>'error', 'error_code', v_auth_check->>'error_code', 'correlation_id', v_correlation_id);
    END IF;

    -- Idempotency
    IF v_quotation.status = 'rejected' THEN
        RETURN jsonb_build_object('success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
            'quotation_status', v_quotation.status, 'is_idempotent', TRUE, 'message', 'Already rejected.', 'correlation_id', v_correlation_id);
    END IF;

    -- State machine
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'rejected');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object('success', FALSE, 'error', v_transition_check->>'error', 'error_code', v_transition_check->>'error_code', 'correlation_id', v_correlation_id);
    END IF;

    -- Derive opportunity_id
    v_effective_opportunity_id := v_quotation.opportunity_id;
    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT ld.opportunity_id INTO v_derived_opportunity_id FROM public.leads ld WHERE ld.lead_id = v_quotation.lead_id AND ld.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;
    IF v_effective_opportunity_id IS NULL AND v_saved_ticket_id IS NOT NULL THEN
        SELECT t.opportunity_id INTO v_derived_opportunity_id FROM public.tickets t WHERE t.id = v_saved_ticket_id AND t.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;

    v_effective_lead_id := v_quotation.lead_id;

    -- Lock and read opportunity BEFORE quotation update
    -- With trigger dropped (migration 180), no race condition:
    -- v_old_opp_stage will reflect the TRUE current stage.
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;
        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            IF v_effective_lead_id IS NULL AND v_opportunity.source_lead_id IS NOT NULL THEN
                v_effective_lead_id := v_opportunity.source_lead_id;
            END IF;
        END IF;
    END IF;

    IF v_effective_lead_id IS NULL AND v_saved_ticket_id IS NOT NULL THEN
        SELECT t.lead_id INTO v_effective_lead_id FROM public.tickets t WHERE t.id = v_saved_ticket_id AND t.lead_id IS NOT NULL;
    END IF;

    -- GUC flag (kept for safety - no-op now that trigger is dropped)
    PERFORM set_config('app.in_quotation_rpc', 'true', true);

    -- 1. UPDATE QUOTATION
    UPDATE public.customer_quotations cq_upd
    SET status = 'rejected'::customer_quotation_status, rejected_at = NOW(), rejection_reason = p_reason_type::TEXT, updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id RETURNING * INTO v_quotation;

    INSERT INTO public.quotation_rejection_reasons (quotation_id, reason_type, competitor_name, competitor_amount, customer_budget, currency, notes, created_by)
    VALUES (p_quotation_id, p_reason_type, p_competitor_name, p_competitor_amount, p_customer_budget, p_currency, p_notes, v_actor_id);

    -- Quotation sequence
    SELECT COUNT(*) INTO v_quotation_sequence FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;

    SELECT COUNT(*) INTO v_previous_rejected_count FROM public.customer_quotations cq2
    WHERE cq2.id != p_quotation_id AND cq2.status = 'rejected'
    AND (
        (v_effective_opportunity_id IS NOT NULL AND cq2.opportunity_id = v_effective_opportunity_id)
        OR (v_saved_ticket_id IS NOT NULL AND cq2.ticket_id = v_saved_ticket_id)
        OR (v_quotation.lead_id IS NOT NULL AND cq2.lead_id = v_quotation.lead_id)
    );

    v_sequence_label := CASE v_quotation_sequence WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE v_quotation_sequence::TEXT || 'th' END;

    -- 2. UPDATE OPPORTUNITY -> Negotiation
    IF v_effective_opportunity_id IS NOT NULL AND v_opportunity IS NOT NULL THEN
        IF v_old_opp_stage NOT IN ('Negotiation', 'Closed Won', 'Closed Lost') THEN
            v_new_opp_stage := 'Negotiation'::opportunity_stage;
        ELSE
            v_new_opp_stage := v_old_opp_stage;
        END IF;

        -- ALWAYS get stage config and sync probability
        SELECT sc.probability, sc.next_step, sc.days_allowed
        INTO v_stage_prob, v_stage_next_step, v_stage_days
        FROM public.fn_stage_config(v_new_opp_stage) sc;

        -- ALWAYS update probability/next_step to match stage
        UPDATE public.opportunities opp_upd
        SET stage = v_new_opp_stage,
            probability = COALESCE(v_stage_prob, opp_upd.probability),
            next_step = COALESCE(v_stage_next_step, opp_upd.next_step),
            next_step_due_date = CASE WHEN v_stage_days > 0 AND v_old_opp_stage IS DISTINCT FROM v_new_opp_stage
                THEN CURRENT_DATE + v_stage_days ELSE opp_upd.next_step_due_date END,
            competitor = COALESCE(p_competitor_name, opp_upd.competitor),
            competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
            customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
            updated_at = NOW()
        WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

        IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
            v_pipeline_updated := TRUE;
        END IF;

        -- Stage history (only if stage changed)
        IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.opportunity_stage_history osh
                WHERE osh.opportunity_id = v_effective_opportunity_id
                AND osh.new_stage = v_new_opp_stage
                AND osh.changed_at > NOW() - INTERVAL '2 minutes'
            ) THEN
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id, from_stage, to_stage, old_stage, new_stage, changed_by, notes, changed_at
                ) VALUES (
                    v_effective_opportunity_id, v_old_opp_stage, v_new_opp_stage, v_old_opp_stage, v_new_opp_stage,
                    v_actor_id, '[' || v_correlation_id || '] Stage changed due to quotation rejection', NOW());
                v_stage_history_inserted := TRUE;
            END IF;
        END IF;

        -- Pipeline update
        IF NOT EXISTS (
            SELECT 1 FROM public.pipeline_updates pu
            WHERE pu.opportunity_id = v_effective_opportunity_id
            AND pu.new_stage = COALESCE(v_new_opp_stage, v_old_opp_stage)::opportunity_stage
            AND pu.updated_at > NOW() - INTERVAL '2 minutes'
        ) THEN
            INSERT INTO public.pipeline_updates (opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at)
            VALUES (v_effective_opportunity_id,
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected by customer',
                'Email'::approach_method, v_old_opp_stage, COALESCE(v_new_opp_stage, v_old_opp_stage), v_actor_id, NOW());
            v_pipeline_updates_inserted := TRUE;
        END IF;

        -- Activity
        IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
            v_activity_subject := 'Pipeline Update: ' || v_old_opp_stage::TEXT || ' → ' || v_new_opp_stage::TEXT;
        ELSE
            v_activity_subject := v_sequence_label || ' Quotation Rejected';
        END IF;
        v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected. Reason: ' || p_reason_type::TEXT;
        IF p_competitor_name IS NOT NULL THEN v_activity_description := v_activity_description || '. Competitor: ' || p_competitor_name; END IF;
        IF p_competitor_amount IS NOT NULL THEN v_activity_description := v_activity_description || '. Competitor price: ' || p_currency || ' ' || p_competitor_amount::TEXT; END IF;
        IF p_customer_budget IS NOT NULL THEN v_activity_description := v_activity_description || '. Customer budget: ' || p_currency || ' ' || p_customer_budget::TEXT; END IF;
        IF p_notes IS NOT NULL THEN v_activity_description := v_activity_description || '. Notes: ' || p_notes; END IF;

        INSERT INTO public.activities (
            related_opportunity_id, related_lead_id, related_account_id, owner_user_id, created_by,
            activity_type, subject, description, status, due_date, completed_at, created_at, updated_at
        ) VALUES (
            v_effective_opportunity_id, v_effective_lead_id, v_opportunity.account_id, v_actor_id, v_actor_id,
            'Email'::activity_type_v2, v_activity_subject, v_activity_description,
            'Completed'::activity_status, CURRENT_DATE, NOW(), NOW(), NOW()
        );
        v_activities_inserted := TRUE;
    END IF;

    -- 3. UPDATE TICKET -> need_adjustment
    IF v_saved_ticket_id IS NOT NULL THEN
        SELECT t.* INTO v_ticket FROM public.tickets t WHERE t.id = v_saved_ticket_id FOR UPDATE;

        IF v_ticket IS NOT NULL AND v_ticket.status NOT IN ('closed', 'resolved') THEN
            v_old_ticket_status := v_ticket.status;
            UPDATE public.tickets t_upd
            SET status = 'need_adjustment'::ticket_status, pending_response_from = 'assignee', updated_at = NOW()
            WHERE t_upd.id = v_saved_ticket_id RETURNING * INTO v_ticket;
            v_return_ticket_status := v_ticket.status::TEXT;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_saved_ticket_id, 'customer_quotation_rejected'::ticket_event_type, v_actor_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object('status', 'need_adjustment', 'quotation_id', p_quotation_id,
                    'quotation_number', v_quotation.quotation_number, 'quotation_status', 'rejected',
                    'rejection_reason', p_reason_type::TEXT, 'competitor_name', p_competitor_name,
                    'competitor_amount', p_competitor_amount, 'customer_budget', p_customer_budget,
                    'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected. Reason: ' || p_reason_type::TEXT, NOW());
            v_ticket_events_created := v_ticket_events_created + 1;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, new_value, notes, created_at)
            VALUES (v_saved_ticket_id, 'request_adjustment'::ticket_event_type, v_actor_id,
                jsonb_build_object('reason', p_reason_type::TEXT, 'triggered_by', 'quotation_rejection', 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Rate adjustment requested due to quotation rejection', NOW());
            v_ticket_events_created := v_ticket_events_created + 1;

            INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
            VALUES (v_saved_ticket_id, v_actor_id,
                'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT ||
                CASE WHEN p_competitor_name IS NOT NULL THEN '. Competitor: ' || p_competitor_name ELSE '' END ||
                CASE WHEN p_competitor_amount IS NOT NULL THEN '. Competitor price: ' || p_currency || ' ' || p_competitor_amount::TEXT ELSE '' END ||
                CASE WHEN p_customer_budget IS NOT NULL THEN '. Customer budget: ' || p_currency || ' ' || p_customer_budget::TEXT ELSE '' END ||
                CASE WHEN p_notes IS NOT NULL THEN '. Notes: ' || p_notes ELSE '' END,
                FALSE, NOW());
            v_ticket_comment_created := TRUE;
        ELSIF v_ticket IS NOT NULL THEN
            v_return_ticket_status := v_ticket.status::TEXT;
            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_saved_ticket_id, 'customer_quotation_rejected'::ticket_event_type, v_actor_id,
                jsonb_build_object('status', v_ticket.status::TEXT),
                jsonb_build_object('quotation_id', p_quotation_id, 'quotation_number', v_quotation.quotation_number,
                    'rejection_reason', p_reason_type::TEXT, 'ticket_status_unchanged', TRUE, 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected (ticket already ' || v_ticket.status::TEXT || ')', NOW());
            v_ticket_events_created := v_ticket_events_created + 1;

            INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
            VALUES (v_saved_ticket_id, v_actor_id,
                'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT ||
                ' (ticket already ' || v_ticket.status::TEXT || ', status unchanged)' ||
                CASE WHEN p_notes IS NOT NULL THEN '. Notes: ' || p_notes ELSE '' END,
                FALSE, NOW());
            v_ticket_comment_created := TRUE;
        END IF;
    END IF;

    -- 4. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads SET quotation_status = 'rejected', updated_at = NOW() WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 5. UPDATE OPERATIONAL COSTS
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes SET status = 'revise_requested'::quote_status, updated_at = NOW() WHERE id = v_quotation.operational_cost_id;
    END IF;
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq SET status = 'revise_requested'::quote_status, updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids) AND trq.status IN ('submitted', 'sent_to_customer');
        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status, 'rejection_reason', p_reason_type::TEXT,
        'opportunity_id', v_effective_opportunity_id, 'old_stage', v_old_opp_stage, 'new_stage', v_new_opp_stage,
        'ticket_id', v_saved_ticket_id, 'ticket_status', v_return_ticket_status,
        'ticket_events_created', v_ticket_events_created, 'ticket_comment_created', v_ticket_comment_created,
        'stage_history_inserted', v_stage_history_inserted, 'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted, 'multi_shipment_costs_updated', v_multi_cost_count,
        'lead_id', v_effective_lead_id, 'sequence_label', v_sequence_label, 'previous_rejected_count', v_previous_rejected_count,
        'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[180][%] mark_rejected FAILED: % (%)', v_correlation_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;


-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';


-- =====================================================
-- SUMMARY
-- =====================================================
-- 1. DROPPED trigger trg_quotation_status_sync on customer_quotations
--    - This was the root cause: trigger and RPCs were BOTH updating
--      opportunity.stage, causing a race condition where the RPC would
--      read the already-changed stage and skip all logging
--
-- 2. DROPPED function trigger_sync_quotation_on_status_change()
--    - No longer needed since the trigger is gone
--
-- 3. RESTORED clean mark_rejected (from migration 177)
--    - Removed debug variables from migration 179
--    - Removed information_schema queries
--    - Removed debug SELECT tests (plain SELECT, FOR UPDATE tests)
--    - Removed debug return fields (_debug_*)
--    - Kept all production logic: probability sync, stage config, etc.
--    - GUC flag kept as no-op safety measure
--
-- Expected behavior after this migration:
--   Reject quotation flow:
--   1. RPC locks opportunity → reads TRUE old_stage (e.g., 'Quote Sent')
--   2. RPC updates quotation status → NO trigger fires
--   3. RPC updates opportunity stage → 'Negotiation'
--   4. v_old != v_new → ALL logging blocks execute:
--      ✅ stage_history inserted
--      ✅ pipeline_updates inserted
--      ✅ activities inserted
--      ✅ ticket_events created
--      ✅ return JSON has correct old_stage/new_stage
-- =====================================================
