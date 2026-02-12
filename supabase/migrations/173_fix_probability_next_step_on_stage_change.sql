-- =====================================================
-- Migration 173: Update probability/next_step when RPCs change stage
-- =====================================================
-- When mark_rejected moves stage to Negotiation, probability should
-- become 75 (not stay at 10 from Prospecting). Same for all stage
-- transitions in mark_sent and mark_accepted.
--
-- The PIPELINE_STAGE_CONFIG from constants.ts is mirrored here:
--   Prospecting: 10%, Discovery: 25%, Quote Sent: 50%,
--   Negotiation: 75%, Closed Won: 100%, Closed Lost: 0%
-- =====================================================


-- Helper function: maps stage to probability + next_step
CREATE OR REPLACE FUNCTION public.fn_stage_config(p_stage opportunity_stage)
RETURNS TABLE(probability INTEGER, next_step TEXT, days_allowed INTEGER)
LANGUAGE sql STABLE AS $$
    SELECT
        CASE p_stage
            WHEN 'Prospecting'  THEN 10
            WHEN 'Discovery'    THEN 25
            WHEN 'Quote Sent'   THEN 50
            WHEN 'Negotiation'  THEN 75
            WHEN 'Closed Won'   THEN 100
            WHEN 'Closed Lost'  THEN 0
            WHEN 'On Hold'      THEN 0
            ELSE 0
        END AS probability,
        CASE p_stage
            WHEN 'Prospecting'  THEN 'Initial Contact - Schedule Discovery Meeting'
            WHEN 'Discovery'    THEN 'Understand Requirements - Prepare Quote'
            WHEN 'Quote Sent'   THEN 'Follow-up on Quote'
            WHEN 'Negotiation'  THEN 'Close Deal'
            WHEN 'Closed Won'   THEN NULL
            WHEN 'Closed Lost'  THEN 'Document Lost Reason'
            WHEN 'On Hold'      THEN 'Review and Reactivate'
            ELSE NULL
        END AS next_step,
        CASE p_stage
            WHEN 'Prospecting'  THEN 1
            WHEN 'Discovery'    THEN 2
            WHEN 'Quote Sent'   THEN 1
            WHEN 'Negotiation'  THEN 3
            WHEN 'Closed Won'   THEN 0
            WHEN 'Closed Lost'  THEN 0
            WHEN 'On Hold'      THEN 7
            ELSE 0
        END AS days_allowed;
$$;

GRANT EXECUTE ON FUNCTION public.fn_stage_config(opportunity_stage) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_stage_config(opportunity_stage) TO service_role;


-- =====================================================
-- PART 1: Fix mark_rejected to update probability/next_step
-- =====================================================

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

    RAISE NOTICE '[173][%] rpc_customer_quotation_mark_rejected started for quotation_id=%', v_correlation_id, p_quotation_id;

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

    -- Idempotency: already rejected
    IF v_quotation.status = 'rejected' THEN
        RETURN jsonb_build_object('success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
            'quotation_status', v_quotation.status, 'is_idempotent', TRUE, 'message', 'Already rejected.', 'correlation_id', v_correlation_id);
    END IF;

    -- State machine validation
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

    -- Derive effective lead_id
    v_effective_lead_id := v_quotation.lead_id;

    -- Lock and read opportunity BEFORE quotation UPDATE
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;
        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            IF v_effective_lead_id IS NULL AND v_opportunity.source_lead_id IS NOT NULL THEN
                v_effective_lead_id := v_opportunity.source_lead_id;
            END IF;
        END IF;
    END IF;

    -- Also try to derive lead_id from ticket
    IF v_effective_lead_id IS NULL AND v_saved_ticket_id IS NOT NULL THEN
        SELECT t.lead_id INTO v_effective_lead_id FROM public.tickets t WHERE t.id = v_saved_ticket_id AND t.lead_id IS NOT NULL;
    END IF;

    -- Set GUC flag to prevent AFTER UPDATE trigger interference
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

    -- Broaden previous_rejected_count
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

            -- [173] Get stage config for probability/next_step
            SELECT sc.probability, sc.next_step, sc.days_allowed
            INTO v_stage_prob, v_stage_next_step, v_stage_days
            FROM public.fn_stage_config(v_new_opp_stage) sc;

            UPDATE public.opportunities opp_upd
            SET stage = v_new_opp_stage,
                probability = COALESCE(v_stage_prob, opp_upd.probability),
                next_step = COALESCE(v_stage_next_step, opp_upd.next_step),
                next_step_due_date = CASE WHEN v_stage_days > 0 THEN CURRENT_DATE + v_stage_days ELSE opp_upd.next_step_due_date END,
                competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
            v_pipeline_updated := TRUE;
        ELSE
            v_new_opp_stage := v_old_opp_stage;
            UPDATE public.opportunities opp_upd
            SET competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
        END IF;

        -- Insert stage history
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

        -- Insert pipeline update
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

        -- Activity subject
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
        'stage_history_inserted', v_stage_history_inserted, 'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted, 'multi_shipment_costs_updated', v_multi_cost_count,
        'lead_id', v_effective_lead_id, 'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[173][%] rpc_customer_quotation_mark_rejected FAILED: % (%)', v_correlation_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- =====================================================
-- PART 2: Fix mark_sent to update probability/next_step
-- Only the opportunity UPDATE section changes
-- =====================================================

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
    v_effective_lead_id TEXT := NULL;
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
    v_quotation_sequence INTEGER := 1;
    v_sequence_label TEXT := '';
    v_previous_rejected_count INTEGER := 0;
    v_multi_cost_count INTEGER := 0;
    v_return_ticket_status TEXT := NULL;
    v_stage_prob INTEGER;
    v_stage_next_step TEXT;
    v_stage_days INTEGER;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    SELECT cq.* INTO v_quotation FROM public.customer_quotations cq WHERE cq.id = p_quotation_id FOR UPDATE;
    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found', 'error_code', 'QUOTATION_NOT_FOUND', 'correlation_id', v_correlation_id);
    END IF;

    v_auth_check := fn_check_quotation_authorization(p_quotation_id, p_actor_user_id, 'send');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object('success', FALSE, 'error', v_auth_check->>'error', 'error_code', v_auth_check->>'error_code', 'correlation_id', v_correlation_id);
    END IF;

    IF v_quotation.status = 'sent' THEN v_is_resend := TRUE; END IF;

    IF NOT v_is_resend THEN
        v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'sent');
        IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
            RETURN jsonb_build_object('success', FALSE, 'error', v_transition_check->>'error', 'error_code', v_transition_check->>'error_code', 'correlation_id', v_correlation_id);
        END IF;
    END IF;

    PERFORM set_config('app.in_quotation_rpc', 'true', true);

    -- 1. UPDATE QUOTATION
    UPDATE public.customer_quotations cq_upd
    SET status = 'sent'::customer_quotation_status, sent_via = COALESCE(p_sent_via, cq_upd.sent_via),
        sent_to = COALESCE(p_sent_to, cq_upd.sent_to), sent_at = COALESCE(cq_upd.sent_at, NOW()), updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id RETURNING * INTO v_quotation;

    -- 2. RESOLVE OPPORTUNITY
    IF NOT v_is_resend THEN
        SELECT resolved.* INTO v_resolved_opp FROM public.fn_resolve_or_create_opportunity(p_quotation_id, p_actor_user_id, p_allow_autocreate) resolved;
        IF v_resolved_opp.error_code IS NOT NULL THEN
            RETURN jsonb_build_object('success', FALSE, 'error', COALESCE(v_resolved_opp.error_message, 'Failed to resolve opportunity'),
                'error_code', v_resolved_opp.error_code, 'quotation_id', v_quotation.id, 'correlation_id', v_correlation_id);
        END IF;
        IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_resolved_opp.opportunity_id;
            v_opportunity_auto_created := v_resolved_opp.was_created;
            IF v_quotation.opportunity_id IS NULL THEN
                UPDATE public.customer_quotations SET opportunity_id = v_effective_opportunity_id WHERE id = p_quotation_id;
            END IF;
        END IF;
        IF v_effective_opportunity_id IS NULL AND v_quotation.opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_quotation.opportunity_id;
        END IF;
    ELSE
        v_effective_opportunity_id := v_quotation.opportunity_id;
    END IF;

    v_effective_lead_id := v_quotation.lead_id;

    -- Quotation sequence
    SELECT COUNT(*) INTO v_quotation_sequence FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;

    SELECT COUNT(*) INTO v_previous_rejected_count FROM public.customer_quotations cq2
    WHERE cq2.id != p_quotation_id AND cq2.status = 'rejected'
      AND ((v_effective_opportunity_id IS NOT NULL AND cq2.opportunity_id = v_effective_opportunity_id)
          OR (v_quotation.ticket_id IS NOT NULL AND cq2.ticket_id = v_quotation.ticket_id)
          OR (v_quotation.ticket_id IS NULL AND v_quotation.lead_id IS NOT NULL AND cq2.lead_id = v_quotation.lead_id));

    v_sequence_label := CASE v_quotation_sequence WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE v_quotation_sequence::TEXT || 'th' END;

    -- 3. UPDATE OPPORTUNITY
    IF v_effective_opportunity_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;
        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            IF v_effective_lead_id IS NULL AND v_opportunity.source_lead_id IS NOT NULL THEN
                v_effective_lead_id := v_opportunity.source_lead_id;
            END IF;

            IF v_previous_rejected_count > 0 AND v_opportunity.stage NOT IN ('Negotiation', 'Closed Won', 'Closed Lost') THEN
                v_new_opp_stage := 'Negotiation'::opportunity_stage;
                SELECT sc.probability, sc.next_step, sc.days_allowed INTO v_stage_prob, v_stage_next_step, v_stage_days FROM public.fn_stage_config(v_new_opp_stage) sc;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage, probability = COALESCE(v_stage_prob, opp_upd.probability),
                    next_step = COALESCE(v_stage_next_step, opp_upd.next_step),
                    next_step_due_date = CASE WHEN v_stage_days > 0 THEN CURRENT_DATE + v_stage_days ELSE opp_upd.next_step_due_date END,
                    estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value), updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;

            ELSIF v_opportunity.stage IN ('Prospecting', 'Discovery') AND v_previous_rejected_count = 0 THEN
                v_new_opp_stage := 'Quote Sent'::opportunity_stage;
                SELECT sc.probability, sc.next_step, sc.days_allowed INTO v_stage_prob, v_stage_next_step, v_stage_days FROM public.fn_stage_config(v_new_opp_stage) sc;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage, probability = COALESCE(v_stage_prob, opp_upd.probability),
                    next_step = COALESCE(v_stage_next_step, opp_upd.next_step),
                    next_step_due_date = CASE WHEN v_stage_days > 0 THEN CURRENT_DATE + v_stage_days ELSE opp_upd.next_step_due_date END,
                    estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value), updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;

            ELSIF v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost') THEN
                v_new_opp_stage := v_opportunity.stage;
                UPDATE public.opportunities opp_upd
                SET estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value), updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
            ELSE
                v_new_opp_stage := v_opportunity.stage;
            END IF;

            -- Stage history
            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                IF NOT EXISTS (SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id AND osh.old_stage = v_old_opp_stage
                    AND osh.new_stage = v_new_opp_stage AND osh.changed_at > NOW() - INTERVAL '2 minutes') THEN
                    INSERT INTO public.opportunity_stage_history (opportunity_id, from_stage, to_stage, old_stage, new_stage, changed_by, notes, changed_at)
                    VALUES (v_effective_opportunity_id, v_old_opp_stage, v_new_opp_stage, v_old_opp_stage, v_new_opp_stage,
                        p_actor_user_id, '[' || v_correlation_id || '] Stage changed due to quotation sent (previous_rejected: ' || v_previous_rejected_count || ')', NOW());
                    v_stage_history_inserted := TRUE;
                END IF;
            END IF;

            -- Pipeline updates
            IF NOT EXISTS (SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id AND pu.old_stage = v_old_opp_stage
                AND pu.new_stage = COALESCE(v_new_opp_stage, v_old_opp_stage) AND pu.created_at > NOW() - INTERVAL '2 minutes') THEN
                INSERT INTO public.pipeline_updates (opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at)
                VALUES (v_effective_opportunity_id,
                    '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer'
                        || CASE WHEN v_previous_rejected_count > 0 THEN ' (revised after ' || v_previous_rejected_count || ' rejection(s))' ELSE '' END,
                    'Email'::approach_method, v_old_opp_stage, COALESCE(v_new_opp_stage, v_old_opp_stage), p_actor_user_id, NOW());
                v_pipeline_updates_inserted := TRUE;
            END IF;

            -- Activity
            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                v_activity_subject := 'Pipeline Update: ' || v_old_opp_stage::TEXT || ' → ' || v_new_opp_stage::TEXT;
            ELSIF v_previous_rejected_count > 0 THEN
                v_activity_subject := v_sequence_label || ' Quotation Sent (Negotiation in progress)';
            ELSE
                v_activity_subject := v_sequence_label || ' Quotation Sent';
            END IF;
            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' sent via ' || COALESCE(p_sent_via, 'system') || ' to ' || COALESCE(p_sent_to, 'customer');

            INSERT INTO public.activities (related_opportunity_id, related_lead_id, related_account_id, owner_user_id, created_by,
                activity_type, subject, description, status, due_date, completed_at, created_at, updated_at)
            VALUES (v_effective_opportunity_id, v_effective_lead_id, v_opportunity.account_id, p_actor_user_id, p_actor_user_id,
                'Email'::activity_type_v2, v_activity_subject, v_activity_description,
                'Completed'::activity_status, CURRENT_DATE, NOW(), NOW(), NOW());
            v_activities_inserted := TRUE;
        END IF;
    END IF;

    -- Derive lead_id from ticket if still null
    IF v_effective_lead_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT lead_id INTO v_effective_lead_id FROM public.tickets WHERE id = v_quotation.ticket_id AND lead_id IS NOT NULL;
    END IF;

    -- 3b. UPDATE TICKET
    IF v_quotation.ticket_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT t.* INTO v_ticket FROM public.tickets t WHERE t.id = v_quotation.ticket_id FOR UPDATE;
        IF v_ticket IS NOT NULL THEN
            v_old_ticket_status := v_ticket.status;
            UPDATE public.tickets t_upd
            SET status = 'waiting_customer'::ticket_status, pending_response_from = 'creator', updated_at = NOW()
            WHERE t_upd.id = v_quotation.ticket_id RETURNING * INTO v_ticket;
            v_return_ticket_status := v_ticket.status::TEXT;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_quotation.ticket_id, 'customer_quotation_sent'::ticket_event_type, p_actor_user_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object('status', 'waiting_customer', 'sent_via', p_sent_via, 'sent_to', p_sent_to,
                    'quotation_number', v_quotation.quotation_number, 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system'), NOW());

            INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
            VALUES (v_quotation.ticket_id, p_actor_user_id,
                v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') sent to customer via ' || COALESCE(p_sent_via, 'system') || ' to ' || COALESCE(p_sent_to, 'customer') || '.',
                FALSE, NOW());
        END IF;
    END IF;

    -- 4. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        IF v_is_resend THEN
            UPDATE public.leads ld SET quotation_status = 'sent', latest_quotation_id = v_quotation.id, updated_at = NOW() WHERE ld.lead_id = v_quotation.lead_id;
        ELSE
            UPDATE public.leads ld SET quotation_status = 'sent', latest_quotation_id = v_quotation.id, quotation_count = COALESCE(ld.quotation_count, 0) + 1, updated_at = NOW() WHERE ld.lead_id = v_quotation.lead_id;
        END IF;
    END IF;

    -- 5. UPDATE OPERATIONAL COSTS
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes trq SET status = 'sent_to_customer'::quote_status, updated_at = NOW() WHERE trq.id = v_quotation.operational_cost_id;
    END IF;
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq SET status = 'sent_to_customer'::quote_status, updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids) AND trq.status = 'submitted';
        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status, 'opportunity_id', COALESCE(v_effective_opportunity_id, v_quotation.opportunity_id),
        'old_stage', v_old_opp_stage, 'new_stage', v_new_opp_stage, 'ticket_id', v_quotation.ticket_id,
        'ticket_status', v_return_ticket_status, 'is_resend', v_is_resend,
        'pipeline_updated', v_pipeline_updated, 'opportunity_auto_created', v_opportunity_auto_created,
        'stage_history_inserted', v_stage_history_inserted, 'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted, 'lead_id', v_effective_lead_id, 'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[173][%] rpc_customer_quotation_mark_sent FAILED: % (%)', v_correlation_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- =====================================================
-- PART 3: Fix mark_accepted to update probability/next_step
-- (also includes migration 172 account fix)
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
    v_account_sync_result JSONB;
    v_stage_prob INTEGER;
    v_stage_next_step TEXT;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    SELECT * INTO v_quotation FROM public.customer_quotations WHERE id = p_quotation_id FOR UPDATE;
    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found', 'error_code', 'QUOTATION_NOT_FOUND', 'correlation_id', v_correlation_id);
    END IF;

    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'accept');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object('success', FALSE, 'error', v_auth_check->>'error', 'error_code', v_auth_check->>'error_code', 'correlation_id', v_correlation_id);
    END IF;

    IF v_quotation.status = 'accepted' THEN
        RETURN jsonb_build_object('success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
            'quotation_status', v_quotation.status, 'is_idempotent', TRUE, 'message', 'Already accepted.', 'correlation_id', v_correlation_id);
    END IF;

    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'accepted');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object('success', FALSE, 'error', v_transition_check->>'error', 'error_code', v_transition_check->>'error_code', 'correlation_id', v_correlation_id);
    END IF;

    -- Derive opportunity_id (TEXT, not UUID)
    v_effective_opportunity_id := v_quotation.opportunity_id;
    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id FROM public.leads WHERE lead_id = v_quotation.lead_id AND opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;
    IF v_effective_opportunity_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id FROM public.tickets WHERE id = v_quotation.ticket_id AND opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;

    v_effective_lead_id := v_quotation.lead_id;

    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity FROM public.opportunities WHERE opportunity_id = v_effective_opportunity_id FOR UPDATE;
        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            IF v_effective_lead_id IS NULL AND v_opportunity.source_lead_id IS NOT NULL THEN
                v_effective_lead_id := v_opportunity.source_lead_id;
            END IF;
        END IF;
    END IF;

    IF v_effective_lead_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT lead_id INTO v_effective_lead_id FROM public.tickets WHERE id = v_quotation.ticket_id AND lead_id IS NOT NULL;
    END IF;

    PERFORM set_config('app.in_quotation_rpc', 'true', true);

    -- 1. UPDATE QUOTATION
    UPDATE public.customer_quotations
    SET status = 'accepted'::customer_quotation_status, accepted_at = NOW(), updated_at = NOW()
    WHERE id = p_quotation_id RETURNING * INTO v_quotation;

    -- 2. UPDATE OPPORTUNITY -> Closed Won
    IF v_effective_opportunity_id IS NOT NULL AND v_opportunity IS NOT NULL THEN
        v_new_opp_stage := 'Closed Won'::opportunity_stage;

        -- [173] Get stage config for probability
        SELECT sc.probability, sc.next_step INTO v_stage_prob, v_stage_next_step FROM public.fn_stage_config(v_new_opp_stage) sc;

        UPDATE public.opportunities
        SET stage = v_new_opp_stage, probability = COALESCE(v_stage_prob, probability),
            next_step = v_stage_next_step,
            estimated_value = COALESCE(v_quotation.total_selling_rate, estimated_value),
            deal_value = v_quotation.total_selling_rate,
            closed_at = NOW(), updated_at = NOW()
        WHERE opportunity_id = v_effective_opportunity_id;

        v_stage_changed := v_old_opp_stage IS DISTINCT FROM v_new_opp_stage;

        -- Stage history
        IF v_stage_changed THEN
            IF NOT EXISTS (SELECT 1 FROM public.opportunity_stage_history osh
                WHERE osh.opportunity_id = v_effective_opportunity_id AND osh.new_stage = v_new_opp_stage
                AND osh.changed_at > NOW() - INTERVAL '2 minutes') THEN
                INSERT INTO public.opportunity_stage_history (opportunity_id, from_stage, to_stage, old_stage, new_stage, changed_by, notes, changed_at)
                VALUES (v_effective_opportunity_id, v_old_opp_stage, v_new_opp_stage, v_old_opp_stage, v_new_opp_stage,
                    v_actor_id, '[' || v_correlation_id || '] Deal won - quotation accepted', NOW());
                v_stage_history_inserted := TRUE;
            END IF;
        END IF;

        -- Pipeline update
        IF NOT EXISTS (SELECT 1 FROM public.pipeline_updates pu
            WHERE pu.opportunity_id = v_effective_opportunity_id AND pu.new_stage = v_new_opp_stage
            AND pu.updated_at > NOW() - INTERVAL '2 minutes') THEN
            INSERT INTO public.pipeline_updates (opportunity_id, approach_method, old_stage, new_stage, updated_by, notes, updated_at)
            VALUES (v_effective_opportunity_id, 'Email'::approach_method, v_old_opp_stage, v_new_opp_stage, v_actor_id,
                '[' || v_correlation_id || '] Deal closed won - quotation ' || v_quotation.quotation_number || ' accepted', NOW());
            v_pipeline_updates_inserted := TRUE;
        END IF;

        -- Activity
        v_activity_subject := 'Pipeline Update: ' || v_old_opp_stage::TEXT || ' → Closed Won';
        v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' accepted. Deal value: ' || COALESCE(v_quotation.currency, 'IDR') || ' ' || COALESCE(v_quotation.total_selling_rate::TEXT, '0');

        INSERT INTO public.activities (related_opportunity_id, related_lead_id, related_account_id, owner_user_id, created_by,
            activity_type, subject, description, status, due_date, completed_at, created_at, updated_at)
        VALUES (v_effective_opportunity_id, v_effective_lead_id, v_opportunity.account_id, v_actor_id, v_actor_id,
            'Email'::activity_type_v2, v_activity_subject, v_activity_description,
            'Completed'::activity_status, CURRENT_DATE, NOW(), NOW(), NOW());
        v_activities_inserted := TRUE;

        -- [172] Account sync via sync_opportunity_to_account (correct column: account_status)
        IF v_opportunity.account_id IS NOT NULL THEN
            BEGIN
                v_account_sync_result := public.sync_opportunity_to_account(v_effective_opportunity_id, 'won');
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING '[173] Account sync failed (non-fatal): %', SQLERRM;
                v_account_sync_result := jsonb_build_object('success', FALSE, 'error', SQLERRM);
            END;
        END IF;
    END IF;

    -- 3. UPDATE TICKET -> closed
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT * INTO v_ticket FROM public.tickets WHERE id = v_quotation.ticket_id FOR UPDATE;
        IF v_ticket IS NOT NULL THEN
            v_old_ticket_status := v_ticket.status;
            UPDATE public.tickets SET status = 'closed'::ticket_status, close_outcome = 'won', closed_at = NOW(), updated_at = NOW()
            WHERE id = v_quotation.ticket_id RETURNING * INTO v_ticket;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_quotation.ticket_id, 'status_changed'::ticket_event_type, v_actor_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object('status', 'closed', 'close_outcome', 'won', 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Ticket closed - quotation accepted', NOW());

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, new_value, notes, created_at)
            VALUES (v_quotation.ticket_id, 'closed'::ticket_event_type, v_actor_id,
                jsonb_build_object('close_outcome', 'won', 'triggered_by', 'quotation_accepted', 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Ticket auto-closed due to quotation acceptance', NOW());

            UPDATE public.ticket_sla_tracking SET resolution_at = COALESCE(resolution_at, NOW()), updated_at = NOW()
            WHERE ticket_id = v_quotation.ticket_id AND resolution_at IS NULL;

            BEGIN
                PERFORM public.record_response_exchange(v_quotation.ticket_id, v_actor_id, NULL);
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING '[173] Failed to record response exchange: %', SQLERRM;
            END;
        END IF;
    END IF;

    -- 4. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads SET quotation_status = 'accepted', updated_at = NOW() WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 5. UPDATE OPERATIONAL COSTS
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes SET status = 'accepted'::quote_status, updated_at = NOW() WHERE id = v_quotation.operational_cost_id;
    END IF;
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq SET status = 'accepted'::quote_status, updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids) AND trq.status IN ('submitted', 'sent_to_customer');
        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status, 'opportunity_id', v_effective_opportunity_id,
        'old_stage', v_old_opp_stage, 'new_stage', v_new_opp_stage, 'stage_changed', v_stage_changed,
        'deal_value', v_quotation.total_selling_rate, 'ticket_id', v_quotation.ticket_id,
        'ticket_status', COALESCE(v_ticket.status::TEXT, 'closed'), 'close_outcome', 'won',
        'stage_history_inserted', v_stage_history_inserted, 'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted, 'multi_shipment_costs_updated', v_multi_cost_count,
        'lead_id', v_effective_lead_id, 'account_sync_result', v_account_sync_result, 'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[173][%] rpc_customer_quotation_mark_accepted FAILED: % (%)', v_correlation_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- =====================================================
-- PART 4: Re-grant permissions
-- =====================================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO service_role;


-- =====================================================
-- SUMMARY
-- =====================================================
-- Migration 173 adds:
-- 1. fn_stage_config() helper: maps stage → probability, next_step, days_allowed
-- 2. mark_rejected: now sets probability=75, next_step='Close Deal' when moving to Negotiation
-- 3. mark_sent: now sets probability=50/75, next_step when moving to Quote Sent/Negotiation
-- 4. mark_accepted: now sets probability=100, deal_value, next_step=NULL for Closed Won
--    Also includes migration 172 account fix (sync_opportunity_to_account)
-- =====================================================
