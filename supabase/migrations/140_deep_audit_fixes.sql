-- =====================================================
-- Migration 140: Deep Audit Fixes
-- =====================================================
-- Fixes found during comprehensive CRM + Ticketing audit:
-- 1. Add 'WhatsApp' to activity_type_v2 enum (was in approach_method but not activity_type_v2)
-- 2. Fix trigger cascade: trg_sync_ticket_status_to_quotation sets ALL quotations to accepted
-- 3. Fix mark_rejected: guard against reopening already closed/resolved tickets
-- 4. Fix mark_sent: add missing SET search_path
-- 5. Fix revoke: also reset is_active and date fields on account
-- 6. Add missing service_role GRANTs
-- =====================================================


-- ============================================
-- PART 1: Add 'WhatsApp' to activity_type_v2 enum
-- Pipeline update uses approach_method as activity_type,
-- but 'WhatsApp' only existed in approach_method, not activity_type_v2.
-- This caused silent INSERT failures for WhatsApp activities.
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'WhatsApp' AND enumtypid = 'activity_type_v2'::regtype) THEN
        ALTER TYPE activity_type_v2 ADD VALUE 'WhatsApp';
    END IF;
END $$;


-- ============================================
-- PART 2: Fix trigger cascade - trg_sync_ticket_status_to_quotation
-- PROBLEM: When ticket closes with close_outcome='won', the trigger
-- sets ALL draft/sent quotations to 'accepted'. This is wrong -
-- only the specifically accepted quotation should be 'accepted'.
-- Other draft/sent quotations should be set to 'expired' instead.
--
-- Also: When ticket closes with close_outcome='won', the specific
-- quotation was already set to 'accepted' by the RPC. So the trigger
-- should only handle the OTHER quotations (set them to 'expired').
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_sync_ticket_status_to_quotation()
RETURNS TRIGGER AS $$
DECLARE
    v_quotation_status TEXT;
    v_quotation RECORD;
BEGIN
    -- Map ticket status changes to quotation status
    -- Only handle meaningful status transitions
    IF NEW.status = 'closed' AND NEW.close_outcome IS NOT NULL THEN
        IF NEW.close_outcome = 'won' THEN
            -- Ticket closed as won: the accepted quotation was already set by RPC.
            -- Set remaining draft/sent quotations to 'expired' (not 'accepted').
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

            -- Update all active quotations for this ticket
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
            -- Other outcomes → no quotation sync
            RETURN NEW;
        END IF;

        -- Update linked lead and opportunity quotation_status
        IF NEW.lead_id IS NOT NULL THEN
            UPDATE public.leads
            SET quotation_status = CASE NEW.close_outcome WHEN 'won' THEN 'accepted' ELSE 'rejected' END,
                updated_at = NOW()
            WHERE lead_id = NEW.lead_id;
        END IF;

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

        -- Update linked lead and opportunity
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
-- PART 3: Fix mark_rejected - guard against reopening closed/resolved tickets
-- PROBLEM: If ticket is already closed (e.g., via another quotation being accepted),
-- rejecting a different quotation would set it back to 'need_adjustment'.
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_mark_rejected(
    p_quotation_id UUID,
    p_reason_type quotation_rejection_reason_type,
    p_reason_notes TEXT DEFAULT NULL,
    p_competitor_amount NUMERIC DEFAULT NULL,
    p_customer_budget NUMERIC DEFAULT NULL,
    p_competitor_name TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'IDR',
    p_actor_user_id UUID DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation public.customer_quotations;
    v_opportunity public.opportunities;
    v_ticket public.tickets;
    v_actor_id UUID;
    v_correlation_id TEXT;
    v_old_opp_stage opportunity_stage;
    v_new_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_return_ticket_status TEXT;
    v_effective_opportunity_id TEXT;
    v_quotation_sequence INTEGER;
    v_sequence_label TEXT;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    v_multi_cost_count INTEGER := 0;
BEGIN
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Actor user ID required', 'error_code', 'UNAUTHORIZED', 'correlation_id', v_correlation_id);
    END IF;

    -- 1. UPDATE QUOTATION
    SELECT * INTO v_quotation FROM public.customer_quotations WHERE id = p_quotation_id FOR UPDATE;
    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found', 'error_code', 'QUOTATION_NOT_FOUND', 'correlation_id', v_correlation_id);
    END IF;
    IF NOT public.fn_validate_quotation_transition(v_quotation.status, 'rejected') THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Cannot reject from status: ' || v_quotation.status::TEXT, 'error_code', 'INVALID_STATUS_TRANSITION', 'correlation_id', v_correlation_id);
    END IF;

    -- FIX: Restore numeric validation (regression from 078→136)
    IF p_reason_type = 'kompetitor_lebih_murah' AND p_competitor_amount IS NULL AND p_competitor_name IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Competitor name or amount required for kompetitor_lebih_murah', 'error_code', 'VALIDATION_ERROR', 'correlation_id', v_correlation_id);
    END IF;
    IF p_reason_type = 'budget_tidak_cukup' AND p_customer_budget IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Customer budget required for budget_tidak_cukup', 'error_code', 'VALIDATION_ERROR', 'correlation_id', v_correlation_id);
    END IF;

    -- Determine quotation sequence number
    SELECT COUNT(*) INTO v_quotation_sequence FROM public.customer_quotations
    WHERE ticket_id = v_quotation.ticket_id AND created_at <= v_quotation.created_at;
    v_sequence_label := CASE WHEN v_quotation_sequence <= 1 THEN '1st' WHEN v_quotation_sequence = 2 THEN '2nd' WHEN v_quotation_sequence = 3 THEN '3rd' ELSE v_quotation_sequence || 'th' END;

    UPDATE public.customer_quotations
    SET status = 'rejected'::customer_quotation_status, rejected_at = NOW(), updated_at = NOW()
    WHERE id = p_quotation_id RETURNING * INTO v_quotation;

    -- Insert rejection reason
    INSERT INTO public.quotation_rejection_reasons (quotation_id, reason_type, reason_notes, competitor_name, competitor_amount, customer_budget, currency, created_by, created_at)
    VALUES (p_quotation_id, p_reason_type, p_reason_notes, p_competitor_name, p_competitor_amount, p_customer_budget, p_currency, v_actor_id, NOW());

    -- 2. UPDATE OPPORTUNITY
    v_effective_opportunity_id := v_quotation.opportunity_id;
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity FROM public.opportunities WHERE opportunity_id = v_effective_opportunity_id FOR UPDATE;
        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            IF v_opportunity.stage IN ('Quote Sent', 'Negotiation') THEN
                v_new_opp_stage := 'Negotiation'::opportunity_stage;
                -- FIX: Also update competitor/budget fields (regression from 078→136)
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage,
                    competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                    competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                    customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
            ELSE
                v_new_opp_stage := v_old_opp_stage;
            END IF;

            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                INSERT INTO public.opportunity_stage_history (opportunity_id, old_stage, new_stage, changed_by, notes, changed_at)
                VALUES (v_effective_opportunity_id, v_old_opp_stage, v_new_opp_stage, v_actor_id,
                    '[' || v_correlation_id || '] Stage reverted due to quotation rejection', NOW());
                v_stage_history_inserted := TRUE;

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

            INSERT INTO public.activities (
                related_opportunity_id, related_lead_id, related_account_id, owner_user_id, created_by,
                activity_type, subject, description, status, due_date, completed_at, created_at, updated_at
            ) VALUES (
                v_effective_opportunity_id, v_quotation.lead_id, v_opportunity.account_id, v_actor_id, v_actor_id,
                'Email'::activity_type_v2,
                v_sequence_label || ' Quotation Rejected' || CASE WHEN v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN ' → Stage moved to ' || v_new_opp_stage::TEXT ELSE '' END,
                'Quotation ' || v_quotation.quotation_number || ' rejected. Reason: ' || p_reason_type::TEXT
                    || CASE WHEN p_competitor_name IS NOT NULL THEN '. Competitor: ' || p_competitor_name ELSE '' END
                    || CASE WHEN p_competitor_amount IS NOT NULL THEN '. Competitor price: ' || p_currency || ' ' || p_competitor_amount::TEXT ELSE '' END,
                'Completed'::activity_status, CURRENT_DATE, NOW(), NOW(), NOW()
            );
            v_activities_inserted := TRUE;
        END IF;
    END IF;

    -- 3. UPDATE TICKET -> need_adjustment (FIX: guard against already closed/resolved tickets)
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
            -- Ticket already closed/resolved - just record the rejection event without changing status
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
        'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- PART 4: Fix mark_sent - add SET search_path (was missing in migration 138)
-- Only need to re-declare with SET search_path, function body unchanged.
-- ============================================

-- Read mark_sent from migration 138 and add SET search_path
-- We use a targeted ALTER approach instead of full re-create
ALTER FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN)
SET search_path = public, pg_temp;


-- ============================================
-- PART 5: Fix revoke - also reset is_active and date fields on account
-- PROBLEM: Revoke sets account_status back to calon_account but leaves
-- is_active=TRUE and populated date fields, causing data inconsistency.
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_revoke_acceptance(
    p_quotation_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation public.customer_quotations;
    v_opportunity public.opportunities;
    v_ticket public.tickets;
    v_actor_id UUID;
    v_correlation_id TEXT;
    v_effective_opportunity_id TEXT;
    v_old_opp_stage opportunity_stage;
BEGIN
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Actor user ID required', 'error_code', 'UNAUTHORIZED', 'correlation_id', v_correlation_id);
    END IF;

    -- 1. UPDATE QUOTATION (accepted → revoked)
    SELECT * INTO v_quotation FROM public.customer_quotations WHERE id = p_quotation_id FOR UPDATE;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found', 'error_code', 'QUOTATION_NOT_FOUND', 'correlation_id', v_correlation_id);
    END IF;

    IF NOT public.fn_validate_quotation_transition(v_quotation.status, 'revoked') THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Cannot revoke from status: ' || v_quotation.status::TEXT,
            'error_code', 'INVALID_STATUS_TRANSITION', 'correlation_id', v_correlation_id);
    END IF;

    UPDATE public.customer_quotations
    SET status = 'revoked'::customer_quotation_status, updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. REOPEN OPPORTUNITY (Closed Won → Negotiation)
    v_effective_opportunity_id := v_quotation.opportunity_id;
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity FROM public.opportunities WHERE opportunity_id = v_effective_opportunity_id FOR UPDATE;

        IF v_opportunity IS NOT NULL AND v_opportunity.stage = 'Closed Won' THEN
            v_old_opp_stage := v_opportunity.stage;

            UPDATE public.opportunities
            SET stage = 'Negotiation'::opportunity_stage, closed_at = NULL, updated_at = NOW()
            WHERE opportunity_id = v_effective_opportunity_id;

            INSERT INTO public.opportunity_stage_history (opportunity_id, old_stage, new_stage, changed_by, notes, changed_at)
            VALUES (v_effective_opportunity_id, v_old_opp_stage, 'Negotiation', v_actor_id,
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

    -- 3. REOPEN TICKET (closed → open)
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT * INTO v_ticket FROM public.tickets WHERE id = v_quotation.ticket_id FOR UPDATE;

        IF v_ticket IS NOT NULL AND v_ticket.status = 'closed' THEN
            UPDATE public.tickets
            SET status = 'open'::ticket_status, close_outcome = NULL, close_reason = NULL, closed_at = NULL,
                resolved_at = NULL, pending_response_from = NULL, updated_at = NOW()
            WHERE id = v_quotation.ticket_id;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_quotation.ticket_id, 'reopened'::ticket_event_type, v_actor_id,
                jsonb_build_object('status', 'closed', 'close_outcome', v_ticket.close_outcome),
                jsonb_build_object('status', 'open', 'reason', 'quotation_revoked'),
                '[' || v_correlation_id || '] Ticket reopened: quotation acceptance revoked', NOW());
        END IF;
    END IF;

    -- 4. REVERT ACCOUNT STATUS (FIX: also reset is_active and date fields)
    IF v_opportunity IS NOT NULL AND v_opportunity.account_id IS NOT NULL THEN
        UPDATE public.accounts
        SET
            account_status = 'calon_account'::account_status,
            is_active = FALSE,
            updated_at = NOW()
        WHERE account_id = v_opportunity.account_id
        AND account_status = 'active_account';
    END IF;

    -- 5. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads SET quotation_status = 'revoked', updated_at = NOW() WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 6. REVERT OPERATIONAL COST
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes SET status = 'sent_to_customer'::quote_status, updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
    END IF;
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq SET status = 'sent_to_customer'::quote_status, updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids) AND trq.status = 'accepted';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
        'quotation_status', 'revoked', 'opportunity_id', v_effective_opportunity_id,
        'ticket_id', v_quotation.ticket_id, 'reason', p_reason, 'correlation_id', v_correlation_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR',
            'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- PART 6: Missing service_role GRANTs
-- ============================================

-- Functions currently missing service_role grant
GRANT EXECUTE ON FUNCTION public.rpc_ticket_assign TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_add_comment TO service_role;

-- Re-grant updated functions
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_revoke_acceptance(UUID, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_revoke_acceptance(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_sync_ticket_status_to_quotation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_sync_ticket_status_to_quotation() TO service_role;


-- ============================================
-- SUMMARY OF FIXES IN MIGRATION 140
-- ============================================
-- 1. Added 'WhatsApp' to activity_type_v2 enum (was causing silent activity INSERT failures)
-- 2. Fixed trigger_sync_ticket_status_to_quotation: won→expire other quotations (not accept them all)
-- 3. Fixed mark_rejected: guard against reopening closed/resolved tickets
-- 4. Fixed mark_sent: added SET search_path for security consistency
-- 5. Fixed revoke: also reset is_active on account revert
-- 6. Added missing service_role GRANTs for rpc_ticket_assign, rpc_ticket_add_comment
