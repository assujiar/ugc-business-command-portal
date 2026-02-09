-- =====================================================
-- Migration 147: Fix mark_won/mark_lost to_stage NULL violation
-- =====================================================
-- BUG: Both rpc_ticket_mark_won and rpc_ticket_mark_lost manually INSERT
-- into opportunity_stage_history with only (old_stage, new_stage) columns,
-- but the table's original to_stage column is NOT NULL (from migration 004).
-- This causes: "null value in column to_stage violates not-null constraint"
--
-- The log_stage_change() trigger on the opportunities table already handles
-- stage history creation (with all 4 columns: from_stage, to_stage,
-- old_stage, new_stage) when the stage column is updated.
--
-- FIX: Remove the redundant manual INSERT from both RPCs. The trigger
-- handles it. This also prevents duplicate history rows.
-- =====================================================


-- ============================================
-- PART 1: Fix rpc_ticket_mark_won
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_mark_won(
    p_ticket_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_sync_result JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    IF v_ticket.created_by != v_user_id AND NOT public.is_ticketing_admin(v_user_id) THEN
        RAISE EXCEPTION 'Only ticket creator can mark as won';
    END IF;

    UPDATE public.tickets
    SET status = 'closed', close_outcome = 'won', close_reason = p_notes,
        closed_at = NOW(), resolved_at = COALESCE(resolved_at, NOW()), updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, new_value, notes)
    VALUES (p_ticket_id, 'closed', v_user_id,
        jsonb_build_object('status', 'closed', 'outcome', 'won'),
        COALESCE(p_notes, 'Ticket won'));

    UPDATE public.ticket_sla_tracking
    SET resolution_at = NOW(),
        resolution_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= resolution_sla_hours,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id AND resolution_at IS NULL;

    BEGIN
        PERFORM public.update_ticket_response_metrics(p_ticket_id);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;

    v_sync_result := public.sync_ticket_to_quotation(p_ticket_id, 'won');

    -- Update opportunity stage to Closed Won
    -- The log_stage_change() trigger on opportunities automatically creates
    -- the stage history entry with all required columns (from_stage, to_stage,
    -- old_stage, new_stage). No manual INSERT needed.
    IF v_ticket.opportunity_id IS NOT NULL THEN
        DECLARE
            v_old_stage opportunity_stage;
        BEGIN
            SELECT stage INTO v_old_stage FROM public.opportunities WHERE opportunity_id = v_ticket.opportunity_id;

            IF v_old_stage NOT IN ('Closed Won', 'Closed Lost') THEN
                UPDATE public.opportunities
                SET stage = 'Closed Won'::opportunity_stage, closed_at = NOW(), updated_at = NOW()
                WHERE opportunity_id = v_ticket.opportunity_id;
                -- Trigger log_stage_change() handles opportunity_stage_history INSERT
            END IF;
        END;
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'ticket_id', p_ticket_id, 'outcome', 'won', 'quotation_sync', v_sync_result);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- PART 2: Fix rpc_ticket_mark_lost
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_ticket_mark_lost(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_competitor_name VARCHAR(255) DEFAULT NULL,
    p_competitor_cost DECIMAL(15,2) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_ticket public.tickets;
    v_sync_result JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;

    IF v_ticket.created_by != v_user_id AND NOT public.is_ticketing_admin(v_user_id) THEN
        RAISE EXCEPTION 'Only ticket creator can mark as lost';
    END IF;

    UPDATE public.tickets
    SET status = 'closed', close_outcome = 'lost', close_reason = p_reason,
        competitor_name = p_competitor_name, competitor_cost = p_competitor_cost,
        closed_at = NOW(), resolved_at = COALESCE(resolved_at, NOW()), updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, new_value, notes)
    VALUES (p_ticket_id, 'closed', v_user_id,
        jsonb_build_object('status', 'closed', 'outcome', 'lost',
            'competitor_name', p_competitor_name, 'competitor_cost', p_competitor_cost),
        COALESCE(p_reason, 'Ticket lost'));

    UPDATE public.ticket_sla_tracking
    SET resolution_at = NOW(),
        resolution_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= resolution_sla_hours,
        updated_at = NOW()
    WHERE ticket_id = p_ticket_id AND resolution_at IS NULL;

    BEGIN
        PERFORM public.update_ticket_response_metrics(p_ticket_id);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;

    v_sync_result := public.sync_ticket_to_quotation(p_ticket_id, 'lost');

    -- Update opportunity stage to Closed Lost
    -- The log_stage_change() trigger on opportunities automatically creates
    -- the stage history entry with all required columns (from_stage, to_stage,
    -- old_stage, new_stage). No manual INSERT needed.
    IF v_ticket.opportunity_id IS NOT NULL THEN
        DECLARE
            v_old_stage opportunity_stage;
        BEGIN
            SELECT stage INTO v_old_stage FROM public.opportunities WHERE opportunity_id = v_ticket.opportunity_id;

            IF v_old_stage NOT IN ('Closed Won', 'Closed Lost') THEN
                UPDATE public.opportunities
                SET stage = 'Closed Lost'::opportunity_stage,
                    lost_reason = p_reason,
                    competitor = p_competitor_name,
                    competitor_price = p_competitor_cost,
                    closed_at = NOW(), updated_at = NOW()
                WHERE opportunity_id = v_ticket.opportunity_id;
                -- Trigger log_stage_change() handles opportunity_stage_history INSERT
            END IF;
        END;
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'ticket_id', p_ticket_id, 'outcome', 'lost', 'quotation_sync', v_sync_result);
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- PART 3: Re-grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_ticket_mark_won(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_mark_won(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_mark_lost(UUID, TEXT, VARCHAR, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_mark_lost(UUID, TEXT, VARCHAR, DECIMAL) TO service_role;


-- ============================================
-- SUMMARY
-- ============================================
-- Removed manual INSERT into opportunity_stage_history from both RPCs.
-- The log_stage_change() trigger on opportunities table already creates
-- the history entry with all 4 stage columns (from_stage, to_stage,
-- old_stage, new_stage) when the stage column is updated.
-- This fixes: "null value in column to_stage violates not-null constraint"
-- ============================================
