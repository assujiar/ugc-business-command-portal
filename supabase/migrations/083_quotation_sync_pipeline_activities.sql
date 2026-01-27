-- ============================================
-- Migration: 083_quotation_sync_pipeline_activities.sql
--
-- PURPOSE: Fix Issues 4-6 - Quotation status changes should auto-create:
-- 1. opportunity_stage_history (already done in 078)
-- 2. pipeline_updates (Issue 4-5)
-- 3. activities (Issue 6)
--
-- DESIGN: Single unified sync engine that's idempotent and complete
-- All status changes (API, RPC, trigger) go through this engine
-- ============================================

-- ============================================
-- 1. ENHANCED: rpc_customer_quotation_sync_from_status
-- Now includes pipeline_updates and activities creation
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

                -- Issue 4-5: Insert opportunity_stage_history (idempotent with NOT EXISTS guard)
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
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    v_old_opp_stage,
                    v_target_stage
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history
                    WHERE opportunity_id = v_quotation.opportunity_id
                    AND new_stage = v_target_stage
                    AND from_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Issue 4-5: Insert pipeline_updates (idempotent with NOT EXISTS guard)
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
                    v_quotation.opportunity_id,
                    '[' || v_correlation_id || '] ' || v_pipeline_notes,
                    'Email'::approach_method,  -- Quotation-driven transitions use Email
                    v_old_opp_stage,
                    v_target_stage,
                    v_actor_id,
                    NOW()
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates
                    WHERE opportunity_id = v_quotation.opportunity_id
                    AND new_stage = v_target_stage
                    AND old_stage = v_old_opp_stage
                    AND created_at > NOW() - INTERVAL '1 minute'
                );

                -- Issue 6: Insert activity record (idempotent with NOT EXISTS guard)
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
                    v_quotation.opportunity_id,
                    v_quotation.lead_id,
                    COALESCE(v_actor_id, v_quotation.created_by),
                    COALESCE(v_actor_id, v_quotation.created_by)
                WHERE NOT EXISTS (
                    SELECT 1 FROM public.activities
                    WHERE related_opportunity_id = v_quotation.opportunity_id
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
        'opportunity_id', v_quotation.opportunity_id,
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
- Derives opportunity_id from lead if missing
- Updates opportunity stage (sent→Quote Sent, rejected→Negotiation, accepted→Closed Won)
- Creates opportunity_stage_history (Issue 4-5)
- Creates pipeline_updates (Issue 4-5)
- Creates activities (Issue 6)
- Updates lead quotation_status
- Updates operational cost status
All inserts use NOT EXISTS guards for idempotency.';

-- ============================================
-- 2. UPDATE: trigger_sync_quotation_on_status_change
-- Now calls the unified sync engine instead of sync_quotation_to_all
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_sync_quotation_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_sync_result JSONB;
BEGIN
    -- Only trigger when status changes to sent, accepted, or rejected
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('sent', 'accepted', 'rejected') THEN
        -- Call the unified sync engine (idempotent and complete)
        v_sync_result := rpc_customer_quotation_sync_from_status(
            NEW.id,
            COALESCE(NEW.created_by, auth.uid()),
            FALSE  -- Don't force, respect stage progression rules
        );

        -- Log result for debugging (optional)
        IF NOT (v_sync_result->>'success')::BOOLEAN THEN
            RAISE WARNING 'Quotation sync failed: %', v_sync_result->>'error';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.trigger_sync_quotation_on_status_change IS
'Trigger function that calls the unified sync engine when quotation status changes.
Fires when status changes to sent/accepted/rejected.
Calls rpc_customer_quotation_sync_from_status for complete sync including:
- opportunity stage update
- opportunity_stage_history
- pipeline_updates
- activities';

-- ============================================
-- 3. UPDATE: Mark functions to also call sync engine at the end
-- This ensures consistency whether status is changed via RPC or directly
-- ============================================

-- Update rpc_customer_quotation_mark_sent to call sync at the end
-- (The trigger already handles this, but explicit call ensures completeness)

-- Note: The existing trigger trg_quotation_status_sync already calls
-- trigger_sync_quotation_on_status_change when status changes, which now
-- calls the unified sync engine. So no additional changes needed to mark_sent.

-- ============================================
-- 4. BACKFILL: Create pipeline_updates and activities for existing sent/accepted/rejected quotations
-- This fixes existing data that's missing these audit records
-- ============================================

-- Backfill pipeline_updates for quotations that changed opportunity stage
-- but don't have a corresponding pipeline_updates record
INSERT INTO public.pipeline_updates (
    opportunity_id,
    notes,
    approach_method,
    old_stage,
    new_stage,
    updated_by,
    updated_at
)
SELECT DISTINCT ON (cq.opportunity_id, cq.status)
    cq.opportunity_id,
    'Backfill: Quotation ' || cq.quotation_number || ' - status ' || cq.status,
    'Email'::approach_method,
    CASE cq.status
        WHEN 'sent' THEN 'Discovery'::opportunity_stage
        WHEN 'rejected' THEN 'Quote Sent'::opportunity_stage
        WHEN 'accepted' THEN 'Quote Sent'::opportunity_stage
    END,
    CASE cq.status
        WHEN 'sent' THEN 'Quote Sent'::opportunity_stage
        WHEN 'rejected' THEN 'Negotiation'::opportunity_stage
        WHEN 'accepted' THEN 'Closed Won'::opportunity_stage
    END,
    cq.created_by,
    COALESCE(cq.sent_at, cq.updated_at, NOW())
FROM public.customer_quotations cq
WHERE cq.opportunity_id IS NOT NULL
AND cq.status IN ('sent', 'rejected', 'accepted')
AND NOT EXISTS (
    SELECT 1 FROM public.pipeline_updates pu
    WHERE pu.opportunity_id = cq.opportunity_id
    AND pu.new_stage = CASE cq.status
        WHEN 'sent' THEN 'Quote Sent'::opportunity_stage
        WHEN 'rejected' THEN 'Negotiation'::opportunity_stage
        WHEN 'accepted' THEN 'Closed Won'::opportunity_stage
    END
    AND pu.notes LIKE '%' || cq.quotation_number || '%'
);

-- Backfill activities for quotations that changed status
-- but don't have a corresponding activity record
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
SELECT DISTINCT ON (cq.opportunity_id, cq.status)
    'Note'::activity_type_v2,
    CASE cq.status
        WHEN 'sent' THEN 'Backfill: Quotation Sent → Quote Sent'
        WHEN 'rejected' THEN 'Backfill: Quotation Rejected → Negotiation'
        WHEN 'accepted' THEN 'Backfill: Quotation Accepted → Closed Won'
    END,
    'Backfill: Quotation ' || cq.quotation_number || ' status changed to ' || cq.status,
    'Completed'::activity_status,
    COALESCE(cq.sent_at::DATE, cq.updated_at::DATE, CURRENT_DATE),
    COALESCE(cq.sent_at, cq.updated_at, NOW()),
    cq.opportunity_id,
    cq.lead_id,
    cq.created_by,
    cq.created_by
FROM public.customer_quotations cq
WHERE cq.opportunity_id IS NOT NULL
AND cq.status IN ('sent', 'rejected', 'accepted')
AND NOT EXISTS (
    SELECT 1 FROM public.activities a
    WHERE a.related_opportunity_id = cq.opportunity_id
    AND a.subject LIKE '%Quotation%' || cq.status || '%'
    OR (a.description LIKE '%' || cq.quotation_number || '%' AND a.activity_type = 'Note')
);

-- ============================================
-- SUMMARY
-- ============================================
-- Issue 4-5: Pipeline stage changes now create:
--   - opportunity_stage_history (already existed, now with correlation_id)
--   - pipeline_updates (NEW: with approach_method='Email' for quotation-driven)
--
-- Issue 6: All auto-updates now create activities:
--   - activity_type = 'Note'
--   - status = 'Completed'
--   - subject = 'Auto: Quotation [Action] → Stage moved to [Stage]'
--
-- All inserts are idempotent with NOT EXISTS guards to prevent duplicates
-- ============================================
