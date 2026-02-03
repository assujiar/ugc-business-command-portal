-- ============================================
-- Migration: 131_fix_multi_shipment_cost_sync.sql
--
-- PURPOSE: Fix multi-shipment operational cost sync on quotation send/reject/accept
--
-- ISSUE:
-- When a quotation is sent/rejected/accepted, only the single operational_cost_id
-- is updated, but the operational_cost_ids array (for multi-shipment quotations)
-- is NOT updated. This leaves multi-shipment costs in an inconsistent state.
--
-- SOLUTION:
-- Update all three RPC functions to also update ALL costs in operational_cost_ids array:
-- 1. rpc_customer_quotation_mark_sent -> update all costs to 'sent_to_customer'
-- 2. rpc_customer_quotation_mark_rejected -> update all costs to 'revise_requested'
-- 3. rpc_customer_quotation_mark_accepted -> update all costs to 'accepted'
--
-- The fix uses UNNEST to iterate over the array and update each cost.
-- ============================================

-- ============================================
-- 1. FIX: rpc_customer_quotation_mark_sent
-- Add logic to update all costs in operational_cost_ids array
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
    -- Quotation sequence tracking
    v_quotation_sequence INTEGER := 1;
    v_sequence_label TEXT := '';
    v_previous_rejected_count INTEGER := 0;
    -- Multi-shipment cost tracking
    v_multi_cost_count INTEGER := 0;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

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

    -- AUTHORIZATION: Check if actor can send this quotation
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, p_actor_user_id, 'send');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- IDEMPOTENCY: If already sent, this is a resend - don't duplicate events/history
    IF v_quotation.status = 'sent' THEN
        v_is_resend := TRUE;
    END IF;

    -- STATE MACHINE: Validate transition using centralized rules
    IF NOT v_is_resend THEN
        v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'sent');
        IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', v_transition_check->>'error',
                'error_code', v_transition_check->>'error_code',
                'correlation_id', v_correlation_id
            );
        END IF;
    END IF;

    -- 1. UPDATE QUOTATION STATUS (always update sent_via/sent_to for resends)
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
        -- Use the helper function to resolve/create opportunity
        -- Pass p_allow_autocreate to control whether new opportunities can be created
        SELECT resolved.* INTO v_resolved_opp
        FROM public.fn_resolve_or_create_opportunity(p_quotation_id, p_actor_user_id, p_allow_autocreate) resolved;

        -- Check if there was an error (e.g., orphan opportunity, autocreate not allowed)
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

            -- Update quotation with resolved opportunity_id if not already set
            IF v_quotation.opportunity_id IS NULL THEN
                UPDATE public.customer_quotations
                SET opportunity_id = v_effective_opportunity_id
                WHERE id = p_quotation_id;
            END IF;
        END IF;
    ELSE
        -- For resends, use existing opportunity_id
        v_effective_opportunity_id := v_quotation.opportunity_id;
    END IF;

    -- Calculate quotation sequence (how many quotations before this one)
    SELECT COUNT(*) INTO v_quotation_sequence
    FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id
    AND cq2.id != p_quotation_id
    AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;

    -- Count previous rejected quotations
    SELECT COUNT(*) INTO v_previous_rejected_count
    FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id
    AND cq2.id != p_quotation_id
    AND cq2.status = 'rejected';

    -- Build sequence label
    v_sequence_label := CASE v_quotation_sequence
        WHEN 1 THEN '1st'
        WHEN 2 THEN '2nd'
        WHEN 3 THEN '3rd'
        ELSE v_quotation_sequence::TEXT || 'th'
    END;

    -- 3. UPDATE OPPORTUNITY (if linked)
    IF v_effective_opportunity_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- Only move to Quote Sent if currently in New Lead or Qualified
            -- Stay in Negotiation if already there (after rejection)
            IF v_opportunity.stage IN ('New Lead', 'Qualified') THEN
                v_new_opp_stage := 'Quote Sent'::opportunity_stage;

                UPDATE public.opportunities opp_upd
                SET
                    stage = v_new_opp_stage,
                    expected_value = COALESCE(v_quotation.total_selling_rate, opp_upd.expected_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

                v_pipeline_updated := TRUE;
            ELSIF v_opportunity.stage = 'Negotiation' THEN
                -- Stay in Negotiation - this is a revised quotation
                v_new_opp_stage := 'Negotiation'::opportunity_stage;
            ELSE
                v_new_opp_stage := v_opportunity.stage;
            END IF;

            -- Insert stage history if stage changed
            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.old_stage = v_old_opp_stage
                    AND osh.new_stage = v_new_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (
                        opportunity_id, old_stage, new_stage, changed_by, notes, changed_at
                    ) VALUES (
                        v_effective_opportunity_id,
                        v_old_opp_stage,
                        v_new_opp_stage,
                        p_actor_user_id,
                        '[' || v_correlation_id || '] Stage changed due to quotation sent',
                        NOW()
                    );
                    v_stage_history_inserted := TRUE;
                END IF;
            END IF;

            -- Insert pipeline update
            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.update_type = 'stage_change'
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (
                    opportunity_id, update_type, old_value, new_value, updated_by, notes, created_at
                ) VALUES (
                    v_effective_opportunity_id,
                    'stage_change',
                    v_old_opp_stage::TEXT,
                    COALESCE(v_new_opp_stage::TEXT, v_old_opp_stage::TEXT),
                    p_actor_user_id,
                    '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer',
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;
            END IF;

            -- Build activity description with sequence info
            v_activity_subject := 'Quotation Sent: ' || v_quotation.quotation_number;
            IF v_previous_rejected_count > 0 THEN
                v_activity_description := v_sequence_label || ' quotation sent (revised after ' || v_previous_rejected_count || ' rejection' || CASE WHEN v_previous_rejected_count > 1 THEN 's' ELSE '' END || '). ';
            ELSE
                v_activity_description := v_sequence_label || ' quotation sent. ';
            END IF;
            v_activity_description := v_activity_description || 'Amount: ' || COALESCE(v_quotation.currency, 'IDR') || ' ' || COALESCE(v_quotation.total_selling_rate::TEXT, '0');

            -- Insert activity
            IF NOT EXISTS (
                SELECT 1 FROM public.activities act
                WHERE act.opportunity_id = v_effective_opportunity_id
                AND act.activity_type = 'quotation_sent'
                AND act.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.activities (
                    opportunity_id, activity_type, subject, description, performed_by, performed_at, created_at
                ) VALUES (
                    v_effective_opportunity_id,
                    'quotation_sent',
                    v_activity_subject,
                    v_activity_description,
                    p_actor_user_id,
                    NOW(),
                    NOW()
                );
                v_activities_inserted := TRUE;
            END IF;
        END IF;
    END IF;

    -- 3b. UPDATE TICKET (if linked)
    IF v_quotation.ticket_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT t.* INTO v_ticket
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        FOR UPDATE;

        IF v_ticket IS NOT NULL THEN
            v_old_ticket_status := v_ticket.status;

            -- Move to waiting_customer
            UPDATE public.tickets t_upd
            SET
                status = 'waiting_customer'::ticket_status,
                pending_response_from = 'customer',
                updated_at = NOW()
            WHERE t_upd.id = v_quotation.ticket_id
            RETURNING * INTO v_ticket;

            -- Create ticket event
            INSERT INTO public.ticket_events (
                ticket_id,
                event_type,
                actor_user_id,
                old_value,
                new_value,
                notes,
                created_at
            ) VALUES (
                v_quotation.ticket_id,
                'status_changed'::ticket_event_type,
                p_actor_user_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object(
                    'status', 'waiting_customer',
                    'sent_via', p_sent_via,
                    'sent_to', p_sent_to,
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system'),
                NOW()
            );
        END IF;
    END IF;

    -- 4. UPDATE LEAD (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        IF v_is_resend THEN
            UPDATE public.leads ld
            SET
                quotation_status = 'sent',
                latest_quotation_id = v_quotation.id,
                updated_at = NOW()
            WHERE ld.lead_id = v_quotation.lead_id;
        ELSE
            UPDATE public.leads ld
            SET
                quotation_status = 'sent',
                latest_quotation_id = v_quotation.id,
                quotation_count = COALESCE(ld.quotation_count, 0) + 1,
                updated_at = NOW()
            WHERE ld.lead_id = v_quotation.lead_id;
        END IF;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (if linked) - SINGLE COST (backward compatible)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'sent_to_customer'::quote_status,
            updated_at = NOW()
        WHERE trq.id = v_quotation.operational_cost_id;
    END IF;

    -- 5b. UPDATE ALL OPERATIONAL COSTS in operational_cost_ids array (MULTI-SHIPMENT FIX)
    -- This updates all costs that were linked when the quotation was created
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'sent_to_customer'::quote_status,
            updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids)
        AND trq.status = 'submitted';  -- Only update costs that are in 'submitted' status

        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'opportunity_id', COALESCE(v_effective_opportunity_id, v_quotation.opportunity_id),
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
        'multi_shipment_costs_updated', v_multi_cost_count,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS
'Atomically marks quotation as sent and syncs to opportunity (Quote Sent), ticket (waiting_customer), lead, and operational cost.

FIX in migration 131:
- Added multi-shipment cost sync: Updates ALL costs in operational_cost_ids array to sent_to_customer
- Previously only updated single operational_cost_id, leaving multi-shipment costs in inconsistent state
- Returns multi_shipment_costs_updated count in response';

-- ============================================
-- 2. FIX: rpc_customer_quotation_mark_rejected
-- Add logic to update all costs in operational_cost_ids array
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
    -- Quotation sequence tracking
    v_quotation_sequence INTEGER := 1;
    v_sequence_label TEXT := '';
    v_previous_rejected_count INTEGER := 0;
    -- Multi-shipment cost tracking
    v_multi_cost_count INTEGER := 0;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    -- Get actor user id
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

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

    -- AUTHORIZATION: Check if actor can reject this quotation
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'reject');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- IDEMPOTENCY: If already rejected, return success without duplicating
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

    -- STATE MACHINE: Validate transition using centralized rules
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'rejected');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- ============================================
    -- Enhanced opportunity_id derivation
    -- Chain: quotation.opportunity_id -> lead.opportunity_id -> ticket.opportunity_id
    -- ============================================

    -- Start with quotation's direct opportunity_id
    v_effective_opportunity_id := v_quotation.opportunity_id;

    -- Try to derive from lead if quotation has lead_id
    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT ld.opportunity_id INTO v_derived_opportunity_id
        FROM public.leads ld
        WHERE ld.lead_id = v_quotation.lead_id
        AND ld.opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
        END IF;
    END IF;

    -- Try to derive from ticket if quotation has ticket_id
    IF v_effective_opportunity_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.opportunity_id INTO v_derived_opportunity_id
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        AND t.opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
        END IF;
    END IF;

    -- 1. UPDATE QUOTATION STATUS
    UPDATE public.customer_quotations cq_upd
    SET
        status = 'rejected'::customer_quotation_status,
        rejected_at = NOW(),
        rejection_reason = p_reason_type::TEXT,
        updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- Insert rejection reason details
    INSERT INTO public.customer_quotation_rejection_reasons (
        quotation_id,
        reason_type,
        competitor_name,
        competitor_amount,
        customer_budget,
        currency,
        notes,
        created_by
    ) VALUES (
        p_quotation_id,
        p_reason_type,
        p_competitor_name,
        p_competitor_amount,
        p_customer_budget,
        p_currency,
        p_notes,
        v_actor_id
    );

    -- Calculate quotation sequence (how many quotations before this one)
    SELECT COUNT(*) INTO v_quotation_sequence
    FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id
    AND cq2.id != p_quotation_id
    AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;

    -- Count previous rejected quotations (excluding this one)
    SELECT COUNT(*) INTO v_previous_rejected_count
    FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id
    AND cq2.id != p_quotation_id
    AND cq2.status = 'rejected';

    -- Build sequence label
    v_sequence_label := CASE v_quotation_sequence
        WHEN 1 THEN '1st'
        WHEN 2 THEN '2nd'
        WHEN 3 THEN '3rd'
        ELSE v_quotation_sequence::TEXT || 'th'
    END;

    -- 2. UPDATE OPPORTUNITY (if linked) -> Negotiation
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            v_new_opp_stage := 'Negotiation'::opportunity_stage;

            -- Only update if not already in Negotiation or later stages
            IF v_opportunity.stage NOT IN ('Negotiation', 'Closed Won', 'Closed Lost') THEN
                UPDATE public.opportunities opp_upd
                SET
                    stage = v_new_opp_stage,
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

                v_pipeline_updated := TRUE;
            ELSE
                v_new_opp_stage := v_opportunity.stage;
            END IF;

            -- Insert stage history if stage changed
            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.old_stage = v_old_opp_stage
                    AND osh.new_stage = v_new_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (
                        opportunity_id, old_stage, new_stage, changed_by, notes, changed_at
                    ) VALUES (
                        v_effective_opportunity_id,
                        v_old_opp_stage,
                        v_new_opp_stage,
                        v_actor_id,
                        '[' || v_correlation_id || '] Stage changed due to quotation rejection',
                        NOW()
                    );
                    v_stage_history_inserted := TRUE;
                END IF;
            END IF;

            -- Insert pipeline update
            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.update_type = 'stage_change'
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (
                    opportunity_id, update_type, old_value, new_value, updated_by, notes, created_at
                ) VALUES (
                    v_effective_opportunity_id,
                    'stage_change',
                    v_old_opp_stage::TEXT,
                    COALESCE(v_new_opp_stage::TEXT, v_old_opp_stage::TEXT),
                    v_actor_id,
                    '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected by customer',
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;
            END IF;

            -- Build activity description with sequence info
            v_activity_subject := 'Quotation Rejected: ' || v_quotation.quotation_number;
            v_activity_description := v_sequence_label || ' quotation rejected. Reason: ' || p_reason_type::TEXT;
            IF p_competitor_name IS NOT NULL THEN
                v_activity_description := v_activity_description || '. Competitor: ' || p_competitor_name;
            END IF;
            IF p_competitor_amount IS NOT NULL THEN
                v_activity_description := v_activity_description || '. Competitor price: ' || p_currency || ' ' || p_competitor_amount::TEXT;
            END IF;
            IF p_customer_budget IS NOT NULL THEN
                v_activity_description := v_activity_description || '. Customer budget: ' || p_currency || ' ' || p_customer_budget::TEXT;
            END IF;

            -- Insert activity
            IF NOT EXISTS (
                SELECT 1 FROM public.activities act
                WHERE act.opportunity_id = v_effective_opportunity_id
                AND act.activity_type = 'quotation_rejected'
                AND act.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.activities (
                    opportunity_id, activity_type, subject, description, performed_by, performed_at, created_at
                ) VALUES (
                    v_effective_opportunity_id,
                    'quotation_rejected',
                    v_activity_subject,
                    v_activity_description,
                    v_actor_id,
                    NOW(),
                    NOW()
                );
                v_activities_inserted := TRUE;
            END IF;
        END IF;
    END IF;

    -- 3. UPDATE TICKET (if linked) -> need_adjustment
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.* INTO v_ticket
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        FOR UPDATE;

        IF v_ticket IS NOT NULL THEN
            v_old_ticket_status := v_ticket.status;

            UPDATE public.tickets t_upd
            SET
                status = 'need_adjustment'::ticket_status,
                pending_response_from = 'ops',
                updated_at = NOW()
            WHERE t_upd.id = v_quotation.ticket_id
            RETURNING * INTO v_ticket;

            -- Create ticket event for status change
            INSERT INTO public.ticket_events (
                ticket_id,
                event_type,
                actor_user_id,
                old_value,
                new_value,
                notes,
                created_at
            ) VALUES (
                v_quotation.ticket_id,
                'status_changed'::ticket_event_type,
                v_actor_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object(
                    'status', 'need_adjustment',
                    'rejection_reason', p_reason_type::TEXT,
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Quotation rejected: ' || p_reason_type::TEXT,
                NOW()
            );

            -- Create request_adjustment event
            INSERT INTO public.ticket_events (
                ticket_id,
                event_type,
                actor_user_id,
                new_value,
                notes,
                created_at
            ) VALUES (
                v_quotation.ticket_id,
                'request_adjustment'::ticket_event_type,
                v_actor_id,
                jsonb_build_object(
                    'reason', p_reason_type::TEXT,
                    'triggered_by', 'quotation_rejection',
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Rate adjustment requested due to quotation rejection',
                NOW()
            );
        END IF;
    END IF;

    -- 4. UPDATE LEAD (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads ld
        SET
            quotation_status = 'rejected',
            updated_at = NOW()
        WHERE ld.lead_id = v_quotation.lead_id;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (if linked) -> revise_requested (SINGLE COST - backward compatible)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'revise_requested'::quote_status,
            updated_at = NOW()
        WHERE trq.id = v_quotation.operational_cost_id;
    END IF;

    -- 5b. UPDATE ALL OPERATIONAL COSTS in operational_cost_ids array (MULTI-SHIPMENT FIX)
    -- This updates all costs that were linked when the quotation was created
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'revise_requested'::quote_status,
            updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids)
        AND trq.status IN ('submitted', 'sent_to_customer');  -- Only update costs in valid prior states

        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'rejection_reason', p_reason_type::TEXT,
        'opportunity_id', COALESCE(v_effective_opportunity_id, v_quotation.opportunity_id),
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
        'multi_shipment_costs_updated', v_multi_cost_count,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_rejected IS
'Atomically marks quotation as rejected with state machine validation and syncs to opportunity (Negotiation), ticket (need_adjustment), lead, and operational cost.

FIX in migration 131:
- Added multi-shipment cost sync: Updates ALL costs in operational_cost_ids array to revise_requested
- Previously only updated single operational_cost_id, leaving multi-shipment costs in inconsistent state
- Returns multi_shipment_costs_updated count in response';

-- ============================================
-- 3. FIX: rpc_customer_quotation_mark_accepted
-- Add logic to update all costs in operational_cost_ids array
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
    -- Multi-shipment cost tracking
    v_multi_cost_count INTEGER := 0;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    -- Get actor user id
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

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

    -- AUTHORIZATION: Check if actor can accept this quotation
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'accept');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- IDEMPOTENCY: If already accepted, return success without duplicating events
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

    -- STATE MACHINE: Validate transition using centralized rules
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'accepted');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- ============================================
    -- Enhanced opportunity_id derivation
    -- Chain: quotation.opportunity_id -> lead.opportunity_id -> ticket.opportunity_id
    -- ============================================

    -- Start with quotation's direct opportunity_id
    v_effective_opportunity_id := v_quotation.opportunity_id;

    -- Try to derive from lead if quotation has lead_id
    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id
        FROM public.leads
        WHERE lead_id = v_quotation.lead_id
        AND opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
        END IF;
    END IF;

    -- Try to derive from ticket if quotation has ticket_id
    IF v_effective_opportunity_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        AND opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
        END IF;
    END IF;

    -- 1. UPDATE QUOTATION STATUS
    UPDATE public.customer_quotations
    SET
        status = 'accepted'::customer_quotation_status,
        accepted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. UPDATE OPPORTUNITY (if linked) -> Closed Won
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;
            v_new_opp_stage := 'Closed Won'::opportunity_stage;

            -- Update opportunity to Closed Won
            UPDATE public.opportunities
            SET
                stage = v_new_opp_stage,
                expected_value = COALESCE(v_quotation.total_selling_rate, expected_value),
                close_date = CURRENT_DATE,
                updated_at = NOW()
            WHERE opportunity_id = v_effective_opportunity_id;

            v_stage_changed := v_old_opp_stage IS DISTINCT FROM v_new_opp_stage;

            -- Insert stage history
            IF v_stage_changed THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.old_stage = v_old_opp_stage
                    AND osh.new_stage = v_new_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (
                        opportunity_id, old_stage, new_stage, changed_by, notes, changed_at
                    ) VALUES (
                        v_effective_opportunity_id,
                        v_old_opp_stage,
                        v_new_opp_stage,
                        v_actor_id,
                        '[' || v_correlation_id || '] Deal won - quotation accepted',
                        NOW()
                    );
                    v_stage_history_inserted := TRUE;
                END IF;
            END IF;

            -- Insert pipeline update
            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.update_type = 'stage_change'
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (
                    opportunity_id, update_type, old_value, new_value, updated_by, notes, created_at
                ) VALUES (
                    v_effective_opportunity_id,
                    'stage_change',
                    v_old_opp_stage::TEXT,
                    v_new_opp_stage::TEXT,
                    v_actor_id,
                    '[' || v_correlation_id || '] Deal closed won - quotation ' || v_quotation.quotation_number || ' accepted',
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;
            END IF;

            -- Insert activity
            IF NOT EXISTS (
                SELECT 1 FROM public.activities act
                WHERE act.opportunity_id = v_effective_opportunity_id
                AND act.activity_type = 'deal_won'
                AND act.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.activities (
                    opportunity_id, activity_type, subject, description, performed_by, performed_at, created_at
                ) VALUES (
                    v_effective_opportunity_id,
                    'deal_won',
                    'Deal Won: ' || v_quotation.quotation_number,
                    'Quotation accepted. Deal value: ' || COALESCE(v_quotation.currency, 'IDR') || ' ' || COALESCE(v_quotation.total_selling_rate::TEXT, '0'),
                    v_actor_id,
                    NOW(),
                    NOW()
                );
                v_activities_inserted := TRUE;
            END IF;

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
    END IF;

    -- 3. UPDATE TICKET (if linked) -> closed
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
                closed_by = v_actor_id,
                updated_at = NOW()
            WHERE id = v_quotation.ticket_id
            RETURNING * INTO v_ticket;

            -- Create status change event
            INSERT INTO public.ticket_events (
                ticket_id,
                event_type,
                actor_user_id,
                old_value,
                new_value,
                notes,
                created_at
            ) VALUES (
                v_quotation.ticket_id,
                'status_changed'::ticket_event_type,
                v_actor_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object(
                    'status', 'closed',
                    'close_outcome', 'won',
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Ticket closed - quotation accepted',
                NOW()
            );

            -- Create closed event
            INSERT INTO public.ticket_events (
                ticket_id,
                event_type,
                actor_user_id,
                new_value,
                notes,
                created_at
            ) VALUES (
                v_quotation.ticket_id,
                'closed'::ticket_event_type,
                v_actor_id,
                jsonb_build_object(
                    'close_outcome', 'won',
                    'triggered_by', 'quotation_accepted',
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Ticket auto-closed due to quotation acceptance',
                NOW()
            );

            -- Update SLA resolution tracking
            UPDATE public.ticket_sla_tracking
            SET
                resolution_at = COALESCE(resolution_at, NOW()),
                updated_at = NOW()
            WHERE ticket_id = v_quotation.ticket_id
            AND resolution_at IS NULL;

            -- Record response exchange for SLA tracking
            BEGIN
                PERFORM public.record_response_exchange(
                    v_quotation.ticket_id,
                    v_actor_id,
                    NULL  -- No comment_id for this action
                );
            EXCEPTION
                WHEN OTHERS THEN
                    -- Log but don't fail the main transaction
                    RAISE WARNING 'Failed to record response exchange: %', SQLERRM;
            END;
        END IF;
    END IF;

    -- 4. UPDATE LEAD (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET
            quotation_status = 'accepted',
            updated_at = NOW()
        WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (if linked) -> accepted (SINGLE COST - backward compatible)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = 'accepted'::quote_status,
            updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
    END IF;

    -- 5b. UPDATE ALL OPERATIONAL COSTS in operational_cost_ids array (MULTI-SHIPMENT FIX)
    -- This updates all costs that were linked when the quotation was created
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'accepted'::quote_status,
            updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids)
        AND trq.status IN ('submitted', 'sent_to_customer');  -- Only update costs in valid prior states

        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

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
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', 'INTERNAL_ERROR',
            'detail', SQLSTATE,
            'correlation_id', v_correlation_id
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_accepted IS
'Atomically marks quotation as accepted and closes the deal.

FIX in migration 131:
- Added multi-shipment cost sync: Updates ALL costs in operational_cost_ids array to accepted
- Previously only updated single operational_cost_id, leaving multi-shipment costs in inconsistent state
- Returns multi_shipment_costs_updated count in response

Syncs to opportunity (Closed Won), ticket (closed/won), account (active_account),
lead, and operational cost (accepted).
Includes state machine validation and correlation_id for observability.';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- Multi-Shipment Cost Sync Fix:
--
-- ISSUE:
-- When quotation is sent/rejected/accepted, only operational_cost_id (singular)
-- was updated. For multi-shipment quotations with operational_cost_ids (array),
-- the other costs were NOT updated, leaving them in inconsistent state.
--
-- SOLUTION:
-- Added section 5b in all three RPC functions that updates ALL costs in the
-- operational_cost_ids array:
--
-- 1. rpc_customer_quotation_mark_sent:
--    - Updates all costs in operational_cost_ids to 'sent_to_customer'
--    - Only affects costs that are in 'submitted' status
--
-- 2. rpc_customer_quotation_mark_rejected:
--    - Updates all costs in operational_cost_ids to 'revise_requested'
--    - Only affects costs in 'submitted' or 'sent_to_customer' status
--
-- 3. rpc_customer_quotation_mark_accepted:
--    - Updates all costs in operational_cost_ids to 'accepted'
--    - Only affects costs in 'submitted' or 'sent_to_customer' status
--
-- The fix is backward compatible:
-- - Still updates single operational_cost_id (section 5)
-- - Additionally updates array operational_cost_ids (section 5b)
-- - Returns multi_shipment_costs_updated count in response
--
-- FLOW EXAMPLE (2-shipment quotation):
--   1. User creates quotation with operational_cost_ids = [cost_A, cost_B]
--   2. User sends quotation -> BOTH cost_A AND cost_B become 'sent_to_customer'
--   3. Customer rejects -> BOTH cost_A AND cost_B become 'revise_requested'
--   4. Ops revises both costs -> cost_A2, cost_B2 created as 'submitted'
--   5. User creates new quotation with [cost_A2, cost_B2]
--   6. Customer accepts -> BOTH cost_A2 AND cost_B2 become 'accepted'
-- ============================================
