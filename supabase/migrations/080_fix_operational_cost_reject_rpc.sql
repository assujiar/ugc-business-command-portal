-- ============================================
-- Migration 080: Fix Operational Cost Reject RPC
--
-- This migration updates rpc_reject_operational_cost_with_reason to:
-- 1. Accept p_actor_user_id for explicit authorization context
-- 2. Accept p_correlation_id for audit trail tracing
-- 3. Return structured errors with error_code
-- 4. Add audit logging with correlation_id
-- ============================================

-- Drop existing function and recreate with new signature
DROP FUNCTION IF EXISTS public.rpc_reject_operational_cost_with_reason(UUID, TEXT, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.rpc_reject_operational_cost_with_reason(
    p_cost_id UUID,
    p_reason_type TEXT,
    p_suggested_amount NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'IDR',
    p_notes TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor_user_id UUID;
    v_correlation_id TEXT;
    v_cost RECORD;
    v_ticket_id UUID;
BEGIN
    -- Determine actor: explicit parameter takes precedence, then auth.uid()
    v_actor_user_id := COALESCE(p_actor_user_id, auth.uid());

    IF v_actor_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Not authenticated',
            'error_code', 'UNAUTHORIZED'
        );
    END IF;

    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    -- Get operational cost with row lock for atomic operation
    SELECT * INTO v_cost
    FROM public.ticket_rate_quotes
    WHERE id = p_cost_id
    FOR UPDATE;

    IF v_cost IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Operational cost not found',
            'error_code', 'NOT_FOUND',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Check if cost can be rejected (must be sent)
    IF v_cost.status != 'sent' THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Operational cost cannot be rejected in current status: ' || v_cost.status,
            'error_code', 'INVALID_STATUS_TRANSITION',
            'current_status', v_cost.status,
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Update operational cost status to revise_requested
    UPDATE public.ticket_rate_quotes
    SET
        status = 'revise_requested',
        updated_at = NOW()
    WHERE id = p_cost_id;

    -- Insert rejection reason
    INSERT INTO public.operational_cost_rejection_reasons (
        operational_cost_id,
        reason_type,
        suggested_amount,
        currency,
        notes,
        created_by
    ) VALUES (
        p_cost_id,
        p_reason_type::operational_cost_rejection_reason_type,
        p_suggested_amount,
        p_currency,
        '[' || v_correlation_id || '] ' || COALESCE(p_notes, ''),
        v_actor_user_id
    );

    -- Get ticket_id for audit logging
    SELECT ticket_id INTO v_ticket_id
    FROM public.ticket_rate_quotes
    WHERE id = p_cost_id;

    -- Log ticket event if ticket exists
    IF v_ticket_id IS NOT NULL THEN
        INSERT INTO public.ticket_events (
            ticket_id,
            event_type,
            old_value,
            new_value,
            changed_by,
            notes
        ) VALUES (
            v_ticket_id,
            'status_change',
            'sent',
            'revise_requested',
            v_actor_user_id,
            '[' || v_correlation_id || '] Operational cost rejected: ' || p_reason_type ||
            CASE WHEN p_suggested_amount IS NOT NULL THEN ' (suggested: ' || p_currency || ' ' || p_suggested_amount::TEXT || ')' ELSE '' END
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'cost_id', p_cost_id,
        'new_status', 'revise_requested',
        'reason_type', p_reason_type,
        'correlation_id', v_correlation_id
    );
END;
$$;

COMMENT ON FUNCTION public.rpc_reject_operational_cost_with_reason IS
'Atomically reject an operational cost with reason tracking.
Supports explicit actor_user_id for admin client calls and correlation_id for tracing.';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.rpc_reject_operational_cost_with_reason TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reject_operational_cost_with_reason TO service_role;
