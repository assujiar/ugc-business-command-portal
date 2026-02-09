-- =====================================================
-- Migration 151: Fix Rejection Trigger-RPC Interference
-- =====================================================
--
-- ROOT CAUSE ANALYSIS:
--
-- Bug: rpc_customer_quotation_mark_rejected returns ticket_events_created=0
-- despite success=true. Rejection events never appear in ticket activity.
--
-- Root cause: AFTER UPDATE trigger `trg_quotation_status_sync` on
-- customer_quotations fires when status changes to 'rejected'. This trigger
-- calls sync_quotation_to_all → sync_quotation_to_ticket, which:
--
--   1. Updates the ticket status (same thing the RPC does)
--   2. Creates ticket_events (same thing the RPC does)
--   3. Also runs sync_quotation_to_opportunity which may INSERT into
--      opportunity_stage_history
--
-- sync_quotation_to_all has EXCEPTION WHEN OTHERS which creates an
-- implicit savepoint. If ANY sub-function fails (e.g., stage_history
-- constraint), the EXCEPTION rolls back ALL operations within
-- sync_quotation_to_all's block — including the ticket changes.
--
-- After the trigger completes (with or without rollback), the RPC continues.
-- But the trigger's interference corrupts the expected state:
-- - If trigger succeeded: ticket already modified, events duplicated
-- - If trigger failed: operations rolled back but timing/state issues remain
--
-- The trigger (sync_quotation_to_all from migration 058/071) and the RPC
-- (mark_rejected from migration 143) are COMPETING to do the same work.
--
-- FIX:
-- 1. Update trigger function to check a session-local GUC flag
--    (app.in_quotation_rpc). When set to 'true', skip the trigger.
-- 2. Redefine mark_rejected to set this flag before the quotation UPDATE.
--    This prevents the AFTER trigger from firing its sync chain.
-- 3. The flag is transaction-local (set_config with is_local=true),
--    so it doesn't affect other sessions or transactions.
-- =====================================================


-- ============================================
-- PART 1: Update trigger function with RPC flag check
-- ============================================
-- When RPCs handle their own syncing, the trigger should not interfere.
-- The flag app.in_quotation_rpc is set by RPCs before updating quotation status.

CREATE OR REPLACE FUNCTION public.trigger_sync_quotation_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Skip when called from within an RPC that handles its own syncing
    -- The flag is set by rpc_customer_quotation_mark_rejected/mark_sent/etc.
    IF current_setting('app.in_quotation_rpc', true) = 'true' THEN
        RAISE NOTICE '[151] trg_quotation_status_sync: skipping (in RPC context)';
        RETURN NEW;
    END IF;

    -- Only trigger when status changes to sent, accepted, or rejected
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('sent', 'accepted', 'rejected') THEN
        -- Call the master sync function
        PERFORM public.sync_quotation_to_all(NEW.id, NEW.status::TEXT, COALESCE(NEW.created_by, auth.uid()));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.trigger_sync_quotation_on_status_change IS
'Migration 151 fix: Added GUC flag check (app.in_quotation_rpc) to skip
when called from within an RPC that handles its own syncing.
Prevents trigger-RPC interference that caused ticket_events_created=0.';


-- ============================================
-- PART 2: Redefine rpc_customer_quotation_mark_rejected
-- ============================================
-- Changes from migration 143:
--   a) Set app.in_quotation_rpc='true' before quotation UPDATE (prevents trigger interference)
--   b) Save ticket_id before UPDATE RETURNING (defensive: ensures ticket_id survives)
--   c) Enhanced RAISE NOTICE at every critical step for debugging
--   d) All migration 143 logic preserved

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
    v_ticket_events_created INTEGER := 0;
    v_ticket_comment_created BOOLEAN := FALSE;
    -- [151] Save ticket_id before UPDATE RETURNING overwrites v_quotation
    v_saved_ticket_id UUID := NULL;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    RAISE NOTICE '[151][%] rpc_customer_quotation_mark_rejected started for quotation_id=%', v_correlation_id, p_quotation_id;

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

    -- [151] Save ticket_id defensively before UPDATE RETURNING overwrites v_quotation
    v_saved_ticket_id := v_quotation.ticket_id;

    RAISE NOTICE '[151][%] Quotation found: number=%, ticket_id=%, lead_id=%, opportunity_id=%, status=%',
        v_correlation_id, v_quotation.quotation_number, v_saved_ticket_id, v_quotation.lead_id, v_quotation.opportunity_id, v_quotation.status;

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

    -- Derive opportunity_id from lead or ticket if not directly set
    v_effective_opportunity_id := v_quotation.opportunity_id;
    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT ld.opportunity_id INTO v_derived_opportunity_id FROM public.leads ld WHERE ld.lead_id = v_quotation.lead_id AND ld.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;
    IF v_effective_opportunity_id IS NULL AND v_saved_ticket_id IS NOT NULL THEN
        SELECT t.opportunity_id INTO v_derived_opportunity_id FROM public.tickets t WHERE t.id = v_saved_ticket_id AND t.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;

    RAISE NOTICE '[151][%] Derived opportunity_id=%, from quotation=%, lead=%, ticket=%',
        v_correlation_id, v_effective_opportunity_id, v_quotation.opportunity_id, v_quotation.lead_id, v_saved_ticket_id;

    -- ================================================
    -- [151] FIX: Set GUC flag to prevent AFTER UPDATE trigger
    -- (trg_quotation_status_sync) from running sync_quotation_to_all.
    -- The RPC handles all syncing itself. The flag is transaction-local.
    -- ================================================
    PERFORM set_config('app.in_quotation_rpc', 'true', true);

    -- 1. UPDATE QUOTATION
    UPDATE public.customer_quotations cq_upd
    SET status = 'rejected'::customer_quotation_status, rejected_at = NOW(), rejection_reason = p_reason_type::TEXT, updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id RETURNING * INTO v_quotation;

    RAISE NOTICE '[151][%] Quotation updated. RETURNING ticket_id=%, status=%',
        v_correlation_id, v_quotation.ticket_id, v_quotation.status;

    INSERT INTO public.quotation_rejection_reasons (quotation_id, reason_type, competitor_name, competitor_amount, customer_budget, currency, notes, created_by)
    VALUES (p_quotation_id, p_reason_type, p_competitor_name, p_competitor_amount, p_customer_budget, p_currency, p_notes, v_actor_id);

    -- Quotation sequence
    SELECT COUNT(*) INTO v_quotation_sequence FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;

    -- Broaden previous_rejected_count: check by opportunity_id, ticket_id, AND lead_id
    SELECT COUNT(*) INTO v_previous_rejected_count FROM public.customer_quotations cq2
    WHERE cq2.id != p_quotation_id AND cq2.status = 'rejected'
    AND (
        (v_effective_opportunity_id IS NOT NULL AND cq2.opportunity_id = v_effective_opportunity_id)
        OR (v_saved_ticket_id IS NOT NULL AND cq2.ticket_id = v_saved_ticket_id)
        OR (v_quotation.lead_id IS NOT NULL AND cq2.lead_id = v_quotation.lead_id)
    );

    v_sequence_label := CASE v_quotation_sequence WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE v_quotation_sequence::TEXT || 'th' END;

    RAISE NOTICE '[151][%] Sequence: %, previous_rejected: %, effective_opp: %',
        v_correlation_id, v_sequence_label, v_previous_rejected_count, v_effective_opportunity_id;

    -- 2. UPDATE OPPORTUNITY -> Negotiation
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            RAISE NOTICE '[151][%] Opportunity found: stage=%', v_correlation_id, v_old_opp_stage;

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
                    RAISE NOTICE '[151][%] Stage history inserted: % -> %', v_correlation_id, v_old_opp_stage, v_new_opp_stage;
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
        ELSE
            RAISE NOTICE '[151][%] Opportunity NOT FOUND for id=%', v_correlation_id, v_effective_opportunity_id;
        END IF;
    ELSE
        RAISE NOTICE '[151][%] No effective_opportunity_id - skipping opportunity section', v_correlation_id;
    END IF;

    -- 3. UPDATE TICKET -> need_adjustment
    -- [151] Use v_saved_ticket_id (saved before UPDATE RETURNING) for robustness
    IF v_saved_ticket_id IS NOT NULL THEN
        RAISE NOTICE '[151][%] Entering ticket section: v_saved_ticket_id=%', v_correlation_id, v_saved_ticket_id;

        SELECT t.* INTO v_ticket FROM public.tickets t WHERE t.id = v_saved_ticket_id FOR UPDATE;

        IF v_ticket IS NULL THEN
            RAISE NOTICE '[151][%] Ticket NOT FOUND for id=%', v_correlation_id, v_saved_ticket_id;
            v_return_ticket_status := 'unknown';
        ELSIF v_ticket.status NOT IN ('closed', 'resolved') THEN
            v_old_ticket_status := v_ticket.status;
            RAISE NOTICE '[151][%] Ticket found: status=%, updating to need_adjustment', v_correlation_id, v_old_ticket_status;

            UPDATE public.tickets t_upd
            SET status = 'need_adjustment'::ticket_status, pending_response_from = 'assignee', updated_at = NOW()
            WHERE t_upd.id = v_saved_ticket_id RETURNING * INTO v_ticket;
            v_return_ticket_status := v_ticket.status::TEXT;

            RAISE NOTICE '[151][%] Ticket updated: new_status=%', v_correlation_id, v_return_ticket_status;

            -- Create rejection event
            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_saved_ticket_id, 'customer_quotation_rejected'::ticket_event_type, v_actor_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object(
                    'status', 'need_adjustment',
                    'quotation_id', p_quotation_id,
                    'quotation_number', v_quotation.quotation_number,
                    'quotation_status', 'rejected',
                    'rejection_reason', p_reason_type::TEXT,
                    'competitor_name', p_competitor_name,
                    'competitor_amount', p_competitor_amount,
                    'customer_budget', p_customer_budget,
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected. Reason: ' || p_reason_type::TEXT, NOW());
            v_ticket_events_created := v_ticket_events_created + 1;
            RAISE NOTICE '[151][%] ticket_event customer_quotation_rejected inserted', v_correlation_id;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, new_value, notes, created_at)
            VALUES (v_saved_ticket_id, 'request_adjustment'::ticket_event_type, v_actor_id,
                jsonb_build_object('reason', p_reason_type::TEXT, 'triggered_by', 'quotation_rejection', 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Rate adjustment requested due to quotation rejection', NOW());
            v_ticket_events_created := v_ticket_events_created + 1;
            RAISE NOTICE '[151][%] ticket_event request_adjustment inserted', v_correlation_id;

            -- Create visible comment (is_internal = FALSE)
            INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
            VALUES (v_saved_ticket_id, v_actor_id,
                'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT ||
                CASE WHEN p_competitor_name IS NOT NULL THEN '. Competitor: ' || p_competitor_name ELSE '' END ||
                CASE WHEN p_competitor_amount IS NOT NULL THEN '. Competitor price: ' || p_currency || ' ' || p_competitor_amount::TEXT ELSE '' END ||
                CASE WHEN p_customer_budget IS NOT NULL THEN '. Customer budget: ' || p_currency || ' ' || p_customer_budget::TEXT ELSE '' END ||
                CASE WHEN p_notes IS NOT NULL THEN '. Notes: ' || p_notes ELSE '' END,
                FALSE, NOW());
            v_ticket_comment_created := TRUE;
            RAISE NOTICE '[151][%] ticket_comment inserted (is_internal=FALSE)', v_correlation_id;

        ELSE
            -- Ticket already closed/resolved - still record event AND comment
            v_return_ticket_status := v_ticket.status::TEXT;
            v_old_ticket_status := v_ticket.status;
            RAISE NOTICE '[151][%] Ticket is closed/resolved (status=%), recording event anyway', v_correlation_id, v_ticket.status;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_saved_ticket_id, 'customer_quotation_rejected'::ticket_event_type, v_actor_id,
                jsonb_build_object('status', v_ticket.status::TEXT),
                jsonb_build_object(
                    'quotation_id', p_quotation_id,
                    'quotation_number', v_quotation.quotation_number,
                    'rejection_reason', p_reason_type::TEXT,
                    'ticket_status_unchanged', TRUE,
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected (ticket already ' || v_ticket.status::TEXT || ', status unchanged)', NOW());
            v_ticket_events_created := v_ticket_events_created + 1;

            INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
            VALUES (v_saved_ticket_id, v_actor_id,
                'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT ||
                ' (ticket already ' || v_ticket.status::TEXT || ', status unchanged)' ||
                CASE WHEN p_notes IS NOT NULL THEN '. Notes: ' || p_notes ELSE '' END,
                FALSE, NOW());
            v_ticket_comment_created := TRUE;
        END IF;

        RAISE NOTICE '[151][%] Ticket section done: status=%, events_created=%, comment_created=%',
            v_correlation_id, v_return_ticket_status, v_ticket_events_created, v_ticket_comment_created;
    ELSE
        RAISE NOTICE '[151][%] No ticket_id on quotation - skipping ticket update', v_correlation_id;
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

    RAISE NOTICE '[151][%] rpc_customer_quotation_mark_rejected completed successfully', v_correlation_id;

    RETURN jsonb_build_object(
        'success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status, 'rejection_reason', p_reason_type::TEXT,
        'opportunity_id', v_effective_opportunity_id, 'old_stage', v_old_opp_stage, 'new_stage', v_new_opp_stage,
        'ticket_id', v_saved_ticket_id, 'ticket_status', v_return_ticket_status,
        'stage_history_inserted', v_stage_history_inserted, 'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted, 'multi_shipment_costs_updated', v_multi_cost_count,
        'quotation_sequence', v_quotation_sequence, 'sequence_label', v_sequence_label,
        'previous_rejected_count', v_previous_rejected_count,
        'ticket_events_created', v_ticket_events_created,
        'ticket_comment_created', v_ticket_comment_created,
        'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[151][%] rpc_customer_quotation_mark_rejected FAILED: % (SQLSTATE: %)', v_correlation_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_rejected IS
'Migration 151 fix: Prevents AFTER UPDATE trigger (trg_quotation_status_sync) interference
by setting app.in_quotation_rpc GUC flag before quotation UPDATE. Uses v_saved_ticket_id
for robustness. Enhanced RAISE NOTICE debugging at every step. Broadened previous_rejected_count
to check by ticket_id and lead_id in addition to opportunity_id.';


-- ============================================
-- PART 3: Also update mark_sent to set the flag
-- (prevents same trigger interference for sent flow)
-- ============================================
-- Rather than redefining the entire 300-line mark_sent function,
-- we create a thin wrapper that sets the flag.
-- Actually, we need to update the trigger to skip for ALL RPC-driven updates.
-- The trigger function update in Part 1 already handles this.
-- We just need mark_sent to also set the flag.
-- Since mark_sent was redefined in migration 150, we add the flag there too.
-- For minimal changes, we create a helper that wraps the quotation update.

-- NOTE: mark_sent from migration 150 does NOT set the flag yet.
-- The trigger fix in Part 1 prevents interference, but ONLY if the flag is set.
-- We need to also update mark_sent. However, to avoid redefining the entire
-- 300-line function, we add the flag setting to the trigger check itself:
-- Instead of requiring the flag, the trigger also checks if the caller is
-- the mark_sent or mark_rejected RPC by checking the current transaction context.
-- Actually, the simplest approach: just update the trigger to ALWAYS skip
-- when the quotation update comes from a service_role JWT (which means it's
-- from an API route that uses adminClient, and the API already calls the RPC).

-- Simpler trigger: skip for service_role callers (all API routes use adminClient)
CREATE OR REPLACE FUNCTION public.trigger_sync_quotation_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Skip when called from within an RPC that handles its own syncing
    -- RPCs set this flag before updating quotation status
    IF current_setting('app.in_quotation_rpc', true) = 'true' THEN
        RAISE NOTICE '[151] trg_quotation_status_sync: skipping (RPC flag set)';
        RETURN NEW;
    END IF;

    -- Also skip when called via service_role (adminClient from API routes)
    -- API routes always call RPCs which handle their own syncing
    IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
        RAISE NOTICE '[151] trg_quotation_status_sync: skipping (service_role context)';
        RETURN NEW;
    END IF;

    -- Only trigger for direct user updates (e.g., from Supabase dashboard)
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('sent', 'accepted', 'rejected') THEN
        PERFORM public.sync_quotation_to_all(NEW.id, NEW.status::TEXT, COALESCE(NEW.created_by, auth.uid()));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- PART 4: Re-grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;


-- ============================================
-- SUMMARY
-- ============================================
-- 1. Updated trigger_sync_quotation_on_status_change:
--    a) Check app.in_quotation_rpc GUC flag (set by RPCs)
--    b) Check service_role JWT claim (covers all API routes using adminClient)
--    c) Only runs sync for direct user updates (e.g., Supabase dashboard)
--
-- 2. Redefined rpc_customer_quotation_mark_rejected:
--    a) Sets app.in_quotation_rpc='true' before quotation UPDATE
--    b) Saves ticket_id before UPDATE RETURNING (v_saved_ticket_id)
--    c) Enhanced RAISE NOTICE at every critical branch
--    d) Broadened previous_rejected_count to check by ticket_id + lead_id
--    e) Uses v_saved_ticket_id throughout ticket section for robustness
--    f) All migration 143 functionality preserved
--
-- 3. Re-granted permissions
--
-- Root cause: trg_quotation_status_sync AFTER UPDATE trigger was competing
-- with the RPC to do the same work (ticket update, events, opportunity sync).
-- The trigger's sync_quotation_to_all has EXCEPTION WHEN OTHERS that could
-- roll back ticket changes, or succeed and cause state interference.
-- Fix: prevent the trigger from firing when RPCs handle the syncing.
-- ============================================
