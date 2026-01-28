-- ============================================
-- Migration: 100_fix_ambiguous_column_references.sql
--
-- PURPOSE: Fix "column reference 'opportunity_id' is ambiguous" error
-- by fully qualifying ALL column references in subqueries.
--
-- ROOT CAUSE: In INSERT ... SELECT ... WHERE NOT EXISTS patterns,
-- PostgreSQL may try to resolve unqualified column names against
-- both the INSERT target table AND the subquery table, causing ambiguity.
--
-- FIX: Qualify ALL column references in subqueries with explicit table aliases.
--
-- IDEMPOTENCY: Safe to re-run (CREATE OR REPLACE)
-- ============================================

-- ============================================
-- PART 1: FIX fn_resolve_or_create_opportunity
-- Ensure all column references are fully qualified
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_resolve_or_create_opportunity(
    p_quotation_id UUID,
    p_actor_user_id UUID
)
RETURNS TABLE (
    opportunity_id TEXT,
    opportunity_stage opportunity_stage,
    was_created BOOLEAN,
    source TEXT
) AS $$
DECLARE
    v_quotation RECORD;
    v_lead RECORD;
    v_opportunity RECORD;
    v_new_opp_id TEXT;
    v_was_created BOOLEAN := FALSE;
    v_source TEXT := NULL;
BEGIN
    -- Get quotation with lead info
    -- Use explicit column names instead of cq.* to avoid any ambiguity
    SELECT
        cq.id AS quotation_id,
        cq.opportunity_id AS cq_opportunity_id,
        cq.lead_id AS cq_lead_id,
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
        RETURN;
    END IF;

    -- Try direct opportunity lookup first
    IF v_quotation.cq_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_quotation.cq_opportunity_id;

        IF v_opportunity IS NOT NULL THEN
            RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, FALSE, 'quotation'::TEXT;
            RETURN;
        END IF;
        v_source := 'quotation_missing';
    END IF;

    -- Try lead's opportunity_id
    IF v_quotation.lead_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_quotation.lead_opportunity_id;

        IF v_opportunity IS NOT NULL THEN
            -- Update quotation with correct opportunity_id
            UPDATE public.customer_quotations cq_upd
            SET opportunity_id = v_quotation.lead_opportunity_id
            WHERE cq_upd.id = p_quotation_id;

            RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, FALSE, 'lead'::TEXT;
            RETURN;
        END IF;
        v_source := 'lead_missing';
    END IF;

    -- If lead has account but no opportunity, auto-create opportunity
    IF v_quotation.lead_account_id IS NOT NULL AND v_quotation.lead_lead_id IS NOT NULL THEN
        -- Generate opportunity ID
        v_new_opp_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6));

        -- Create the opportunity
        INSERT INTO public.opportunities (
            opportunity_id,
            name,
            account_id,
            source_lead_id,
            stage,
            estimated_value,
            currency,
            probability,
            owner_user_id,
            created_by,
            next_step,
            next_step_due_date
        ) VALUES (
            v_new_opp_id,
            'Pipeline - ' || COALESCE(v_quotation.lead_company_name, 'Auto-created'),
            v_quotation.lead_account_id,
            v_quotation.lead_lead_id,
            'Prospecting'::opportunity_stage,
            COALESCE(v_quotation.lead_potential_revenue, v_quotation.cq_total_selling_rate, 0),
            'IDR',
            10, -- Prospecting probability
            COALESCE(v_quotation.lead_sales_owner, p_actor_user_id),
            p_actor_user_id,
            'Initial Contact',
            (CURRENT_DATE + INTERVAL '3 days')::DATE
        )
        RETURNING * INTO v_opportunity;

        -- Update lead with new opportunity_id
        UPDATE public.leads ld
        SET opportunity_id = v_new_opp_id, updated_at = NOW()
        WHERE ld.lead_id = v_quotation.lead_lead_id
        AND ld.opportunity_id IS NULL;

        -- Update quotation with new opportunity_id
        UPDATE public.customer_quotations cq_upd
        SET opportunity_id = v_new_opp_id
        WHERE cq_upd.id = p_quotation_id;

        v_was_created := TRUE;
        RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, TRUE, 'auto_created'::TEXT;
        RETURN;
    END IF;

    -- No opportunity could be found or created
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_resolve_or_create_opportunity IS
'Resolves opportunity for quotation, auto-creating if lead has account but no opportunity exists.
Returns opportunity_id, stage, was_created flag, and source. All column references fully qualified.';

-- ============================================
-- PART 2: FIX rpc_customer_quotation_mark_sent
-- Fully qualify ALL column references in subqueries
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_mark_sent(
    p_quotation_id UUID,
    p_sent_via TEXT,
    p_sent_to TEXT,
    p_actor_user_id UUID,
    p_correlation_id TEXT DEFAULT NULL
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
        SELECT resolved.* INTO v_resolved_opp
        FROM public.fn_resolve_or_create_opportunity(p_quotation_id, p_actor_user_id) resolved;

        IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_resolved_opp.opportunity_id;
            v_opportunity_auto_created := v_resolved_opp.was_created;

            -- Fetch full opportunity record
            SELECT opp.* INTO v_opportunity
            FROM public.opportunities opp
            WHERE opp.opportunity_id = v_effective_opportunity_id
            FOR UPDATE;

            -- Refresh quotation to get updated opportunity_id
            SELECT cq.* INTO v_quotation
            FROM public.customer_quotations cq
            WHERE cq.id = p_quotation_id;
        END IF;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- FIX: Include 'Negotiation' for revised quotations after rejection
            IF v_opportunity.stage IN ('Prospecting', 'Discovery', 'Negotiation') THEN
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

                -- Prepare messages for audit records
                v_activity_subject := 'Auto: Quotation Sent → Stage moved to Quote Sent';
                v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system') || '. Pipeline stage auto-updated.';
                v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system');

                -- Create stage history entry (AUDIT TRAIL)
                -- Use explicit INSERT VALUES instead of INSERT SELECT to avoid column resolution issues
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.new_stage = 'Quote Sent'::opportunity_stage
                    AND osh.from_stage = v_old_opp_stage
                    AND osh.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (
                        opportunity_id,
                        from_stage,
                        to_stage,
                        changed_by,
                        notes,
                        old_stage,
                        new_stage
                    ) VALUES (
                        v_effective_opportunity_id,
                        v_old_opp_stage,
                        'Quote Sent'::opportunity_stage,
                        p_actor_user_id,
                        '[' || v_correlation_id || '] ' || v_pipeline_notes,
                        v_old_opp_stage,
                        'Quote Sent'::opportunity_stage
                    );
                END IF;

                -- Insert pipeline_updates (idempotent)
                IF NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates pu
                    WHERE pu.opportunity_id = v_effective_opportunity_id
                    AND pu.new_stage = 'Quote Sent'::opportunity_stage
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
                        '[' || v_correlation_id || '] ' || v_pipeline_notes,
                        'Email'::approach_method,
                        v_old_opp_stage,
                        'Quote Sent'::opportunity_stage,
                        p_actor_user_id,
                        NOW()
                    );
                END IF;

                -- Insert activity record (idempotent)
                IF NOT EXISTS (
                    SELECT 1 FROM public.activities act
                    WHERE act.related_opportunity_id = v_effective_opportunity_id
                    AND act.subject = v_activity_subject
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
                        v_activity_subject,
                        '[' || v_correlation_id || '] ' || v_activity_description,
                        'Completed'::activity_status,
                        CURRENT_DATE,
                        NOW(),
                        v_effective_opportunity_id,
                        v_quotation.lead_id,
                        COALESCE(p_actor_user_id, v_quotation.created_by),
                        COALESCE(p_actor_user_id, v_quotation.created_by)
                    );
                END IF;
            ELSE
                -- Just update quotation status on opportunity, don't change stage
                UPDATE public.opportunities opp_upd
                SET
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
            END IF;
        END IF;
    END IF;

    -- 3. UPDATE TICKET STATUS (if linked)
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.status INTO v_old_ticket_status
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        FOR UPDATE;

        -- Update ticket to waiting_customer (Cost sent, awaiting feedback) - idempotent
        UPDATE public.tickets t_upd
        SET
            status = 'waiting_customer'::ticket_status,
            pending_response_from = 'creator',
            updated_at = NOW()
        WHERE t_upd.id = v_quotation.ticket_id
        AND t_upd.status NOT IN ('closed', 'resolved', 'waiting_customer')
        RETURNING * INTO v_ticket;

        -- Create ticket event (AUDIT TRAIL - only on first send, not resend)
        IF NOT v_is_resend THEN
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
                'customer_quotation_sent'::ticket_event_type,
                p_actor_user_id,
                jsonb_build_object('ticket_status', v_old_ticket_status),
                jsonb_build_object(
                    'ticket_status', 'waiting_customer',
                    'quotation_id', v_quotation.id,
                    'quotation_number', v_quotation.quotation_number,
                    'quotation_status', 'sent',
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

    -- 5. UPDATE OPERATIONAL COST (if linked)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'sent_to_customer'::quote_status,
            updated_at = NOW()
        WHERE trq.id = v_quotation.operational_cost_id;
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
        'pipeline_updates_created', v_pipeline_updated,
        'activities_created', v_pipeline_updated,
        'opportunity_auto_created', v_opportunity_auto_created,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS 'Atomically marks quotation as sent and syncs to opportunity (Quote Sent), ticket (waiting_customer), lead, and operational cost. Auto-creates opportunity from lead if needed. Includes Negotiation stage for revised quotations. All column references fully qualified to avoid ambiguity errors.';

-- ============================================
-- PART 3: FIX rpc_customer_quotation_mark_rejected
-- Fully qualify ALL column references in subqueries
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
    v_resolved_opp RECORD;
    v_old_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_new_opp_stage opportunity_stage := NULL;
    v_effective_opportunity_id TEXT := NULL;
    v_actor_id UUID;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_pipeline_updated BOOLEAN := FALSE;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    -- Get actor user id
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Validate required numeric fields for specific reasons
    IF p_reason_type = 'kompetitor_lebih_murah' AND p_competitor_amount IS NULL AND p_competitor_name IS NULL THEN
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

    -- IDEMPOTENCY: If already rejected, return success without duplicating events
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
        quotation_id,
        reason_type,
        competitor_name,
        competitor_amount,
        customer_budget,
        currency,
        notes,
        created_by,
        created_at
    ) VALUES (
        p_quotation_id,
        p_reason_type,
        p_competitor_name,
        p_competitor_amount,
        p_customer_budget,
        COALESCE(p_currency, v_quotation.currency, 'IDR'),
        p_notes,
        v_actor_id,
        NOW()
    );

    -- 3. RESOLVE OPPORTUNITY (with auto-creation if needed)
    SELECT resolved.* INTO v_resolved_opp
    FROM public.fn_resolve_or_create_opportunity(p_quotation_id, v_actor_id) resolved;

    IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
        v_effective_opportunity_id := v_resolved_opp.opportunity_id;

        -- Fetch full opportunity record
        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        -- Refresh quotation to get updated opportunity_id
        SELECT cq.* INTO v_quotation
        FROM public.customer_quotations cq
        WHERE cq.id = p_quotation_id;
    END IF;

    IF v_opportunity IS NOT NULL THEN
        v_old_opp_stage := v_opportunity.stage;

        -- Transition to Negotiation if in Quote Sent, Discovery, or Prospecting
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

            -- Prepare messages for audit records
            v_activity_subject := 'Auto: Quotation Rejected → Stage moved to Negotiation';
            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT || '. Pipeline stage auto-updated for re-negotiation.';
            v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' rejected - moved to negotiation. Reason: ' || p_reason_type::TEXT;

            -- Create stage history entry (use IF NOT EXISTS pattern instead of INSERT SELECT)
            IF NOT EXISTS (
                SELECT 1 FROM public.opportunity_stage_history osh
                WHERE osh.opportunity_id = v_effective_opportunity_id
                AND osh.new_stage = 'Negotiation'::opportunity_stage
                AND osh.from_stage = v_old_opp_stage
                AND osh.created_at > NOW() - INTERVAL '1 minute'
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
                    'Negotiation'::opportunity_stage,
                    v_actor_id,
                    'quotation_rejected',
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    v_old_opp_stage,
                    'Negotiation'::opportunity_stage
                );
            END IF;

            -- Insert pipeline_updates (idempotent)
            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.new_stage = 'Negotiation'::opportunity_stage
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
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    'Email'::approach_method,
                    v_old_opp_stage,
                    'Negotiation'::opportunity_stage,
                    v_actor_id,
                    NOW()
                );
            END IF;

            -- Insert activity record (idempotent)
            IF NOT EXISTS (
                SELECT 1 FROM public.activities act
                WHERE act.related_opportunity_id = v_effective_opportunity_id
                AND act.subject = v_activity_subject
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
            END IF;
        ELSIF v_opportunity.stage = 'Negotiation' THEN
            -- Already in Negotiation, still update quotation_status and create activity
            UPDATE public.opportunities opp_upd
            SET
                quotation_status = 'rejected',
                competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

            -- Create activity for visibility even without stage change
            v_activity_subject := 'Quotation Rejected (Already in Negotiation)';
            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT || '. Opportunity already in Negotiation stage.';

            IF NOT EXISTS (
                SELECT 1 FROM public.activities act
                WHERE act.related_opportunity_id = v_effective_opportunity_id
                AND act.subject = v_activity_subject
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
            END IF;

            v_pipeline_updated := TRUE;
        ELSE
            -- Just update quotation status, don't change stage if already past Negotiation
            UPDATE public.opportunities opp_upd
            SET
                quotation_status = 'rejected',
                updated_at = NOW()
            WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
        END IF;
    END IF;

    -- 4. UPDATE TICKET STATUS (if linked) -> need_adjustment
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.status INTO v_old_ticket_status
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        FOR UPDATE;

        -- Update ticket to need_adjustment
        UPDATE public.tickets t_upd
        SET
            status = 'need_adjustment'::ticket_status,
            pending_response_from = 'assignee',
            updated_at = NOW()
        WHERE t_upd.id = v_quotation.ticket_id
        AND t_upd.status NOT IN ('closed', 'resolved')
        RETURNING * INTO v_ticket;

        -- Create ticket event for rejection
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
            'customer_quotation_rejected'::ticket_event_type,
            v_actor_id,
            jsonb_build_object('ticket_status', v_old_ticket_status),
            jsonb_build_object(
                'ticket_status', 'need_adjustment',
                'quotation_id', v_quotation.id,
                'quotation_number', v_quotation.quotation_number,
                'quotation_status', 'rejected',
                'rejection_reason', p_reason_type::TEXT,
                'competitor_name', p_competitor_name,
                'competitor_amount', p_competitor_amount,
                'customer_budget', p_customer_budget,
                'correlation_id', v_correlation_id
            ),
            '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT,
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

    -- 5. UPDATE LEAD (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads ld
        SET
            quotation_status = 'rejected',
            updated_at = NOW()
        WHERE ld.lead_id = v_quotation.lead_id;
    END IF;

    -- 6. UPDATE OPERATIONAL COST (if linked) -> revise_requested
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'revise_requested'::quote_status,
            updated_at = NOW()
        WHERE trq.id = v_quotation.operational_cost_id;
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
        'pipeline_updates_created', v_pipeline_updated,
        'activities_created', v_pipeline_updated,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_rejected IS 'Atomically marks quotation as rejected with state machine validation and syncs to opportunity (Negotiation), ticket (need_adjustment), lead, and operational cost. Auto-resolves opportunity from lead if needed. All column references fully qualified to avoid ambiguity errors.';

-- ============================================
-- PART 4: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.fn_resolve_or_create_opportunity(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- Fixed "column reference 'opportunity_id' is ambiguous" error by:
--
-- 1. Replaced cq.* with explicit column selections in fn_resolve_or_create_opportunity
-- 2. Added table aliases to ALL table references (cq, opp, ld, t, trq, osh, pu, act)
-- 3. Changed INSERT ... SELECT ... WHERE NOT EXISTS to IF NOT EXISTS ... INSERT VALUES
--    This avoids any potential column resolution issues between INSERT target and subquery
-- 4. Qualified all UPDATE statements with table aliases (cq_upd, opp_upd, t_upd, etc.)
--
-- This ensures PostgreSQL never has to resolve ambiguous column names.
-- ============================================
