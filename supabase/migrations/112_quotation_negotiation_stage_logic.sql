-- ============================================
-- MIGRATION 112: Update quotation stage transition logic
-- ============================================
--
-- BUSINESS LOGIC CHANGE:
-- After the first quotation is rejected and pipeline moves to Negotiation,
-- subsequent quotations should stay in Negotiation (not move back to Quote Sent).
-- This reflects that sending revised quotations is part of the negotiation process.
--
-- NEW FLOW:
-- 1. 1st Quotation Sent: Prospecting/Discovery → Quote Sent
-- 2. 1st Quotation Rejected: Quote Sent → Negotiation
-- 3. 2nd Quotation Sent: Stay in Negotiation (with marker "2nd quotation sent")
-- 4. 2nd Quotation Rejected: Stay in Negotiation (with marker "2nd quotation rejected")
-- 5. ... until quotation is accepted → Closed Won
--
-- IDEMPOTENCY: Safe to re-run (DROP + CREATE)
-- ============================================

-- ============================================
-- PART 0: Drop all existing overloads
-- ============================================

DO $$
DECLARE
    v_proc RECORD;
BEGIN
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'rpc_customer_quotation_mark_sent'
    LOOP
        RAISE NOTICE '[112] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;

    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'rpc_customer_quotation_mark_rejected'
    LOOP
        RAISE NOTICE '[112] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;
END $$;

-- ============================================
-- UPDATED: rpc_customer_quotation_mark_sent
-- Stay in Negotiation for revised quotations
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
    v_effective_opportunity_id TEXT;
    v_old_opp_stage opportunity_stage;
    v_new_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_is_resend BOOLEAN := FALSE;
    v_correlation_id TEXT;
    v_actor_id UUID;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_pipeline_updated BOOLEAN := FALSE;
    v_opportunity_auto_created BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    -- Quotation sequence tracking
    v_quotation_sequence INTEGER := 1;
    v_sequence_label TEXT := '';
    v_previous_rejected_count INTEGER := 0;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Start by locking the quotation
    SELECT cq.* INTO v_quotation
    FROM public.customer_quotations cq
    WHERE cq.id = p_quotation_id
    FOR UPDATE;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Quotation not found',
            'error_code', 'QUOTATION_NOT_FOUND',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Check if this is a resend (already sent before)
    v_is_resend := (v_quotation.status = 'sent' AND v_quotation.sent_at IS NOT NULL);

    -- Validate transition (draft → sent, or resend)
    IF v_quotation.status NOT IN ('draft', 'sent') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Cannot send quotation with status: ' || v_quotation.status,
            'error_code', 'INVALID_STATUS_TRANSITION',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- 1. UPDATE QUOTATION STATUS
    UPDATE public.customer_quotations cq_upd
    SET
        status = 'sent'::customer_quotation_status,
        sent_via = COALESCE(p_sent_via, cq_upd.sent_via),
        sent_to = COALESCE(p_sent_to, cq_upd.sent_to),
        sent_at = COALESCE(cq_upd.sent_at, NOW()),
        updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. RESOLVE OPPORTUNITY (with auto-creation if needed) - skip on resend
    IF NOT v_is_resend THEN
        SELECT resolved.* INTO v_resolved_opp
        FROM public.fn_resolve_or_create_opportunity(p_quotation_id, v_actor_id, p_allow_autocreate) resolved;

        IF v_resolved_opp.error_code IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', COALESCE(v_resolved_opp.error_message, 'Failed to resolve opportunity'),
                'error_code', v_resolved_opp.error_code,
                'quotation_id', v_quotation.id,
                'quotation_number', v_quotation.quotation_number,
                'correlation_id', v_correlation_id
            );
        END IF;

        IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_resolved_opp.opportunity_id;
            v_opportunity_auto_created := v_resolved_opp.was_created;

            SELECT opp.* INTO v_opportunity
            FROM public.opportunities opp
            WHERE opp.opportunity_id = v_effective_opportunity_id
            FOR UPDATE;

            -- Update quotation with opportunity_id if not set
            IF v_quotation.opportunity_id IS NULL OR v_quotation.opportunity_id != v_effective_opportunity_id THEN
                UPDATE public.customer_quotations cq_upd
                SET opportunity_id = v_effective_opportunity_id
                WHERE cq_upd.id = p_quotation_id;
            END IF;

            SELECT cq.* INTO v_quotation
            FROM public.customer_quotations cq
            WHERE cq.id = p_quotation_id;
        END IF;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- Calculate quotation sequence
            SELECT COUNT(*) INTO v_quotation_sequence
            FROM public.customer_quotations cq
            WHERE cq.opportunity_id = v_effective_opportunity_id
            AND cq.status IN ('sent', 'rejected', 'accepted');

            -- Count previously rejected quotations
            SELECT COUNT(*) INTO v_previous_rejected_count
            FROM public.customer_quotations cq
            WHERE cq.opportunity_id = v_effective_opportunity_id
            AND cq.status = 'rejected';

            -- Generate sequence label (1st, 2nd, 3rd, etc.)
            v_sequence_label := CASE v_quotation_sequence
                WHEN 1 THEN '1st'
                WHEN 2 THEN '2nd'
                WHEN 3 THEN '3rd'
                ELSE v_quotation_sequence::TEXT || 'th'
            END;

            -- ============================================
            -- NEW LOGIC: Different behavior based on stage
            -- ============================================

            -- CASE 1: First quotation (from Prospecting/Discovery) → Move to Quote Sent
            IF v_opportunity.stage IN ('Prospecting', 'Discovery') THEN
                UPDATE public.opportunities opp_upd
                SET
                    stage = 'Quote Sent'::opportunity_stage,
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    quotation_count = COALESCE(opp_upd.quotation_count, 0) + 1,
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Quote Sent'::opportunity_stage;
                v_pipeline_updated := TRUE;

                v_activity_subject := v_sequence_label || ' Quotation Sent → Stage moved to Quote Sent';
                v_activity_description := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') sent to customer via ' || COALESCE(p_sent_via, 'system') || '. Pipeline stage auto-updated.';
                v_pipeline_notes := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') sent via ' || COALESCE(p_sent_via, 'system');

                -- Insert stage history
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.new_stage = 'Quote Sent'::opportunity_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (
                        opportunity_id, from_stage, to_stage, changed_by, reason, notes, old_stage, new_stage
                    ) VALUES (
                        v_effective_opportunity_id, v_old_opp_stage, 'Quote Sent'::opportunity_stage,
                        v_actor_id, 'quotation_sent',
                        '[' || v_correlation_id || '] ' || v_pipeline_notes,
                        v_old_opp_stage, 'Quote Sent'::opportunity_stage
                    );
                    v_stage_history_inserted := TRUE;
                END IF;

                -- Insert pipeline_updates
                IF NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates pu
                    WHERE pu.opportunity_id = v_effective_opportunity_id
                    AND pu.new_stage = 'Quote Sent'::opportunity_stage
                    AND pu.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.pipeline_updates (
                        opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at
                    ) VALUES (
                        v_effective_opportunity_id,
                        '[' || v_correlation_id || '] ' || v_pipeline_notes,
                        'Email'::approach_method,
                        v_old_opp_stage,
                        'Quote Sent'::opportunity_stage,
                        v_actor_id,
                        NOW()
                    );
                    v_pipeline_updates_inserted := TRUE;
                END IF;

            -- CASE 2: Revised quotation during negotiation → Stay in Negotiation
            ELSIF v_opportunity.stage = 'Negotiation' THEN
                -- Don't change stage, just update quotation info
                UPDATE public.opportunities opp_upd
                SET
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    quotation_count = COALESCE(opp_upd.quotation_count, 0) + 1,
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Negotiation'::opportunity_stage;
                v_pipeline_updated := TRUE;

                -- Activity subject indicates stage stays in Negotiation
                v_activity_subject := v_sequence_label || ' Quotation Sent (Negotiation in progress)';
                v_activity_description := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') sent to customer via ' || COALESCE(p_sent_via, 'system') || '. Stage remains in Negotiation.' ||
                    CASE WHEN v_previous_rejected_count > 0 THEN ' (After ' || v_previous_rejected_count || ' rejected quotation(s))' ELSE '' END;
                v_pipeline_notes := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') sent via ' || COALESCE(p_sent_via, 'system') ||
                    ' [revised after ' || v_previous_rejected_count || ' rejection(s)]';

                -- Insert pipeline_updates for tracking (no stage change but record the activity)
                IF NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates pu
                    WHERE pu.opportunity_id = v_effective_opportunity_id
                    AND pu.notes LIKE '%' || v_quotation.quotation_number || '%'
                    AND pu.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.pipeline_updates (
                        opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at
                    ) VALUES (
                        v_effective_opportunity_id,
                        '[' || v_correlation_id || '] ' || v_pipeline_notes,
                        'Email'::approach_method,
                        'Negotiation'::opportunity_stage,
                        'Negotiation'::opportunity_stage,
                        v_actor_id,
                        NOW()
                    );
                    v_pipeline_updates_inserted := TRUE;
                END IF;

            -- CASE 3: Already in Quote Sent (sending another quotation before rejection)
            ELSIF v_opportunity.stage = 'Quote Sent' THEN
                UPDATE public.opportunities opp_upd
                SET
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    quotation_count = COALESCE(opp_upd.quotation_count, 0) + 1,
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Quote Sent'::opportunity_stage;

                v_activity_subject := v_sequence_label || ' Quotation Sent (Already in Quote Sent)';
                v_activity_description := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') sent to customer via ' || COALESCE(p_sent_via, 'system') || '. Stage already in Quote Sent.';
                v_pipeline_notes := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') sent via ' || COALESCE(p_sent_via, 'system');

            ELSE
                -- Other stages - just update quotation status
                UPDATE public.opportunities opp_upd
                SET
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

                v_new_opp_stage := v_opportunity.stage;
                v_activity_subject := v_sequence_label || ' Quotation Sent';
                v_activity_description := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') sent to customer via ' || COALESCE(p_sent_via, 'system') || '.';
            END IF;

            -- Insert activity record for all cases
            IF v_activity_subject IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.activities act
                    WHERE act.related_opportunity_id = v_effective_opportunity_id
                    AND act.subject = v_activity_subject
                    AND act.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.activities (
                        activity_type, subject, description, status, due_date, completed_at,
                        related_opportunity_id, related_lead_id, owner_user_id, created_by
                    ) VALUES (
                        'Note'::activity_type_v2,
                        v_activity_subject,
                        '[' || v_correlation_id || '] ' || v_activity_description,
                        'Completed'::activity_status,
                        CURRENT_DATE,
                        NOW(),
                        v_effective_opportunity_id,
                        v_quotation.lead_id,
                        COALESCE(v_actor_id, v_quotation.created_by),
                        COALESCE(v_actor_id, v_quotation.created_by)
                    );
                    v_activities_inserted := TRUE;
                END IF;
            END IF;
        END IF;
    END IF;

    -- 3. UPDATE TICKET STATUS (if linked)
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.status INTO v_old_ticket_status
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        FOR UPDATE;

        UPDATE public.tickets t_upd
        SET
            status = 'waiting_customer'::ticket_status,
            pending_response_from = 'creator',
            updated_at = NOW()
        WHERE t_upd.id = v_quotation.ticket_id
        AND t_upd.status NOT IN ('closed', 'resolved', 'waiting_customer')
        RETURNING * INTO v_ticket;

        IF NOT v_is_resend THEN
            INSERT INTO public.ticket_events (
                ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at
            ) VALUES (
                v_quotation.ticket_id,
                'customer_quotation_sent'::ticket_event_type,
                v_actor_id,
                jsonb_build_object('ticket_status', v_old_ticket_status),
                jsonb_build_object(
                    'ticket_status', 'waiting_customer',
                    'quotation_id', v_quotation.id,
                    'quotation_number', v_quotation.quotation_number,
                    'quotation_status', 'sent',
                    'sent_via', p_sent_via,
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system'),
                NOW()
            );
        END IF;
    END IF;

    -- 4. UPDATE LEAD STATUS (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads l_upd
        SET
            lead_status = 'Qualified'::lead_status,
            updated_at = NOW()
        WHERE l_upd.lead_id = v_quotation.lead_id
        AND l_upd.lead_status NOT IN ('Won', 'Lost', 'Qualified');
    END IF;

    -- Return success
    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'opportunity_id', v_effective_opportunity_id,
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
        'ticket_id', v_quotation.ticket_id,
        'ticket_status', v_ticket.status,
        'is_resend', v_is_resend,
        'pipeline_updated', v_pipeline_updated,
        'opportunity_auto_created', v_opportunity_auto_created,
        'stage_history_inserted', v_stage_history_inserted,
        'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted,
        'quotation_sequence', v_quotation_sequence,
        'sequence_label', v_sequence_label,
        'previous_rejected_count', v_previous_rejected_count,
        'correlation_id', v_correlation_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', 'INTERNAL_ERROR',
            'correlation_id', v_correlation_id
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS
'Atomically marks quotation as sent with updated stage transition logic.

MIGRATION 112 CHANGES:
- First quotation (from Prospecting/Discovery) → Quote Sent
- Revised quotations during Negotiation → Stay in Negotiation
- Activity messages now reflect whether stage changed or stayed the same
- "2nd Quotation Sent (Negotiation in progress)" for revised quotes';

-- ============================================
-- UPDATED: rpc_customer_quotation_mark_rejected
-- Improved messaging for negotiation flow
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
    v_lead RECORD;
    v_resolved_opp RECORD;
    v_effective_opportunity_id TEXT;
    v_old_opp_stage opportunity_stage;
    v_new_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_actor_id UUID;
    v_auth_check JSONB;
    v_transition_check JSONB;
    v_correlation_id TEXT;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_pipeline_updated BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    -- Quotation sequence tracking
    v_quotation_sequence INTEGER := 1;
    v_sequence_label TEXT := '';
    v_previous_rejected_count INTEGER := 0;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Validate required numeric fields for specific reasons
    IF p_reason_type = 'kompetitor_lebih_murah' AND p_competitor_name IS NULL AND p_competitor_amount IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Competitor name or amount is required when reason is "kompetitor_lebih_murah"',
            'error_code', 'VALIDATION_ERROR',
            'field_errors', jsonb_build_object('competitor_amount', 'Required for this reason'),
            'correlation_id', v_correlation_id
        );
    END IF;

    IF p_reason_type = 'budget_customer_tidak_cukup' AND p_customer_budget IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Customer budget is required when reason is "budget_customer_tidak_cukup"',
            'error_code', 'VALIDATION_ERROR',
            'field_errors', jsonb_build_object('customer_budget', 'Required for this reason'),
            'correlation_id', v_correlation_id
        );
    END IF;

    IF p_reason_type = 'tarif_tidak_masuk' AND p_competitor_amount IS NULL AND p_customer_budget IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Either competitor amount or customer budget is required when reason is "tarif_tidak_masuk"',
            'error_code', 'VALIDATION_ERROR',
            'field_errors', jsonb_build_object('competitor_amount', 'Either this or customer_budget required'),
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Lock the quotation
    SELECT cq.* INTO v_quotation
    FROM public.customer_quotations cq
    WHERE cq.id = p_quotation_id
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
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'reject');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Idempotency: If already rejected, return success
    IF v_quotation.status = 'rejected' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'quotation_id', v_quotation.id,
            'quotation_number', v_quotation.quotation_number,
            'quotation_status', v_quotation.status,
            'is_idempotent', TRUE,
            'message', 'Quotation was already rejected. No changes made.',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Validate state transition
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'rejected');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- 1. UPDATE QUOTATION STATUS
    UPDATE public.customer_quotations cq_upd
    SET
        status = 'rejected'::customer_quotation_status,
        rejection_reason = p_reason_type::TEXT,
        updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. INSERT REJECTION REASON RECORD
    INSERT INTO public.quotation_rejection_reasons (
        quotation_id, reason_type, competitor_name, competitor_amount, customer_budget, currency, notes, created_by, created_at
    ) VALUES (
        p_quotation_id, p_reason_type, p_competitor_name, p_competitor_amount, p_customer_budget,
        COALESCE(p_currency, v_quotation.currency, 'IDR'), p_notes, v_actor_id, NOW()
    );

    -- 3. RESOLVE OPPORTUNITY
    SELECT resolved.* INTO v_resolved_opp
    FROM public.fn_resolve_or_create_opportunity(p_quotation_id, v_actor_id) resolved;

    IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
        v_effective_opportunity_id := v_resolved_opp.opportunity_id;

        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        SELECT cq.* INTO v_quotation
        FROM public.customer_quotations cq
        WHERE cq.id = p_quotation_id;
    END IF;

    IF v_opportunity IS NOT NULL THEN
        v_old_opp_stage := v_opportunity.stage;

        -- Calculate quotation sequence
        SELECT COUNT(*) INTO v_quotation_sequence
        FROM public.customer_quotations cq
        WHERE cq.opportunity_id = v_effective_opportunity_id
        AND cq.status IN ('sent', 'rejected', 'accepted');

        -- Count previously rejected (excluding current)
        SELECT COUNT(*) INTO v_previous_rejected_count
        FROM public.customer_quotations cq
        WHERE cq.opportunity_id = v_effective_opportunity_id
        AND cq.status = 'rejected'
        AND cq.id != p_quotation_id;

        v_sequence_label := CASE v_quotation_sequence
            WHEN 1 THEN '1st'
            WHEN 2 THEN '2nd'
            WHEN 3 THEN '3rd'
            ELSE v_quotation_sequence::TEXT || 'th'
        END;

        -- CASE 1: First rejection (from Quote Sent/Discovery/Prospecting) → Move to Negotiation
        IF v_opportunity.stage IN ('Quote Sent', 'Discovery', 'Prospecting') THEN
            UPDATE public.opportunities opp_upd
            SET
                stage = 'Negotiation'::opportunity_stage,
                quotation_status = 'rejected',
                competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id
            RETURNING * INTO v_opportunity;

            v_new_opp_stage := 'Negotiation'::opportunity_stage;
            v_pipeline_updated := TRUE;

            v_activity_subject := v_sequence_label || ' Quotation Rejected → Stage moved to Negotiation';
            v_activity_description := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') rejected by customer. Reason: ' || p_reason_type::TEXT || '. Pipeline stage moved to Negotiation for re-negotiation.';
            v_pipeline_notes := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') rejected. Reason: ' || p_reason_type::TEXT;

            -- Insert stage history
            IF NOT EXISTS (
                SELECT 1 FROM public.opportunity_stage_history osh
                WHERE osh.opportunity_id = v_effective_opportunity_id
                AND osh.new_stage = 'Negotiation'::opportunity_stage
                AND osh.from_stage = v_old_opp_stage
                AND osh.changed_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id, from_stage, to_stage, changed_by, reason, notes, old_stage, new_stage
                ) VALUES (
                    v_effective_opportunity_id, v_old_opp_stage, 'Negotiation'::opportunity_stage,
                    v_actor_id, 'quotation_rejected',
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    v_old_opp_stage, 'Negotiation'::opportunity_stage
                );
                v_stage_history_inserted := TRUE;
            END IF;

            -- Insert pipeline_updates
            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.new_stage = 'Negotiation'::opportunity_stage
                AND pu.old_stage = v_old_opp_stage
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (
                    opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at
                ) VALUES (
                    v_effective_opportunity_id,
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    'Email'::approach_method,
                    v_old_opp_stage,
                    'Negotiation'::opportunity_stage,
                    v_actor_id,
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;
            END IF;

        -- CASE 2: Already in Negotiation → Stay in Negotiation (subsequent rejections)
        ELSIF v_opportunity.stage = 'Negotiation' THEN
            UPDATE public.opportunities opp_upd
            SET
                quotation_status = 'rejected',
                competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

            v_new_opp_stage := 'Negotiation'::opportunity_stage;
            v_pipeline_updated := TRUE;

            v_activity_subject := v_sequence_label || ' Quotation Rejected (Negotiation in progress)';
            v_activity_description := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') rejected by customer. Reason: ' || p_reason_type::TEXT || '. Stage remains in Negotiation.' ||
                CASE WHEN v_previous_rejected_count > 0 THEN ' (Total rejections: ' || (v_previous_rejected_count + 1) || ')' ELSE '' END;
            v_pipeline_notes := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') rejected. Reason: ' || p_reason_type::TEXT ||
                ' [rejection #' || (v_previous_rejected_count + 1) || ']';

            -- Insert pipeline_updates for tracking (no stage change)
            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.notes LIKE '%' || v_quotation.quotation_number || '%'
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (
                    opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at
                ) VALUES (
                    v_effective_opportunity_id,
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    'Email'::approach_method,
                    'Negotiation'::opportunity_stage,
                    'Negotiation'::opportunity_stage,
                    v_actor_id,
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;
            END IF;

        ELSE
            -- Other stages - just update quotation status
            UPDATE public.opportunities opp_upd
            SET
                quotation_status = 'rejected',
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

            v_new_opp_stage := v_opportunity.stage;
            v_activity_subject := v_sequence_label || ' Quotation Rejected';
            v_activity_description := v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') rejected by customer. Reason: ' || p_reason_type::TEXT || '.';
        END IF;

        -- Insert activity record
        IF v_activity_subject IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.activities act
                WHERE act.related_opportunity_id = v_effective_opportunity_id
                AND act.subject = v_activity_subject
                AND act.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.activities (
                    activity_type, subject, description, status, due_date, completed_at,
                    related_opportunity_id, related_lead_id, owner_user_id, created_by
                ) VALUES (
                    'Note'::activity_type_v2,
                    v_activity_subject,
                    '[' || v_correlation_id || '] ' || v_activity_description,
                    'Completed'::activity_status,
                    CURRENT_DATE,
                    NOW(),
                    v_effective_opportunity_id,
                    v_quotation.lead_id,
                    COALESCE(v_actor_id, v_quotation.created_by),
                    COALESCE(v_actor_id, v_quotation.created_by)
                );
                v_activities_inserted := TRUE;
            END IF;
        END IF;
    END IF;

    -- 4. UPDATE TICKET STATUS (if linked) → need_adjustment
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.status INTO v_old_ticket_status
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        FOR UPDATE;

        UPDATE public.tickets t_upd
        SET
            status = 'need_adjustment'::ticket_status,
            pending_response_from = 'assignee',
            updated_at = NOW()
        WHERE t_upd.id = v_quotation.ticket_id
        AND t_upd.status NOT IN ('closed', 'resolved')
        RETURNING * INTO v_ticket;

        INSERT INTO public.ticket_events (
            ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at
        ) VALUES (
            v_quotation.ticket_id,
            'customer_quotation_rejected'::ticket_event_type,
            v_actor_id,
            jsonb_build_object('ticket_status', v_old_ticket_status),
            jsonb_build_object(
                'ticket_status', 'need_adjustment',
                'quotation_id', v_quotation.id,
                'quotation_number', v_quotation.quotation_number,
                'rejection_reason', p_reason_type::TEXT,
                'correlation_id', v_correlation_id
            ),
            '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected. Reason: ' || p_reason_type::TEXT,
            NOW()
        );
    END IF;

    -- 5. UPDATE LEAD STATUS (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads l_upd
        SET
            updated_at = NOW()
        WHERE l_upd.lead_id = v_quotation.lead_id;
    END IF;

    -- Return success
    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'opportunity_id', v_effective_opportunity_id,
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
        'ticket_id', v_quotation.ticket_id,
        'ticket_status', COALESCE(v_ticket.status::TEXT, v_old_ticket_status::TEXT),
        'pipeline_updated', v_pipeline_updated,
        'stage_history_inserted', v_stage_history_inserted,
        'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted,
        'quotation_sequence', v_quotation_sequence,
        'sequence_label', v_sequence_label,
        'previous_rejected_count', v_previous_rejected_count,
        'correlation_id', v_correlation_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', 'INTERNAL_ERROR',
            'correlation_id', v_correlation_id
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_rejected IS
'Atomically marks quotation as rejected with updated stage transition logic.

MIGRATION 112 CHANGES:
- First rejection (from Quote Sent) → Negotiation
- Subsequent rejections → Stay in Negotiation
- Activity messages now show "(Negotiation in progress)" for subsequent rejections
- Tracks total rejection count in activity description';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- Migration 112: Updated quotation stage transition logic
--
-- NEW BEHAVIOR:
-- 1. First quotation sent: Prospecting/Discovery → Quote Sent
-- 2. First quotation rejected: Quote Sent → Negotiation
-- 3. Subsequent quotations sent: Stay in Negotiation (part of negotiation process)
-- 4. Subsequent quotations rejected: Stay in Negotiation
-- 5. Quotation accepted: → Closed Won
--
-- This reflects that sending revised quotations is part of the negotiation process,
-- not a new quote stage.
