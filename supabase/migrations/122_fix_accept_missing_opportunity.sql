-- =====================================================
-- Migration 122: Fix accept RPC - handle missing opportunity
-- =====================================================
-- ISSUE: When quotation has opportunity_id but the opportunity record
--        doesn't exist (orphan reference), the accept flow silently fails
--        to update the pipeline.
--
-- FIX: Check if opportunity exists and handle both cases properly
-- =====================================================

DROP FUNCTION IF EXISTS public.rpc_customer_quotation_mark_accepted(UUID, UUID, TEXT);

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
    v_lead RECORD;
    v_old_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_new_opp_stage opportunity_stage := NULL;
    v_actor_id UUID;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_derived_opportunity_id TEXT := NULL;
    v_effective_opportunity_id TEXT := NULL;
    v_stage_changed BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    v_ticket_closed BOOLEAN := FALSE;
    v_opportunity_exists BOOLEAN := FALSE;
    v_deal_notes TEXT;
    v_quotation_count INTEGER := 0;
    v_margin_actual DECIMAL(15,2) := NULL;
    v_debug_info TEXT := '';
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Lock and get quotation
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

    v_debug_info := 'quotation_found;';

    -- Authorization check
    v_auth_check := public.fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'accept');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    v_debug_info := v_debug_info || 'authorized;';

    -- Idempotency check
    IF v_quotation.status = 'accepted' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'quotation_id', v_quotation.id,
            'quotation_number', v_quotation.quotation_number,
            'quotation_status', v_quotation.status,
            'is_idempotent', TRUE,
            'message', 'Quotation was already accepted.',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- State machine validation
    v_transition_check := public.fn_validate_quotation_transition(v_quotation.status::TEXT, 'accepted');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    v_debug_info := v_debug_info || 'transition_valid;';

    -- Calculate margin
    IF v_quotation.total_cost IS NOT NULL AND v_quotation.total_cost > 0 AND v_quotation.total_selling_rate IS NOT NULL THEN
        v_margin_actual := ROUND(((v_quotation.total_selling_rate - v_quotation.total_cost) / v_quotation.total_cost) * 100, 2);
    END IF;

    -- Build deal notes
    v_deal_notes := 'Deal Value: ' || COALESCE(v_quotation.total_selling_rate::TEXT, 'N/A') || ' ' || COALESCE(v_quotation.currency, 'IDR');
    IF v_quotation.total_cost IS NOT NULL THEN
        v_deal_notes := v_deal_notes || ' | Cost: ' || v_quotation.total_cost::TEXT;
    END IF;
    IF v_margin_actual IS NOT NULL THEN
        v_deal_notes := v_deal_notes || ' | Margin: ' || v_margin_actual::TEXT || '%';
    END IF;

    -- ============================================
    -- DERIVE OPPORTUNITY_ID with validation
    -- ============================================
    v_effective_opportunity_id := v_quotation.opportunity_id;
    v_debug_info := v_debug_info || 'opp_from_quotation:' || COALESCE(v_effective_opportunity_id, 'NULL') || ';';

    -- Try from lead
    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id
        FROM public.leads
        WHERE lead_id = v_quotation.lead_id
        AND opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
            v_debug_info := v_debug_info || 'opp_from_lead:' || v_effective_opportunity_id || ';';
        END IF;
    END IF;

    -- Try from ticket
    IF v_effective_opportunity_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        AND opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_derived_opportunity_id;
            v_debug_info := v_debug_info || 'opp_from_ticket:' || v_effective_opportunity_id || ';';
        END IF;
    END IF;

    -- ============================================
    -- 1. UPDATE QUOTATION STATUS
    -- ============================================
    UPDATE public.customer_quotations
    SET
        status = 'accepted'::customer_quotation_status,
        opportunity_id = COALESCE(v_effective_opportunity_id, opportunity_id),
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    v_debug_info := v_debug_info || 'quotation_updated;';

    -- ============================================
    -- 2. CHECK IF OPPORTUNITY EXISTS & UPDATE
    -- ============================================
    IF v_effective_opportunity_id IS NOT NULL THEN
        -- Check if opportunity actually exists
        SELECT EXISTS(
            SELECT 1 FROM public.opportunities WHERE opportunity_id = v_effective_opportunity_id
        ) INTO v_opportunity_exists;

        v_debug_info := v_debug_info || 'opp_exists:' || v_opportunity_exists::TEXT || ';';

        IF v_opportunity_exists THEN
            -- Lock and get opportunity
            SELECT * INTO v_opportunity
            FROM public.opportunities
            WHERE opportunity_id = v_effective_opportunity_id
            FOR UPDATE;

            IF v_opportunity IS NOT NULL THEN
                v_old_opp_stage := v_opportunity.stage;
                v_debug_info := v_debug_info || 'old_stage:' || COALESCE(v_old_opp_stage::TEXT, 'NULL') || ';';

                -- Count quotations for this opportunity
                SELECT COUNT(*) INTO v_quotation_count
                FROM public.customer_quotations
                WHERE opportunity_id = v_effective_opportunity_id;

                v_debug_info := v_debug_info || 'quotation_count:' || v_quotation_count || ';';

                -- Only close if not already closed
                IF v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost') THEN
                    -- Update opportunity to Closed Won
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
                    v_debug_info := v_debug_info || 'opp_updated_to_closed_won;';

                    -- Insert stage history
                    INSERT INTO public.opportunity_stage_history (
                        opportunity_id,
                        from_stage,
                        to_stage,
                        changed_by,
                        reason,
                        notes
                    ) VALUES (
                        v_effective_opportunity_id,
                        v_old_opp_stage,
                        'Closed Won'::opportunity_stage,
                        v_actor_id,
                        'quotation_accepted',
                        '[' || v_correlation_id || '] Deal Won! ' || v_quotation.quotation_number || ' accepted. ' || v_deal_notes
                    );
                    v_stage_history_inserted := TRUE;

                    -- Insert pipeline_updates
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
                        '[' || v_correlation_id || '] 🎉 DEAL WON! ' || v_quotation.quotation_number || ' accepted. ' || v_deal_notes,
                        'Email'::approach_method,
                        v_old_opp_stage,
                        'Closed Won'::opportunity_stage,
                        v_actor_id,
                        NOW()
                    );
                    v_pipeline_updates_inserted := TRUE;

                    -- Insert activities
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
                        '🎉 Deal Won - ' || v_quotation.quotation_number || ' Accepted',
                        '[' || v_correlation_id || '] Customer accepted quotation. ' || v_deal_notes,
                        'Completed'::activity_status,
                        CURRENT_DATE,
                        NOW(),
                        v_effective_opportunity_id,
                        v_quotation.lead_id,
                        v_actor_id,
                        v_actor_id
                    );
                    v_activities_inserted := TRUE;

                    -- Update account status if needed
                    IF v_opportunity.account_id IS NOT NULL THEN
                        UPDATE public.accounts
                        SET
                            account_status = 'new_account'::account_status,
                            first_transaction_date = COALESCE(first_transaction_date, NOW()),
                            last_transaction_date = NOW(),
                            updated_at = NOW()
                        WHERE account_id = v_opportunity.account_id
                        AND account_status = 'calon_account';
                    END IF;
                ELSE
                    -- Already closed, just update quotation tracking
                    UPDATE public.opportunities
                    SET
                        quotation_status = 'accepted',
                        latest_quotation_id = p_quotation_id,
                        quotation_count = v_quotation_count,
                        deal_value = COALESCE(deal_value, v_quotation.total_selling_rate),
                        updated_at = NOW()
                    WHERE opportunity_id = v_effective_opportunity_id;

                    v_new_opp_stage := v_opportunity.stage;
                    v_debug_info := v_debug_info || 'opp_already_closed:' || v_opportunity.stage::TEXT || ';';
                END IF;
            END IF;
        ELSE
            -- Opportunity doesn't exist - clear the orphan reference
            v_debug_info := v_debug_info || 'ORPHAN_OPPORTUNITY_CLEARED;';

            -- Update quotation to clear invalid opportunity_id
            UPDATE public.customer_quotations
            SET opportunity_id = NULL
            WHERE id = p_quotation_id;

            v_effective_opportunity_id := NULL;
        END IF;
    END IF;

    -- ============================================
    -- 3. CLOSE TICKET
    -- ============================================
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT status INTO v_old_ticket_status
        FROM public.tickets
        WHERE id = v_quotation.ticket_id;

        v_debug_info := v_debug_info || 'ticket_old_status:' || COALESCE(v_old_ticket_status::TEXT, 'NULL') || ';';

        IF v_old_ticket_status IS NOT NULL AND v_old_ticket_status NOT IN ('closed', 'resolved') THEN
            UPDATE public.tickets
            SET
                status = 'closed'::ticket_status,
                close_outcome = 'won'::ticket_close_outcome,
                close_reason = 'Customer accepted ' || v_quotation.quotation_number || '. ' || v_deal_notes,
                closed_at = COALESCE(closed_at, NOW()),
                resolved_at = COALESCE(resolved_at, NOW()),
                updated_at = NOW()
            WHERE id = v_quotation.ticket_id
            RETURNING * INTO v_ticket;

            v_ticket_closed := TRUE;
            v_debug_info := v_debug_info || 'ticket_closed_won;';

            -- Audit trail
            INSERT INTO public.ticket_events (
                ticket_id,
                event_type,
                actor_user_id,
                old_value,
                new_value,
                notes
            ) VALUES (
                v_quotation.ticket_id,
                'status_change'::ticket_event_type,
                v_actor_id,
                jsonb_build_object('status', v_old_ticket_status),
                jsonb_build_object('status', 'closed', 'close_outcome', 'won'),
                v_quotation.quotation_number || ' accepted'
            );
        END IF;
    END IF;

    -- Return result
    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'opportunity_id', v_effective_opportunity_id,
        'opportunity_exists', v_opportunity_exists,
        'opportunity_stage', COALESCE(v_new_opp_stage::TEXT, v_old_opp_stage::TEXT),
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
        'ticket_id', v_quotation.ticket_id,
        'ticket_closed', v_ticket_closed,
        'stage_changed', v_stage_changed,
        'stage_history_inserted', v_stage_history_inserted,
        'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted,
        'deal_value', v_quotation.total_selling_rate,
        'total_cost', v_quotation.total_cost,
        'actual_margin_percent', v_margin_actual,
        'quotation_count', v_quotation_count,
        'correlation_id', v_correlation_id,
        'debug_info', v_debug_info
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'detail', SQLSTATE,
            'error_code', 'INTERNAL_ERROR',
            'correlation_id', v_correlation_id,
            'debug_info', v_debug_info
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CRITICAL: Set search_path
ALTER FUNCTION public.rpc_customer_quotation_mark_accepted SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_accepted TO service_role;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_accepted IS
'Migration 122: Added opportunity existence check and debug info.
Handles orphan opportunity references by clearing them.
Returns debug_info field for troubleshooting.';

DO $$
BEGIN
    RAISE NOTICE '[122] rpc_customer_quotation_mark_accepted recreated with existence check';
END $$;
