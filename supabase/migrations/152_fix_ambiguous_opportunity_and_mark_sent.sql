-- =====================================================
-- Migration 152: Fix AMBIGUOUS_OPPORTUNITY + mark_sent trigger interference
-- =====================================================
--
-- BUG 1: AMBIGUOUS_OPPORTUNITY blocks quotation send
--
-- The old fn_resolve_or_create_opportunity uses a complex 6-step chain
-- (quotation → repair → lead → account → ticket → autocreate) to find the
-- opportunity. When the repair step finds multiple candidates, it returns
-- AMBIGUOUS_OPPORTUNITY error and blocks the send.
--
-- But the mapping is actually simple:
--   customer_quotations.ticket_id → tickets.opportunity_id
-- Every quotation has a ticket_id, every ticket has an opportunity_id.
-- Direct FK mapping, no ambiguity possible.
--
-- FIX: mark_sent now resolves opportunity DIRECTLY via ticket_id first.
-- fn_resolve_or_create_opportunity is only called as fallback (and also
-- updated to not hard-fail on AMBIGUOUS).
--
-- BUG 2: mark_sent has same trigger interference as mark_rejected
--
-- trg_quotation_status_sync fires AFTER UPDATE on customer_quotations when
-- status changes to 'sent'. Same root cause as migration 151 (mark_rejected).
--
-- FIX: Set app.in_quotation_rpc GUC flag before quotation UPDATE in mark_sent.
-- =====================================================


-- ============================================
-- PART 1: Fix fn_resolve_or_create_opportunity
-- Continue to Steps 2-6 when repair returns AMBIGUOUS (safety net)
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_resolve_or_create_opportunity(
    p_quotation_id UUID,
    p_actor_user_id UUID,
    p_allow_autocreate BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    opportunity_id TEXT,
    opportunity_stage opportunity_stage,
    was_created BOOLEAN,
    source TEXT,
    error_code TEXT,
    error_message TEXT
) AS $$
DECLARE
    v_quotation RECORD;
    v_lead RECORD;
    v_opportunity RECORD;
    v_existing_opp RECORD;
    v_new_opp_id TEXT;
    v_was_created BOOLEAN := FALSE;
    v_source TEXT := NULL;
    v_original_opp_id TEXT := NULL;
    v_repair_result JSONB;
BEGIN
    -- ============================================
    -- STEP 0: Fetch quotation with full lead info
    -- ============================================
    SELECT
        cq.id AS quotation_id,
        cq.opportunity_id AS cq_opportunity_id,
        cq.lead_id AS cq_lead_id,
        cq.ticket_id AS cq_ticket_id,
        cq.total_selling_rate AS cq_total_selling_rate,
        cq.created_by AS cq_created_by,
        l.lead_id AS lead_lead_id,
        l.opportunity_id AS lead_opportunity_id,
        l.account_id AS lead_account_id,
        l.company_name AS lead_company_name,
        l.potential_revenue AS lead_potential_revenue,
        l.sales_owner_user_id AS lead_sales_owner
    INTO v_quotation
    FROM public.customer_quotations cq
    LEFT JOIN public.leads l ON l.lead_id = cq.lead_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RAISE NOTICE '[fn_resolve][152] Quotation % not found', p_quotation_id;
        RETURN QUERY SELECT NULL::TEXT, NULL::opportunity_stage, FALSE, NULL::TEXT,
                            'QUOTATION_NOT_FOUND'::TEXT, 'Quotation not found'::TEXT;
        RETURN;
    END IF;

    v_original_opp_id := v_quotation.cq_opportunity_id;

    RAISE NOTICE '[fn_resolve][152] Quotation found: id=%, cq_opportunity_id=%, lead_opportunity_id=%, ticket_id=%, allow_autocreate=%',
        v_quotation.quotation_id, v_quotation.cq_opportunity_id, v_quotation.lead_opportunity_id, v_quotation.cq_ticket_id, p_allow_autocreate;

    -- ============================================
    -- STEP 1: Try direct opportunity lookup from quotation.opportunity_id
    -- ============================================
    IF v_quotation.cq_opportunity_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve][152] STEP 1: Checking quotation opportunity_id: %', v_quotation.cq_opportunity_id;

        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_quotation.cq_opportunity_id;

        IF v_opportunity IS NOT NULL THEN
            RAISE NOTICE '[fn_resolve][152] STEP 1: Found opportunity % with stage %', v_opportunity.opportunity_id, v_opportunity.stage;
            RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, FALSE, 'quotation'::TEXT, NULL::TEXT, NULL::TEXT;
            RETURN;
        ELSE
            -- ORPHAN DETECTED: Attempt repair
            RAISE WARNING '[fn_resolve][152] STEP 1: ORPHAN - Opportunity % NOT FOUND. Attempting repair...', v_quotation.cq_opportunity_id;

            v_repair_result := fn_repair_orphan_opportunity(p_quotation_id);

            IF (v_repair_result->>'can_repair')::BOOLEAN AND v_repair_result->>'resolved_opportunity_id' IS NOT NULL THEN
                RAISE NOTICE '[fn_resolve][152] STEP 1: REPAIR SUCCESS - Using opportunity % from source %',
                    v_repair_result->>'resolved_opportunity_id', v_repair_result->>'resolution_source';

                UPDATE public.customer_quotations cq_upd
                SET opportunity_id = v_repair_result->>'resolved_opportunity_id'
                WHERE cq_upd.id = p_quotation_id;

                SELECT opp.* INTO v_opportunity
                FROM public.opportunities opp
                WHERE opp.opportunity_id = v_repair_result->>'resolved_opportunity_id';

                RETURN QUERY SELECT
                    v_opportunity.opportunity_id, v_opportunity.stage, FALSE,
                    ('repaired_' || COALESCE(v_repair_result->>'resolution_source', 'unknown'))::TEXT,
                    NULL::TEXT, NULL::TEXT;
                RETURN;
            ELSE
                -- [152] FIX: Don't return error. Continue to Steps 1b-6.
                RAISE WARNING '[fn_resolve][152] STEP 1: REPAIR FAILED - %. Continuing...',
                    v_repair_result->>'error';
                v_source := 'orphan_repair_failed';
            END IF;
        END IF;
    ELSE
        RAISE NOTICE '[fn_resolve][152] STEP 1: Quotation has no opportunity_id';
    END IF;

    -- ============================================
    -- STEP 1b (NEW): Try ticket_id → ticket.opportunity_id
    -- Direct FK mapping - simplest and most reliable
    -- ============================================
    IF v_quotation.cq_ticket_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve][152] STEP 1b: Checking ticket.opportunity_id via ticket_id=%', v_quotation.cq_ticket_id;

        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        INNER JOIN public.tickets t ON t.opportunity_id = opp.opportunity_id
        WHERE t.id = v_quotation.cq_ticket_id;

        IF v_opportunity IS NOT NULL THEN
            RAISE NOTICE '[fn_resolve][152] STEP 1b: Found opportunity % via ticket (direct FK)', v_opportunity.opportunity_id;

            UPDATE public.customer_quotations cq_upd
            SET opportunity_id = v_opportunity.opportunity_id
            WHERE cq_upd.id = p_quotation_id
            AND (cq_upd.opportunity_id IS NULL OR cq_upd.opportunity_id != v_opportunity.opportunity_id);

            IF v_quotation.lead_lead_id IS NOT NULL THEN
                UPDATE public.leads ld
                SET opportunity_id = v_opportunity.opportunity_id, updated_at = NOW()
                WHERE ld.lead_id = v_quotation.lead_lead_id
                AND (ld.opportunity_id IS NULL OR ld.opportunity_id != v_opportunity.opportunity_id);
            END IF;

            RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, FALSE, 'ticket_direct'::TEXT, NULL::TEXT, NULL::TEXT;
            RETURN;
        ELSE
            RAISE NOTICE '[fn_resolve][152] STEP 1b: Ticket % has no valid opportunity', v_quotation.cq_ticket_id;
        END IF;
    END IF;

    -- ============================================
    -- STEP 2: Try lead's opportunity_id
    -- ============================================
    IF v_quotation.lead_opportunity_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve][152] STEP 2: Checking lead opportunity_id: %', v_quotation.lead_opportunity_id;

        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_quotation.lead_opportunity_id;

        IF v_opportunity IS NOT NULL THEN
            RAISE NOTICE '[fn_resolve][152] STEP 2: Found opportunity % via lead', v_opportunity.opportunity_id;

            UPDATE public.customer_quotations cq_upd
            SET opportunity_id = v_quotation.lead_opportunity_id
            WHERE cq_upd.id = p_quotation_id;

            RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, FALSE, 'lead'::TEXT, NULL::TEXT, NULL::TEXT;
            RETURN;
        ELSE
            RAISE NOTICE '[fn_resolve][152] STEP 2: Lead opportunity % NOT FOUND', v_quotation.lead_opportunity_id;
            v_source := 'lead_missing';
        END IF;
    ELSE
        RAISE NOTICE '[fn_resolve][152] STEP 2: Lead has no opportunity_id';
    END IF;

    -- ============================================
    -- STEP 3: Find EXISTING opportunity by account_id (LIMIT 1, most recent)
    -- ============================================
    IF v_quotation.lead_account_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve][152] STEP 3: Searching by account_id: %', v_quotation.lead_account_id;

        SELECT opp.* INTO v_existing_opp
        FROM public.opportunities opp
        WHERE opp.account_id = v_quotation.lead_account_id
        AND opp.stage NOT IN ('Closed Won', 'Closed Lost')
        ORDER BY opp.updated_at DESC
        LIMIT 1;

        IF v_existing_opp IS NOT NULL THEN
            RAISE NOTICE '[fn_resolve][152] STEP 3: Found opportunity % for account %', v_existing_opp.opportunity_id, v_quotation.lead_account_id;

            UPDATE public.customer_quotations cq_upd
            SET opportunity_id = v_existing_opp.opportunity_id
            WHERE cq_upd.id = p_quotation_id;

            IF v_quotation.lead_lead_id IS NOT NULL THEN
                UPDATE public.leads ld
                SET opportunity_id = v_existing_opp.opportunity_id, updated_at = NOW()
                WHERE ld.lead_id = v_quotation.lead_lead_id
                AND ld.opportunity_id IS NULL;
            END IF;

            RETURN QUERY SELECT v_existing_opp.opportunity_id, v_existing_opp.stage, FALSE, 'account_existing'::TEXT, NULL::TEXT, NULL::TEXT;
            RETURN;
        ELSE
            RAISE NOTICE '[fn_resolve][152] STEP 3: No active opportunity for account %', v_quotation.lead_account_id;
        END IF;
    ELSE
        RAISE NOTICE '[fn_resolve][152] STEP 3: Lead has no account_id';
    END IF;

    -- ============================================
    -- STEP 4: Auto-create opportunity (if allowed)
    -- ============================================
    IF p_allow_autocreate AND v_quotation.lead_account_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve][152] STEP 4: Auto-creating opportunity for account %', v_quotation.lead_account_id;

        INSERT INTO public.opportunities (
            name, account_id, source_lead_id, owner_user_id, created_by,
            stage, estimated_value, currency, probability,
            expected_close_date, next_step, next_step_due_date
        ) VALUES (
            'Pipeline - ' || COALESCE(v_quotation.lead_company_name, 'Unknown'),
            v_quotation.lead_account_id,
            v_quotation.lead_lead_id,
            COALESCE(v_quotation.lead_sales_owner, p_actor_user_id),
            p_actor_user_id,
            'Quote Sent'::opportunity_stage,
            COALESCE(v_quotation.cq_total_selling_rate, v_quotation.lead_potential_revenue, 0),
            'IDR', 30,
            CURRENT_DATE + INTERVAL '30 days',
            'Follow up quotation',
            CURRENT_DATE + INTERVAL '7 days'
        ) RETURNING opportunities.opportunity_id INTO v_new_opp_id;

        UPDATE public.customer_quotations cq_upd
        SET opportunity_id = v_new_opp_id
        WHERE cq_upd.id = p_quotation_id;

        IF v_quotation.lead_lead_id IS NOT NULL THEN
            UPDATE public.leads ld
            SET opportunity_id = v_new_opp_id, updated_at = NOW()
            WHERE ld.lead_id = v_quotation.lead_lead_id;
        END IF;

        INSERT INTO public.opportunity_stage_history (
            opportunity_id, old_stage, new_stage, changed_by, notes, changed_at
        ) VALUES (
            v_new_opp_id, NULL, 'Quote Sent'::opportunity_stage, p_actor_user_id,
            'Auto-created from quotation send', NOW()
        );

        RAISE NOTICE '[fn_resolve][152] STEP 4: Auto-created opportunity %', v_new_opp_id;

        RETURN QUERY SELECT v_new_opp_id, 'Quote Sent'::opportunity_stage, TRUE, 'auto_created'::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- No opportunity found
    RAISE NOTICE '[fn_resolve][152] No opportunity found. lead_id=%, account_id=%, ticket_id=%',
        v_quotation.cq_lead_id, v_quotation.lead_account_id, v_quotation.cq_ticket_id;

    IF p_allow_autocreate THEN
        RETURN QUERY SELECT NULL::TEXT, NULL::opportunity_stage, FALSE, 'no_data'::TEXT,
            'INSUFFICIENT_DATA'::TEXT, 'Cannot auto-create opportunity: missing account_id'::TEXT;
    ELSE
        RETURN QUERY SELECT NULL::TEXT, NULL::opportunity_stage, FALSE, COALESCE(v_source, 'not_found')::TEXT,
            NULL::TEXT, NULL::TEXT;
    END IF;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_resolve_or_create_opportunity IS
'Migration 152: Simplified resolution order:
1. quotation.opportunity_id (direct, if exists in DB)
1b. quotation.ticket_id → ticket.opportunity_id (NEW - direct FK mapping, most reliable)
2. lead.opportunity_id
3. account active opportunities (LIMIT 1, ORDER BY updated_at DESC)
4. Auto-create (if p_allow_autocreate=TRUE)

Key fix: Step 1b uses ticket_id FK mapping which never hits AMBIGUOUS_OPPORTUNITY.
Also: repair failure no longer hard-fails, continues to Steps 1b+.';

GRANT EXECUTE ON FUNCTION public.fn_resolve_or_create_opportunity(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_or_create_opportunity(UUID, UUID, BOOLEAN) TO service_role;


-- ============================================
-- PART 2: Redefine mark_sent with:
--   a) Direct ticket_id → opportunity_id resolution (primary path)
--   b) GUC flag for trigger interference prevention
--   c) fn_resolve as fallback only
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
    v_saved_ticket_id UUID := NULL;
    v_opp_source TEXT := NULL;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    RAISE NOTICE '[152][%] mark_sent started for quotation_id=%', v_correlation_id, p_quotation_id;

    SELECT cq.* INTO v_quotation FROM public.customer_quotations cq WHERE cq.id = p_quotation_id FOR UPDATE;
    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found', 'error_code', 'QUOTATION_NOT_FOUND', 'correlation_id', v_correlation_id);
    END IF;

    v_saved_ticket_id := v_quotation.ticket_id;

    RAISE NOTICE '[152][%] Quotation: number=%, ticket_id=%, lead_id=%, opportunity_id=%, status=%',
        v_correlation_id, v_quotation.quotation_number, v_saved_ticket_id, v_quotation.lead_id, v_quotation.opportunity_id, v_quotation.status;

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

    -- ================================================
    -- [152] Set GUC flag to prevent AFTER UPDATE trigger interference
    -- ================================================
    PERFORM set_config('app.in_quotation_rpc', 'true', true);

    -- 1. UPDATE QUOTATION
    UPDATE public.customer_quotations cq_upd
    SET status = 'sent'::customer_quotation_status, sent_via = COALESCE(p_sent_via, cq_upd.sent_via),
        sent_to = COALESCE(p_sent_to, cq_upd.sent_to), sent_at = COALESCE(cq_upd.sent_at, NOW()), updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id RETURNING * INTO v_quotation;

    RAISE NOTICE '[152][%] Quotation updated to sent', v_correlation_id;

    -- ================================================
    -- 2. RESOLVE OPPORTUNITY
    -- Primary path: direct FK mapping via ticket_id
    -- Fallback: fn_resolve_or_create_opportunity
    -- ================================================
    IF NOT v_is_resend THEN
        -- [152] PRIMARY: Try quotation.opportunity_id first (already set, fastest)
        IF v_quotation.opportunity_id IS NOT NULL THEN
            SELECT opp.opportunity_id INTO v_effective_opportunity_id
            FROM public.opportunities opp
            WHERE opp.opportunity_id = v_quotation.opportunity_id;

            IF v_effective_opportunity_id IS NOT NULL THEN
                v_opp_source := 'quotation_direct';
                RAISE NOTICE '[152][%] Resolved via quotation.opportunity_id=%', v_correlation_id, v_effective_opportunity_id;
            END IF;
        END IF;

        -- [152] SECONDARY: ticket_id → ticket.opportunity_id (direct FK, never ambiguous)
        IF v_effective_opportunity_id IS NULL AND v_saved_ticket_id IS NOT NULL THEN
            SELECT t.opportunity_id INTO v_effective_opportunity_id
            FROM public.tickets t
            WHERE t.id = v_saved_ticket_id
            AND t.opportunity_id IS NOT NULL;

            IF v_effective_opportunity_id IS NOT NULL THEN
                v_opp_source := 'ticket_fk';
                RAISE NOTICE '[152][%] Resolved via ticket FK: ticket_id=% → opportunity_id=%',
                    v_correlation_id, v_saved_ticket_id, v_effective_opportunity_id;

                -- Sync back to quotation
                UPDATE public.customer_quotations cq_upd
                SET opportunity_id = v_effective_opportunity_id
                WHERE cq_upd.id = p_quotation_id AND cq_upd.opportunity_id IS DISTINCT FROM v_effective_opportunity_id;
            END IF;
        END IF;

        -- [152] FALLBACK: fn_resolve_or_create_opportunity (complex chain, only if above failed)
        IF v_effective_opportunity_id IS NULL THEN
            RAISE NOTICE '[152][%] Primary paths failed, falling back to fn_resolve...', v_correlation_id;

            SELECT resolved.* INTO v_resolved_opp
            FROM public.fn_resolve_or_create_opportunity(p_quotation_id, p_actor_user_id, p_allow_autocreate) resolved;

            IF v_resolved_opp.error_code IS NOT NULL THEN
                RAISE WARNING '[152][%] fn_resolve error: % (%). Continuing without opportunity.',
                    v_correlation_id, v_resolved_opp.error_code, v_resolved_opp.error_message;
            END IF;

            IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
                v_effective_opportunity_id := v_resolved_opp.opportunity_id;
                v_opportunity_auto_created := v_resolved_opp.was_created;
                v_opp_source := 'fn_resolve_' || COALESCE(v_resolved_opp.source, 'unknown');
            END IF;
        END IF;

        RAISE NOTICE '[152][%] Final effective_opportunity_id=% (source=%)',
            v_correlation_id, v_effective_opportunity_id, v_opp_source;
    ELSE
        v_effective_opportunity_id := v_quotation.opportunity_id;
        v_opp_source := 'resend';
    END IF;

    -- Quotation sequence
    SELECT COUNT(*) INTO v_quotation_sequence FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;

    -- Broaden v_previous_rejected_count
    SELECT COUNT(*) INTO v_previous_rejected_count FROM public.customer_quotations cq2
    WHERE cq2.id != p_quotation_id
      AND cq2.status = 'rejected'
      AND (
          (v_effective_opportunity_id IS NOT NULL AND cq2.opportunity_id = v_effective_opportunity_id)
          OR (v_saved_ticket_id IS NOT NULL AND cq2.ticket_id = v_saved_ticket_id)
          OR (v_saved_ticket_id IS NULL AND v_quotation.lead_id IS NOT NULL AND cq2.lead_id = v_quotation.lead_id)
      );

    RAISE NOTICE '[152][%] Sequence: %, previous_rejected: %, opp_id: %',
        v_correlation_id, v_quotation_sequence, v_previous_rejected_count, v_effective_opportunity_id;

    v_sequence_label := CASE v_quotation_sequence WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE v_quotation_sequence::TEXT || 'th' END;

    -- 3. UPDATE OPPORTUNITY
    IF v_effective_opportunity_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            RAISE NOTICE '[152][%] Opportunity: id=%, stage=%, previous_rejected=%',
                v_correlation_id, v_opportunity.opportunity_id, v_opportunity.stage, v_previous_rejected_count;

            IF v_previous_rejected_count > 0 AND v_opportunity.stage NOT IN ('Negotiation', 'Closed Won', 'Closed Lost') THEN
                v_new_opp_stage := 'Negotiation'::opportunity_stage;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage,
                    estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;

            ELSIF v_opportunity.stage IN ('Prospecting', 'Discovery') AND v_previous_rejected_count = 0 THEN
                v_new_opp_stage := 'Quote Sent'::opportunity_stage;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage,
                    estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;

            ELSIF v_opportunity.stage IN ('Quote Sent', 'Negotiation') THEN
                v_new_opp_stage := v_opportunity.stage;
                UPDATE public.opportunities opp_upd
                SET estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

            ELSIF v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost') THEN
                v_new_opp_stage := v_opportunity.stage;
                UPDATE public.opportunities opp_upd
                SET estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

            ELSE
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
                        '[' || v_correlation_id || '] Stage changed: quotation sent (prev_rejected: ' || v_previous_rejected_count || ')', NOW());
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
                    'Quotation ' || v_quotation.quotation_number || ' sent to customer'
                        || CASE WHEN v_previous_rejected_count > 0
                            THEN ' (revised after ' || v_previous_rejected_count || ' rejection(s))'
                            ELSE '' END,
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
        ELSE
            RAISE NOTICE '[152][%] Opportunity NOT FOUND for id=%', v_correlation_id, v_effective_opportunity_id;
        END IF;
    END IF;

    -- 3b. UPDATE TICKET
    IF v_saved_ticket_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT t.* INTO v_ticket FROM public.tickets t WHERE t.id = v_saved_ticket_id FOR UPDATE;
        IF v_ticket IS NOT NULL THEN
            v_old_ticket_status := v_ticket.status;
            UPDATE public.tickets t_upd
            SET status = 'waiting_customer'::ticket_status,
                pending_response_from = 'creator',
                updated_at = NOW()
            WHERE t_upd.id = v_saved_ticket_id
            RETURNING * INTO v_ticket;
            v_return_ticket_status := v_ticket.status::TEXT;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_saved_ticket_id, 'customer_quotation_sent'::ticket_event_type, p_actor_user_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object('status', 'waiting_customer', 'sent_via', p_sent_via, 'sent_to', p_sent_to,
                    'quotation_number', v_quotation.quotation_number, 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent via ' || COALESCE(p_sent_via, 'system'), NOW());

            INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
            VALUES (v_saved_ticket_id, p_actor_user_id,
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

    RAISE NOTICE '[152][%] mark_sent completed: old_stage=%, new_stage=%, pipeline_updated=%, opp_id=%, source=%',
        v_correlation_id, v_old_opp_stage, v_new_opp_stage, v_pipeline_updated, v_effective_opportunity_id, v_opp_source;

    RETURN jsonb_build_object(
        'success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status, 'opportunity_id', COALESCE(v_effective_opportunity_id, v_quotation.opportunity_id),
        'opportunity_source', v_opp_source,
        'old_stage', v_old_opp_stage, 'new_stage', v_new_opp_stage, 'ticket_id', v_saved_ticket_id,
        'ticket_status', v_return_ticket_status, 'is_resend', v_is_resend,
        'pipeline_updated', v_pipeline_updated, 'opportunity_auto_created', v_opportunity_auto_created,
        'stage_history_inserted', v_stage_history_inserted, 'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted, 'quotation_sequence', v_quotation_sequence,
        'sequence_label', v_sequence_label, 'previous_rejected_count', v_previous_rejected_count,
        'multi_shipment_costs_updated', v_multi_cost_count,
        'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[152][%] mark_sent FAILED: % (SQLSTATE: %)', v_correlation_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS
'Migration 152: Simplified opportunity resolution.
1. PRIMARY: quotation.opportunity_id (if exists in DB)
2. SECONDARY: ticket_id → ticket.opportunity_id (direct FK, never ambiguous)
3. FALLBACK: fn_resolve_or_create_opportunity (complex chain)
Also: GUC flag for trigger interference prevention (same as 151).';

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO service_role;
