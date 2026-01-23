-- ============================================
-- Migration: 067_fix_quotation_creation_without_ticket.sql
-- Fix issues with creating quotations directly from pipeline/opportunities
-- without going through a ticket
--
-- Fixes:
-- 1. Add SECURITY DEFINER to generate_customer_quotation_number function
--    so it can always access the sequence table
-- 2. Update RLS SELECT policy to allow access to quotations linked
--    to opportunities or leads (not just tickets)
-- ============================================

-- ============================================
-- FIX 1: Add SECURITY DEFINER to generate_customer_quotation_number
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_customer_quotation_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year INTEGER;
    v_month INTEGER;
    v_seq INTEGER;
    v_number VARCHAR(50);
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    v_month := EXTRACT(MONTH FROM CURRENT_DATE);

    -- Get or create sequence
    INSERT INTO public.customer_quotation_sequences (year, month, last_sequence)
    VALUES (v_year, v_month, 1)
    ON CONFLICT (year, month)
    DO UPDATE SET last_sequence = customer_quotation_sequences.last_sequence + 1
    RETURNING last_sequence INTO v_seq;

    -- Format: QUO-YYYYMM-XXXX
    v_number := 'QUO-' || v_year::TEXT || LPAD(v_month::TEXT, 2, '0') || '-' || LPAD(v_seq::TEXT, 4, '0');

    RETURN v_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FIX 2: Update SELECT policy for customer_quotations
-- to allow access via opportunity_id or lead_id
-- ============================================

-- Drop the existing policy first
DROP POLICY IF EXISTS "customer_quotations_select" ON public.customer_quotations;

-- Recreate with support for opportunity and lead access
CREATE POLICY "customer_quotations_select" ON public.customer_quotations
    FOR SELECT TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (
            -- Creator can always see their quotations
            created_by = auth.uid()
            -- Ticketing admins can see all
            OR public.is_ticketing_admin(auth.uid())
            -- Access via linked ticket (original behavior)
            OR EXISTS (
                SELECT 1 FROM public.tickets t
                WHERE t.id = ticket_id
                AND (t.created_by = auth.uid() OR t.assigned_to = auth.uid())
            )
            -- Access via linked opportunity (for sales users)
            OR EXISTS (
                SELECT 1 FROM public.opportunities o
                WHERE o.opportunity_id = customer_quotations.opportunity_id
                AND o.owner_user_id = auth.uid()
            )
            -- Access via linked lead (for marketing/sales users who own the lead)
            OR EXISTS (
                SELECT 1 FROM public.leads l
                WHERE l.lead_id = customer_quotations.lead_id
                AND (l.created_by = auth.uid() OR l.assigned_sales_id = auth.uid())
            )
        )
    );

-- ============================================
-- FIX 3: Also add SECURITY DEFINER to get_next_quotation_sequence
-- for consistent behavior
-- ============================================

CREATE OR REPLACE FUNCTION public.get_next_quotation_sequence(
    p_ticket_id UUID DEFAULT NULL,
    p_lead_id TEXT DEFAULT NULL,
    p_opportunity_id TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_max_seq INTEGER;
BEGIN
    -- Get the maximum sequence number for this source
    SELECT COALESCE(MAX(sequence_number), 0) INTO v_max_seq
    FROM public.customer_quotations
    WHERE
        (p_ticket_id IS NOT NULL AND ticket_id = p_ticket_id)
        OR (p_lead_id IS NOT NULL AND lead_id = p_lead_id)
        OR (p_opportunity_id IS NOT NULL AND opportunity_id = p_opportunity_id);

    RETURN v_max_seq + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON FUNCTION public.generate_customer_quotation_number() IS 'Generates a unique quotation number in format QUO-YYYYMM-XXXX. Uses SECURITY DEFINER to bypass RLS on sequence table.';
COMMENT ON FUNCTION public.get_next_quotation_sequence(UUID, TEXT, TEXT) IS 'Returns the next sequence number for a quotation based on the source (ticket, lead, or opportunity). Uses SECURITY DEFINER to bypass RLS.';
