-- ============================================
-- Migration: 053_lead_opportunity_quotation_integration.sql
-- Integration between Leads, Opportunities (Pipeline), Tickets, and Customer Quotations
--
-- Features:
-- 1. Direct quotation creation from leads (marketing flow)
-- 2. Direct quotation creation from pipeline/opportunities (sales flow)
-- 3. Bidirectional sync between quotation status and lead/opportunity
-- 4. Quotation sequence tracking (1st, 2nd, etc.)
-- 5. Request adjustment flow for recreate quotation
-- ============================================

-- ============================================
-- ADD NEW COLUMNS TO CUSTOMER_QUOTATIONS
-- ============================================

-- Add lead_id for direct quotation from lead (marketing flow)
ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS lead_id TEXT REFERENCES public.leads(lead_id) ON DELETE SET NULL;

-- Add opportunity_id for direct quotation from pipeline (sales flow)
ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS opportunity_id TEXT REFERENCES public.opportunities(opportunity_id) ON DELETE SET NULL;

-- Add sequence number to track "1st quotation", "2nd quotation", etc.
ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS sequence_number INTEGER DEFAULT 1;

-- Add source to track where quotation was created from
ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'ticket';
-- Values: 'ticket', 'lead', 'opportunity'

-- Make ticket_id optional (can be NULL if created from lead/opportunity without ticket)
ALTER TABLE public.customer_quotations
ALTER COLUMN ticket_id DROP NOT NULL;

-- ============================================
-- ADD QUOTATION TRACKING TO LEADS
-- ============================================

-- Add quotation tracking fields to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS quotation_status VARCHAR(50) DEFAULT NULL;
-- Values: NULL, 'draft', 'sent', 'accepted', 'rejected'

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS latest_quotation_id UUID REFERENCES public.customer_quotations(id) ON DELETE SET NULL;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS quotation_count INTEGER DEFAULT 0;

-- ============================================
-- ADD QUOTATION TRACKING TO OPPORTUNITIES
-- ============================================

-- Add quotation tracking fields to opportunities table
ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS quotation_status VARCHAR(50) DEFAULT NULL;
-- Values: NULL, 'draft', 'sent', 'accepted', 'rejected'

ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS latest_quotation_id UUID REFERENCES public.customer_quotations(id) ON DELETE SET NULL;

ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS quotation_count INTEGER DEFAULT 0;

-- ============================================
-- CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_customer_quotations_lead_id ON public.customer_quotations(lead_id);
CREATE INDEX IF NOT EXISTS idx_customer_quotations_opportunity_id ON public.customer_quotations(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_customer_quotations_source_type ON public.customer_quotations(source_type);
CREATE INDEX IF NOT EXISTS idx_leads_quotation_status ON public.leads(quotation_status);
CREATE INDEX IF NOT EXISTS idx_opportunities_quotation_status ON public.opportunities(quotation_status);

-- ============================================
-- FUNCTION: Calculate next sequence number for quotation
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
-- FUNCTION: Sync quotation status to lead
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_quotation_to_lead(
    p_quotation_id UUID,
    p_new_status TEXT,
    p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_lead RECORD;
BEGIN
    -- Get quotation with lead info
    SELECT cq.*, l.lead_id, l.triage_status
    INTO v_quotation
    FROM public.customer_quotations cq
    LEFT JOIN public.leads l ON l.lead_id = cq.lead_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Only sync if quotation has a lead_id
    IF v_quotation.lead_id IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'synced', FALSE, 'message', 'No lead linked');
    END IF;

    -- Update lead with quotation status
    UPDATE public.leads
    SET
        quotation_status = p_new_status,
        latest_quotation_id = p_quotation_id,
        updated_at = NOW()
    WHERE lead_id = v_quotation.lead_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'synced', TRUE,
        'lead_id', v_quotation.lead_id,
        'quotation_status', p_new_status
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Sync quotation status to opportunity
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
    SELECT cq.*, o.opportunity_id, o.stage
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
            -- When quotation is accepted, opportunity ready for Closed Won
            -- Don't auto-close, let user confirm
            NULL;

        ELSE
            -- No stage change for other statuses
            NULL;
    END CASE;

    RETURN jsonb_build_object(
        'success', TRUE,
        'synced', TRUE,
        'opportunity_id', v_quotation.opportunity_id,
        'quotation_status', p_new_status,
        'stage_changed_to', v_new_stage
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Sync opportunity stage to quotation
-- Called when opportunity is marked won/lost
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_opportunity_to_quotation(
    p_opportunity_id TEXT,
    p_outcome TEXT -- 'won' or 'lost'
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_new_status TEXT;
    v_updated_count INTEGER := 0;
BEGIN
    -- Determine new quotation status based on outcome
    IF p_outcome = 'won' THEN
        v_new_status := 'accepted';
    ELSIF p_outcome = 'lost' THEN
        v_new_status := 'rejected';
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid outcome: ' || p_outcome);
    END IF;

    -- Update all active quotations for this opportunity
    UPDATE public.customer_quotations
    SET
        status = v_new_status,
        updated_at = NOW()
    WHERE opportunity_id = p_opportunity_id
    AND status IN ('sent', 'draft');

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Update opportunity quotation_status
    UPDATE public.opportunities
    SET
        quotation_status = v_new_status,
        updated_at = NOW()
    WHERE opportunity_id = p_opportunity_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'updated_count', v_updated_count,
        'new_status', v_new_status
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Create quotation from lead
-- ============================================

CREATE OR REPLACE FUNCTION public.create_quotation_from_lead(
    p_lead_id TEXT,
    p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_lead RECORD;
    v_quotation_id UUID;
    v_quotation_number TEXT;
    v_seq INTEGER;
BEGIN
    -- Get lead info
    SELECT l.*, sd.*
    INTO v_lead
    FROM public.leads l
    LEFT JOIN public.lead_shipment_details sd ON sd.lead_id = l.lead_id
    WHERE l.lead_id = p_lead_id;

    IF v_lead IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Lead not found');
    END IF;

    -- Check lead status - must be Qualified or higher
    IF v_lead.triage_status NOT IN ('Qualified', 'Handed Over', 'Assigned to Sales') THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Lead must be qualified first');
    END IF;

    -- Get sequence number
    v_seq := public.get_next_quotation_sequence(NULL, p_lead_id, NULL);

    -- Generate quotation number
    SELECT 'QUO-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 12) AS INTEGER)), 0) + 1)::TEXT, 4, '0')
    INTO v_quotation_number
    FROM public.customer_quotations
    WHERE quotation_number LIKE 'QUO-' || TO_CHAR(NOW(), 'YYYYMM') || '-%';

    -- Create quotation
    INSERT INTO public.customer_quotations (
        lead_id,
        source_type,
        sequence_number,
        quotation_number,
        customer_name,
        customer_company,
        customer_email,
        customer_phone,
        service_type,
        fleet_type,
        fleet_quantity,
        incoterm,
        commodity,
        cargo_description,
        cargo_weight,
        cargo_volume,
        origin_address,
        origin_city,
        origin_country,
        destination_address,
        destination_city,
        destination_country,
        status,
        created_by
    ) VALUES (
        p_lead_id,
        'lead',
        v_seq,
        v_quotation_number,
        v_lead.contact_name,
        v_lead.company_name,
        v_lead.contact_email,
        v_lead.contact_phone,
        v_lead.service_type_code,
        v_lead.fleet_type,
        v_lead.fleet_quantity,
        v_lead.incoterm,
        v_lead.cargo_category,
        v_lead.cargo_description,
        v_lead.weight_total_kg,
        v_lead.volume_total_cbm,
        v_lead.origin_address,
        v_lead.origin_city,
        v_lead.origin_country,
        v_lead.destination_address,
        v_lead.destination_city,
        v_lead.destination_country,
        'draft',
        p_created_by
    )
    RETURNING id INTO v_quotation_id;

    -- Update lead with quotation info
    UPDATE public.leads
    SET
        quotation_status = 'draft',
        latest_quotation_id = v_quotation_id,
        quotation_count = v_seq,
        updated_at = NOW()
    WHERE lead_id = p_lead_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation_id,
        'quotation_number', v_quotation_number,
        'sequence_number', v_seq
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Create quotation from opportunity
-- ============================================

CREATE OR REPLACE FUNCTION public.create_quotation_from_opportunity(
    p_opportunity_id TEXT,
    p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_opportunity RECORD;
    v_account RECORD;
    v_quotation_id UUID;
    v_quotation_number TEXT;
    v_seq INTEGER;
BEGIN
    -- Get opportunity with account info
    SELECT o.*, a.*
    INTO v_opportunity
    FROM public.opportunities o
    LEFT JOIN public.accounts a ON a.account_id = o.account_id
    WHERE o.opportunity_id = p_opportunity_id;

    IF v_opportunity IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Opportunity not found');
    END IF;

    -- Get sequence number
    v_seq := public.get_next_quotation_sequence(NULL, NULL, p_opportunity_id);

    -- Generate quotation number
    SELECT 'QUO-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 12) AS INTEGER)), 0) + 1)::TEXT, 4, '0')
    INTO v_quotation_number
    FROM public.customer_quotations
    WHERE quotation_number LIKE 'QUO-' || TO_CHAR(NOW(), 'YYYYMM') || '-%';

    -- Create quotation
    INSERT INTO public.customer_quotations (
        opportunity_id,
        source_type,
        sequence_number,
        quotation_number,
        customer_name,
        customer_company,
        customer_email,
        customer_phone,
        customer_address,
        status,
        created_by
    ) VALUES (
        p_opportunity_id,
        'opportunity',
        v_seq,
        v_quotation_number,
        v_opportunity.pic_name,
        v_opportunity.company_name,
        v_opportunity.pic_email,
        v_opportunity.pic_phone,
        v_opportunity.address,
        'draft',
        p_created_by
    )
    RETURNING id INTO v_quotation_id;

    -- Update opportunity with quotation info
    UPDATE public.opportunities
    SET
        quotation_status = 'draft',
        latest_quotation_id = v_quotation_id,
        quotation_count = v_seq,
        updated_at = NOW()
    WHERE opportunity_id = p_opportunity_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation_id,
        'quotation_number', v_quotation_number,
        'sequence_number', v_seq
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Request adjustment (recreate quotation)
-- Triggers adjustment in linked ticket if exists
-- ============================================

CREATE OR REPLACE FUNCTION public.request_quotation_adjustment(
    p_quotation_id UUID,
    p_actor_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_new_quotation_id UUID;
    v_new_quotation_number TEXT;
    v_seq INTEGER;
    v_ticket_result JSONB;
BEGIN
    -- Get quotation info
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- If there's a linked ticket, trigger request adjustment
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT public.rpc_ticket_request_adjustment(v_quotation.ticket_id, 'Rate adjustment requested - creating new quotation')
        INTO v_ticket_result;
    END IF;

    -- If opportunity linked, move to Negotiation stage
    IF v_quotation.opportunity_id IS NOT NULL THEN
        UPDATE public.opportunities
        SET
            stage = 'Negotiation',
            quotation_status = 'rejected',
            updated_at = NOW()
        WHERE opportunity_id = v_quotation.opportunity_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', p_quotation_id,
        'ticket_adjustment_result', v_ticket_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE EXISTING SYNC FUNCTION
-- Include lead and opportunity sync
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_quotation_to_all(
    p_quotation_id UUID,
    p_new_status TEXT,
    p_actor_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_ticket_result JSONB;
    v_lead_result JSONB;
    v_opportunity_result JSONB;
BEGIN
    -- Get quotation
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Sync to ticket if linked
    IF v_quotation.ticket_id IS NOT NULL THEN
        v_ticket_result := public.sync_quotation_to_ticket(p_quotation_id, p_new_status, p_actor_user_id);
    END IF;

    -- Sync to lead if linked
    IF v_quotation.lead_id IS NOT NULL THEN
        v_lead_result := public.sync_quotation_to_lead(p_quotation_id, p_new_status, p_actor_user_id);
    END IF;

    -- Sync to opportunity if linked
    IF v_quotation.opportunity_id IS NOT NULL THEN
        v_opportunity_result := public.sync_quotation_to_opportunity(p_quotation_id, p_new_status, p_actor_user_id);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', p_quotation_id,
        'new_status', p_new_status,
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
-- FUNCTION: Get quotation history for lead/opportunity
-- ============================================

CREATE OR REPLACE FUNCTION public.get_quotation_history(
    p_lead_id TEXT DEFAULT NULL,
    p_opportunity_id TEXT DEFAULT NULL,
    p_ticket_id UUID DEFAULT NULL
)
RETURNS TABLE (
    quotation_id UUID,
    quotation_number VARCHAR,
    sequence_number INTEGER,
    status VARCHAR,
    total_selling_rate DECIMAL,
    currency VARCHAR,
    created_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    source_type VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cq.id,
        cq.quotation_number,
        cq.sequence_number,
        cq.status::VARCHAR,
        cq.total_selling_rate,
        cq.currency,
        cq.created_at,
        cq.sent_at,
        cq.source_type
    FROM public.customer_quotations cq
    WHERE
        (p_lead_id IS NOT NULL AND cq.lead_id = p_lead_id)
        OR (p_opportunity_id IS NOT NULL AND cq.opportunity_id = p_opportunity_id)
        OR (p_ticket_id IS NOT NULL AND cq.ticket_id = p_ticket_id)
    ORDER BY cq.sequence_number DESC, cq.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_next_quotation_sequence(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_quotation_to_lead(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_quotation_to_opportunity(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_opportunity_to_quotation(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation_from_lead(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation_from_opportunity(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_quotation_adjustment(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_quotation_to_all(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quotation_history(TEXT, TEXT, UUID) TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN public.customer_quotations.lead_id IS 'Reference to lead for quotations created from marketing flow';
COMMENT ON COLUMN public.customer_quotations.opportunity_id IS 'Reference to opportunity for quotations created from sales pipeline';
COMMENT ON COLUMN public.customer_quotations.sequence_number IS 'Sequence number for this source (1st quotation, 2nd quotation, etc.)';
COMMENT ON COLUMN public.customer_quotations.source_type IS 'Where the quotation was created from: ticket, lead, or opportunity';
COMMENT ON COLUMN public.leads.quotation_status IS 'Current status of latest quotation for this lead';
COMMENT ON COLUMN public.leads.quotation_count IS 'Number of quotations created for this lead';
COMMENT ON COLUMN public.opportunities.quotation_status IS 'Current status of latest quotation for this opportunity';
COMMENT ON COLUMN public.opportunities.quotation_count IS 'Number of quotations created for this opportunity';
