-- ============================================
-- Migration: 065_fix_pipeline_auto_close_and_deal_value.sql
--
-- Fixes:
-- 1. Auto-update pipeline to "Closed Won" when quotation is accepted
-- 2. Add deal_value field to opportunities for actual deal amount
-- 3. Update sync function to set deal_value from accepted quotation
-- 4. Allow account owners to see tickets for their accounts in CRM
-- ============================================

-- ============================================
-- 1. Add deal_value column to opportunities
-- ============================================

-- Add deal_value column (actual deal amount from accepted quotation)
ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS deal_value DECIMAL(15, 2) DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN public.opportunities.deal_value IS 'Actual deal value from accepted quotation (vs estimated_value which is the initial estimate)';

-- ============================================
-- 2. Update sync_quotation_to_opportunity to auto-close on acceptance
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_quotation_to_opportunity(
    p_quotation_id UUID,
    p_new_status TEXT,
    p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_new_stage TEXT;
BEGIN
    -- Get quotation with opportunity info
    SELECT cq.*, cq.total_selling_rate as quotation_amount, o.opportunity_id, o.stage
    INTO v_quotation
    FROM public.customer_quotations cq
    LEFT JOIN public.opportunities o ON o.opportunity_id = cq.opportunity_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Only sync if quotation has an opportunity_id
    IF v_quotation.opportunity_id IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'synced', FALSE, 'message', 'No opportunity linked');
    END IF;

    -- Update opportunity with quotation status
    UPDATE public.opportunities
    SET
        quotation_status = p_new_status,
        latest_quotation_id = p_quotation_id,
        updated_at = NOW()
    WHERE opportunity_id = v_quotation.opportunity_id;

    -- Auto-transition opportunity stage based on quotation status
    CASE p_new_status
        WHEN 'sent' THEN
            -- When quotation is sent, move to Quote Sent if not already past it
            IF v_quotation.stage IN ('Prospecting', 'Discovery') THEN
                UPDATE public.opportunities
                SET stage = 'Quote Sent', updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;
                v_new_stage := 'Quote Sent';
            END IF;

        WHEN 'rejected' THEN
            -- When quotation is rejected, move to Negotiation for renegotiation
            IF v_quotation.stage = 'Quote Sent' THEN
                UPDATE public.opportunities
                SET stage = 'Negotiation', updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;
                v_new_stage := 'Negotiation';
            END IF;

        WHEN 'accepted' THEN
            -- When quotation is accepted, auto-close as Won and set deal_value
            IF v_quotation.stage NOT IN ('Closed Won', 'Closed Lost') THEN
                UPDATE public.opportunities
                SET
                    stage = 'Closed Won',
                    deal_value = v_quotation.quotation_amount,
                    closed_at = NOW(),
                    updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id;
                v_new_stage := 'Closed Won';

                -- Create stage history entry
                INSERT INTO public.opportunity_stage_history (
                    opportunity_id,
                    old_stage,
                    new_stage,
                    changed_by,
                    notes
                ) VALUES (
                    v_quotation.opportunity_id,
                    v_quotation.stage,
                    'Closed Won',
                    p_actor_user_id,
                    'Auto-closed: Customer quotation accepted'
                );
            END IF;

        ELSE
            NULL;
    END CASE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'synced', TRUE,
        'opportunity_id', v_quotation.opportunity_id,
        'quotation_status', p_new_status,
        'new_stage', v_new_stage,
        'deal_value', v_quotation.quotation_amount
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Update sync_quotation_to_all to handle deal_value for propagated opportunities
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_quotation_to_all(
    p_quotation_id UUID,
    p_new_status TEXT,
    p_actor_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_ticket RECORD;
    v_ticket_result JSONB;
    v_lead_result JSONB;
    v_opportunity_result JSONB;
    v_cost_result JSONB;
    v_propagated_lead_id TEXT;
    v_propagated_opportunity_id TEXT;
BEGIN
    -- Get quotation with all relations
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Sync to operational cost (explicit sync, not relying on trigger)
    v_cost_result := public.sync_quotation_to_operational_cost(p_quotation_id, p_new_status);

    -- Sync to ticket if directly linked
    IF v_quotation.ticket_id IS NOT NULL THEN
        v_ticket_result := public.sync_quotation_to_ticket(p_quotation_id, p_new_status, p_actor_user_id);

        -- Also get ticket's lead/opportunity links for propagation
        SELECT lead_id, opportunity_id INTO v_propagated_lead_id, v_propagated_opportunity_id
        FROM public.tickets
        WHERE id = v_quotation.ticket_id;
    END IF;

    -- Sync to lead if directly linked OR via ticket
    IF v_quotation.lead_id IS NOT NULL THEN
        v_lead_result := public.sync_quotation_to_lead(p_quotation_id, p_new_status, p_actor_user_id);
    ELSIF v_propagated_lead_id IS NOT NULL THEN
        -- Update lead quotation status via propagation from ticket
        UPDATE public.leads
        SET
            quotation_status = p_new_status,
            updated_at = NOW()
        WHERE lead_id = v_propagated_lead_id;
        v_lead_result := jsonb_build_object('success', TRUE, 'synced', TRUE, 'lead_id', v_propagated_lead_id, 'propagated', TRUE);
    END IF;

    -- Sync to opportunity if directly linked OR via ticket
    IF v_quotation.opportunity_id IS NOT NULL THEN
        v_opportunity_result := public.sync_quotation_to_opportunity(p_quotation_id, p_new_status, p_actor_user_id);
    ELSIF v_propagated_opportunity_id IS NOT NULL THEN
        -- Update opportunity quotation status via propagation from ticket
        UPDATE public.opportunities
        SET
            quotation_status = p_new_status,
            updated_at = NOW()
        WHERE opportunity_id = v_propagated_opportunity_id;

        -- Auto-transition opportunity stage for propagated updates
        IF p_new_status = 'sent' THEN
            UPDATE public.opportunities
            SET stage = 'Quote Sent', updated_at = NOW()
            WHERE opportunity_id = v_propagated_opportunity_id
            AND stage IN ('Prospecting', 'Discovery');
        ELSIF p_new_status = 'rejected' THEN
            UPDATE public.opportunities
            SET stage = 'Negotiation', updated_at = NOW()
            WHERE opportunity_id = v_propagated_opportunity_id
            AND stage = 'Quote Sent';
        ELSIF p_new_status = 'accepted' THEN
            -- Auto-close as Won and set deal_value for propagated opportunities
            UPDATE public.opportunities
            SET
                stage = 'Closed Won',
                deal_value = v_quotation.total_selling_rate,
                closed_at = NOW(),
                updated_at = NOW()
            WHERE opportunity_id = v_propagated_opportunity_id
            AND stage NOT IN ('Closed Won', 'Closed Lost');

            -- Create stage history entry for propagated close
            INSERT INTO public.opportunity_stage_history (
                opportunity_id,
                old_stage,
                new_stage,
                changed_by,
                notes
            )
            SELECT
                opportunity_id,
                stage,
                'Closed Won',
                p_actor_user_id,
                'Auto-closed: Customer quotation accepted (propagated from ticket)'
            FROM public.opportunities
            WHERE opportunity_id = v_propagated_opportunity_id
            AND stage = 'Closed Won';
        END IF;

        v_opportunity_result := jsonb_build_object('success', TRUE, 'synced', TRUE, 'opportunity_id', v_propagated_opportunity_id, 'propagated', TRUE);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', p_quotation_id,
        'new_status', p_new_status,
        'operational_cost_sync', v_cost_result,
        'ticket_sync', v_ticket_result,
        'lead_sync', v_lead_result,
        'opportunity_sync', v_opportunity_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Update tickets RLS policy to allow account owners to see their account's tickets
-- ============================================

-- Drop and recreate tickets select policy to include account owners
DROP POLICY IF EXISTS "tickets_select_policy" ON public.tickets;
CREATE POLICY "tickets_select_policy" ON public.tickets
    FOR SELECT
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (
            -- Admin sees all
            public.is_ticketing_admin(auth.uid())
            -- Ops sees their department
            OR public.is_ticketing_ops(auth.uid())
            -- Creator sees own tickets
            OR created_by = auth.uid()
            -- Assignee sees assigned tickets
            OR assigned_to = auth.uid()
            -- Account owner can see tickets for their accounts (for CRM integration)
            OR account_id IN (
                SELECT account_id FROM public.accounts
                WHERE owner_user_id = auth.uid()
            )
        )
    );

-- ============================================
-- 5. Update pipeline view to include deal_value
-- ============================================

-- Update the pipeline detail view to include deal_value
DROP VIEW IF EXISTS public.vw_pipeline_detail;
CREATE OR REPLACE VIEW public.vw_pipeline_detail AS
SELECT
    o.opportunity_id,
    o.name,
    o.stage,
    o.estimated_value,
    o.deal_value,
    o.currency,
    o.probability,
    o.next_step_due_date as expected_close_date,
    o.next_step,
    o.next_step_due_date,
    o.outcome as close_reason,
    o.lost_reason,
    o.competitor_price,
    o.customer_budget,
    o.closed_at,
    o.description as notes,
    o.created_at,
    o.updated_at,
    o.quotation_status,
    o.latest_quotation_id,
    -- Company info
    a.account_id,
    a.company_name,
    a.industry,
    a.address,
    a.city,
    a.account_status,
    -- PIC info
    a.pic_name,
    a.pic_email,
    a.pic_phone,
    -- Lead info
    o.source_lead_id as lead_id,
    l.potential_revenue,
    l.source AS lead_source,
    creator.name as lead_creator_name,
    creator.department as lead_creator_department,
    -- Owner info
    o.owner_user_id,
    owner.name as owner_name,
    owner.email as owner_email,
    owner.department as owner_department
FROM public.opportunities o
LEFT JOIN public.accounts a ON o.account_id = a.account_id
LEFT JOIN public.leads l ON o.source_lead_id = l.lead_id
LEFT JOIN public.profiles creator ON l.created_by = creator.user_id
LEFT JOIN public.profiles owner ON o.owner_user_id = owner.user_id;

-- Grant access
GRANT SELECT ON public.vw_pipeline_detail TO authenticated;

-- ============================================
-- 6. Update accounts detail view to include deal_value in pipeline total
-- ============================================

-- Create or replace function to get account pipeline summary
CREATE OR REPLACE FUNCTION public.get_account_pipeline_summary(p_account_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_estimated_value', COALESCE(SUM(estimated_value), 0),
        'total_deal_value', COALESCE(SUM(deal_value), 0),
        'open_opportunities', COUNT(*) FILTER (WHERE stage NOT IN ('Closed Won', 'Closed Lost')),
        'won_opportunities', COUNT(*) FILTER (WHERE stage = 'Closed Won'),
        'lost_opportunities', COUNT(*) FILTER (WHERE stage = 'Closed Lost')
    )
    INTO v_result
    FROM public.opportunities
    WHERE account_id = p_account_id;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_account_pipeline_summary(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_account_pipeline_summary IS 'Returns pipeline summary for an account including estimated and deal values';

-- ============================================
-- 7. Add index for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_opportunities_deal_value ON public.opportunities(deal_value) WHERE deal_value IS NOT NULL;

-- ============================================
-- 8. Update v_pipeline_with_updates view to include deal_value
-- ============================================

DROP VIEW IF EXISTS v_pipeline_with_updates CASCADE;

CREATE VIEW v_pipeline_with_updates AS
SELECT
  o.opportunity_id,
  o.name,
  o.account_id,
  o.source_lead_id,
  o.stage,
  o.estimated_value,
  o.deal_value,
  o.currency,
  o.probability,
  o.next_step,
  o.next_step_due_date,
  o.owner_user_id,
  o.created_by,
  o.created_at,
  o.updated_at,
  o.closed_at,
  o.outcome,
  o.lost_reason,
  o.competitor,
  o.attempt_number,
  -- Additional columns for Opportunity tab
  o.competitor_price,
  o.customer_budget,
  -- Use original_creator_id if set, otherwise fall back to lead.created_by
  COALESCE(o.original_creator_id, l.created_by) AS original_creator_id,
  a.company_name AS account_name,
  a.pic_name AS account_pic_name,
  a.pic_email AS account_pic_email,
  a.pic_phone AS account_pic_phone,
  a.account_status,
  a.original_lead_id AS account_original_lead_id,
  a.original_creator_id AS account_original_creator_id,
  p.name AS owner_name,
  p.email AS owner_email,
  l.company_name AS lead_company_name,
  l.created_by AS lead_created_by,
  l.marketing_owner_user_id AS lead_marketing_owner,
  -- Lead source - using 'source' column from leads table
  l.source AS lead_source,
  -- Get creator info (fallback to lead creator if original_creator_id is NULL)
  COALESCE(creator.name, lead_creator.name) AS original_creator_name,
  -- Cast role enum to text to avoid type mismatch
  COALESCE(creator.role::text, lead_creator.role::text) AS original_creator_role,
  COALESCE(creator.department, lead_creator.department) AS original_creator_department,
  -- Check if original creator is marketing (with fallback)
  CASE
    WHEN COALESCE(creator.department, lead_creator.department) IS NOT NULL
         AND LOWER(COALESCE(creator.department, lead_creator.department)) LIKE '%marketing%' THEN TRUE
    WHEN COALESCE(creator.role::text, lead_creator.role::text) IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO') THEN TRUE
    ELSE FALSE
  END AS original_creator_is_marketing,
  (SELECT COUNT(*) FROM pipeline_updates pu WHERE pu.opportunity_id = o.opportunity_id) AS update_count,
  (SELECT MAX(pu.created_at) FROM pipeline_updates pu WHERE pu.opportunity_id = o.opportunity_id) AS last_update_at,
  -- is_overdue calculation
  CASE
    WHEN o.next_step_due_date < NOW() AND o.stage NOT IN ('Closed Won', 'Closed Lost') THEN TRUE
    ELSE FALSE
  END AS is_overdue
FROM opportunities o
LEFT JOIN accounts a ON o.account_id = a.account_id
LEFT JOIN profiles p ON o.owner_user_id = p.user_id
LEFT JOIN leads l ON o.source_lead_id = l.lead_id
LEFT JOIN profiles creator ON o.original_creator_id = creator.user_id
LEFT JOIN profiles lead_creator ON l.created_by = lead_creator.user_id;

-- Grant access
GRANT SELECT ON v_pipeline_with_updates TO authenticated;

COMMENT ON VIEW v_pipeline_with_updates IS 'Pipeline/opportunities with update counts, creator info, deal_value for Pipeline and Opportunity tabs';
