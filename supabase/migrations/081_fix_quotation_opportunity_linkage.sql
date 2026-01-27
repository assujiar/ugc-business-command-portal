-- ============================================
-- Migration: 081_fix_quotation_opportunity_linkage.sql
--
-- PURPOSE: Fix Issue 2 - Quotation "sent" succeeds but pipeline doesn't change to "Quote Sent"
--
-- ROOT CAUSE: Quotations often don't have opportunity_id even when lead_id exists,
-- because the lead may have an opportunity_id that wasn't inherited during quotation creation.
--
-- FIXES:
-- 1. Update rpc_customer_quotation_mark_sent to derive opportunity_id from lead if missing
-- 2. Create rpc_customer_quotation_sync_from_status for central idempotent status sync
-- 3. Backfill existing quotations to link opportunity_id from lead
-- ============================================

-- ============================================
-- 1. CENTRAL SYNC FUNCTION: rpc_customer_quotation_sync_from_status
-- This function ensures quotation status is properly synced to opportunity stage
-- Includes opportunity_id derivation from lead_id if missing
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
    v_actor_id UUID;
    v_correlation_id TEXT;
    v_changes_made BOOLEAN := FALSE;
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

    -- STEP 1: Derive opportunity_id from lead if missing
    IF v_quotation.opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id
        FROM public.leads
        WHERE lead_id = v_quotation.lead_id
        AND opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            -- Update quotation with derived opportunity_id
            UPDATE public.customer_quotations
            SET
                opportunity_id = v_derived_opportunity_id,
                updated_at = NOW()
            WHERE id = p_quotation_id;

            -- Update local variable
            v_quotation.opportunity_id := v_derived_opportunity_id;
            v_changes_made := TRUE;
        END IF;
    END IF;

    -- STEP 2: Determine target stage based on quotation status
    CASE v_quotation.status
        WHEN 'sent' THEN v_target_stage := 'Quote Sent'::opportunity_stage;
        WHEN 'rejected' THEN v_target_stage := 'Negotiation'::opportunity_stage;
        WHEN 'accepted' THEN v_target_stage := 'Closed Won'::opportunity_stage;
        ELSE v_target_stage := NULL; -- draft doesn't trigger stage change
    END CASE;

    -- STEP 3: Update opportunity stage if needed
    IF v_quotation.opportunity_id IS NOT NULL AND v_target_stage IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_quotation.opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- Only update if stage is earlier in pipeline (or force=true)
            -- Sent: Update from Prospecting/Discovery
            -- Rejected: Update from Quote Sent/Discovery/Prospecting
            -- Accepted: Update from any non-closed stage
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
                WHERE opportunity_id = v_quotation.opportunity_id
                RETURNING * INTO v_opportunity;

                v_changes_made := TRUE;

                -- Create stage history entry (idempotent with NOT EXISTS guard)
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
                    v_quotation.opportunity_id,
                    v_old_opp_stage,
                    v_target_stage,
                    v_actor_id,
                    '[' || v_correlation_id || '] Auto-synced from quotation status: ' || v_quotation.status,
                    v_old_opp_stage,
                    v_target_stage
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history
                    WHERE opportunity_id = v_quotation.opportunity_id
                    AND new_stage = v_target_stage
                    AND from_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_status', v_quotation.status,
        'opportunity_id', v_quotation.opportunity_id,
        'derived_opportunity_id', v_derived_opportunity_id,
        'old_stage', v_old_opp_stage,
        'new_stage', v_target_stage,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_sync_from_status IS 'Central idempotent function to sync quotation status to opportunity stage. Derives opportunity_id from lead if missing. Status mapping: sent->Quote Sent, rejected->Negotiation, accepted->Closed Won.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_sync_from_status(UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================
-- 2. UPDATE rpc_customer_quotation_mark_sent to derive opportunity_id
-- Add logic to derive opportunity_id from lead_id before updating opportunity
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

    -- FIX Issue 2: Derive opportunity_id from lead if missing
    IF v_quotation.opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT opportunity_id INTO v_derived_opportunity_id
        FROM public.leads
        WHERE lead_id = v_quotation.lead_id
        AND opportunity_id IS NOT NULL;

        IF v_derived_opportunity_id IS NOT NULL THEN
            -- Update quotation with derived opportunity_id
            v_quotation.opportunity_id := v_derived_opportunity_id;
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
        opportunity_id = COALESCE(v_derived_opportunity_id, opportunity_id),
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. UPDATE OPPORTUNITY STAGE (if linked) - skip on resend
    IF v_quotation.opportunity_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_quotation.opportunity_id
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
                WHERE opportunity_id = v_quotation.opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Quote Sent'::opportunity_stage;

                -- Create stage history entry (AUDIT TRAIL - only on first send)
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    from_stage,
                    to_stage,
                    changed_by,
                    notes,
                    old_stage,
                    new_stage
                ) VALUES (
                    v_quotation.opportunity_id,
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage,
                    p_actor_user_id,
                    '[' || v_correlation_id || '] Auto-updated: Quotation sent to customer via ' || COALESCE(p_sent_via, 'system'),
                    v_old_opp_stage,
                    'Quote Sent'::opportunity_stage
                );
            ELSE
                -- Just update quotation status, don't change stage
                UPDATE public.opportunities
                SET
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;
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
        'opportunity_id', v_quotation.opportunity_id,
        'derived_opportunity_id', v_derived_opportunity_id,
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
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

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS 'Atomically marks quotation as sent and syncs to opportunity (Quote Sent), ticket (waiting_customer), lead, and operational cost in a single transaction. Derives opportunity_id from lead if missing. Includes state machine validation and correlation_id for observability.';

-- ============================================
-- 3. BACKFILL: Link opportunity_id to quotations from lead
-- Fix existing quotations that have lead_id but no opportunity_id
-- ============================================

-- Update quotations where lead has opportunity_id but quotation doesn't
UPDATE public.customer_quotations cq
SET
    opportunity_id = l.opportunity_id,
    updated_at = NOW()
FROM public.leads l
WHERE cq.lead_id = l.lead_id
AND cq.opportunity_id IS NULL
AND l.opportunity_id IS NOT NULL;

-- ============================================
-- 4. BACKFILL: Sync pipeline stage for sent quotations
-- Fix opportunities that are stuck in Discovery/Prospecting when quotation is sent
-- ============================================

-- Fix opportunities where quotation is 'sent' but stage is still early
UPDATE public.opportunities o
SET
    stage = 'Quote Sent'::opportunity_stage,
    quotation_status = 'sent',
    updated_at = NOW()
FROM public.customer_quotations cq
WHERE cq.opportunity_id = o.opportunity_id
AND cq.status = 'sent'
AND o.stage IN ('Discovery', 'Prospecting')
AND o.stage NOT IN ('Closed Won', 'Closed Lost');

-- ============================================
-- SUMMARY
-- ============================================
-- 1. rpc_customer_quotation_sync_from_status: Central sync function with opportunity derivation
-- 2. Updated rpc_customer_quotation_mark_sent: Now derives opportunity_id from lead if missing
-- 3. Backfill: Links opportunity_id to existing quotations from lead
-- 4. Backfill: Syncs pipeline stage for existing sent quotations
-- ============================================
