-- ============================================
-- Migration: 101_fix_opportunity_lookup_by_account.sql
--
-- PURPOSE: Fix fn_resolve_or_create_opportunity to find EXISTING opportunity
-- by account_id BEFORE creating a new one.
--
-- ROOT CAUSE: The function only checked quotation.opportunity_id and
-- lead.opportunity_id, but did NOT check if an opportunity already exists
-- for the lead's account. This caused duplicate opportunities to be created.
--
-- FIX: Add step to find existing opportunity by account_id before creating.
--
-- IDEMPOTENCY: Safe to re-run (CREATE OR REPLACE)
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_resolve_or_create_opportunity(
    p_quotation_id UUID,
    p_actor_user_id UUID
)
RETURNS TABLE (
    opportunity_id TEXT,
    opportunity_stage opportunity_stage,
    was_created BOOLEAN,
    source TEXT
) AS $$
DECLARE
    v_quotation RECORD;
    v_lead RECORD;
    v_opportunity RECORD;
    v_existing_opp RECORD;
    v_new_opp_id TEXT;
    v_was_created BOOLEAN := FALSE;
    v_source TEXT := NULL;
BEGIN
    -- Get quotation with lead info
    SELECT
        cq.id AS quotation_id,
        cq.opportunity_id AS cq_opportunity_id,
        cq.lead_id AS cq_lead_id,
        cq.total_selling_rate AS cq_total_selling_rate,
        cq.created_by AS cq_created_by,
        l.lead_id AS lead_lead_id,
        l.opportunity_id AS lead_opportunity_id,
        l.account_id AS lead_account_id,
        l.company_name AS lead_company_name,
        l.potential_revenue AS lead_potential_revenue,
        l.sales_owner_user_id AS lead_sales_owner
    INTO v_quotation
    FROM public.customer_quotations cq
    LEFT JOIN public.leads l ON l.lead_id = cq.lead_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN;
    END IF;

    -- ============================================
    -- STEP 1: Try direct opportunity lookup from quotation
    -- ============================================
    IF v_quotation.cq_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_quotation.cq_opportunity_id;

        IF v_opportunity IS NOT NULL THEN
            RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, FALSE, 'quotation'::TEXT;
            RETURN;
        END IF;
        v_source := 'quotation_missing';
    END IF;

    -- ============================================
    -- STEP 2: Try lead's opportunity_id
    -- ============================================
    IF v_quotation.lead_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_quotation.lead_opportunity_id;

        IF v_opportunity IS NOT NULL THEN
            -- Update quotation with correct opportunity_id
            UPDATE public.customer_quotations cq_upd
            SET opportunity_id = v_quotation.lead_opportunity_id
            WHERE cq_upd.id = p_quotation_id;

            RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, FALSE, 'lead'::TEXT;
            RETURN;
        END IF;
        v_source := 'lead_missing';
    END IF;

    -- ============================================
    -- STEP 3 (NEW): Find EXISTING opportunity by account_id
    -- Only look for opportunities that are NOT closed (still active)
    -- Prefer the most recently updated one
    -- ============================================
    IF v_quotation.lead_account_id IS NOT NULL THEN
        SELECT opp.* INTO v_existing_opp
        FROM public.opportunities opp
        WHERE opp.account_id = v_quotation.lead_account_id
        AND opp.stage NOT IN ('Closed Won', 'Closed Lost')
        ORDER BY opp.updated_at DESC
        LIMIT 1;

        IF v_existing_opp IS NOT NULL THEN
            -- Found existing opportunity for this account!
            -- Update quotation with this opportunity_id
            UPDATE public.customer_quotations cq_upd
            SET opportunity_id = v_existing_opp.opportunity_id
            WHERE cq_upd.id = p_quotation_id;

            -- Also update lead if it doesn't have opportunity_id set
            IF v_quotation.lead_lead_id IS NOT NULL THEN
                UPDATE public.leads ld
                SET opportunity_id = v_existing_opp.opportunity_id, updated_at = NOW()
                WHERE ld.lead_id = v_quotation.lead_lead_id
                AND ld.opportunity_id IS NULL;
            END IF;

            RETURN QUERY SELECT v_existing_opp.opportunity_id, v_existing_opp.stage, FALSE, 'account_existing'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- ============================================
    -- STEP 4: No existing opportunity found - create new one
    -- Only if lead has account but no opportunity exists
    -- ============================================
    IF v_quotation.lead_account_id IS NOT NULL AND v_quotation.lead_lead_id IS NOT NULL THEN
        -- Generate opportunity ID
        v_new_opp_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6));

        -- Create the opportunity
        INSERT INTO public.opportunities (
            opportunity_id,
            name,
            account_id,
            source_lead_id,
            stage,
            estimated_value,
            currency,
            probability,
            owner_user_id,
            created_by,
            next_step,
            next_step_due_date
        ) VALUES (
            v_new_opp_id,
            'Pipeline - ' || COALESCE(v_quotation.lead_company_name, 'Auto-created'),
            v_quotation.lead_account_id,
            v_quotation.lead_lead_id,
            'Prospecting'::opportunity_stage,
            COALESCE(v_quotation.lead_potential_revenue, v_quotation.cq_total_selling_rate, 0),
            'IDR',
            10, -- Prospecting probability
            COALESCE(v_quotation.lead_sales_owner, p_actor_user_id),
            p_actor_user_id,
            'Initial Contact',
            (CURRENT_DATE + INTERVAL '3 days')::DATE
        )
        RETURNING * INTO v_opportunity;

        -- Update lead with new opportunity_id
        UPDATE public.leads ld
        SET opportunity_id = v_new_opp_id, updated_at = NOW()
        WHERE ld.lead_id = v_quotation.lead_lead_id
        AND ld.opportunity_id IS NULL;

        -- Update quotation with new opportunity_id
        UPDATE public.customer_quotations cq_upd
        SET opportunity_id = v_new_opp_id
        WHERE cq_upd.id = p_quotation_id;

        v_was_created := TRUE;
        RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, TRUE, 'auto_created'::TEXT;
        RETURN;
    END IF;

    -- No opportunity could be found or created
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_resolve_or_create_opportunity IS
'Resolves opportunity for quotation with proper lookup chain:
1. Try quotation.opportunity_id (direct link)
2. Try lead.opportunity_id (via lead)
3. Find existing opportunity by account_id (NEW - prevents duplicates)
4. Only auto-create if no existing opportunity found for the account';

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.fn_resolve_or_create_opportunity(UUID, UUID) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- Fixed: fn_resolve_or_create_opportunity now properly finds existing
-- opportunities by account_id BEFORE creating a new one.
--
-- This prevents the bug where sending a quotation from an opportunity
-- that exists would create a DUPLICATE opportunity instead of updating
-- the existing one.
-- ============================================
