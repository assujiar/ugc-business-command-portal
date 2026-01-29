-- =====================================================
-- Migration 120: Sync tickets when pipeline is Closed Lost or On Hold
-- =====================================================
-- Issue: When pipeline is updated to Closed Lost or On Hold,
--        related tickets should also be closed with appropriate reason
--
-- Changes:
-- 1. Update rpc_opportunity_change_stage to sync tickets
-- 2. Require notes (reason) when changing to On Hold
-- 3. Create helper function sync_opportunity_tickets_closed
-- =====================================================

-- =====================================================
-- PART 1: Helper function to sync tickets to closed status
-- =====================================================

CREATE OR REPLACE FUNCTION public.sync_opportunity_tickets_closed(
    p_opportunity_id TEXT,
    p_close_outcome ticket_close_outcome,
    p_close_reason TEXT,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_ticket RECORD;
    v_tickets_updated INTEGER := 0;
    v_ticket_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Find all tickets linked to this opportunity that are not already closed
    FOR v_ticket IN
        SELECT t.id, t.ticket_code, t.status
        FROM public.tickets t
        WHERE t.opportunity_id = p_opportunity_id
        AND t.status NOT IN ('closed', 'resolved')
    LOOP
        -- Update ticket to closed
        UPDATE public.tickets
        SET
            status = 'closed'::ticket_status,
            close_outcome = p_close_outcome,
            close_reason = p_close_reason,
            closed_at = COALESCE(closed_at, NOW()),
            resolved_at = COALESCE(resolved_at, NOW()),
            updated_at = NOW()
        WHERE id = v_ticket.id;

        -- Create ticket event for audit trail
        INSERT INTO public.ticket_events (
            ticket_id,
            event_type,
            actor_user_id,
            old_value,
            new_value,
            notes
        ) VALUES (
            v_ticket.id,
            'status_change'::ticket_event_type,
            COALESCE(p_actor_id, auth.uid()),
            jsonb_build_object('status', v_ticket.status),
            jsonb_build_object('status', 'closed', 'close_outcome', p_close_outcome),
            'Auto-closed due to pipeline status change. Reason: ' || p_close_reason
        );

        v_tickets_updated := v_tickets_updated + 1;
        v_ticket_ids := array_append(v_ticket_ids, v_ticket.ticket_code);
    END LOOP;

    RETURN jsonb_build_object(
        'tickets_updated', v_tickets_updated,
        'ticket_codes', to_jsonb(v_ticket_ids)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_opportunity_tickets_closed IS
'Closes all tickets linked to an opportunity with specified outcome and reason.
Used when pipeline is marked as Closed Lost or On Hold.';

GRANT EXECUTE ON FUNCTION public.sync_opportunity_tickets_closed TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_opportunity_tickets_closed TO service_role;

-- =====================================================
-- PART 2: Drop existing overloads of rpc_opportunity_change_stage
-- =====================================================

DO $$
DECLARE
    v_proc RECORD;
BEGIN
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'rpc_opportunity_change_stage'
    LOOP
        RAISE NOTICE '[120] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;
END $$;

-- =====================================================
-- PART 3: Enhanced rpc_opportunity_change_stage with ticket sync
-- =====================================================

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
    v_ticket_sync JSONB;
    v_actor_id UUID;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_pipeline_updates_created BOOLEAN := FALSE;
    v_activities_created BOOLEAN := FALSE;
    v_history_created BOOLEAN := FALSE;
    v_close_reason_text TEXT;
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

    -- ENFORCE: notes (reason) is required when changing to On Hold
    IF p_new_stage = 'On Hold' AND (p_notes IS NULL OR TRIM(p_notes) = '') THEN
        RAISE EXCEPTION 'Reason (notes) is required when putting an opportunity on hold';
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
            'activities_created', false,
            'tickets_synced', false
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
            WHEN p_new_stage = 'On Hold' THEN 'On Hold: ' || COALESCE(p_notes, '')
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
        'System'::approach_method,
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

    -- Add details based on new stage
    IF p_new_stage = 'Closed Lost' AND p_lost_reason IS NOT NULL THEN
        v_activity_description := v_activity_description || E'\nLost Reason: ' || p_lost_reason;
    END IF;
    IF p_new_stage = 'On Hold' THEN
        v_activity_description := v_activity_description || E'\nOn Hold Reason: ' || COALESCE(p_notes, 'Not specified');
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
    -- 5. SYNC QUOTATION, ACCOUNT, AND TICKETS
    -- ============================================
    IF p_new_stage = 'Closed Won' THEN
        v_quotation_sync := public.sync_opportunity_to_quotation(p_opportunity_id, 'won');
        v_account_sync := public.sync_opportunity_to_account(p_opportunity_id, 'won');
        -- Tickets closed with won outcome handled by quotation accept
    ELSIF p_new_stage = 'Closed Lost' THEN
        v_quotation_sync := public.sync_opportunity_to_quotation(p_opportunity_id, 'lost');
        v_account_sync := public.sync_opportunity_to_account(p_opportunity_id, 'lost');

        -- SYNC TICKETS: Close all linked tickets as lost
        v_close_reason_text := 'Pipeline closed as lost. Reason: ' || COALESCE(p_lost_reason, 'Not specified');
        IF p_competitor IS NOT NULL THEN
            v_close_reason_text := v_close_reason_text || '. Competitor: ' || p_competitor;
        END IF;

        v_ticket_sync := public.sync_opportunity_tickets_closed(
            p_opportunity_id,
            'lost'::ticket_close_outcome,
            v_close_reason_text,
            v_actor_id
        );
    ELSIF p_new_stage = 'On Hold' THEN
        -- SYNC TICKETS: Close all linked tickets as lost (On Hold = deal suspended)
        v_close_reason_text := 'Pipeline put on hold. Reason: ' || COALESCE(p_notes, 'Not specified');

        v_ticket_sync := public.sync_opportunity_tickets_closed(
            p_opportunity_id,
            'lost'::ticket_close_outcome,
            v_close_reason_text,
            v_actor_id
        );
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
        'account_sync', v_account_sync,
        'ticket_sync', v_ticket_sync
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
'Atomically changes opportunity stage and syncs all related entities:
- Updates opportunity.stage
- Creates opportunity_stage_history
- Creates pipeline_updates (for UI timeline)
- Creates activities (for activity tracking)
- Syncs quotation and account status when closed
- SYNCS TICKETS: Closes all linked tickets when Closed Lost or On Hold

MIGRATION 120 ENHANCEMENTS:
- Requires notes (reason) when changing to On Hold
- Closes all linked tickets when pipeline is Closed Lost or On Hold
- Ticket close_reason includes pipeline close reason';

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.rpc_opportunity_change_stage TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_opportunity_change_stage TO service_role;

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.proname = 'rpc_opportunity_change_stage'
    ) THEN
        RAISE NOTICE '[120] SUCCESS: rpc_opportunity_change_stage function updated with ticket sync';
    ELSE
        RAISE WARNING '[120] FAILED: rpc_opportunity_change_stage function not found';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
        AND p.proname = 'sync_opportunity_tickets_closed'
    ) THEN
        RAISE NOTICE '[120] SUCCESS: sync_opportunity_tickets_closed function created';
    ELSE
        RAISE WARNING '[120] FAILED: sync_opportunity_tickets_closed function not found';
    END IF;
END $$;
