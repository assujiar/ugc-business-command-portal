-- =====================================================
-- Migration 159: Fix pipeline_updates and stage_history
-- for mark_rejected AND mark_accepted RPCs
-- =====================================================
--
-- ISSUE:
-- When quotation is rejected (first rejection), pipeline_updates and
-- opportunity_stage_history records for Quote Sent → Negotiation are NOT created.
-- Similarly, mark_accepted may fail to create pipeline_updates.
--
-- ROOT CAUSES IDENTIFIED:
--
-- 1. TRIGGER RACE CONDITION: The AFTER UPDATE trigger
--    (trg_quotation_status_sync → sync_quotation_to_all →
--    sync_quotation_to_opportunity) may fire BEFORE the RPC reads
--    the opportunity. If the GUC flag doesn't work (e.g., migration 151
--    wasn't applied), the trigger changes the opportunity stage to
--    Negotiation BEFORE the RPC reads it. The RPC then sees
--    stage='Negotiation', skips the stage change, and skips
--    pipeline_updates/stage_history inserts.
--
-- 2. MISSING from_stage/to_stage COLUMNS: The stage_history INSERT in
--    migration 151 only provides old_stage/new_stage but NOT
--    from_stage/to_stage. The to_stage column has a NOT NULL constraint
--    (migration 004). If the auto-fill trigger (migration 149) doesn't
--    exist, the INSERT fails, causing EXCEPTION WHEN OTHERS to roll back
--    ALL operations including the quotation and opportunity updates.
--
-- FIX:
-- 1. Lock opportunity BEFORE quotation UPDATE to capture true old_stage
-- 2. Provide all 4 stage columns in stage_history INSERT
-- 3. Same fixes for mark_accepted
-- 4. Re-include the trigger GUC fix for safety
-- =====================================================


-- ============================================
-- PART 1: Ensure trigger checks GUC flag
-- (Re-apply from migration 151 for safety)
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_sync_quotation_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Skip when called from within an RPC that handles its own syncing
    IF current_setting('app.in_quotation_rpc', true) = 'true' THEN
        RAISE NOTICE '[159] trg_quotation_status_sync: skipping (RPC flag set)';
        RETURN NEW;
    END IF;

    -- Also skip when called via service_role (adminClient from API routes)
    IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
        RAISE NOTICE '[159] trg_quotation_status_sync: skipping (service_role context)';
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
-- PART 2: Fix rpc_customer_quotation_mark_rejected
-- Key changes from migration 151:
--   a) Read & lock opportunity BEFORE quotation UPDATE
--   b) Provide all 4 stage columns in stage_history INSERT
--   c) Capture old_stage before any trigger can change it
--   d) All migration 151 logic preserved
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
    v_ticket_events_created INTEGER := 0;
    v_ticket_comment_created BOOLEAN := FALSE;
    v_saved_ticket_id UUID := NULL;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    RAISE NOTICE '[159][%] rpc_customer_quotation_mark_rejected started for quotation_id=%', v_correlation_id, p_quotation_id;

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

    RAISE NOTICE '[159][%] Quotation found: number=%, ticket_id=%, lead_id=%, opportunity_id=%, status=%',
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

    -- ================================================
    -- [159] FIX: Derive opportunity_id BEFORE quotation UPDATE
    -- and LOCK opportunity to capture true old_stage
    -- before any AFTER UPDATE trigger can change it
    -- ================================================
    v_effective_opportunity_id := v_quotation.opportunity_id;
    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT ld.opportunity_id INTO v_derived_opportunity_id FROM public.leads ld WHERE ld.lead_id = v_quotation.lead_id AND ld.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;
    IF v_effective_opportunity_id IS NULL AND v_saved_ticket_id IS NOT NULL THEN
        SELECT t.opportunity_id INTO v_derived_opportunity_id FROM public.tickets t WHERE t.id = v_saved_ticket_id AND t.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;

    RAISE NOTICE '[159][%] Derived opportunity_id=%, from quotation=%, lead=%, ticket=%',
        v_correlation_id, v_effective_opportunity_id, v_quotation.opportunity_id, v_quotation.lead_id, v_saved_ticket_id;

    -- [159] FIX: Lock and read opportunity BEFORE quotation UPDATE
    -- This captures the true old_stage before any trigger can change it
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;
        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            RAISE NOTICE '[159][%] Opportunity PRE-LOCKED: stage=% (captured before quotation UPDATE)', v_correlation_id, v_old_opp_stage;
        ELSE
            RAISE NOTICE '[159][%] Opportunity NOT FOUND for id=%', v_correlation_id, v_effective_opportunity_id;
        END IF;
    END IF;

    -- ================================================
    -- Set GUC flag to prevent AFTER UPDATE trigger interference
    -- ================================================
    PERFORM set_config('app.in_quotation_rpc', 'true', true);

    -- 1. UPDATE QUOTATION
    UPDATE public.customer_quotations cq_upd
    SET status = 'rejected'::customer_quotation_status, rejected_at = NOW(), rejection_reason = p_reason_type::TEXT, updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id RETURNING * INTO v_quotation;

    RAISE NOTICE '[159][%] Quotation updated. RETURNING ticket_id=%, status=%',
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

    RAISE NOTICE '[159][%] Sequence: %, previous_rejected: %, effective_opp: %',
        v_correlation_id, v_sequence_label, v_previous_rejected_count, v_effective_opportunity_id;

    -- 2. UPDATE OPPORTUNITY -> Negotiation
    -- [159] FIX: Use the pre-locked v_old_opp_stage (captured BEFORE quotation UPDATE)
    IF v_effective_opportunity_id IS NOT NULL AND v_opportunity IS NOT NULL THEN
        RAISE NOTICE '[159][%] Processing opportunity: pre-locked old_stage=%', v_correlation_id, v_old_opp_stage;

        IF v_old_opp_stage NOT IN ('Negotiation', 'Closed Won', 'Closed Lost') THEN
            v_new_opp_stage := 'Negotiation'::opportunity_stage;

            -- Re-read opportunity to get the CURRENT state (trigger may have changed it)
            -- But use the PRE-LOCKED old_stage for history records
            UPDATE public.opportunities opp_upd
            SET stage = v_new_opp_stage,
                competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
            v_pipeline_updated := TRUE;

            RAISE NOTICE '[159][%] Opportunity updated: % -> %', v_correlation_id, v_old_opp_stage, v_new_opp_stage;
        ELSE
            -- Stage already at Negotiation or beyond - only update competitor info
            UPDATE public.opportunities opp_upd
            SET competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
            v_new_opp_stage := v_old_opp_stage;

            RAISE NOTICE '[159][%] Opportunity stage already at %, only updating competitor info', v_correlation_id, v_old_opp_stage;
        END IF;

        -- [159] FIX: Insert stage history with ALL 4 columns (removes dependency on auto-fill trigger)
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
                    v_effective_opportunity_id,
                    v_old_opp_stage,        -- from_stage (legacy column)
                    v_new_opp_stage,        -- to_stage (legacy NOT NULL column)
                    v_old_opp_stage,        -- old_stage (new column)
                    v_new_opp_stage,        -- new_stage (new NOT NULL column)
                    v_actor_id,
                    '[' || v_correlation_id || '] Stage changed due to quotation rejection',
                    NOW()
                );
                v_stage_history_inserted := TRUE;
                RAISE NOTICE '[159][%] Stage history inserted: % -> %', v_correlation_id, v_old_opp_stage, v_new_opp_stage;
            ELSE
                RAISE NOTICE '[159][%] Stage history already exists (within 2 min), skipping', v_correlation_id;
            END IF;
        END IF;

        -- [159] FIX: Insert pipeline update - always for stage changes
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
            RAISE NOTICE '[159][%] Pipeline update inserted: % -> %', v_correlation_id, v_old_opp_stage, COALESCE(v_new_opp_stage, v_old_opp_stage);
        ELSE
            RAISE NOTICE '[159][%] Pipeline update already exists (within 2 min), skipping', v_correlation_id;
        END IF;

        -- Insert activity
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
        RAISE NOTICE '[159][%] Activity inserted: %', v_correlation_id, v_activity_subject;
    ELSE
        RAISE NOTICE '[159][%] No opportunity found - skipping opportunity section', v_correlation_id;
    END IF;

    -- 3. UPDATE TICKET -> need_adjustment
    IF v_saved_ticket_id IS NOT NULL THEN
        RAISE NOTICE '[159][%] Entering ticket section: v_saved_ticket_id=%', v_correlation_id, v_saved_ticket_id;

        SELECT t.* INTO v_ticket FROM public.tickets t WHERE t.id = v_saved_ticket_id FOR UPDATE;

        IF v_ticket IS NULL THEN
            RAISE NOTICE '[159][%] Ticket NOT FOUND for id=%', v_correlation_id, v_saved_ticket_id;
            v_return_ticket_status := 'unknown';
        ELSIF v_ticket.status NOT IN ('closed', 'resolved') THEN
            v_old_ticket_status := v_ticket.status;
            RAISE NOTICE '[159][%] Ticket found: status=%, updating to need_adjustment', v_correlation_id, v_old_ticket_status;

            UPDATE public.tickets t_upd
            SET status = 'need_adjustment'::ticket_status, pending_response_from = 'assignee', updated_at = NOW()
            WHERE t_upd.id = v_saved_ticket_id RETURNING * INTO v_ticket;
            v_return_ticket_status := v_ticket.status::TEXT;

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

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, new_value, notes, created_at)
            VALUES (v_saved_ticket_id, 'request_adjustment'::ticket_event_type, v_actor_id,
                jsonb_build_object('reason', p_reason_type::TEXT, 'triggered_by', 'quotation_rejection', 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Rate adjustment requested due to quotation rejection', NOW());
            v_ticket_events_created := v_ticket_events_created + 1;

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

        ELSE
            -- Ticket already closed/resolved - still record event AND comment
            v_return_ticket_status := v_ticket.status::TEXT;
            v_old_ticket_status := v_ticket.status;
            RAISE NOTICE '[159][%] Ticket is closed/resolved (status=%), recording event anyway', v_correlation_id, v_ticket.status;

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

        RAISE NOTICE '[159][%] Ticket section done: status=%, events_created=%, comment_created=%',
            v_correlation_id, v_return_ticket_status, v_ticket_events_created, v_ticket_comment_created;
    ELSE
        RAISE NOTICE '[159][%] No ticket_id on quotation - skipping ticket update', v_correlation_id;
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

    RAISE NOTICE '[159][%] rpc_customer_quotation_mark_rejected completed successfully', v_correlation_id;

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
    RAISE WARNING '[159][%] rpc_customer_quotation_mark_rejected FAILED: % (SQLSTATE: %)', v_correlation_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- PART 3: Fix rpc_customer_quotation_mark_accepted
-- Key changes from migration 158:
--   a) Read & lock opportunity BEFORE quotation UPDATE
--   b) Provide all 4 stage columns in stage_history INSERT
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
    v_derived_opportunity_id UUID := NULL;
    v_effective_opportunity_id UUID := NULL;
    v_stage_changed BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_multi_cost_count INTEGER := 0;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    RAISE NOTICE '[159][%] rpc_customer_quotation_mark_accepted started for quotation_id=%', v_correlation_id, p_quotation_id;

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

    -- Enhanced opportunity_id derivation
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

    -- [159] FIX: Lock and read opportunity BEFORE quotation UPDATE
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            RAISE NOTICE '[159][%] Opportunity PRE-LOCKED: stage=%', v_correlation_id, v_old_opp_stage;
        END IF;
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

    RAISE NOTICE '[159][%] Quotation updated to accepted', v_correlation_id;

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

        RAISE NOTICE '[159][%] Opportunity updated: % -> %, stage_changed=%', v_correlation_id, v_old_opp_stage, v_new_opp_stage, v_stage_changed;

        -- [159] FIX: Insert stage history with ALL 4 columns
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
                    v_old_opp_stage,        -- from_stage (legacy column)
                    v_new_opp_stage,        -- to_stage (legacy NOT NULL column)
                    v_old_opp_stage,        -- old_stage (new column)
                    v_new_opp_stage,        -- new_stage (new NOT NULL column)
                    v_actor_id,
                    '[' || v_correlation_id || '] Deal won - quotation accepted',
                    NOW()
                );
                v_stage_history_inserted := TRUE;
                RAISE NOTICE '[159][%] Stage history inserted: % -> %', v_correlation_id, v_old_opp_stage, v_new_opp_stage;
            END IF;
        END IF;

        -- [159] FIX: Insert pipeline update with correct columns
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
            RAISE NOTICE '[159][%] Pipeline update inserted: % -> %', v_correlation_id, v_old_opp_stage, v_new_opp_stage;
        END IF;

        -- Insert activity
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

        -- Update account status to active_account
        IF v_opportunity.account_id IS NOT NULL THEN
            UPDATE public.accounts
            SET
                status = 'active_account'::account_status,
                updated_at = NOW()
            WHERE account_id = v_opportunity.account_id
            AND status != 'active_account';
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
                    RAISE WARNING 'Failed to record response exchange: %', SQLERRM;
            END;
        END IF;
    END IF;

    -- 4. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET quotation_status = 'accepted', updated_at = NOW()
        WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (SINGLE - backward compatible)
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

    RAISE NOTICE '[159][%] rpc_customer_quotation_mark_accepted completed successfully', v_correlation_id;

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
        'correlation_id', v_correlation_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[159][%] rpc_customer_quotation_mark_accepted FAILED: % (SQLSTATE: %)', v_correlation_id, SQLERRM, SQLSTATE;
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
-- PART 4: Re-grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO service_role;


-- ============================================
-- SUMMARY
-- ============================================
-- Migration 159: Fix pipeline_updates and stage_history for rejection + acceptance
--
-- ROOT CAUSES:
-- 1. Trigger race: AFTER UPDATE trigger (trg_quotation_status_sync) could change
--    opportunity stage BEFORE the RPC reads it, causing RPC to see wrong old_stage
-- 2. Missing from_stage/to_stage: stage_history INSERT only provided old_stage/new_stage
--    but to_stage has NOT NULL constraint. Depends on auto-fill trigger (mig 149).
--
-- FIXES:
-- 1. Lock opportunity BEFORE quotation UPDATE to capture true old_stage
-- 2. Provide all 4 stage columns in stage_history INSERT
-- 3. Wider NOT EXISTS window (2 minutes instead of 1)
-- 4. Re-apply trigger GUC check for safety
-- 5. Enhanced RAISE NOTICE debugging at every step
-- 6. Same fixes applied to both mark_rejected AND mark_accepted
-- ============================================
