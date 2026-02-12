-- =====================================================
-- Migration 176: Fix mark_sent missing p_allow_autocreate parameter
-- =====================================================
-- The API route sends p_allow_autocreate=false to prevent orphan opportunity
-- creation, but migration 174 recreated the function WITHOUT this parameter.
-- PostgREST cannot find the function because the signature doesn't match.
--
-- Fix: Drop old signature, recreate with p_allow_autocreate BOOLEAN DEFAULT TRUE.
-- When p_allow_autocreate=false, skip fn_resolve_or_create_opportunity.
-- =====================================================

-- Drop the old signature (5 params: UUID, TEXT, TEXT, UUID, TEXT)
DO $$
DECLARE
    v_proc RECORD;
BEGIN
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'rpc_customer_quotation_mark_sent'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', v_proc.proc_sig);
        RAISE WARNING '[176] Dropped mark_sent overload: %', v_proc.proc_sig;
    END LOOP;
END $$;

-- Recreate with p_allow_autocreate parameter
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
    v_old_opp_stage opportunity_stage;
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
    v_pipeline_updates_created BOOLEAN := FALSE;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_quotation_sequence INTEGER := 1;
    v_sequence_label TEXT := '';
    v_previous_rejected_count INTEGER := 0;
    v_multi_cost_count INTEGER := 0;
    v_return_ticket_status TEXT := NULL;
    v_saved_ticket_id UUID := NULL;
    v_stage_prob INTEGER;
    v_stage_next_step TEXT;
    v_stage_days INTEGER;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    RAISE WARNING '[176][%] mark_sent START qid=% allow_autocreate=%', v_correlation_id, p_quotation_id, p_allow_autocreate;

    -- Lock quotation
    SELECT cq.* INTO v_quotation FROM public.customer_quotations cq WHERE cq.id = p_quotation_id FOR UPDATE;
    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found', 'error_code', 'QUOTATION_NOT_FOUND', 'correlation_id', v_correlation_id);
    END IF;
    v_saved_ticket_id := v_quotation.ticket_id;

    -- Authorization
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'send');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object('success', FALSE, 'error', v_auth_check->>'error', 'error_code', v_auth_check->>'error_code', 'correlation_id', v_correlation_id);
    END IF;

    -- Idempotency
    IF v_quotation.status = 'sent' THEN
        RETURN jsonb_build_object('success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
            'quotation_status', v_quotation.status, 'is_idempotent', TRUE, 'message', 'Already sent.', 'correlation_id', v_correlation_id);
    END IF;

    -- State machine
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'sent');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object('success', FALSE, 'error', v_transition_check->>'error', 'error_code', v_transition_check->>'error_code', 'correlation_id', v_correlation_id);
    END IF;

    -- Derive opportunity_id
    v_effective_opportunity_id := v_quotation.opportunity_id;
    IF v_effective_opportunity_id IS NULL AND p_allow_autocreate THEN
        -- Only call fn_resolve_or_create_opportunity when autocreate is allowed
        BEGIN
            SELECT fn_resolve_or_create_opportunity(p_quotation_id) INTO v_derived_opportunity_id;
            IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[176][%] fn_resolve_or_create_opportunity failed: %', v_correlation_id, SQLERRM;
        END;
    END IF;
    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT ld.opportunity_id INTO v_derived_opportunity_id FROM public.leads ld WHERE ld.lead_id = v_quotation.lead_id AND ld.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;
    IF v_effective_opportunity_id IS NULL AND v_saved_ticket_id IS NOT NULL THEN
        SELECT t.opportunity_id INTO v_derived_opportunity_id FROM public.tickets t WHERE t.id = v_saved_ticket_id AND t.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;

    v_effective_lead_id := v_quotation.lead_id;

    -- Lock opportunity
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;
        RAISE WARNING '[176][%] mark_sent opp SELECT: FOUND=%, opp_id=%', v_correlation_id, FOUND, v_effective_opportunity_id;
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

    -- GUC flag
    PERFORM set_config('app.in_quotation_rpc', 'true', true);

    -- Count previous rejections
    SELECT COUNT(*) INTO v_previous_rejected_count FROM public.customer_quotations cq2
    WHERE cq2.id != p_quotation_id AND cq2.status = 'rejected'
    AND (
        (v_effective_opportunity_id IS NOT NULL AND cq2.opportunity_id = v_effective_opportunity_id)
        OR (v_saved_ticket_id IS NOT NULL AND cq2.ticket_id = v_saved_ticket_id)
        OR (v_quotation.lead_id IS NOT NULL AND cq2.lead_id = v_quotation.lead_id)
    );

    -- 1. UPDATE QUOTATION
    UPDATE public.customer_quotations cq_upd
    SET status = 'sent'::customer_quotation_status, sent_at = NOW(), sent_via = p_sent_via, sent_to = p_sent_to,
        opportunity_id = COALESCE(cq_upd.opportunity_id, v_effective_opportunity_id), updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id RETURNING * INTO v_quotation;

    -- Sequence
    SELECT COUNT(*) INTO v_quotation_sequence FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;
    v_sequence_label := CASE v_quotation_sequence WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE v_quotation_sequence::TEXT || 'th' END;

    -- 2. UPDATE OPPORTUNITY
    IF v_effective_opportunity_id IS NOT NULL AND v_opportunity IS NOT NULL THEN
        IF v_previous_rejected_count > 0 THEN
            v_new_opp_stage := 'Negotiation'::opportunity_stage;
        ELSE
            IF v_old_opp_stage IN ('Prospecting', 'Discovery') THEN
                v_new_opp_stage := 'Quote Sent'::opportunity_stage;
            ELSE
                v_new_opp_stage := v_old_opp_stage;
            END IF;
        END IF;

        SELECT sc.probability, sc.next_step, sc.days_allowed
        INTO v_stage_prob, v_stage_next_step, v_stage_days
        FROM public.fn_stage_config(v_new_opp_stage) sc;

        IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
            UPDATE public.opportunities opp_upd
            SET stage = v_new_opp_stage,
                probability = COALESCE(v_stage_prob, opp_upd.probability),
                next_step = COALESCE(v_stage_next_step, opp_upd.next_step),
                next_step_due_date = CASE WHEN v_stage_days > 0 THEN CURRENT_DATE + v_stage_days ELSE opp_upd.next_step_due_date END,
                estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
            v_pipeline_updated := TRUE;
        ELSE
            UPDATE public.opportunities opp_upd
            SET estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value), updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
        END IF;

        -- Stage history
        IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
            IF NOT EXISTS (SELECT 1 FROM public.opportunity_stage_history osh WHERE osh.opportunity_id = v_effective_opportunity_id AND osh.new_stage = v_new_opp_stage AND osh.changed_at > NOW() - INTERVAL '2 minutes') THEN
                INSERT INTO public.opportunity_stage_history (opportunity_id, from_stage, to_stage, old_stage, new_stage, changed_by, notes, changed_at)
                VALUES (v_effective_opportunity_id, v_old_opp_stage, v_new_opp_stage, v_old_opp_stage, v_new_opp_stage, v_actor_id, '[' || v_correlation_id || '] Stage changed due to quotation sent', NOW());
                v_stage_history_inserted := TRUE;
            END IF;
        END IF;

        -- Pipeline update
        IF NOT EXISTS (SELECT 1 FROM public.pipeline_updates pu WHERE pu.opportunity_id = v_effective_opportunity_id AND pu.new_stage = COALESCE(v_new_opp_stage, v_old_opp_stage)::opportunity_stage AND pu.updated_at > NOW() - INTERVAL '2 minutes') THEN
            INSERT INTO public.pipeline_updates (opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at)
            VALUES (v_effective_opportunity_id, '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer', 'Email'::approach_method, v_old_opp_stage, COALESCE(v_new_opp_stage, v_old_opp_stage), v_actor_id, NOW());
            v_pipeline_updates_inserted := TRUE;
            v_pipeline_updates_created := TRUE;
        END IF;

        -- Activity
        IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
            v_activity_subject := 'Pipeline Update: ' || v_old_opp_stage::TEXT || ' → ' || v_new_opp_stage::TEXT;
        ELSE
            v_activity_subject := v_sequence_label || ' Quotation Sent';
        END IF;
        v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' sent to ' || COALESCE(p_sent_to, 'customer') || ' via ' || COALESCE(p_sent_via, 'unknown');

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

    -- 3. UPDATE TICKET
    IF v_saved_ticket_id IS NOT NULL THEN
        SELECT t.* INTO v_ticket FROM public.tickets t WHERE t.id = v_saved_ticket_id FOR UPDATE;
        RAISE WARNING '[176][%] mark_sent ticket SELECT: FOUND=%', v_correlation_id, FOUND;
        IF v_ticket IS NOT NULL AND v_ticket.status NOT IN ('closed', 'resolved') THEN
            UPDATE public.tickets t_upd
            SET status = 'waiting_customer'::ticket_status, pending_response_from = 'customer', updated_at = NOW()
            WHERE t_upd.id = v_saved_ticket_id RETURNING * INTO v_ticket;
            v_return_ticket_status := v_ticket.status::TEXT;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, new_value, notes, created_at)
            VALUES (v_saved_ticket_id, 'customer_quotation_sent'::ticket_event_type, v_actor_id,
                jsonb_build_object('quotation_id', p_quotation_id, 'quotation_number', v_quotation.quotation_number, 'sent_via', p_sent_via, 'sent_to', p_sent_to, 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer', NOW());

            INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
            VALUES (v_saved_ticket_id, v_actor_id,
                'Quotation ' || v_quotation.quotation_number || ' sent to ' || COALESCE(p_sent_to, 'customer') || ' via ' || COALESCE(p_sent_via, 'unknown'), FALSE, NOW());
        END IF;
    END IF;

    -- 4. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads SET quotation_status = 'sent', updated_at = NOW() WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 5. UPDATE COSTS
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes SET status = 'sent_to_customer'::quote_status, updated_at = NOW() WHERE id = v_quotation.operational_cost_id;
    END IF;
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq SET status = 'sent_to_customer'::quote_status, updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids) AND trq.status IN ('submitted', 'draft');
        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status, 'opportunity_id', v_effective_opportunity_id,
        'old_stage', v_old_opp_stage, 'new_stage', v_new_opp_stage,
        'ticket_id', v_saved_ticket_id, 'ticket_status', v_return_ticket_status,
        'stage_history_inserted', v_stage_history_inserted, 'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'pipeline_updates_created', v_pipeline_updates_created, 'activities_inserted', v_activities_inserted,
        'multi_shipment_costs_updated', v_multi_cost_count, 'lead_id', v_effective_lead_id,
        'sequence_label', v_sequence_label, 'previous_rejected_count', v_previous_rejected_count,
        'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[176][%] mark_sent FAILED: % (%)', v_correlation_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Grant with NEW signature (6 params)
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
