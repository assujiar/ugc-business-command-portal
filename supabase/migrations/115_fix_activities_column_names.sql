-- =====================================================
-- Migration 115: Fix activities table column names in RPC functions
-- =====================================================
-- Issue: Migration 114 used wrong column names:
--   - opportunity_id (should be related_opportunity_id)
--   - lead_id (should be related_lead_id)
--   - account_id (should be related_account_id)
--
-- Correct columns in activities table:
--   - activity_id (auto-generated)
--   - activity_type
--   - subject
--   - description
--   - outcome
--   - status
--   - due_date (NOT NULL)
--   - due_time
--   - completed_at
--   - related_account_id
--   - related_contact_id
--   - related_opportunity_id
--   - related_lead_id
--   - related_target_id
--   - owner_user_id (NOT NULL)
--   - assigned_to
--   - created_by
--   - created_at
--   - updated_at
-- =====================================================

-- =====================================================
-- FIX rpc_customer_quotation_mark_sent
-- =====================================================
CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_mark_sent(
    p_quotation_id UUID,
    p_sent_via TEXT,
    p_sent_to TEXT,
    p_actor_user_id UUID,
    p_correlation_id TEXT DEFAULT NULL,
    p_allow_autocreate BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
AS $$
DECLARE
    v_quotation RECORD;
    v_ticket RECORD;
    v_opportunity RECORD;
    v_effective_opportunity_id TEXT;
    v_old_opp_stage opportunity_stage;
    v_new_opp_stage opportunity_stage;
    v_is_resend BOOLEAN := FALSE;
    v_pipeline_updated BOOLEAN := FALSE;
    v_opportunity_auto_created BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    v_correlation_id TEXT;
    v_transition_check JSONB;
    v_quotation_sequence INTEGER := 1;
    v_sequence_label TEXT := '1st';
    v_previous_rejected_count INTEGER := 0;
    v_activity_subject TEXT;
    v_pipeline_notes TEXT;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    -- 1. FETCH AND LOCK QUOTATION
    SELECT cq.*, cq.status AS quotation_status
    INTO v_quotation
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

    -- Validate transition (unless resending)
    IF v_quotation.status NOT IN ('draft', 'sent') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Cannot send quotation with status: ' || v_quotation.status,
            'error_code', 'INVALID_STATUS_TRANSITION',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Update quotation status
    UPDATE public.customer_quotations
    SET
        status = 'sent'::customer_quotation_status,
        sent_at = COALESCE(sent_at, NOW()),
        sent_via = p_sent_via,
        sent_to = p_sent_to,
        updated_at = NOW()
    WHERE id = p_quotation_id;

    -- Refresh quotation record
    SELECT * INTO v_quotation FROM public.customer_quotations WHERE id = p_quotation_id;

    -- Fetch ticket if linked
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT * INTO v_ticket FROM public.tickets WHERE id = v_quotation.ticket_id;
    END IF;

    -- 2. RESOLVE OPPORTUNITY ID
    v_effective_opportunity_id := v_quotation.opportunity_id;

    IF v_effective_opportunity_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.opportunity_id INTO v_effective_opportunity_id
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id;
    END IF;

    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT l.opportunity_id INTO v_effective_opportunity_id
        FROM public.leads l
        WHERE l.lead_id = v_quotation.lead_id;
    END IF;

    -- If we have an opportunity, proceed with pipeline sync
    IF v_effective_opportunity_id IS NOT NULL THEN
        -- Verify opportunity exists
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NULL THEN
            -- Opportunity doesn't exist - this is an orphan reference
            IF NOT p_allow_autocreate THEN
                RETURN jsonb_build_object(
                    'success', FALSE,
                    'error', 'Opportunity ' || v_effective_opportunity_id || ' does not exist',
                    'error_code', 'OPPORTUNITY_NOT_FOUND',
                    'quotation_opportunity_id', v_quotation.opportunity_id,
                    'correlation_id', v_correlation_id
                );
            END IF;
        ELSE
            -- Opportunity exists, proceed with stage update
            v_old_opp_stage := v_opportunity.stage;

            -- Calculate quotation sequence for this opportunity
            SELECT COUNT(*) + 1 INTO v_quotation_sequence
            FROM public.customer_quotations cq
            WHERE cq.opportunity_id = v_effective_opportunity_id
            AND cq.id != p_quotation_id
            AND cq.status IN ('sent', 'rejected', 'accepted');

            -- Count previous rejections
            SELECT COUNT(*) INTO v_previous_rejected_count
            FROM public.customer_quotations cq
            WHERE cq.opportunity_id = v_effective_opportunity_id
            AND cq.id != p_quotation_id
            AND cq.status = 'rejected';

            -- Generate sequence label
            v_sequence_label := CASE v_quotation_sequence
                WHEN 1 THEN '1st'
                WHEN 2 THEN '2nd'
                WHEN 3 THEN '3rd'
                ELSE v_quotation_sequence || 'th'
            END;

            -- STAGE TRANSITION LOGIC:
            -- First quotation (from Prospecting/Discovery) → Quote Sent
            -- First rejection → Negotiation
            -- Subsequent quotations → Stay in Negotiation

            IF v_old_opp_stage IN ('Prospecting', 'Discovery') AND v_quotation_sequence = 1 THEN
                -- First quotation from early stage - move to Quote Sent
                v_new_opp_stage := 'Quote Sent';
                v_activity_subject := v_sequence_label || ' Quotation Sent → Stage moved to Quote Sent';
                v_pipeline_notes := '[' || v_correlation_id || '] ' || v_sequence_label || ' quotation sent - ' || v_quotation.quotation_number;

                UPDATE public.opportunities
                SET stage = v_new_opp_stage, updated_at = NOW()
                WHERE opportunity_id = v_effective_opportunity_id;

                v_pipeline_updated := TRUE;

                -- Insert stage history
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id, from_stage, to_stage, changed_by, changed_at, change_reason
                ) VALUES (
                    v_effective_opportunity_id,
                    v_old_opp_stage,
                    v_new_opp_stage,
                    p_actor_user_id,
                    NOW(),
                    v_sequence_label || ' quotation sent to customer'
                );
                v_stage_history_inserted := TRUE;

                -- Insert pipeline update
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
                    v_pipeline_notes,
                    'Email'::approach_method,
                    v_old_opp_stage,
                    v_new_opp_stage,
                    p_actor_user_id,
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;

            ELSIF v_old_opp_stage = 'Quote Sent' AND v_quotation_sequence = 1 THEN
                -- Already in Quote Sent (first quotation) - no stage change
                v_new_opp_stage := 'Quote Sent';
                v_activity_subject := v_sequence_label || ' Quotation Sent (already in Quote Sent stage)';
                v_pipeline_notes := '[' || v_correlation_id || '] ' || v_sequence_label || ' quotation sent - ' || v_quotation.quotation_number;

                -- Insert pipeline update
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
                    v_pipeline_notes,
                    'Email'::approach_method,
                    v_old_opp_stage,
                    v_new_opp_stage,
                    p_actor_user_id,
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;

            ELSIF v_old_opp_stage = 'Negotiation' THEN
                -- In Negotiation stage (after previous rejection) - stay in Negotiation
                v_new_opp_stage := 'Negotiation';
                v_activity_subject := v_sequence_label || ' Quotation Sent (Negotiation in progress)';
                v_pipeline_notes := '[' || v_correlation_id || '] ' || v_sequence_label || ' quotation sent during negotiation - ' || v_quotation.quotation_number;

                -- Insert pipeline update
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
                    v_pipeline_notes,
                    'Email'::approach_method,
                    v_old_opp_stage,
                    v_new_opp_stage,
                    p_actor_user_id,
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;

            ELSE
                -- Other stages - just record update without stage change
                v_new_opp_stage := v_old_opp_stage;
                v_activity_subject := v_sequence_label || ' Quotation Sent';
                v_pipeline_notes := '[' || v_correlation_id || '] Quotation sent - ' || v_quotation.quotation_number;

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
                    v_pipeline_notes,
                    'Email'::approach_method,
                    v_old_opp_stage,
                    v_new_opp_stage,
                    p_actor_user_id,
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;
            END IF;

            -- Insert activity record with CORRECT column names
            INSERT INTO public.activities (
                related_opportunity_id,
                related_lead_id,
                related_account_id,
                owner_user_id,
                created_by,
                activity_type,
                subject,
                description,
                status,
                due_date,
                completed_at,
                created_at,
                updated_at
            ) VALUES (
                v_effective_opportunity_id,
                v_quotation.lead_id,
                v_opportunity.account_id,
                p_actor_user_id,
                p_actor_user_id,
                'Email'::activity_type_v2,
                v_activity_subject,
                'Quotation ' || v_quotation.quotation_number || ' sent via ' || p_sent_via || ' to ' || p_sent_to,
                'Completed'::activity_status,
                CURRENT_DATE,
                NOW(),
                NOW(),
                NOW()
            );
            v_activities_inserted := TRUE;
        END IF;
    END IF;

    -- 3. UPDATE TICKET STATUS (if linked)
    IF v_quotation.ticket_id IS NOT NULL THEN
        DECLARE
            v_old_ticket_status ticket_status;
        BEGIN
            SELECT t.status INTO v_old_ticket_status
            FROM public.tickets t
            WHERE t.id = v_quotation.ticket_id;

            UPDATE public.tickets t_upd
            SET
                status = 'waiting_customer'::ticket_status,
                updated_at = NOW()
            WHERE t_upd.id = v_quotation.ticket_id
            AND t_upd.status NOT IN ('closed', 'resolved', 'waiting_customer')
            RETURNING * INTO v_ticket;
        END;
    END IF;

    -- 4. UPDATE LEAD STATUS (if linked)
    -- Column is 'status' of type 'lead_status'
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads l_upd
        SET
            status = 'Qualified'::lead_status,
            updated_at = NOW()
        WHERE l_upd.lead_id = v_quotation.lead_id
        AND l_upd.status NOT IN ('Won', 'Lost', 'Qualified');
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent TO service_role;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS
'Atomically marks quotation as sent with correct column names.

MIGRATION 115 FIX:
- Fixed activities INSERT to use correct columns:
  related_opportunity_id, related_lead_id, related_account_id, owner_user_id
- Fixed activity_type to use activity_type_v2 enum
- Added due_date (required NOT NULL column)';
