-- =====================================================
-- Migration 142: Fix Quotation Activity & Stage Transition
-- =====================================================
-- Fixes:
-- 1. mark_sent: 2nd+ quotation after rejection should transition Quote Sent → Negotiation
-- 2. mark_sent: Update estimated_value for all non-terminal stages (not just Prospecting/Discovery)
-- 3. mark_sent: Add ticket_comments for activity timeline visibility
-- 4. mark_rejected: Add ticket_comments for activity timeline visibility
-- =====================================================


-- ============================================
-- PART 1: Fix rpc_customer_quotation_mark_sent
-- Changes from migration 138:
--   a) When stage='Quote Sent' AND previous_rejected_count > 0 → transition to 'Negotiation'
--   b) Update estimated_value for all non-terminal stages
--   c) Add ticket_comments insertion alongside ticket_events
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
    v_quotation_sequence INTEGER := 1;
    v_sequence_label TEXT := '';
    v_previous_rejected_count INTEGER := 0;
    v_multi_cost_count INTEGER := 0;
    v_return_ticket_status TEXT := NULL;
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
    ELSE
        v_effective_opportunity_id := v_quotation.opportunity_id;
    END IF;

    -- Quotation sequence
    SELECT COUNT(*) INTO v_quotation_sequence FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;
    SELECT COUNT(*) INTO v_previous_rejected_count FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.status = 'rejected';
    v_sequence_label := CASE v_quotation_sequence WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE v_quotation_sequence::TEXT || 'th' END;

    -- 3. UPDATE OPPORTUNITY
    IF v_effective_opportunity_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- FIX (migration 142): Improved stage transition logic
            IF v_opportunity.stage IN ('Prospecting', 'Discovery') THEN
                -- First quotation sent: Prospecting/Discovery → Quote Sent
                v_new_opp_stage := 'Quote Sent'::opportunity_stage;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage,
                    estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;

            ELSIF v_opportunity.stage = 'Quote Sent' AND v_previous_rejected_count > 0 THEN
                -- 2nd+ quotation after rejection(s): Quote Sent → Negotiation
                v_new_opp_stage := 'Negotiation'::opportunity_stage;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage,
                    estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;

            ELSIF v_opportunity.stage IN ('Quote Sent', 'Negotiation') THEN
                -- Already in Quote Sent or Negotiation: stay but update estimated_value
                v_new_opp_stage := v_opportunity.stage;
                UPDATE public.opportunities opp_upd
                SET estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

            ELSIF v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost') THEN
                -- Other non-terminal stages: stay but update estimated_value
                v_new_opp_stage := v_opportunity.stage;
                UPDATE public.opportunities opp_upd
                SET estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

            ELSE
                -- Terminal stages (Closed Won/Closed Lost): don't change anything
                v_new_opp_stage := v_opportunity.stage;
            END IF;

            -- Stage history
            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.old_stage = v_old_opp_stage AND osh.new_stage = v_new_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (opportunity_id, old_stage, new_stage, changed_by, notes, changed_at)
                    VALUES (v_effective_opportunity_id, v_old_opp_stage, v_new_opp_stage, p_actor_user_id,
                        '[' || v_correlation_id || '] Stage changed due to quotation sent', NOW());
                    v_stage_history_inserted := TRUE;
                END IF;
            END IF;

            -- Pipeline updates
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
                    '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer',
                    'Email'::approach_method,
                    v_old_opp_stage,
                    COALESCE(v_new_opp_stage, v_old_opp_stage),
                    p_actor_user_id,
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;
            END IF;

            -- Activity
            v_activity_subject := v_sequence_label || ' Quotation Sent';
            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                v_activity_subject := v_activity_subject || ' → Stage moved to ' || v_new_opp_stage::TEXT;
            ELSIF v_previous_rejected_count > 0 THEN
                v_activity_subject := v_activity_subject || ' (Negotiation in progress)';
            END IF;
            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' sent via ' || COALESCE(p_sent_via, 'system') || ' to ' || COALESCE(p_sent_to, 'customer');

            INSERT INTO public.activities (
                related_opportunity_id, related_lead_id, related_account_id, owner_user_id, created_by,
                activity_type, subject, description, status, due_date, completed_at, created_at, updated_at
            ) VALUES (
                v_effective_opportunity_id, v_quotation.lead_id, v_opportunity.account_id, p_actor_user_id, p_actor_user_id,
                'Email'::activity_type_v2, v_activity_subject, v_activity_description,
                'Completed'::activity_status, CURRENT_DATE, NOW(), NOW(), NOW()
            );
            v_activities_inserted := TRUE;
        END IF;
    END IF;

    -- 3b. UPDATE TICKET
    IF v_quotation.ticket_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT t.* INTO v_ticket FROM public.tickets t WHERE t.id = v_quotation.ticket_id FOR UPDATE;
        IF v_ticket IS NOT NULL THEN
            v_old_ticket_status := v_ticket.status;
            UPDATE public.tickets t_upd
            SET status = 'waiting_customer'::ticket_status,
                pending_response_from = 'creator',
                updated_at = NOW()
            WHERE t_upd.id = v_quotation.ticket_id
            RETURNING * INTO v_ticket;
            v_return_ticket_status := v_ticket.status::TEXT;

            -- Ticket event
            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_quotation.ticket_id, 'customer_quotation_sent'::ticket_event_type, p_actor_user_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object('status', 'waiting_customer', 'sent_via', p_sent_via, 'sent_to', p_sent_to, 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system'), NOW());

            -- FIX (migration 142): Add ticket_comment for activity timeline visibility
            INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
            VALUES (v_quotation.ticket_id, p_actor_user_id,
                v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') sent to customer via ' || COALESCE(p_sent_via, 'system') || ' to ' || COALESCE(p_sent_to, 'customer') || '.',
                TRUE, NOW());
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
        'activities_inserted', v_activities_inserted, 'quotation_sequence', v_quotation_sequence,
        'sequence_label', v_sequence_label, 'previous_rejected_count', v_previous_rejected_count,
        'multi_shipment_costs_updated', v_multi_cost_count,
        'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- PART 2: Fix rpc_customer_quotation_mark_rejected
-- Changes from migration 141:
--   a) Add ticket_comments insertion for activity timeline visibility
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
    v_return_ticket_status TEXT := NULL;
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

    -- State machine validation (JSONB return, extract 'valid' key)
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'rejected');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object('success', FALSE, 'error', v_transition_check->>'error', 'error_code', v_transition_check->>'error_code', 'correlation_id', v_correlation_id);
    END IF;

    -- Derive opportunity_id from lead or ticket if not directly set
    v_effective_opportunity_id := v_quotation.opportunity_id;
    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT ld.opportunity_id INTO v_derived_opportunity_id FROM public.leads ld WHERE ld.lead_id = v_quotation.lead_id AND ld.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;
    IF v_effective_opportunity_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.opportunity_id INTO v_derived_opportunity_id FROM public.tickets t WHERE t.id = v_quotation.ticket_id AND t.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;

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
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.status = 'rejected';
    v_sequence_label := CASE v_quotation_sequence WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE v_quotation_sequence::TEXT || 'th' END;

    -- 2. UPDATE OPPORTUNITY -> Negotiation
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            IF v_opportunity.stage NOT IN ('Negotiation', 'Closed Won', 'Closed Lost') THEN
                v_new_opp_stage := 'Negotiation'::opportunity_stage;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage,
                    competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                    competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                    customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;
            ELSE
                -- Still update competitor/budget even if stage doesn't change
                UPDATE public.opportunities opp_upd
                SET competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                    competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                    customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_new_opp_stage := v_opportunity.stage;
            END IF;

            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.old_stage = v_old_opp_stage AND osh.new_stage = v_new_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (opportunity_id, old_stage, new_stage, changed_by, notes, changed_at)
                    VALUES (v_effective_opportunity_id, v_old_opp_stage, v_new_opp_stage, v_actor_id,
                        '[' || v_correlation_id || '] Stage changed due to quotation rejection', NOW());
                    v_stage_history_inserted := TRUE;
                END IF;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.old_stage = v_old_opp_stage AND pu.new_stage = COALESCE(v_new_opp_stage, v_old_opp_stage)
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at)
                VALUES (v_effective_opportunity_id,
                    '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected by customer',
                    'Email'::approach_method, v_old_opp_stage, COALESCE(v_new_opp_stage, v_old_opp_stage), v_actor_id, NOW());
                v_pipeline_updates_inserted := TRUE;
            END IF;

            v_activity_subject := v_sequence_label || ' Quotation Rejected';
            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                v_activity_subject := v_activity_subject || ' → Stage moved to ' || v_new_opp_stage::TEXT;
            END IF;
            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected. Reason: ' || p_reason_type::TEXT;
            IF p_competitor_name IS NOT NULL THEN v_activity_description := v_activity_description || '. Competitor: ' || p_competitor_name; END IF;
            IF p_competitor_amount IS NOT NULL THEN v_activity_description := v_activity_description || '. Competitor price: ' || p_currency || ' ' || p_competitor_amount::TEXT; END IF;

            INSERT INTO public.activities (
                related_opportunity_id, related_lead_id, related_account_id, owner_user_id, created_by,
                activity_type, subject, description, status, due_date, completed_at, created_at, updated_at
            ) VALUES (
                v_effective_opportunity_id, v_quotation.lead_id, v_opportunity.account_id, v_actor_id, v_actor_id,
                'Email'::activity_type_v2, v_activity_subject, v_activity_description,
                'Completed'::activity_status, CURRENT_DATE, NOW(), NOW(), NOW()
            );
            v_activities_inserted := TRUE;
        END IF;
    END IF;

    -- 3. UPDATE TICKET -> need_adjustment
    -- Guard against already closed/resolved tickets
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.* INTO v_ticket FROM public.tickets t WHERE t.id = v_quotation.ticket_id FOR UPDATE;
        IF v_ticket IS NOT NULL AND v_ticket.status NOT IN ('closed', 'resolved') THEN
            v_old_ticket_status := v_ticket.status;
            UPDATE public.tickets t_upd
            SET status = 'need_adjustment'::ticket_status, pending_response_from = 'assignee', updated_at = NOW()
            WHERE t_upd.id = v_quotation.ticket_id RETURNING * INTO v_ticket;
            v_return_ticket_status := v_ticket.status::TEXT;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_quotation.ticket_id, 'customer_quotation_rejected'::ticket_event_type, v_actor_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object('status', 'need_adjustment', 'rejection_reason', p_reason_type::TEXT, 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected. Reason: ' || p_reason_type::TEXT, NOW());

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, new_value, notes, created_at)
            VALUES (v_quotation.ticket_id, 'request_adjustment'::ticket_event_type, v_actor_id,
                jsonb_build_object('reason', p_reason_type::TEXT, 'triggered_by', 'quotation_rejection', 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Rate adjustment requested due to quotation rejection', NOW());

            -- FIX (migration 142): Add ticket_comment for activity timeline visibility
            INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
            VALUES (v_quotation.ticket_id, v_actor_id,
                'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT ||
                CASE WHEN p_competitor_name IS NOT NULL THEN '. Competitor: ' || p_competitor_name ELSE '' END ||
                CASE WHEN p_competitor_amount IS NOT NULL THEN '. Competitor price: ' || p_currency || ' ' || p_competitor_amount::TEXT ELSE '' END ||
                CASE WHEN p_customer_budget IS NOT NULL THEN '. Customer budget: ' || p_currency || ' ' || p_customer_budget::TEXT ELSE '' END ||
                CASE WHEN p_notes IS NOT NULL THEN '. Notes: ' || p_notes ELSE '' END,
                TRUE, NOW());
        ELSE
            -- Ticket already closed/resolved - record event without changing status
            v_return_ticket_status := COALESCE(v_ticket.status::TEXT, 'unknown');
            IF v_ticket IS NOT NULL THEN
                INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, new_value, notes, created_at)
                VALUES (v_quotation.ticket_id, 'customer_quotation_rejected'::ticket_event_type, v_actor_id,
                    jsonb_build_object('rejection_reason', p_reason_type::TEXT, 'ticket_status_unchanged', TRUE, 'correlation_id', v_correlation_id),
                    '[' || v_correlation_id || '] Quotation rejected (ticket already ' || v_ticket.status::TEXT || ', status unchanged)', NOW());
            END IF;
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
        'ticket_id', v_quotation.ticket_id, 'ticket_status', v_return_ticket_status,
        'stage_history_inserted', v_stage_history_inserted, 'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted, 'multi_shipment_costs_updated', v_multi_cost_count,
        'quotation_sequence', v_quotation_sequence, 'sequence_label', v_sequence_label,
        'previous_rejected_count', v_previous_rejected_count,
        'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- PART 3: Re-grant permissions
-- ============================================
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;


-- ============================================
-- PART 4: Fix format_duration to show seconds for sub-minute values
-- Previously: 42 seconds displayed as "0m" (seconds omitted entirely)
-- Fix: Show "42s" for values under 60 seconds
-- ============================================

CREATE OR REPLACE FUNCTION public.format_duration(
    p_seconds INTEGER
)
RETURNS TEXT AS $$
DECLARE
    v_days INTEGER;
    v_hours INTEGER;
    v_minutes INTEGER;
    v_secs INTEGER;
    v_result TEXT := '';
BEGIN
    IF p_seconds IS NULL THEN
        RETURN 'N/A';
    END IF;

    v_days := p_seconds / 86400;
    v_hours := (p_seconds % 86400) / 3600;
    v_minutes := (p_seconds % 3600) / 60;
    v_secs := p_seconds % 60;

    IF v_days > 0 THEN
        v_result := v_days || 'd ';
    END IF;

    IF v_hours > 0 OR v_days > 0 THEN
        v_result := v_result || v_hours || 'h ';
    END IF;

    IF v_minutes > 0 OR v_hours > 0 OR v_days > 0 THEN
        v_result := v_result || v_minutes || 'm';
    END IF;

    -- Show seconds when total time is under 1 minute
    IF v_days = 0 AND v_hours = 0 AND v_minutes = 0 THEN
        v_result := v_secs || 's';
    END IF;

    RETURN TRIM(v_result);
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ============================================
-- SUMMARY
-- ============================================
-- 1. mark_sent: Quote Sent → Negotiation when 2nd+ quotation after rejection(s)
-- 2. mark_sent: estimated_value updated for all non-terminal stages
-- 3. mark_sent: ticket_comments added for activity timeline visibility
-- 4. mark_rejected: ticket_comments added with rejection details
-- 5. Re-granted permissions for both functions
-- 6. format_duration: show seconds for sub-minute values (was showing "0m" for 42s)
