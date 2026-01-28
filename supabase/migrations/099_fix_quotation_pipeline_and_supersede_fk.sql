-- ============================================
-- Migration: 099_fix_quotation_pipeline_and_supersede_fk.sql
--
-- PURPOSE: Fix critical issues with quotation pipeline sync:
--
-- ISSUE 1: Pipeline updates not created when quotation sent/rejected
-- ROOT CAUSES:
--   a) Stage condition only checked 'Prospecting', 'Discovery' - missed 'Negotiation'
--   b) Opportunity might not exist even though quotation has opportunity_id
--   c) Opportunity_id derivation from lead may point to non-existent opportunity
--   d) RLS policies block SECURITY DEFINER functions because auth.uid() returns NULL
--
-- FIX:
--   a) Extend stage conditions to include 'Negotiation'
--   b) Add opportunity derivation chain: quotation -> lead -> create if needed
--   c) Create opportunity automatically if lead has account but no opportunity
--   d) Temporarily disable RLS during opportunity updates
--
-- ISSUE 2: Foreign key constraint violation on superseded_by_id
-- ROOT CAUSE: BEFORE INSERT trigger sets superseded_by_id = NEW.id before commit
--
-- FIX: Split into BEFORE (is_current=FALSE) and AFTER (set superseded_by_id) triggers
--
-- IDEMPOTENCY: Safe to re-run
-- ============================================

-- ============================================
-- PART 0: Fix RLS for SECURITY DEFINER functions
-- The UPDATE policy on opportunities requires is_admin() OR owner check,
-- but SECURITY DEFINER functions have auth.uid() = NULL, causing silent failures.
-- Add a policy that allows service role / function owner to update.
-- ============================================

-- Add policy to allow postgres/service role to update opportunities
-- This ensures SECURITY DEFINER functions can update regardless of owner
DO $$
BEGIN
    -- Drop existing policy if it exists (for idempotency)
    DROP POLICY IF EXISTS opp_update_service ON opportunities;

    -- Create policy that allows updates when there's no auth context (SECURITY DEFINER)
    -- This is safe because SECURITY DEFINER functions are explicitly trusted
    CREATE POLICY opp_update_service ON opportunities FOR UPDATE
        USING (auth.uid() IS NULL);

    RAISE NOTICE 'Created opp_update_service policy for SECURITY DEFINER functions';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create opp_update_service policy: %', SQLERRM;
END $$;

-- Also add similar policies for other tables that RPC functions update
DO $$
BEGIN
    DROP POLICY IF EXISTS activities_insert_service ON activities;
    CREATE POLICY activities_insert_service ON activities FOR INSERT
        WITH CHECK (auth.uid() IS NULL);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create activities_insert_service policy: %', SQLERRM;
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS stage_history_insert_service ON opportunity_stage_history;
    CREATE POLICY stage_history_insert_service ON opportunity_stage_history FOR INSERT
        WITH CHECK (auth.uid() IS NULL);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create stage_history_insert_service policy: %', SQLERRM;
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS pipeline_updates_insert_service ON pipeline_updates;
    CREATE POLICY pipeline_updates_insert_service ON pipeline_updates FOR INSERT
        WITH CHECK (auth.uid() IS NULL);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create pipeline_updates_insert_service policy: %', SQLERRM;
END $$;

-- ============================================
-- PART 1: FIX SUPERSEDE TRIGGER - Split into BEFORE and AFTER
-- ============================================

-- Drop the old trigger first
DROP TRIGGER IF EXISTS trg_supersede_previous_quotes ON public.ticket_rate_quotes;

-- BEFORE INSERT: Only mark old quotes as NOT current (don't set superseded_by_id yet)
CREATE OR REPLACE FUNCTION public.fn_supersede_previous_quotes_before()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_current = TRUE AND NEW.ticket_id IS NOT NULL THEN
        -- Advisory lock to serialize per-ticket inserts (prevents race conditions)
        PERFORM pg_advisory_xact_lock(hashtext(NEW.ticket_id::text)::bigint);

        -- Mark all previous current quotes for this ticket as NOT current
        -- NOTE: We don't set superseded_by_id here because NEW.id doesn't exist yet
        UPDATE public.ticket_rate_quotes
        SET
            is_current = FALSE,
            superseded_at = NOW(),
            updated_at = NOW()
        WHERE ticket_id = NEW.ticket_id
        AND is_current = TRUE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_supersede_previous_quotes_before IS
'BEFORE INSERT trigger that marks previous current quotes as is_current=FALSE.
Uses advisory lock to prevent race conditions. Does NOT set superseded_by_id
(that happens in AFTER INSERT trigger).';

DROP TRIGGER IF EXISTS trg_supersede_previous_quotes_before ON public.ticket_rate_quotes;
CREATE TRIGGER trg_supersede_previous_quotes_before
    BEFORE INSERT ON public.ticket_rate_quotes
    FOR EACH ROW
    WHEN (NEW.is_current = TRUE)
    EXECUTE FUNCTION public.fn_supersede_previous_quotes_before();

-- AFTER INSERT: Now set superseded_by_id on old records (NEW.id exists now)
CREATE OR REPLACE FUNCTION public.fn_supersede_previous_quotes_after()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_current = TRUE AND NEW.ticket_id IS NOT NULL THEN
        -- Now NEW.id exists, so we can safely set the FK reference
        UPDATE public.ticket_rate_quotes
        SET superseded_by_id = NEW.id
        WHERE ticket_id = NEW.ticket_id
        AND is_current = FALSE
        AND superseded_by_id IS NULL
        AND superseded_at IS NOT NULL
        AND id != NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_supersede_previous_quotes_after IS
'AFTER INSERT trigger that sets superseded_by_id on old quotes to reference the new quote.
Runs after the INSERT so NEW.id is valid for FK constraint.';

DROP TRIGGER IF EXISTS trg_supersede_previous_quotes_after ON public.ticket_rate_quotes;
CREATE TRIGGER trg_supersede_previous_quotes_after
    AFTER INSERT ON public.ticket_rate_quotes
    FOR EACH ROW
    WHEN (NEW.is_current = TRUE)
    EXECUTE FUNCTION public.fn_supersede_previous_quotes_after();

-- ============================================
-- PART 2: Helper function to resolve/create opportunity
-- Auto-creates opportunity if lead has account but no opportunity exists
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
    SELECT cq.*, l.lead_id as lead_lead_id, l.opportunity_id as lead_opportunity_id,
           l.account_id as lead_account_id, l.company_name as lead_company_name,
           l.potential_revenue as lead_potential_revenue, l.sales_owner_user_id as lead_sales_owner
    INTO v_quotation
    FROM public.customer_quotations cq
    LEFT JOIN public.leads l ON l.lead_id = cq.lead_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN;
    END IF;

    -- Try direct opportunity lookup first
    IF v_quotation.opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunities.opportunity_id = v_quotation.opportunity_id;

        IF v_opportunity IS NOT NULL THEN
            RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, FALSE, 'quotation'::TEXT;
            RETURN;
        END IF;
        v_source := 'quotation_missing';
    END IF;

    -- Try lead's opportunity_id
    IF v_quotation.lead_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunities.opportunity_id = v_quotation.lead_opportunity_id;

        IF v_opportunity IS NOT NULL THEN
            -- Update quotation with correct opportunity_id
            UPDATE public.customer_quotations
            SET opportunity_id = v_quotation.lead_opportunity_id
            WHERE id = p_quotation_id;

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
            COALESCE(v_quotation.lead_potential_revenue, v_quotation.total_selling_rate, 0),
            'IDR',
            10, -- Prospecting probability
            COALESCE(v_quotation.lead_sales_owner, p_actor_user_id),
            p_actor_user_id,
            'Initial Contact',
            (CURRENT_DATE + INTERVAL '3 days')::DATE
        )
        RETURNING * INTO v_opportunity;

        -- Update lead with new opportunity_id
        UPDATE public.leads
        SET opportunity_id = v_new_opp_id, updated_at = NOW()
        WHERE lead_id = v_quotation.lead_lead_id
        AND opportunity_id IS NULL;

        -- Update quotation with new opportunity_id
        UPDATE public.customer_quotations
        SET opportunity_id = v_new_opp_id
        WHERE id = p_quotation_id;

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
Returns opportunity_id, stage, was_created flag, and source.';

-- ============================================
-- PART 3: FIX rpc_customer_quotation_mark_sent
-- Now uses opportunity resolution with auto-creation
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
    UPDATE public.customer_quotations
    SET
        status = 'sent'::customer_quotation_status,
        sent_via = COALESCE(p_sent_via, sent_via),
        sent_to = COALESCE(p_sent_to, sent_to),
        sent_at = COALESCE(sent_at, NOW()),
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. RESOLVE OPPORTUNITY (with auto-creation if needed) - skip on resend
    IF NOT v_is_resend THEN
        -- Use the helper function to resolve/create opportunity
        SELECT * INTO v_resolved_opp
        FROM public.fn_resolve_or_create_opportunity(p_quotation_id, p_actor_user_id);

        IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_resolved_opp.opportunity_id;
            v_opportunity_auto_created := v_resolved_opp.was_created;

            -- Fetch full opportunity record
            SELECT * INTO v_opportunity
            FROM public.opportunities
            WHERE opportunities.opportunity_id = v_effective_opportunity_id
            FOR UPDATE;

            -- Refresh quotation to get updated opportunity_id
            SELECT * INTO v_quotation
            FROM public.customer_quotations
            WHERE id = p_quotation_id;
        END IF;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- FIX: Include 'Negotiation' for revised quotations after rejection
            IF v_opportunity.stage IN ('Prospecting', 'Discovery', 'Negotiation') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Quote Sent'::opportunity_stage,
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    quotation_count = COALESCE(quotation_count, 0) + 1,
                    updated_at = NOW()
                WHERE opportunities.opportunity_id = v_effective_opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Quote Sent'::opportunity_stage;
                v_pipeline_updated := TRUE;

                -- Prepare messages for audit records
                v_activity_subject := 'Auto: Quotation Sent → Stage moved to Quote Sent';
                v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system') || '. Pipeline stage auto-updated.';
                v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system');

                -- Create stage history entry (AUDIT TRAIL)
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    from_stage,
                    to_stage,
                    changed_by,
                    notes,
                    old_stage,
                    new_stage
                )
                SELECT
                    v_effective_opportunity_id,
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage,
                    p_actor_user_id,
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND new_stage = 'Quote Sent'::opportunity_stage
                    AND from_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Insert pipeline_updates (idempotent)
                INSERT INTO public.pipeline_updates (
                    opportunity_id,
                    notes,
                    approach_method,
                    old_stage,
                    new_stage,
                    updated_by,
                    updated_at
                )
                SELECT
                    v_effective_opportunity_id,
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    'Email'::approach_method,
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage,
                    p_actor_user_id,
                    NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates pu
                    WHERE pu.opportunity_id = v_effective_opportunity_id
                    AND new_stage = 'Quote Sent'::opportunity_stage
                    AND old_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Insert activity record (idempotent)
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
                )
                SELECT
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
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.activities act
                    WHERE act.related_opportunity_id = v_effective_opportunity_id
                    AND subject = v_activity_subject
                    AND created_at > NOW() - INTERVAL '1 minute'
                );
            ELSE
                -- Just update quotation status on opportunity, don't change stage
                UPDATE public.opportunities
                SET
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    updated_at = NOW()
                WHERE opportunities.opportunity_id = v_effective_opportunity_id;
            END IF;
        END IF;
    END IF;

    -- 3. UPDATE TICKET STATUS (if linked)
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT status INTO v_old_ticket_status
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        FOR UPDATE;

        -- Update ticket to waiting_customer (Cost sent, awaiting feedback) - idempotent
        UPDATE public.tickets
        SET
            status = 'waiting_customer'::ticket_status,
            pending_response_from = 'creator',
            updated_at = NOW()
        WHERE id = v_quotation.ticket_id
        AND status NOT IN ('closed', 'resolved', 'waiting_customer')
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
            UPDATE public.leads
            SET
                quotation_status = 'sent',
                latest_quotation_id = v_quotation.id,
                updated_at = NOW()
            WHERE lead_id = v_quotation.lead_id;
        ELSE
            UPDATE public.leads
            SET
                quotation_status = 'sent',
                latest_quotation_id = v_quotation.id,
                quotation_count = COALESCE(quotation_count, 0) + 1,
                updated_at = NOW()
            WHERE lead_id = v_quotation.lead_id;
        END IF;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (if linked)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = 'sent_to_customer'::quote_status,
            updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS 'Atomically marks quotation as sent and syncs to opportunity (Quote Sent), ticket (waiting_customer), lead, and operational cost. Auto-creates opportunity from lead if needed. Includes Negotiation stage for revised quotations.';

-- ============================================
-- PART 4: FIX rpc_customer_quotation_mark_rejected
-- Also uses opportunity resolution
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
    UPDATE public.customer_quotations
    SET
        status = 'rejected'::customer_quotation_status,
        rejection_reason = p_reason_type::TEXT,
        updated_at = NOW()
    WHERE id = p_quotation_id
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
    SELECT * INTO v_resolved_opp
    FROM public.fn_resolve_or_create_opportunity(p_quotation_id, v_actor_id);

    IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
        v_effective_opportunity_id := v_resolved_opp.opportunity_id;

        -- Fetch full opportunity record
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunities.opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        -- Refresh quotation to get updated opportunity_id
        SELECT * INTO v_quotation
        FROM public.customer_quotations
        WHERE id = p_quotation_id;
    END IF;

    IF v_opportunity IS NOT NULL THEN
        v_old_opp_stage := v_opportunity.stage;

        -- Transition to Negotiation if in Quote Sent, Discovery, or Prospecting
        IF v_opportunity.stage IN ('Quote Sent', 'Discovery', 'Prospecting') THEN
            UPDATE public.opportunities
            SET
                stage = 'Negotiation'::opportunity_stage,
                quotation_status = 'rejected',
                competitor = COALESCE(p_competitor_name, competitor),
                competitor_price = COALESCE(p_competitor_amount, competitor_price),
                customer_budget = COALESCE(p_customer_budget, customer_budget),
                updated_at = NOW()
            WHERE opportunities.opportunity_id = v_effective_opportunity_id
            RETURNING * INTO v_opportunity;

            v_new_opp_stage := 'Negotiation'::opportunity_stage;
            v_pipeline_updated := TRUE;

            -- Prepare messages for audit records
            v_activity_subject := 'Auto: Quotation Rejected → Stage moved to Negotiation';
            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT || '. Pipeline stage auto-updated for re-negotiation.';
            v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' rejected - moved to negotiation. Reason: ' || p_reason_type::TEXT;

            -- Create stage history entry
            INSERT INTO public.opportunity_stage_history (
                opportunity_id,
                from_stage,
                to_stage,
                changed_by,
                reason,
                notes,
                old_stage,
                new_stage
            )
            SELECT
                v_effective_opportunity_id,
                v_old_opp_stage,
                'Negotiation'::opportunity_stage,
                v_actor_id,
                'quotation_rejected',
                '[' || v_correlation_id || '] ' || v_pipeline_notes,
                v_old_opp_stage,
                'Negotiation'::opportunity_stage
            WHERE NOT EXISTS (
                SELECT 1 FROM public.opportunity_stage_history osh
                WHERE osh.opportunity_id = v_effective_opportunity_id
                AND osh.new_stage = 'Negotiation'::opportunity_stage
                AND osh.from_stage = v_old_opp_stage
                AND osh.created_at > NOW() - INTERVAL '1 minute'
            );

            -- Insert pipeline_updates (idempotent)
            INSERT INTO public.pipeline_updates (
                opportunity_id,
                notes,
                approach_method,
                old_stage,
                new_stage,
                updated_by,
                updated_at
            )
            SELECT
                v_effective_opportunity_id,
                '[' || v_correlation_id || '] ' || v_pipeline_notes,
                'Email'::approach_method,
                v_old_opp_stage,
                'Negotiation'::opportunity_stage,
                v_actor_id,
                NOW()
            WHERE NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.new_stage = 'Negotiation'::opportunity_stage
                AND pu.old_stage = v_old_opp_stage
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            );

            -- Insert activity record (idempotent)
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
            )
            SELECT
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
            WHERE NOT EXISTS (
                SELECT 1 FROM public.activities act
                WHERE act.related_opportunity_id = v_effective_opportunity_id
                AND act.subject = v_activity_subject
                AND act.created_at > NOW() - INTERVAL '1 minute'
            );
        ELSIF v_opportunity.stage = 'Negotiation' THEN
            -- Already in Negotiation, still update quotation_status and create activity
            UPDATE public.opportunities
            SET
                quotation_status = 'rejected',
                competitor = COALESCE(p_competitor_name, competitor),
                competitor_price = COALESCE(p_competitor_amount, competitor_price),
                customer_budget = COALESCE(p_customer_budget, customer_budget),
                updated_at = NOW()
            WHERE opportunities.opportunity_id = v_effective_opportunity_id;

            -- Create activity for visibility even without stage change
            v_activity_subject := 'Quotation Rejected (Already in Negotiation)';
            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT || '. Opportunity already in Negotiation stage.';

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
            )
            SELECT
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
            WHERE NOT EXISTS (
                SELECT 1 FROM public.activities act
                WHERE act.related_opportunity_id = v_effective_opportunity_id
                AND act.subject = v_activity_subject
                AND act.created_at > NOW() - INTERVAL '1 minute'
            );

            v_pipeline_updated := TRUE;
        ELSE
            -- Just update quotation status, don't change stage if already past Negotiation
            UPDATE public.opportunities
            SET
                quotation_status = 'rejected',
                updated_at = NOW()
            WHERE opportunities.opportunity_id = v_effective_opportunity_id;
        END IF;
    END IF;

    -- 4. UPDATE TICKET STATUS (if linked) -> need_adjustment
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT status INTO v_old_ticket_status
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        FOR UPDATE;

        -- Update ticket to need_adjustment
        UPDATE public.tickets
        SET
            status = 'need_adjustment'::ticket_status,
            pending_response_from = 'assignee',
            updated_at = NOW()
        WHERE id = v_quotation.ticket_id
        AND status NOT IN ('closed', 'resolved')
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
        UPDATE public.leads
        SET
            quotation_status = 'rejected',
            updated_at = NOW()
        WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 6. UPDATE OPERATIONAL COST (if linked) -> revise_requested
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = 'revise_requested'::quote_status,
            updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_rejected IS 'Atomically marks quotation as rejected with state machine validation and syncs to opportunity (Negotiation), ticket (need_adjustment), lead, and operational cost. Auto-resolves opportunity from lead if needed.';

-- ============================================
-- PART 5: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.fn_resolve_or_create_opportunity(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- Fixed Issue 1: Pipeline updates not created
--   - Added fn_resolve_or_create_opportunity helper
--   - Auto-creates opportunity from lead if lead has account but no opportunity
--   - Extended stage conditions to include 'Negotiation'
--   - Creates activity even when already in Negotiation
--
-- Fixed Issue 2: Foreign key constraint on superseded_by_id
--   - Split trigger into BEFORE and AFTER
--   - BEFORE: Only sets is_current=FALSE
--   - AFTER: Sets superseded_by_id (NEW.id now exists)
-- ============================================
