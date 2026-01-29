-- =====================================================
-- Migration 118: Fix opportunity_id type in accept RPC
-- =====================================================
-- Issue: Variables declared as UUID but opportunity_id is TEXT
-- Error: invalid input syntax for type uuid: "OPP20260129608534"
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

            -- Only close if not already closed
            IF v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Closed Won'::opportunity_stage,
                    quotation_status = 'accepted',
                    deal_value = v_quotation.total_selling_rate,
                    closed_at = COALESCE(closed_at, NOW()),
                    updated_at = NOW()
                WHERE opportunity_id = v_effective_opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Closed Won'::opportunity_stage;
                v_stage_changed := TRUE;

                -- Insert stage history
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
                        '[' || v_correlation_id || '] Auto-closed: Customer accepted quotation ' || v_quotation.quotation_number || '. Deal value: ' || COALESCE(v_quotation.total_selling_rate::TEXT, 'N/A'),
                        v_old_opp_stage,
                        'Closed Won'::opportunity_stage
                    );
                    v_stage_history_inserted := TRUE;
                END IF;

                -- Insert pipeline_updates
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
                        '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' accepted. Deal closed successfully! Value: ' || COALESCE(v_quotation.total_selling_rate::TEXT, 'N/A') || ' ' || COALESCE(v_quotation.currency, 'IDR'),
                        'Email'::approach_method,
                        v_old_opp_stage,
                        'Closed Won'::opportunity_stage,
                        v_actor_id,
                        NOW()
                    );
                    v_pipeline_updates_inserted := TRUE;
                END IF;

                -- Insert activities
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
                        'Deal Won - Quotation ' || v_quotation.quotation_number || ' Accepted',
                        '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' accepted by customer. Deal closed successfully! Value: ' || COALESCE(v_quotation.total_selling_rate::TEXT, 'N/A') || ' ' || COALESCE(v_quotation.currency, 'IDR'),
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
                -- Already closed, just update quotation_status
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
            close_reason = 'Customer accepted quotation ' || v_quotation.quotation_number,
            closed_at = COALESCE(closed_at, NOW()),
            resolved_at = COALESCE(resolved_at, NOW()),
            updated_at = NOW()
        WHERE id = v_quotation.ticket_id
        AND status NOT IN ('closed', 'resolved')
        RETURNING * INTO v_ticket;
    END IF;

    -- Return success
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
'Atomically marks quotation as accepted and closes the deal.

FIX: opportunity_id variables changed from UUID to TEXT to match table schema.

Actions:
1. Updates quotation status to accepted
2. Updates opportunity stage to Closed Won
3. Creates pipeline_updates and activities records
4. Closes linked ticket';
