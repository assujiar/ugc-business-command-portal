-- =====================================================
-- Migration 141: Fix compile errors in migration 140
-- =====================================================
-- Migration 140 had COMPILE-TIME errors that prevent the entire
-- migration from applying (all changes rolled back):
--
-- 1. mark_rejected: undeclared variable v_activity_subject
-- 2. mark_rejected: fn_validate_quotation_transition returns JSONB,
--    used as BOOLEAN (IF NOT fn_validate_quotation_transition(...))
-- 3. revoke: same JSONB-as-BOOLEAN bug
-- 4. mark_rejected: wrong parameter name p_reason_notes (API sends p_notes)
-- 5. mark_rejected: wrong enum value budget_tidak_cukup
--    (correct: budget_customer_tidak_cukup)
-- 6. mark_rejected: missing auth check, idempotency, opportunity derivation
-- 7. revoke: missing auth check, idempotency, quotation_status on opportunity
--
-- This migration re-applies ALL migration 140 fixes with correct code.
-- Based on migration 138 (mark_rejected) and 137 (revoke) as correct
-- foundations, with the intended 140 enhancements merged in.
-- =====================================================


-- ============================================
-- PART 1: Re-add 'WhatsApp' to activity_type_v2 (idempotent)
-- May already exist if migration 140 partially applied
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'WhatsApp' AND enumtypid = 'activity_type_v2'::regtype) THEN
        ALTER TYPE activity_type_v2 ADD VALUE 'WhatsApp';
    END IF;
END $$;


-- ============================================
-- PART 2: Fix trigger_sync_ticket_status_to_quotation
-- When ticket closes with 'won', remaining draft/sent quotations
-- should be EXPIRED (not accepted). The specific accepted quotation
-- was already set by the RPC.
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_sync_ticket_status_to_quotation()
RETURNS TRIGGER AS $$
DECLARE
    v_quotation_status TEXT;
    v_quotation RECORD;
BEGIN
    -- Only handle meaningful status transitions
    IF NEW.status = 'closed' AND NEW.close_outcome IS NOT NULL THEN
        IF NEW.close_outcome = 'won' THEN
            -- Ticket closed as won: the accepted quotation was already set by RPC.
            -- Set remaining draft/sent quotations to 'expired' (NOT 'accepted').
            FOR v_quotation IN
                SELECT * FROM public.customer_quotations
                WHERE ticket_id = NEW.id
                AND status IN ('draft', 'sent')
            LOOP
                UPDATE public.customer_quotations
                SET status = 'expired'::customer_quotation_status, updated_at = NOW()
                WHERE id = v_quotation.id;

                -- Also expire linked operational costs
                IF v_quotation.operational_cost_id IS NOT NULL THEN
                    UPDATE public.ticket_rate_quotes
                    SET status = 'rejected'::quote_status, updated_at = NOW()
                    WHERE id = v_quotation.operational_cost_id
                    AND status NOT IN ('accepted', 'rejected', 'won');
                END IF;
            END LOOP;

        ELSIF NEW.close_outcome = 'lost' THEN
            v_quotation_status := 'rejected';

            FOR v_quotation IN
                SELECT * FROM public.customer_quotations
                WHERE ticket_id = NEW.id
                AND status IN ('draft', 'sent')
            LOOP
                UPDATE public.customer_quotations
                SET status = v_quotation_status::customer_quotation_status, updated_at = NOW()
                WHERE id = v_quotation.id;

                IF v_quotation.operational_cost_id IS NOT NULL THEN
                    UPDATE public.ticket_rate_quotes
                    SET status = 'rejected'::quote_status, updated_at = NOW()
                    WHERE id = v_quotation.operational_cost_id
                    AND status NOT IN ('accepted', 'rejected', 'won');
                END IF;
            END LOOP;
        ELSE
            RETURN NEW;
        END IF;

        -- Update linked lead quotation_status
        IF NEW.lead_id IS NOT NULL THEN
            UPDATE public.leads
            SET quotation_status = CASE NEW.close_outcome WHEN 'won' THEN 'accepted' ELSE 'rejected' END,
                updated_at = NOW()
            WHERE lead_id = NEW.lead_id;
        END IF;

        -- Update linked opportunity quotation_status
        IF NEW.opportunity_id IS NOT NULL THEN
            UPDATE public.opportunities
            SET quotation_status = CASE NEW.close_outcome WHEN 'won' THEN 'accepted' ELSE 'rejected' END,
                updated_at = NOW()
            WHERE opportunity_id = NEW.opportunity_id;
        END IF;

    ELSIF NEW.status = 'need_adjustment' AND OLD.status != 'need_adjustment' THEN
        -- Ticket moved to need_adjustment → reject current 'sent' quotations
        v_quotation_status := 'rejected';

        UPDATE public.customer_quotations
        SET status = v_quotation_status::customer_quotation_status, updated_at = NOW()
        WHERE ticket_id = NEW.id
        AND status = 'sent';

        IF NEW.lead_id IS NOT NULL THEN
            UPDATE public.leads
            SET quotation_status = v_quotation_status, updated_at = NOW()
            WHERE lead_id = NEW.lead_id;
        END IF;

        IF NEW.opportunity_id IS NOT NULL THEN
            UPDATE public.opportunities
            SET
                quotation_status = v_quotation_status,
                stage = CASE
                    WHEN stage = 'Quote Sent' THEN 'Negotiation'
                    ELSE stage
                END,
                updated_at = NOW()
            WHERE opportunity_id = NEW.opportunity_id
            AND stage NOT IN ('Closed Won', 'Closed Lost');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- PART 3: Fix mark_rejected
-- Base: migration 138 (correct params, auth, idempotency, derivation)
-- Enhancement from 140: guard against closed/resolved tickets
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
    -- FIX from migration 140: Guard against already closed/resolved tickets
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
-- PART 4: Fix mark_sent SET search_path (re-apply from migration 140)
-- ============================================

ALTER FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN)
SET search_path = public, pg_temp;


-- ============================================
-- PART 5: Fix revoke
-- Base: migration 137 (correct auth, idempotency, JSONB validation)
-- Enhancements from 140: is_active=FALSE, resolved_at=NULL,
-- pipeline_updates, activities, multi-cost handling
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_revoke_acceptance(
    p_quotation_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_ticket RECORD;
    v_actor_id UUID;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_effective_opportunity_id TEXT := NULL;
    v_old_opp_stage opportunity_stage;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Lock quotation
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
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'revoke');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Idempotency: already revoked
    IF v_quotation.status = 'revoked' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'quotation_id', v_quotation.id,
            'quotation_status', 'revoked',
            'is_idempotent', TRUE,
            'message', 'Quotation was already revoked.',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- State machine validation (JSONB return, extract 'valid' key)
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'revoked');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- 1. UPDATE QUOTATION → revoked
    UPDATE public.customer_quotations
    SET status = 'revoked'::customer_quotation_status, updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    v_effective_opportunity_id := v_quotation.opportunity_id;

    -- 2. REOPEN OPPORTUNITY (Closed Won → Negotiation)
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL AND v_opportunity.stage = 'Closed Won' THEN
            v_old_opp_stage := v_opportunity.stage;

            UPDATE public.opportunities
            SET stage = 'Negotiation'::opportunity_stage,
                quotation_status = 'revoked',
                closed_at = NULL,
                updated_at = NOW()
            WHERE opportunity_id = v_effective_opportunity_id;

            INSERT INTO public.opportunity_stage_history (opportunity_id, old_stage, new_stage, changed_by, notes, changed_at)
            VALUES (v_effective_opportunity_id, v_old_opp_stage, 'Negotiation'::opportunity_stage, v_actor_id,
                '[' || v_correlation_id || '] Stage reverted: quotation acceptance revoked', NOW());

            INSERT INTO public.pipeline_updates (opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at)
            VALUES (v_effective_opportunity_id,
                '[' || v_correlation_id || '] Quotation acceptance revoked: ' || COALESCE(p_reason, 'No reason provided'),
                'Email'::approach_method, v_old_opp_stage, 'Negotiation'::opportunity_stage, v_actor_id, NOW());

            INSERT INTO public.activities (
                related_opportunity_id, related_lead_id, related_account_id, owner_user_id, created_by,
                activity_type, subject, description, status, due_date, completed_at, created_at, updated_at
            ) VALUES (
                v_effective_opportunity_id, v_quotation.lead_id, v_opportunity.account_id, v_actor_id, v_actor_id,
                'Email'::activity_type_v2,
                'Quotation Acceptance Revoked',
                '[' || v_correlation_id || '] Quotation acceptance revoked: ' || COALESCE(p_reason, 'No reason provided'),
                'Completed'::activity_status, CURRENT_DATE, NOW(), NOW(), NOW()
            );
        END IF;
    END IF;

    -- 3. REOPEN TICKET (closed → open, with full field reset)
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT * INTO v_ticket
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        FOR UPDATE;

        IF v_ticket IS NOT NULL AND v_ticket.status = 'closed' THEN
            UPDATE public.tickets
            SET status = 'open'::ticket_status,
                close_outcome = NULL,
                close_reason = NULL,
                closed_at = NULL,
                resolved_at = NULL,
                pending_response_from = NULL,
                updated_at = NOW()
            WHERE id = v_quotation.ticket_id;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_quotation.ticket_id, 'reopened'::ticket_event_type, v_actor_id,
                jsonb_build_object('status', 'closed', 'close_outcome', v_ticket.close_outcome),
                jsonb_build_object('status', 'open', 'reason', 'quotation_revoked'),
                '[' || v_correlation_id || '] Ticket reopened: quotation acceptance revoked', NOW());
        END IF;
    END IF;

    -- 4. REVERT ACCOUNT STATUS (FIX: also reset is_active)
    IF v_opportunity IS NOT NULL AND v_opportunity.account_id IS NOT NULL THEN
        UPDATE public.accounts
        SET account_status = 'calon_account'::account_status,
            is_active = FALSE,
            updated_at = NOW()
        WHERE account_id = v_opportunity.account_id
        AND account_status = 'active_account';
    END IF;

    -- 5. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads SET quotation_status = 'revoked', updated_at = NOW() WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 6. REVERT OPERATIONAL COSTS
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes SET status = 'sent_to_customer'::quote_status, updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
    END IF;
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq SET status = 'sent_to_customer'::quote_status, updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids) AND trq.status = 'accepted';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', 'revoked',
        'opportunity_id', v_effective_opportunity_id,
        'ticket_id', v_quotation.ticket_id,
        'reason', p_reason,
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
-- PART 6: GRANTS
-- ============================================

-- Re-grant trigger function
GRANT EXECUTE ON FUNCTION public.trigger_sync_ticket_status_to_quotation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_sync_ticket_status_to_quotation() TO service_role;

-- Re-grant mark_rejected (same signature as migration 138)
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;

-- Re-grant revoke
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_revoke_acceptance(UUID, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_revoke_acceptance(UUID, TEXT, UUID, TEXT) TO service_role;

-- Re-grant ticket RPCs (from migration 140 Part 6)
GRANT EXECUTE ON FUNCTION public.rpc_ticket_assign TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_add_comment TO service_role;


-- ============================================
-- SUMMARY OF FIXES IN MIGRATION 141
-- ============================================
-- This migration re-applies ALL migration 140 fixes with correct code:
--
-- 1. WhatsApp enum addition (idempotent re-apply)
-- 2. Trigger cascade fix: won→expire other quotations (not accept them all)
-- 3. mark_rejected REWRITTEN:
--    - Fixed: undeclared v_activity_subject (now declared)
--    - Fixed: fn_validate_quotation_transition JSONB→BOOLEAN extraction
--    - Fixed: parameter names match API (p_competitor_name, p_notes)
--    - Fixed: enum value budget_customer_tidak_cukup (was budget_tidak_cukup)
--    - Fixed: quotation_rejection_reasons.notes (was reason_notes)
--    - Restored: auth check (fn_check_quotation_authorization)
--    - Restored: idempotency guard
--    - Restored: opportunity_id derivation from lead/ticket
--    - Restored: tarif_tidak_masuk validation
--    - Restored: rejection_reason column on quotation
--    - Added: closed/resolved ticket guard (from migration 140)
-- 4. mark_sent SET search_path (re-apply)
-- 5. revoke REWRITTEN:
--    - Fixed: fn_validate_quotation_transition JSONB→BOOLEAN extraction
--    - Restored: auth check (fn_check_quotation_authorization)
--    - Restored: idempotency guard
--    - Restored: quotation_status='revoked' on opportunity
--    - Added: is_active=FALSE on account revert (from migration 140)
--    - Added: resolved_at=NULL, pending_response_from=NULL on ticket (from 140)
--    - Added: pipeline_updates INSERT (from migration 140)
--    - Added: activities INSERT (from migration 140)
--    - Added: multi-cost handling (operational_cost_ids array)
-- 6. All necessary GRANTs re-applied
-- ============================================
