-- ============================================
-- Migration: 076_rejection_reasons_and_quotation_sync_fix.sql
--
-- Features:
-- 1. Create quotation_rejection_reasons table
-- 2. Create operational_cost_rejection_reasons table
-- 3. Create RPC for rejecting quotation with reason
-- 4. Fix sync_quotation_to_all to be callable on resends
-- 5. Create RPC for updating quotation status with validation
-- ============================================

-- ============================================
-- 1. REJECTION REASON ENUMS
-- ============================================

-- Quotation rejection reason types
DO $$ BEGIN
    CREATE TYPE quotation_rejection_reason_type AS ENUM (
        'tarif_tidak_masuk',
        'kompetitor_lebih_murah',
        'budget_customer_tidak_cukup',
        'service_tidak_sesuai',
        'waktu_tidak_sesuai',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE quotation_rejection_reason_type IS 'Types of reasons for rejecting a customer quotation';

-- Operational cost rejection reason types
DO $$ BEGIN
    CREATE TYPE operational_cost_rejection_reason_type AS ENUM (
        'harga_terlalu_tinggi',
        'margin_tidak_mencukupi',
        'vendor_tidak_sesuai',
        'waktu_tidak_sesuai',
        'perlu_revisi',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE operational_cost_rejection_reason_type IS 'Types of reasons for rejecting an operational cost';

-- ============================================
-- 2. QUOTATION REJECTION REASONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.quotation_rejection_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id UUID NOT NULL REFERENCES public.customer_quotations(id) ON DELETE CASCADE,

    -- Reason details
    reason_type quotation_rejection_reason_type NOT NULL,
    competitor_name TEXT, -- If reason is kompetitor_lebih_murah
    competitor_amount NUMERIC(15, 2), -- Competitor's price if known
    customer_budget NUMERIC(15, 2), -- Customer's budget if reason is budget_customer_tidak_cukup
    currency VARCHAR(3) DEFAULT 'IDR',
    notes TEXT, -- Additional notes or details

    -- Metadata
    created_by UUID NOT NULL REFERENCES public.profiles(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_competitor_info CHECK (
        (reason_type != 'kompetitor_lebih_murah') OR
        (competitor_name IS NOT NULL OR competitor_amount IS NOT NULL)
    ),
    CONSTRAINT valid_budget_info CHECK (
        (reason_type != 'budget_customer_tidak_cukup') OR
        (customer_budget IS NOT NULL)
    )
);

COMMENT ON TABLE public.quotation_rejection_reasons IS 'Stores rejection reasons for customer quotations for analytics';

CREATE INDEX idx_quotation_rejection_reasons_quotation_id ON public.quotation_rejection_reasons(quotation_id);
CREATE INDEX idx_quotation_rejection_reasons_reason_type ON public.quotation_rejection_reasons(reason_type);
CREATE INDEX idx_quotation_rejection_reasons_created_at ON public.quotation_rejection_reasons(created_at);

-- ============================================
-- 3. OPERATIONAL COST REJECTION REASONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.operational_cost_rejection_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operational_cost_id UUID NOT NULL REFERENCES public.ticket_rate_quotes(id) ON DELETE CASCADE,

    -- Reason details
    reason_type operational_cost_rejection_reason_type NOT NULL,
    suggested_amount NUMERIC(15, 2), -- What amount would be acceptable
    currency VARCHAR(3) DEFAULT 'IDR',
    notes TEXT, -- Additional notes or details

    -- Metadata
    created_by UUID NOT NULL REFERENCES public.profiles(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.operational_cost_rejection_reasons IS 'Stores rejection reasons for operational costs for analytics';

CREATE INDEX idx_operational_cost_rejection_reasons_cost_id ON public.operational_cost_rejection_reasons(operational_cost_id);
CREATE INDEX idx_operational_cost_rejection_reasons_reason_type ON public.operational_cost_rejection_reasons(reason_type);
CREATE INDEX idx_operational_cost_rejection_reasons_created_at ON public.operational_cost_rejection_reasons(created_at);

-- ============================================
-- 4. RLS POLICIES FOR REJECTION REASONS
-- ============================================

-- Quotation rejection reasons RLS
ALTER TABLE public.quotation_rejection_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view rejection reasons for their quotations" ON public.quotation_rejection_reasons;
CREATE POLICY "Users can view rejection reasons for their quotations" ON public.quotation_rejection_reasons
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.customer_quotations cq
            WHERE cq.id = quotation_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR cq.created_by = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.tickets t
                    WHERE t.id = cq.ticket_id
                    AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
                )
            )
        )
    );

DROP POLICY IF EXISTS "Users can insert rejection reasons" ON public.quotation_rejection_reasons;
CREATE POLICY "Users can insert rejection reasons" ON public.quotation_rejection_reasons
    FOR INSERT TO authenticated
    WITH CHECK (
        created_by = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.customer_quotations cq
            WHERE cq.id = quotation_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR cq.created_by = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.tickets t
                    WHERE t.id = cq.ticket_id
                    AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
                )
            )
        )
    );

-- Operational cost rejection reasons RLS
ALTER TABLE public.operational_cost_rejection_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view cost rejection reasons for their tickets" ON public.operational_cost_rejection_reasons;
CREATE POLICY "Users can view cost rejection reasons for their tickets" ON public.operational_cost_rejection_reasons
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.ticket_rate_quotes trq
            JOIN public.tickets t ON t.id = trq.ticket_id
            WHERE trq.id = operational_cost_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
                OR trq.created_by = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can insert cost rejection reasons" ON public.operational_cost_rejection_reasons;
CREATE POLICY "Users can insert cost rejection reasons" ON public.operational_cost_rejection_reasons
    FOR INSERT TO authenticated
    WITH CHECK (
        created_by = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.ticket_rate_quotes trq
            JOIN public.tickets t ON t.id = trq.ticket_id
            WHERE trq.id = operational_cost_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
            )
        )
    );

-- ============================================
-- 5. RPC: Reject Quotation with Reason
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_reject_quotation_with_reason(
    p_quotation_id UUID,
    p_reason_type TEXT,
    p_competitor_name TEXT DEFAULT NULL,
    p_competitor_amount NUMERIC DEFAULT NULL,
    p_customer_budget NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'IDR',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_quotation RECORD;
    v_sync_result JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get quotation
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Check if quotation can be rejected (must be sent)
    IF v_quotation.status NOT IN ('sent', 'draft') THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation cannot be rejected in current status: ' || v_quotation.status);
    END IF;

    -- Insert rejection reason
    INSERT INTO public.quotation_rejection_reasons (
        quotation_id,
        reason_type,
        competitor_name,
        competitor_amount,
        customer_budget,
        currency,
        notes,
        created_by
    ) VALUES (
        p_quotation_id,
        p_reason_type::quotation_rejection_reason_type,
        p_competitor_name,
        p_competitor_amount,
        p_customer_budget,
        COALESCE(p_currency, 'IDR'),
        p_notes,
        v_user_id
    );

    -- Update quotation status to rejected
    UPDATE public.customer_quotations
    SET
        status = 'rejected',
        updated_at = NOW()
    WHERE id = p_quotation_id;

    -- Sync to all linked entities (ticket, lead, opportunity)
    v_sync_result := public.sync_quotation_to_all(p_quotation_id, 'rejected', v_user_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', p_quotation_id,
        'reason_type', p_reason_type,
        'sync_result', v_sync_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_reject_quotation_with_reason IS 'Rejects a quotation and records the rejection reason for analytics';

-- ============================================
-- 6. RPC: Reject Operational Cost with Reason
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_reject_operational_cost_with_reason(
    p_cost_id UUID,
    p_reason_type TEXT,
    p_suggested_amount NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'IDR',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_cost RECORD;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get operational cost
    SELECT * INTO v_cost
    FROM public.ticket_rate_quotes
    WHERE id = p_cost_id;

    IF v_cost IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Operational cost not found');
    END IF;

    -- Check if cost can be rejected (must be sent)
    IF v_cost.status != 'sent' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Operational cost cannot be rejected in current status: ' || v_cost.status);
    END IF;

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
        COALESCE(p_currency, 'IDR'),
        p_notes,
        v_user_id
    );

    -- Update operational cost status to rejected
    UPDATE public.ticket_rate_quotes
    SET
        status = 'rejected',
        updated_at = NOW()
    WHERE id = p_cost_id;

    -- Create ticket event
    INSERT INTO public.ticket_events (
        ticket_id,
        event_type,
        actor_user_id,
        old_value,
        new_value,
        notes
    ) VALUES (
        v_cost.ticket_id,
        'cost_rejected',
        v_user_id,
        jsonb_build_object('status', 'sent'),
        jsonb_build_object('status', 'rejected', 'reason_type', p_reason_type),
        COALESCE(p_notes, 'Operational cost rejected: ' || p_reason_type)
    );

    -- Update ticket status to need_adjustment
    UPDATE public.tickets
    SET
        status = 'need_adjustment',
        pending_response_from = 'assignee',
        updated_at = NOW()
    WHERE id = v_cost.ticket_id
    AND status NOT IN ('closed', 'resolved');

    RETURN jsonb_build_object(
        'success', TRUE,
        'cost_id', p_cost_id,
        'reason_type', p_reason_type
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_reject_operational_cost_with_reason IS 'Rejects an operational cost and records the rejection reason for analytics';

-- ============================================
-- 7. RPC: Update Quotation Status (with validation)
-- This ensures proper enum casting
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_update_quotation_status_validated(
    p_quotation_id UUID,
    p_new_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_quotation RECORD;
    v_valid_statuses TEXT[] := ARRAY['draft', 'sent', 'accepted', 'rejected', 'expired'];
    v_sync_result JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Validate status
    IF NOT (p_new_status = ANY(v_valid_statuses)) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Invalid status: ' || p_new_status || '. Valid values are: ' || array_to_string(v_valid_statuses, ', ')
        );
    END IF;

    -- Get quotation
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Update quotation status with proper enum cast
    UPDATE public.customer_quotations
    SET
        status = p_new_status::customer_quotation_status,
        sent_at = CASE WHEN p_new_status = 'sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END,
        updated_at = NOW()
    WHERE id = p_quotation_id;

    -- Sync to all linked entities for status changes that affect the pipeline
    IF p_new_status IN ('sent', 'accepted', 'rejected') AND v_quotation.status != p_new_status THEN
        v_sync_result := public.sync_quotation_to_all(p_quotation_id, p_new_status, v_user_id);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', p_quotation_id,
        'old_status', v_quotation.status,
        'new_status', p_new_status,
        'sync_result', v_sync_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_update_quotation_status_validated IS 'Updates quotation status with validation and proper enum casting';

-- ============================================
-- 8. RPC: Force Sync Quotation (for resends)
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_force_sync_quotation(
    p_quotation_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_quotation RECORD;
    v_sync_result JSONB;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get quotation
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Force sync current status to all linked entities
    v_sync_result := public.sync_quotation_to_all(p_quotation_id, v_quotation.status::TEXT, v_user_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', p_quotation_id,
        'current_status', v_quotation.status,
        'sync_result', v_sync_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_force_sync_quotation IS 'Forces sync of quotation status to all linked entities (useful for resends)';

-- ============================================
-- 9. ANALYTICS VIEWS FOR REJECTION REASONS
-- ============================================

-- View: Quotation rejection analytics
CREATE OR REPLACE VIEW public.vw_quotation_rejection_analytics AS
SELECT
    qrr.reason_type,
    COUNT(*) as count,
    ROUND(COUNT(*)::NUMERIC / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 2) as percentage,
    AVG(qrr.competitor_amount) as avg_competitor_amount,
    AVG(qrr.customer_budget) as avg_customer_budget,
    DATE_TRUNC('month', qrr.created_at) as month
FROM public.quotation_rejection_reasons qrr
GROUP BY qrr.reason_type, DATE_TRUNC('month', qrr.created_at);

COMMENT ON VIEW public.vw_quotation_rejection_analytics IS 'Analytics view for quotation rejection reasons';

-- View: Operational cost rejection analytics
CREATE OR REPLACE VIEW public.vw_operational_cost_rejection_analytics AS
SELECT
    ocrr.reason_type,
    COUNT(*) as count,
    ROUND(COUNT(*)::NUMERIC / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 2) as percentage,
    AVG(ocrr.suggested_amount) as avg_suggested_amount,
    DATE_TRUNC('month', ocrr.created_at) as month
FROM public.operational_cost_rejection_reasons ocrr
GROUP BY ocrr.reason_type, DATE_TRUNC('month', ocrr.created_at);

COMMENT ON VIEW public.vw_operational_cost_rejection_analytics IS 'Analytics view for operational cost rejection reasons';

-- ============================================
-- 10. GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON public.quotation_rejection_reasons TO authenticated;
GRANT INSERT ON public.quotation_rejection_reasons TO authenticated;
GRANT SELECT ON public.operational_cost_rejection_reasons TO authenticated;
GRANT INSERT ON public.operational_cost_rejection_reasons TO authenticated;

GRANT SELECT ON public.vw_quotation_rejection_analytics TO authenticated;
GRANT SELECT ON public.vw_operational_cost_rejection_analytics TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_reject_quotation_with_reason(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reject_operational_cost_with_reason(UUID, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_quotation_status_validated(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_force_sync_quotation(UUID) TO authenticated;
