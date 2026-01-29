-- ============================================
-- Migration: 109_fix_opportunity_change_stage_sync.sql
--
-- PURPOSE: Fix synchronization gaps in opportunity stage change flow
--
-- PROBLEM: rpc_opportunity_change_stage only updates opportunity.stage and relies on
-- trigger for opportunity_stage_history. It does NOT create:
-- - pipeline_updates record (for timeline UI)
-- - activities record (for activity tracking)
--
-- This causes inconsistency when:
-- - Sales rep manually changes pipeline stage via /api/crm/opportunities/[id]/stage
-- - Stage changes from non-quotation flows
--
-- SOLUTION: Enhance rpc_opportunity_change_stage to create all necessary records:
-- - Update opportunity.stage
-- - Insert pipeline_updates (with idempotency guard)
-- - Insert activities (with idempotency guard)
-- - Insert opportunity_stage_history (with both old/new and from/to columns)
--
-- PATTERN: Follow the atomic pattern used in quotation RPCs (rpc_customer_quotation_mark_sent)
--
-- IDEMPOTENCY: Safe to re-run (CREATE OR REPLACE)
-- ============================================

-- ============================================
-- PART 1: Enhanced rpc_opportunity_change_stage
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_opportunity_change_stage(
    p_opportunity_id TEXT,
    p_new_stage opportunity_stage,
    p_notes TEXT DEFAULT NULL,
    p_close_reason TEXT DEFAULT NULL,
    p_lost_reason TEXT DEFAULT NULL,
    p_competitor TEXT DEFAULT NULL,
    p_competitor_price NUMERIC DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_opp RECORD;
    v_old_stage opportunity_stage;
    v_existing JSONB;
    v_result JSONB;
    v_quotation_sync JSONB;
    v_account_sync JSONB;
    v_actor_id UUID;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_pipeline_updates_created BOOLEAN := FALSE;
    v_activities_created BOOLEAN := FALSE;
    v_history_created BOOLEAN := FALSE;
BEGIN
    -- Get actor user id
    v_actor_id := auth.uid();

    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        SELECT result INTO v_existing
        FROM public.idempotency_keys
        WHERE key = p_idempotency_key
        AND created_at > NOW() - INTERVAL '24 hours';

        IF v_existing IS NOT NULL THEN
            RETURN v_existing;
        END IF;
    END IF;

    -- Lock opportunity
    SELECT * INTO v_opp
    FROM public.opportunities
    WHERE opportunity_id = p_opportunity_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Opportunity not found: %', p_opportunity_id;
    END IF;

    -- Store old stage before update
    v_old_stage := v_opp.stage;

    -- Check if already in final state
    IF v_opp.stage IN ('Closed Won', 'Closed Lost') THEN
        RAISE EXCEPTION 'Cannot change stage of closed opportunity';
    END IF;

    -- ENFORCE: lost_reason is required when closing as lost
    IF p_new_stage = 'Closed Lost' AND p_lost_reason IS NULL THEN
        RAISE EXCEPTION 'lost_reason is required when closing an opportunity as lost';
    END IF;

    -- Skip if same stage (no-op)
    IF v_old_stage = p_new_stage THEN
        RETURN jsonb_build_object(
            'success', true,
            'opportunity_id', p_opportunity_id,
            'old_stage', v_old_stage::TEXT,
            'new_stage', p_new_stage::TEXT,
            'message', 'No change - already at this stage',
            'pipeline_updates_created', false,
            'activities_created', false
        );
    END IF;

    -- ============================================
    -- 1. UPDATE OPPORTUNITY
    -- ============================================
    UPDATE public.opportunities
    SET
        stage = p_new_stage,
        close_reason = CASE WHEN p_new_stage IN ('Closed Won', 'Closed Lost') THEN COALESCE(p_close_reason, close_reason) ELSE close_reason END,
        lost_reason = CASE WHEN p_new_stage = 'Closed Lost' THEN COALESCE(p_lost_reason, lost_reason) ELSE lost_reason END,
        outcome = CASE WHEN p_new_stage = 'Closed Lost' THEN COALESCE(p_lost_reason, outcome) ELSE outcome END,
        competitor = CASE WHEN p_new_stage = 'Closed Lost' THEN COALESCE(p_competitor, competitor) ELSE competitor END,
        competitor_price = CASE WHEN p_new_stage = 'Closed Lost' THEN COALESCE(p_competitor_price, competitor_price) ELSE competitor_price END,
        closed_at = CASE WHEN p_new_stage IN ('Closed Won', 'Closed Lost') THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE opportunity_id = p_opportunity_id
    RETURNING * INTO v_opp;

    -- ============================================
    -- 2. CREATE OPPORTUNITY_STAGE_HISTORY (with idempotency guard)
    -- Populate BOTH old/new columns AND from/to columns for compatibility
    -- ============================================
    INSERT INTO public.opportunity_stage_history (
        opportunity_id,
        from_stage,
        to_stage,
        old_stage,
        new_stage,
        changed_by,
        changed_at,
        reason,
        notes
    )
    SELECT
        p_opportunity_id,
        v_old_stage,
        p_new_stage,
        v_old_stage,
        p_new_stage,
        v_actor_id,
        NOW(),
        CASE
            WHEN p_new_stage = 'Closed Lost' THEN p_lost_reason
            ELSE NULL
        END,
        p_notes
    WHERE NOT EXISTS (
        SELECT 1 FROM public.opportunity_stage_history osh
        WHERE osh.opportunity_id = p_opportunity_id
        AND osh.to_stage = p_new_stage
        AND osh.from_stage = v_old_stage
        AND osh.created_at > NOW() - INTERVAL '1 minute'
    );

    IF FOUND THEN
        v_history_created := TRUE;
    END IF;

    -- ============================================
    -- 3. CREATE PIPELINE_UPDATES (with idempotency guard)
    -- ============================================
    v_pipeline_notes := COALESCE(p_notes, 'Stage changed from ' || v_old_stage::TEXT || ' to ' || p_new_stage::TEXT);

    INSERT INTO public.pipeline_updates (
        opportunity_id,
        old_stage,
        new_stage,
        approach_method,
        notes,
        updated_by,
        updated_at,
        created_at
    )
    SELECT
        p_opportunity_id,
        v_old_stage,
        p_new_stage,
        'System'::approach_method,  -- Default approach method for programmatic changes
        v_pipeline_notes,
        v_actor_id,
        NOW(),
        NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM public.pipeline_updates pu
        WHERE pu.opportunity_id = p_opportunity_id
        AND pu.new_stage = p_new_stage
        AND pu.old_stage = v_old_stage
        AND pu.created_at > NOW() - INTERVAL '1 minute'
    );

    IF FOUND THEN
        v_pipeline_updates_created := TRUE;
    END IF;

    -- ============================================
    -- 4. CREATE ACTIVITIES (with idempotency guard)
    -- ============================================
    v_activity_subject := 'Pipeline Stage: ' || v_old_stage::TEXT || ' → ' || p_new_stage::TEXT;
    v_activity_description := COALESCE(p_notes, 'Pipeline stage changed');

    -- Add lost reason details if closing as lost
    IF p_new_stage = 'Closed Lost' AND p_lost_reason IS NOT NULL THEN
        v_activity_description := v_activity_description || E'\nLost Reason: ' || p_lost_reason;
    END IF;
    IF p_competitor IS NOT NULL THEN
        v_activity_description := v_activity_description || E'\nCompetitor: ' || p_competitor;
    END IF;

    INSERT INTO public.activities (
        activity_type,
        subject,
        description,
        status,
        due_date,
        completed_at,
        related_opportunity_id,
        related_account_id,
        owner_user_id,
        created_by
    )
    SELECT
        'Note'::activity_type_v2,
        v_activity_subject,
        v_activity_description,
        'Completed'::activity_status,
        CURRENT_DATE,
        NOW(),
        p_opportunity_id,
        v_opp.account_id,
        COALESCE(v_actor_id, v_opp.owner_user_id),
        COALESCE(v_actor_id, v_opp.owner_user_id)
    WHERE NOT EXISTS (
        SELECT 1 FROM public.activities a
        WHERE a.related_opportunity_id = p_opportunity_id
        AND a.subject = v_activity_subject
        AND a.created_at > NOW() - INTERVAL '1 minute'
    );

    IF FOUND THEN
        v_activities_created := TRUE;
    END IF;

    -- ============================================
    -- 5. SYNC QUOTATION AND ACCOUNT STATUS (for closed opportunities)
    -- ============================================
    IF p_new_stage = 'Closed Won' THEN
        v_quotation_sync := public.sync_opportunity_to_quotation(p_opportunity_id, 'won');
        v_account_sync := public.sync_opportunity_to_account(p_opportunity_id, 'won');
    ELSIF p_new_stage = 'Closed Lost' THEN
        v_quotation_sync := public.sync_opportunity_to_quotation(p_opportunity_id, 'lost');
        v_account_sync := public.sync_opportunity_to_account(p_opportunity_id, 'lost');
    END IF;

    -- ============================================
    -- 6. BUILD RESULT
    -- ============================================
    v_result := jsonb_build_object(
        'success', true,
        'opportunity_id', p_opportunity_id,
        'old_stage', v_old_stage::TEXT,
        'new_stage', p_new_stage::TEXT,
        'pipeline_updates_created', v_pipeline_updates_created,
        'activities_created', v_activities_created,
        'history_created', v_history_created,
        'quotation_sync', v_quotation_sync,
        'account_sync', v_account_sync
    );

    -- Store idempotency result
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public.idempotency_keys (key, operation, result, created_at)
        VALUES (p_idempotency_key, 'stage_change-' || p_opportunity_id, v_result, NOW())
        ON CONFLICT (key) DO NOTHING;
    END IF;

    -- Audit log
    INSERT INTO public.audit_logs (module, action, record_type, record_id, user_id, after_data)
    VALUES ('opportunities', 'stage_change', 'opportunity', p_opportunity_id, v_actor_id, v_result);

    RETURN v_result;

EXCEPTION
    WHEN OTHERS THEN
        -- Return error as JSONB instead of raising exception
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'error_code', SQLSTATE,
            'opportunity_id', p_opportunity_id
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set search_path for security
ALTER FUNCTION public.rpc_opportunity_change_stage SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.rpc_opportunity_change_stage IS
'Atomically changes opportunity stage and creates all necessary audit records:
- Updates opportunity.stage
- Creates opportunity_stage_history (with both old/new and from/to columns)
- Creates pipeline_updates (for UI timeline)
- Creates activities (for activity tracking)
- Syncs quotation and account status when closed
All operations use idempotency guards to prevent duplicates.';

-- ============================================
-- PART 2: Grant permissions
-- ============================================

-- Grant to authenticated users (for API routes)
GRANT EXECUTE ON FUNCTION public.rpc_opportunity_change_stage TO authenticated;

-- Grant to service_role (for admin operations)
GRANT EXECUTE ON FUNCTION public.rpc_opportunity_change_stage TO service_role;

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
    -- Verify function exists
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.proname = 'rpc_opportunity_change_stage'
    ) THEN
        RAISE NOTICE '[109] SUCCESS: rpc_opportunity_change_stage function created/updated';
    ELSE
        RAISE WARNING '[109] FAILED: rpc_opportunity_change_stage function not found';
    END IF;
END $$;

-- ============================================
-- SUMMARY
-- ============================================
-- This migration enhances rpc_opportunity_change_stage to:
-- 1. Create pipeline_updates record (was missing)
-- 2. Create activities record (was missing)
-- 3. Create opportunity_stage_history with BOTH old/new AND from/to columns
-- 4. Use idempotency guards to prevent duplicate records
-- 5. Return detailed result with what was created
--
-- This ensures consistency with quotation RPCs and provides
-- complete audit trail for all stage changes.
-- ============================================
