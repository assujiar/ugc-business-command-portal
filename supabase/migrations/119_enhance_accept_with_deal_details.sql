-- =====================================================
-- Migration 119: Enhance accept RPC with deal details
-- =====================================================
-- Issue: Accept RPC doesn't update latest_quotation_id, quotation_count,
--        and notes don't include cost/margin information
--
-- Changes:
-- 1. Update latest_quotation_id to the accepted quotation
-- 2. Update quotation_count
-- 3. Include cost, margin in pipeline_updates and activities notes
-- 4. Return comprehensive deal data including cost/margin
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
    -- FIX: opportunity_id is TEXT, not UUID
    v_derived_opportunity_id TEXT := NULL;
    v_effective_opportunity_id TEXT := NULL;
    v_stage_changed BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    -- Deal details for notes
    v_deal_notes TEXT;
    v_quotation_count INTEGER := 0;
    v_margin_actual DECIMAL(15,2) := NULL;
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

    -- Calculate actual margin if we have cost and selling rate
    IF v_quotation.total_cost IS NOT NULL AND v_quotation.total_cost > 0 AND v_quotation.total_selling_rate IS NOT NULL THEN
        v_margin_actual := ROUND(((v_quotation.total_selling_rate - v_quotation.total_cost) / v_quotation.total_cost) * 100, 2);
    END IF;

    -- Build deal notes with cost and margin info
    v_deal_notes := 'Deal Value: ' || COALESCE(v_quotation.total_selling_rate::TEXT, 'N/A') || ' ' || COALESCE(v_quotation.currency, 'IDR');
    IF v_quotation.total_cost IS NOT NULL THEN
        v_deal_notes := v_deal_notes || ' | Cost: ' || v_quotation.total_cost::TEXT || ' ' || COALESCE(v_quotation.currency, 'IDR');
    END IF;
    IF v_margin_actual IS NOT NULL THEN
        v_deal_notes := v_deal_notes || ' | Margin: ' || v_margin_actual::TEXT || '%';
    ELSIF v_quotation.target_margin_percent IS NOT NULL THEN
        v_deal_notes := v_deal_notes || ' | Target Margin: ' || v_quotation.target_margin_percent::TEXT || '%';
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
        opportunity_id = COALESCE(v_effective_opportunity_id, opportunity_id),
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. UPDATE OPPORTUNITY STAGE -> Closed Won
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- Count total quotations for this opportunity
            SELECT COUNT(*) INTO v_quotation_count
            FROM public.customer_quotations
            WHERE opportunity_id = v_effective_opportunity_id;

            -- Only close if not already closed
            IF v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost') THEN
                -- Update opportunity with deal value, quotation info, and close it
                UPDATE public.opportunities
                SET
                    stage = 'Closed Won'::opportunity_stage,
                    quotation_status = 'accepted',
                    deal_value = v_quotation.total_selling_rate,
                    latest_quotation_id = p_quotation_id,
                    quotation_count = v_quotation_count,
                    closed_at = COALESCE(closed_at, NOW()),
                    updated_at = NOW()
                WHERE opportunity_id = v_effective_opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Closed Won'::opportunity_stage;
                v_stage_changed := TRUE;

                -- Insert stage history with deal details
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.new_stage = 'Closed Won'::opportunity_stage
                    AND osh.from_stage = v_old_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (
                        opportunity_id,
                        from_stage,
                        to_stage,
                        changed_by,
                        reason,
                        notes,
                        old_stage,
                        new_stage
                    ) VALUES (
                        v_effective_opportunity_id,
                        v_old_opp_stage,
                        'Closed Won'::opportunity_stage,
                        v_actor_id,
                        'quotation_accepted',
                        '[' || v_correlation_id || '] Deal Won! Quotation ' || v_quotation.quotation_number || ' accepted. ' || v_deal_notes,
                        v_old_opp_stage,
                        'Closed Won'::opportunity_stage
                    );
                    v_stage_history_inserted := TRUE;
                END IF;

                -- Insert pipeline_updates with comprehensive deal info
                IF NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates pu
                    WHERE pu.opportunity_id = v_effective_opportunity_id
                    AND pu.new_stage = 'Closed Won'::opportunity_stage
                    AND pu.old_stage = v_old_opp_stage
                    AND pu.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.pipeline_updates (
                        opportunity_id,
                        notes,
                        approach_method,
                        old_stage,
                        new_stage,
                        updated_by,
                        updated_at
                    ) VALUES (
                        v_effective_opportunity_id,
                        '[' || v_correlation_id || '] 🎉 DEAL WON! Quotation ' || v_quotation.quotation_number || ' accepted by customer. ' || v_deal_notes ||
                        CASE WHEN v_quotation.ticket_id IS NOT NULL THEN ' | Related Ticket: ' || v_quotation.ticket_id::TEXT ELSE '' END,
                        'Email'::approach_method,
                        v_old_opp_stage,
                        'Closed Won'::opportunity_stage,
                        v_actor_id,
                        NOW()
                    );
                    v_pipeline_updates_inserted := TRUE;
                END IF;

                -- Insert activities with full deal details
                IF NOT EXISTS (
                    SELECT 1 FROM public.activities act
                    WHERE act.related_opportunity_id = v_effective_opportunity_id
                    AND act.subject LIKE '%' || v_quotation.quotation_number || '%'
                    AND act.subject LIKE '%Accepted%'
                    AND act.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.activities (
                        activity_type,
                        subject,
                        description,
                        status,
                        due_date,
                        completed_at,
                        related_opportunity_id,
                        related_lead_id,
                        owner_user_id,
                        created_by
                    ) VALUES (
                        'Note'::activity_type_v2,
                        '🎉 Deal Won - Quotation ' || v_quotation.quotation_number || ' Accepted',
                        '[' || v_correlation_id || '] Customer accepted quotation ' || v_quotation.quotation_number || '. ' || v_deal_notes ||
                        CASE WHEN v_quotation.ticket_id IS NOT NULL THEN E'\nRelated Ticket ID: ' || v_quotation.ticket_id::TEXT ELSE '' END ||
                        CASE WHEN v_quotation.customer_company IS NOT NULL THEN E'\nCustomer: ' || v_quotation.customer_company ELSE '' END,
                        'Completed'::activity_status,
                        CURRENT_DATE,
                        NOW(),
                        v_effective_opportunity_id,
                        v_quotation.lead_id,
                        v_actor_id,
                        v_actor_id
                    );
                    v_activities_inserted := TRUE;
                END IF;
            ELSE
                -- Already closed, just update quotation tracking info
                UPDATE public.opportunities
                SET
                    quotation_status = 'accepted',
                    latest_quotation_id = p_quotation_id,
                    quotation_count = v_quotation_count,
                    updated_at = NOW()
                WHERE opportunity_id = v_effective_opportunity_id;

                v_new_opp_stage := v_opportunity.stage;
            END IF;
        END IF;
    END IF;

    -- 3. UPDATE TICKET STATUS (if linked)
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT status INTO v_old_ticket_status
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        FOR UPDATE;

        UPDATE public.tickets
        SET
            status = 'closed'::ticket_status,
            close_outcome = 'won'::ticket_close_outcome,
            close_reason = 'Customer accepted quotation ' || v_quotation.quotation_number || '. ' || v_deal_notes,
            closed_at = COALESCE(closed_at, NOW()),
            resolved_at = COALESCE(resolved_at, NOW()),
            updated_at = NOW()
        WHERE id = v_quotation.ticket_id
        AND status NOT IN ('closed', 'resolved')
        RETURNING * INTO v_ticket;
    END IF;

    -- Return success with comprehensive deal data
    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'opportunity_id', v_effective_opportunity_id,
        'opportunity_stage', COALESCE(v_new_opp_stage::TEXT, v_old_opp_stage::TEXT),
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
        'ticket_id', v_quotation.ticket_id,
        'ticket_status', COALESCE(v_ticket.status::TEXT, v_old_ticket_status::TEXT),
        'stage_changed', v_stage_changed,
        'stage_history_inserted', v_stage_history_inserted,
        'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted,
        -- Deal details
        'deal_value', v_quotation.total_selling_rate,
        'total_cost', v_quotation.total_cost,
        'target_margin_percent', v_quotation.target_margin_percent,
        'actual_margin_percent', v_margin_actual,
        'currency', v_quotation.currency,
        'quotation_count', v_quotation_count,
        'correlation_id', v_correlation_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'detail', SQLSTATE,
            'error_code', 'INTERNAL_ERROR',
            'correlation_id', v_correlation_id
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted TO service_role;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_accepted IS
'Atomically marks quotation as accepted and closes the deal with full tracking.

MIGRATION 119 ENHANCEMENTS:
1. Updates latest_quotation_id to the accepted quotation
2. Updates quotation_count on the opportunity
3. Includes cost, margin, and related ticket info in notes
4. Returns comprehensive deal data (deal_value, total_cost, margin, etc.)

Actions:
1. Updates quotation status to accepted
2. Updates opportunity: stage → Closed Won, deal_value, quotation tracking
3. Creates pipeline_updates with deal value, cost, margin info
4. Creates activities with full deal details
5. Closes linked ticket with won outcome and deal notes';
