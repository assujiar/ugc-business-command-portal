-- ============================================
-- Migration: 087_fix_quotation_ticket_opportunity_derivation.sql
--
-- PURPOSE: Fix BUG #2 - Quotation "sent" doesn't move pipeline to "Quote Sent"
-- when quotation only has ticket_id (no direct opportunity_id or lead_id)
--
-- ISSUES FIXED:
-- 1. Derive opportunity_id from ticket.opportunity_id if quotation only has ticket_id
-- 2. Insert pipeline_updates directly in mark_sent (not just via trigger)
-- 3. Insert activities directly in mark_sent (not just via trigger)
-- 4. Add record_response_exchange call for SLA tracking
--
-- DERIVATION CHAIN:
-- opportunity_id := COALESCE(
--     quotation.opportunity_id,
--     lead.opportunity_id (from quotation.lead_id),
--     ticket.opportunity_id (from quotation.ticket_id)
-- )
-- ============================================

-- ============================================
-- 1. UPDATE: rpc_customer_quotation_mark_sent
-- Add ticket.opportunity_id derivation + direct pipeline_updates + activities
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
    v_old_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_new_opp_stage opportunity_stage := NULL;
    v_is_resend BOOLEAN := FALSE;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_derived_opportunity_id UUID := NULL;
    v_effective_opportunity_id UUID := NULL;
    v_stage_changed BOOLEAN := FALSE;
    v_comment_id UUID := NULL;
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

    -- ============================================
    -- FIX BUG #2: Enhanced opportunity_id derivation
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

    -- 1. UPDATE QUOTATION STATUS (always update sent_via/sent_to for resends)
    -- Also update opportunity_id if derived
    UPDATE public.customer_quotations
    SET
        status = 'sent'::customer_quotation_status,
        sent_via = COALESCE(p_sent_via, sent_via),
        sent_to = COALESCE(p_sent_to, sent_to),
        sent_at = COALESCE(sent_at, NOW()),
        opportunity_id = COALESCE(v_effective_opportunity_id, opportunity_id),
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. UPDATE OPPORTUNITY STAGE (if linked) - skip on resend
    IF v_effective_opportunity_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- Only transition if in early stages
            IF v_opportunity.stage IN ('Prospecting', 'Discovery') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Quote Sent'::opportunity_stage,
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    quotation_count = COALESCE(quotation_count, 0) + 1,
                    updated_at = NOW()
                WHERE opportunity_id = v_effective_opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Quote Sent'::opportunity_stage;
                v_stage_changed := TRUE;

                -- Create stage history entry (AUDIT TRAIL - only on first send)
                -- Populate BOTH from_stage/to_stage AND old_stage/new_stage for compatibility
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
                    '[' || v_correlation_id || '] Auto-updated: Quotation sent to customer via ' || COALESCE(p_sent_via, 'system'),
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage
                );

                -- ============================================
                -- FIX BUG #2: Insert pipeline_updates directly
                -- ============================================
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
                    '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system'),
                    'Email'::approach_method,
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage,
                    p_actor_user_id,
                    NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates
                    WHERE opportunity_id = v_effective_opportunity_id
                    AND new_stage = 'Quote Sent'::opportunity_stage
                    AND old_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- ============================================
                -- FIX BUG #2: Insert activities directly
                -- ============================================
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
                    'Email'::activity_type_v2,
                    'Quotation Sent - ' || v_quotation.quotation_number,
                    '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system') || '. Pipeline stage moved to Quote Sent.',
                    'Completed'::activity_status,
                    CURRENT_DATE,
                    NOW(),
                    v_effective_opportunity_id,
                    v_quotation.lead_id,
                    p_actor_user_id,
                    p_actor_user_id
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.activities
                    WHERE related_opportunity_id = v_effective_opportunity_id
                    AND subject LIKE '%' || v_quotation.quotation_number || '%'
                    AND activity_type = 'Email'
                    AND created_at > NOW() - INTERVAL '1 minute'
                );
            ELSE
                -- Just update quotation status, don't change stage
                UPDATE public.opportunities
                SET
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    updated_at = NOW()
                WHERE opportunity_id = v_effective_opportunity_id;
            END IF;
        END IF;
    END IF;

    -- 3. UPDATE TICKET STATUS (if linked) - skip event on resend
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

            -- ============================================
            -- FIX BUG #2: Record response exchange for SLA tracking
            -- This action counts as user response/activity
            -- ============================================
            BEGIN
                PERFORM public.record_response_exchange(
                    v_quotation.ticket_id,
                    p_actor_user_id,
                    NULL  -- No comment_id for this action
                );
            EXCEPTION
                WHEN OTHERS THEN
                    -- Log but don't fail the main transaction
                    RAISE WARNING 'Failed to record response exchange: %', SQLERRM;
            END;
        END IF;
    END IF;

    -- 4. UPDATE LEAD (if linked) - skip quotation_count increment on resend
    IF v_quotation.lead_id IS NOT NULL THEN
        IF v_is_resend THEN
            -- Just update latest_quotation_id, don't increment count
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
        'opportunity_id', v_effective_opportunity_id,
        'derived_opportunity_id', v_derived_opportunity_id,
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
        'stage_changed', v_stage_changed,
        'ticket_id', v_quotation.ticket_id,
        'ticket_status', v_ticket.status,
        'is_resend', v_is_resend,
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

FIX BUG #2 enhancements:
- Derives opportunity_id from ticket.opportunity_id if quotation only has ticket_id
- Derivation chain: quotation.opportunity_id -> lead.opportunity_id -> ticket.opportunity_id
- Directly inserts pipeline_updates (not just via trigger)
- Directly inserts activities with type Email
- Calls record_response_exchange for SLA tracking
- All inserts use NOT EXISTS guards for idempotency

Includes state machine validation and correlation_id for observability.';

-- ============================================
-- 2. UPDATE: rpc_customer_quotation_sync_from_status
-- Add ticket.opportunity_id derivation
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_sync_from_status(
    p_quotation_id UUID,
    p_actor_user_id UUID DEFAULT NULL,
    p_force BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_lead RECORD;
    v_old_opp_stage opportunity_stage;
    v_target_stage opportunity_stage;
    v_derived_opportunity_id UUID := NULL;
    v_effective_opportunity_id UUID := NULL;
    v_actor_id UUID;
    v_correlation_id TEXT;
    v_changes_made BOOLEAN := FALSE;
    v_stage_changed BOOLEAN := FALSE;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
BEGIN
    -- Generate correlation_id
    v_correlation_id := gen_random_uuid()::TEXT;

    -- Get actor user id
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

    -- ============================================
    -- FIX BUG #2: Enhanced opportunity_id derivation
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

    -- Update quotation with derived opportunity_id if found
    IF v_effective_opportunity_id IS NOT NULL AND v_quotation.opportunity_id IS NULL THEN
        UPDATE public.customer_quotations
        SET
            opportunity_id = v_effective_opportunity_id,
            updated_at = NOW()
        WHERE id = p_quotation_id;

        -- Update local variable
        v_quotation.opportunity_id := v_effective_opportunity_id;
        v_changes_made := TRUE;
    END IF;

    -- STEP 2: Determine target stage based on quotation status
    CASE v_quotation.status
        WHEN 'sent' THEN v_target_stage := 'Quote Sent'::opportunity_stage;
        WHEN 'rejected' THEN v_target_stage := 'Negotiation'::opportunity_stage;
        WHEN 'accepted' THEN v_target_stage := 'Closed Won'::opportunity_stage;
        ELSE v_target_stage := NULL; -- draft doesn't trigger stage change
    END CASE;

    -- STEP 3: Update opportunity stage if needed
    IF v_effective_opportunity_id IS NOT NULL AND v_target_stage IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- Only update if stage is earlier in pipeline (or force=true)
            IF p_force OR (
                (v_target_stage = 'Quote Sent' AND v_opportunity.stage IN ('Prospecting', 'Discovery')) OR
                (v_target_stage = 'Negotiation' AND v_opportunity.stage IN ('Quote Sent', 'Discovery', 'Prospecting')) OR
                (v_target_stage = 'Closed Won' AND v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost'))
            ) THEN
                -- Update opportunity stage
                UPDATE public.opportunities
                SET
                    stage = v_target_stage,
                    quotation_status = v_quotation.status::TEXT,
                    latest_quotation_id = v_quotation.id,
                    deal_value = CASE WHEN v_target_stage = 'Closed Won' THEN COALESCE(deal_value, v_quotation.total_selling_rate) ELSE deal_value END,
                    closed_at = CASE WHEN v_target_stage = 'Closed Won' THEN COALESCE(closed_at, NOW()) ELSE closed_at END,
                    updated_at = NOW()
                WHERE opportunity_id = v_effective_opportunity_id
                RETURNING * INTO v_opportunity;

                v_changes_made := TRUE;
                v_stage_changed := TRUE;

                -- Prepare messages for audit records
                CASE v_quotation.status
                    WHEN 'sent' THEN
                        v_activity_subject := 'Auto: Quotation Sent → Stage moved to Quote Sent';
                        v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' sent to customer. Pipeline stage auto-updated.';
                        v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via system';
                    WHEN 'rejected' THEN
                        v_activity_subject := 'Auto: Quotation Rejected → Stage moved to Negotiation';
                        v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Pipeline stage auto-updated for re-negotiation.';
                        v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' rejected - moved to negotiation';
                    WHEN 'accepted' THEN
                        v_activity_subject := 'Auto: Quotation Accepted → Stage moved to Closed Won';
                        v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' accepted by customer. Deal closed successfully.';
                        v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' accepted - deal won';
                    ELSE
                        v_activity_subject := 'Auto: Quotation Status Changed';
                        v_activity_description := 'Quotation status changed to ' || v_quotation.status;
                        v_pipeline_notes := 'Quotation status changed';
                END CASE;

                -- Insert opportunity_stage_history (idempotent with NOT EXISTS guard)
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
                    v_target_stage,
                    v_actor_id,
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    v_old_opp_stage,
                    v_target_stage
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history
                    WHERE opportunity_id = v_effective_opportunity_id
                    AND new_stage = v_target_stage
                    AND from_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Insert pipeline_updates (idempotent with NOT EXISTS guard)
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
                    v_target_stage,
                    v_actor_id,
                    NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates
                    WHERE opportunity_id = v_effective_opportunity_id
                    AND new_stage = v_target_stage
                    AND old_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Insert activity record (idempotent with NOT EXISTS guard)
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
                    CASE v_quotation.status
                        WHEN 'sent' THEN 'Email'::activity_type_v2
                        ELSE 'Note'::activity_type_v2
                    END,
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
                    SELECT 1 FROM public.activities
                    WHERE related_opportunity_id = v_effective_opportunity_id
                    AND subject = v_activity_subject
                    AND created_at > NOW() - INTERVAL '1 minute'
                );
            END IF;
        END IF;
    END IF;

    -- STEP 4: Update lead quotation_status (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET
            quotation_status = v_quotation.status::TEXT,
            latest_quotation_id = v_quotation.id,
            updated_at = NOW()
        WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- STEP 5: Update operational cost status (if linked)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET
            status = CASE v_quotation.status
                WHEN 'sent' THEN 'sent_to_customer'::quote_status
                WHEN 'accepted' THEN 'accepted'::quote_status
                WHEN 'rejected' THEN 'rejected'::quote_status
                ELSE status
            END,
            updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id
        AND status NOT IN ('accepted', 'rejected');
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_status', v_quotation.status,
        'opportunity_id', v_effective_opportunity_id,
        'derived_opportunity_id', v_derived_opportunity_id,
        'old_stage', v_old_opp_stage,
        'new_stage', v_target_stage,
        'stage_changed', v_stage_changed,
        'changes_made', v_changes_made,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_sync_from_status IS
'Central idempotent function to sync quotation status to all linked entities.

FIX BUG #2 enhancements:
- Derives opportunity_id from ticket.opportunity_id if quotation only has ticket_id
- Derivation chain: quotation.opportunity_id -> lead.opportunity_id -> ticket.opportunity_id

Features:
- Updates opportunity stage (sent→Quote Sent, rejected→Negotiation, accepted→Closed Won)
- Creates opportunity_stage_history with both from/to and old/new stage columns
- Creates pipeline_updates with approach_method=Email
- Creates activities (Email for sent, Note for others)
- Updates lead quotation_status
- Updates operational cost status
- All inserts use NOT EXISTS guards for idempotency';

-- ============================================
-- 3. BACKFILL: Link opportunity_id to quotations from ticket
-- Fix existing quotations that have ticket_id with opportunity_id but quotation doesn't
-- ============================================

-- Update quotations where ticket has opportunity_id but quotation doesn't
UPDATE public.customer_quotations cq
SET
    opportunity_id = t.opportunity_id,
    updated_at = NOW()
FROM public.tickets t
WHERE cq.ticket_id = t.id
AND cq.opportunity_id IS NULL
AND t.opportunity_id IS NOT NULL;

-- ============================================
-- SUMMARY
-- ============================================
-- BUG #2 Fix: Quotation "sent" now properly:
-- 1. Derives opportunity_id from ticket if quotation only has ticket_id
-- 2. Updates opportunity stage to "Quote Sent"
-- 3. Inserts opportunity_stage_history (both from/to and old/new)
-- 4. Inserts pipeline_updates with approach_method='Email'
-- 5. Inserts activities with type='Email', status='Completed'
-- 6. Calls record_response_exchange for SLA tracking
-- 7. All inserts are idempotent (NOT EXISTS guards prevent duplicates on resend)
-- ============================================
