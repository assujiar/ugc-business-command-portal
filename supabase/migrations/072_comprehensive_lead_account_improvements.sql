-- ============================================
-- Migration: 072_comprehensive_lead_account_improvements.sql
--
-- COMPREHENSIVE IMPROVEMENTS FOR LEAD-TO-ACCOUNT FLOW
--
-- This migration builds upon 071 to address:
-- 1. Add missing foreign key constraints with proper ON DELETE behavior
-- 2. Add validation function for quotation source
-- 3. Create comprehensive view for quotation information with sequence labels
-- 4. Add helper functions for quotation sequence labels
-- 5. Add proper indexes for performance
-- 6. Create RPC for creating quotation from pipeline
-- 7. Fix any remaining enum inconsistencies
-- 8. Add reverse sync functions for opportunity → quotation
--
-- Flow: Lead → Pipeline/Opportunity ↔ Ticket ↔ Operational Cost ↔ Customer Quotation
-- ============================================

-- ============================================
-- PART 1: ADD MISSING FOREIGN KEY CONSTRAINTS
-- ============================================

-- Drop existing constraints if they exist to avoid conflicts
DO $$
BEGIN
    -- customer_quotations constraints
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customer_quotations_lead') THEN
        ALTER TABLE public.customer_quotations DROP CONSTRAINT fk_customer_quotations_lead;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_customer_quotations_opportunity') THEN
        ALTER TABLE public.customer_quotations DROP CONSTRAINT fk_customer_quotations_opportunity;
    END IF;

    -- tickets constraints
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_lead') THEN
        ALTER TABLE public.tickets DROP CONSTRAINT fk_tickets_lead;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tickets_opportunity') THEN
        ALTER TABLE public.tickets DROP CONSTRAINT fk_tickets_opportunity;
    END IF;

    -- ticket_rate_quotes constraints
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ticket_rate_quotes_lead') THEN
        ALTER TABLE public.ticket_rate_quotes DROP CONSTRAINT fk_ticket_rate_quotes_lead;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ticket_rate_quotes_opportunity') THEN
        ALTER TABLE public.ticket_rate_quotes DROP CONSTRAINT fk_ticket_rate_quotes_opportunity;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ticket_rate_quotes_customer_quotation') THEN
        ALTER TABLE public.ticket_rate_quotes DROP CONSTRAINT fk_ticket_rate_quotes_customer_quotation;
    END IF;
END $$;

-- Add foreign key constraints with ON DELETE SET NULL
-- This ensures referential integrity while allowing parent deletion

-- customer_quotations → leads
ALTER TABLE public.customer_quotations
    ADD CONSTRAINT fk_customer_quotations_lead
    FOREIGN KEY (lead_id) REFERENCES public.leads(lead_id)
    ON DELETE SET NULL;

-- customer_quotations → opportunities
ALTER TABLE public.customer_quotations
    ADD CONSTRAINT fk_customer_quotations_opportunity
    FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(opportunity_id)
    ON DELETE SET NULL;

-- tickets → leads
ALTER TABLE public.tickets
    ADD CONSTRAINT fk_tickets_lead
    FOREIGN KEY (lead_id) REFERENCES public.leads(lead_id)
    ON DELETE SET NULL;

-- tickets → opportunities
ALTER TABLE public.tickets
    ADD CONSTRAINT fk_tickets_opportunity
    FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(opportunity_id)
    ON DELETE SET NULL;

-- ticket_rate_quotes → leads
ALTER TABLE public.ticket_rate_quotes
    ADD CONSTRAINT fk_ticket_rate_quotes_lead
    FOREIGN KEY (lead_id) REFERENCES public.leads(lead_id)
    ON DELETE SET NULL;

-- ticket_rate_quotes → opportunities
ALTER TABLE public.ticket_rate_quotes
    ADD CONSTRAINT fk_ticket_rate_quotes_opportunity
    FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(opportunity_id)
    ON DELETE SET NULL;

-- ticket_rate_quotes → customer_quotations
ALTER TABLE public.ticket_rate_quotes
    ADD CONSTRAINT fk_ticket_rate_quotes_customer_quotation
    FOREIGN KEY (customer_quotation_id) REFERENCES public.customer_quotations(id)
    ON DELETE SET NULL;

-- ============================================
-- PART 2: ADD VALIDATION FUNCTION FOR QUOTATION SOURCE
-- ============================================

-- Function to validate quotation source consistency
CREATE OR REPLACE FUNCTION public.validate_quotation_source()
RETURNS TRIGGER AS $$
BEGIN
    -- If source_type is explicitly set, validate the corresponding ID
    IF NEW.source_type = 'ticket' AND NEW.ticket_id IS NULL THEN
        RAISE EXCEPTION 'source_type is ticket but ticket_id is null';
    END IF;

    IF NEW.source_type = 'lead' AND NEW.lead_id IS NULL THEN
        RAISE EXCEPTION 'source_type is lead but lead_id is null';
    END IF;

    IF NEW.source_type = 'opportunity' AND NEW.opportunity_id IS NULL THEN
        RAISE EXCEPTION 'source_type is opportunity but opportunity_id is null';
    END IF;

    -- Auto-determine source_type if not set
    IF NEW.source_type IS NULL OR NEW.source_type = '' THEN
        IF NEW.ticket_id IS NOT NULL THEN
            NEW.source_type := 'ticket';
        ELSIF NEW.opportunity_id IS NOT NULL THEN
            NEW.source_type := 'opportunity';
        ELSIF NEW.lead_id IS NOT NULL THEN
            NEW.source_type := 'lead';
        ELSE
            NEW.source_type := 'standalone';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_quotation_source ON public.customer_quotations;
CREATE TRIGGER trg_validate_quotation_source
    BEFORE INSERT OR UPDATE ON public.customer_quotations
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_quotation_source();

COMMENT ON FUNCTION public.validate_quotation_source IS
'Validates that quotation source_type matches the provided IDs.
Auto-determines source_type if not explicitly set.';

-- ============================================
-- PART 3: ADD QUOTATION SEQUENCE LABEL FUNCTION
-- ============================================

-- Function to get human-readable sequence label (First, Second, Third, etc.)
CREATE OR REPLACE FUNCTION public.get_quotation_sequence_label(p_sequence_number INTEGER)
RETURNS TEXT AS $$
DECLARE
    v_labels TEXT[] := ARRAY['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
BEGIN
    IF p_sequence_number IS NULL OR p_sequence_number < 1 THEN
        RETURN 'First';
    ELSIF p_sequence_number <= 10 THEN
        RETURN v_labels[p_sequence_number];
    ELSE
        RETURN p_sequence_number::TEXT || 'th';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_quotation_sequence_label IS
'Converts sequence number to human-readable label: 1→First, 2→Second, etc.';

-- Indonesian version
CREATE OR REPLACE FUNCTION public.get_quotation_sequence_label_id(p_sequence_number INTEGER)
RETURNS TEXT AS $$
DECLARE
    v_labels TEXT[] := ARRAY['Pertama', 'Kedua', 'Ketiga', 'Keempat', 'Kelima', 'Keenam', 'Ketujuh', 'Kedelapan', 'Kesembilan', 'Kesepuluh'];
BEGIN
    IF p_sequence_number IS NULL OR p_sequence_number < 1 THEN
        RETURN 'Pertama';
    ELSIF p_sequence_number <= 10 THEN
        RETURN v_labels[p_sequence_number];
    ELSE
        RETURN 'Ke-' || p_sequence_number::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.get_quotation_sequence_label_id IS
'Converts sequence number to Indonesian label: 1→Pertama, 2→Kedua, etc.';

-- ============================================
-- PART 4: CREATE COMPREHENSIVE QUOTATION VIEW
-- ============================================

-- Drop existing view if exists
DROP VIEW IF EXISTS public.v_customer_quotations_enriched;

-- Create enriched view with all related information
CREATE OR REPLACE VIEW public.v_customer_quotations_enriched AS
SELECT
    cq.id,
    cq.quotation_number,
    cq.sequence_number,
    public.get_quotation_sequence_label(cq.sequence_number) AS sequence_label,
    public.get_quotation_sequence_label_id(cq.sequence_number) AS sequence_label_id,
    cq.status,
    cq.source_type,
    cq.customer_name,
    cq.customer_company,
    cq.customer_email,
    cq.customer_phone,
    cq.customer_address,
    cq.service_type,
    cq.fleet_type,
    cq.fleet_quantity,
    cq.incoterm,
    cq.commodity,
    cq.cargo_description,
    cq.cargo_weight,
    cq.cargo_weight_unit,
    cq.cargo_volume,
    cq.cargo_volume_unit,
    cq.cargo_quantity,
    cq.cargo_quantity_unit,
    cq.estimated_leadtime,
    cq.estimated_cargo_value,
    cq.cargo_value_currency,
    cq.origin_address,
    cq.origin_city,
    cq.origin_country,
    cq.origin_port,
    cq.destination_address,
    cq.destination_city,
    cq.destination_country,
    cq.destination_port,
    cq.rate_structure,
    cq.total_cost,
    cq.target_margin_percent,
    cq.total_selling_rate,
    cq.currency,
    cq.scope_of_work,
    cq.terms_includes,
    cq.terms_excludes,
    cq.terms_notes,
    cq.validity_days,
    cq.valid_until,
    cq.sent_at,
    cq.sent_via,
    cq.pdf_url,
    cq.rejection_reason,
    cq.created_at,
    cq.updated_at,
    -- Ticket info
    cq.ticket_id,
    t.ticket_code,
    t.subject AS ticket_subject,
    t.status AS ticket_status,
    -- Lead info
    cq.lead_id,
    l.company_name AS lead_company_name,
    l.pic_name AS lead_pic_name,
    l.triage_status AS lead_status,
    -- Opportunity info
    cq.opportunity_id,
    o.name AS opportunity_name,
    o.stage AS opportunity_stage,
    o.estimated_value AS opportunity_value,
    o.account_id,
    -- Account info (from opportunity)
    a.company_name AS account_company_name,
    -- Operational cost info
    cq.operational_cost_id,
    oc.quote_number AS operational_cost_number,
    oc.amount AS operational_cost_amount,
    oc.status AS operational_cost_status,
    -- Creator info
    cq.created_by,
    p.name AS creator_name,
    p.email AS creator_email,
    -- Computed fields
    CASE
        WHEN cq.valid_until < CURRENT_DATE AND cq.status = 'sent' THEN TRUE
        ELSE FALSE
    END AS is_expired,
    CASE
        WHEN cq.status = 'draft' THEN 1
        WHEN cq.status = 'sent' THEN 2
        WHEN cq.status = 'accepted' THEN 3
        WHEN cq.status = 'rejected' THEN 4
        WHEN cq.status = 'expired' THEN 5
        WHEN cq.status = 'revoked' THEN 6
        ELSE 7
    END AS status_order
FROM public.customer_quotations cq
LEFT JOIN public.tickets t ON t.id = cq.ticket_id
LEFT JOIN public.leads l ON l.lead_id = cq.lead_id
LEFT JOIN public.opportunities o ON o.opportunity_id = cq.opportunity_id
LEFT JOIN public.accounts a ON a.account_id = o.account_id
LEFT JOIN public.ticket_rate_quotes oc ON oc.id = cq.operational_cost_id
LEFT JOIN public.profiles p ON p.user_id = cq.created_by;

COMMENT ON VIEW public.v_customer_quotations_enriched IS
'Enriched view of customer quotations with all related entity information,
sequence labels, and computed fields.';

-- ============================================
-- PART 5: ADD PERFORMANCE INDEXES
-- ============================================

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_customer_quotations_lead_id ON public.customer_quotations(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_quotations_opportunity_id ON public.customer_quotations(opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_quotations_ticket_id ON public.customer_quotations(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_quotations_status ON public.customer_quotations(status);
CREATE INDEX IF NOT EXISTS idx_customer_quotations_created_at ON public.customer_quotations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_quotations_source_type ON public.customer_quotations(source_type);

CREATE INDEX IF NOT EXISTS idx_tickets_lead_id ON public.tickets(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_opportunity_id ON public.tickets(opportunity_id) WHERE opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_lead_id ON public.ticket_rate_quotes(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_opportunity_id ON public.ticket_rate_quotes(opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_customer_quotation_id ON public.ticket_rate_quotes(customer_quotation_id) WHERE customer_quotation_id IS NOT NULL;

-- ============================================
-- PART 6: CREATE RPC FOR QUOTATION FROM PIPELINE
-- ============================================

-- RPC to create quotation from pipeline with automatic lead/opportunity resolution
CREATE OR REPLACE FUNCTION public.create_quotation_from_pipeline(
    p_opportunity_id TEXT,
    p_customer_name TEXT,
    p_customer_company TEXT DEFAULT NULL,
    p_customer_email TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_customer_address TEXT DEFAULT NULL,
    p_service_type TEXT DEFAULT NULL,
    p_incoterm TEXT DEFAULT NULL,
    p_fleet_type TEXT DEFAULT NULL,
    p_fleet_quantity INTEGER DEFAULT NULL,
    p_commodity TEXT DEFAULT NULL,
    p_cargo_description TEXT DEFAULT NULL,
    p_cargo_weight DECIMAL DEFAULT NULL,
    p_cargo_weight_unit TEXT DEFAULT 'kg',
    p_cargo_volume DECIMAL DEFAULT NULL,
    p_cargo_volume_unit TEXT DEFAULT 'cbm',
    p_cargo_quantity INTEGER DEFAULT NULL,
    p_cargo_quantity_unit TEXT DEFAULT NULL,
    p_origin_address TEXT DEFAULT NULL,
    p_origin_city TEXT DEFAULT NULL,
    p_origin_country TEXT DEFAULT NULL,
    p_origin_port TEXT DEFAULT NULL,
    p_destination_address TEXT DEFAULT NULL,
    p_destination_city TEXT DEFAULT NULL,
    p_destination_country TEXT DEFAULT NULL,
    p_destination_port TEXT DEFAULT NULL,
    p_rate_structure TEXT DEFAULT 'bundling',
    p_total_cost DECIMAL DEFAULT 0,
    p_target_margin_percent DECIMAL DEFAULT 0,
    p_total_selling_rate DECIMAL DEFAULT 0,
    p_currency TEXT DEFAULT 'IDR',
    p_scope_of_work TEXT DEFAULT NULL,
    p_terms_includes TEXT[] DEFAULT '{}',
    p_terms_excludes TEXT[] DEFAULT '{}',
    p_terms_notes TEXT DEFAULT NULL,
    p_validity_days INTEGER DEFAULT 14
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_opportunity RECORD;
    v_lead_id TEXT;
    v_quotation_number TEXT;
    v_sequence_number INTEGER;
    v_quotation_id UUID;
    v_valid_until DATE;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Not authenticated');
    END IF;

    -- Get opportunity with source_lead_id
    SELECT opportunity_id, name, source_lead_id, account_id
    INTO v_opportunity
    FROM public.opportunities
    WHERE opportunity_id = p_opportunity_id;

    IF v_opportunity IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Opportunity not found');
    END IF;

    -- Resolve lead_id from opportunity
    v_lead_id := v_opportunity.source_lead_id;

    -- Generate quotation number
    SELECT public.generate_customer_quotation_number() INTO v_quotation_number;

    IF v_quotation_number IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Failed to generate quotation number');
    END IF;

    -- Get next sequence number for this opportunity
    SELECT public.get_next_quotation_sequence(
        NULL,  -- ticket_id
        v_lead_id,
        p_opportunity_id
    ) INTO v_sequence_number;

    -- Calculate valid_until
    v_valid_until := CURRENT_DATE + p_validity_days;

    -- Insert quotation
    INSERT INTO public.customer_quotations (
        ticket_id,
        lead_id,
        opportunity_id,
        source_type,
        sequence_number,
        quotation_number,
        customer_name,
        customer_company,
        customer_email,
        customer_phone,
        customer_address,
        service_type,
        fleet_type,
        fleet_quantity,
        incoterm,
        commodity,
        cargo_description,
        cargo_weight,
        cargo_weight_unit,
        cargo_volume,
        cargo_volume_unit,
        cargo_quantity,
        cargo_quantity_unit,
        origin_address,
        origin_city,
        origin_country,
        origin_port,
        destination_address,
        destination_city,
        destination_country,
        destination_port,
        rate_structure,
        total_cost,
        target_margin_percent,
        total_selling_rate,
        currency,
        scope_of_work,
        terms_includes,
        terms_excludes,
        terms_notes,
        validity_days,
        valid_until,
        created_by
    ) VALUES (
        NULL,  -- ticket_id
        v_lead_id,
        p_opportunity_id,
        'opportunity',
        v_sequence_number,
        v_quotation_number,
        p_customer_name,
        p_customer_company,
        p_customer_email,
        p_customer_phone,
        p_customer_address,
        p_service_type,
        p_fleet_type,
        p_fleet_quantity,
        p_incoterm,
        p_commodity,
        p_cargo_description,
        p_cargo_weight,
        p_cargo_weight_unit,
        p_cargo_volume,
        p_cargo_volume_unit,
        p_cargo_quantity,
        p_cargo_quantity_unit,
        p_origin_address,
        p_origin_city,
        p_origin_country,
        p_origin_port,
        p_destination_address,
        p_destination_city,
        p_destination_country,
        p_destination_port,
        p_rate_structure,
        p_total_cost,
        p_target_margin_percent,
        p_total_selling_rate,
        p_currency,
        p_scope_of_work,
        p_terms_includes,
        p_terms_excludes,
        p_terms_notes,
        p_validity_days,
        v_valid_until,
        v_user_id
    )
    RETURNING id INTO v_quotation_id;

    -- Sync to lead if linked
    IF v_lead_id IS NOT NULL THEN
        PERFORM public.sync_quotation_to_lead(v_quotation_id, 'draft', v_user_id);
    END IF;

    -- Sync to opportunity
    PERFORM public.sync_quotation_to_opportunity(v_quotation_id, 'draft', v_user_id);

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation_id,
        'quotation_number', v_quotation_number,
        'sequence_number', v_sequence_number,
        'sequence_label', public.get_quotation_sequence_label(v_sequence_number),
        'lead_id', v_lead_id,
        'opportunity_id', p_opportunity_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_quotation_from_pipeline IS
'Creates a customer quotation directly from pipeline/opportunity.
Automatically resolves lead_id from opportunity.source_lead_id and
generates sequence number.';

-- ============================================
-- PART 7: FIX SYNC OPPORTUNITY TO QUOTATION (REVERSE SYNC)
-- ============================================

-- When opportunity is closed, update all linked quotations
CREATE OR REPLACE FUNCTION public.sync_opportunity_to_quotation(
    p_opportunity_id TEXT,
    p_outcome TEXT -- 'won' or 'lost'
)
RETURNS JSONB AS $$
DECLARE
    v_opportunity RECORD;
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

    -- Get opportunity info
    SELECT * INTO v_opportunity
    FROM public.opportunities
    WHERE opportunity_id = p_opportunity_id;

    IF v_opportunity IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Opportunity not found');
    END IF;

    -- Update all active quotations for this opportunity
    UPDATE public.customer_quotations
    SET
        status = v_new_status,
        updated_at = NOW()
    WHERE opportunity_id = p_opportunity_id
    AND status IN ('sent', 'draft');

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Also update linked operational costs
    UPDATE public.ticket_rate_quotes
    SET
        status = CASE v_new_status
            WHEN 'accepted' THEN 'accepted'::quote_status
            WHEN 'rejected' THEN 'rejected'::quote_status
        END,
        updated_at = NOW()
    WHERE opportunity_id = p_opportunity_id
    AND status IN ('sent', 'sent_to_customer', 'submitted');

    -- Also sync tickets linked to this opportunity
    PERFORM public.sync_opportunity_to_ticket(p_opportunity_id, p_outcome);

    RETURN jsonb_build_object(
        'success', TRUE,
        'opportunity_id', p_opportunity_id,
        'outcome', p_outcome,
        'updated_quotations', v_updated_count
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_opportunity_to_quotation IS
'Syncs opportunity close outcome to all linked quotations.
When opportunity is won, quotations become accepted.
When opportunity is lost, quotations become rejected.';

-- ============================================
-- PART 8: FIX SYNC OPPORTUNITY TO TICKET (REVERSE SYNC)
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_opportunity_to_ticket(
    p_opportunity_id TEXT,
    p_outcome TEXT -- 'won' or 'lost'
)
RETURNS JSONB AS $$
DECLARE
    v_ticket RECORD;
    v_user_id UUID;
    v_updated_count INTEGER := 0;
BEGIN
    v_user_id := auth.uid();

    -- Update all open tickets linked to this opportunity
    FOR v_ticket IN
        SELECT id, ticket_code, status
        FROM public.tickets
        WHERE opportunity_id = p_opportunity_id
        AND status NOT IN ('closed', 'resolved')
    LOOP
        -- Update ticket
        UPDATE public.tickets
        SET
            status = 'closed',
            close_outcome = p_outcome::ticket_close_outcome,
            close_reason = 'Opportunity closed as ' || p_outcome,
            closed_at = NOW(),
            resolved_at = COALESCE(resolved_at, NOW()),
            updated_at = NOW()
        WHERE id = v_ticket.id;

        -- Create ticket event
        INSERT INTO public.ticket_events (
            ticket_id,
            event_type,
            actor_user_id,
            new_value,
            notes
        ) VALUES (
            v_ticket.id,
            'closed',
            v_user_id,
            jsonb_build_object('status', 'closed', 'outcome', p_outcome, 'source', 'opportunity_sync'),
            'Ticket closed: Opportunity marked as ' || p_outcome
        );

        v_updated_count := v_updated_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'opportunity_id', p_opportunity_id,
        'outcome', p_outcome,
        'updated_tickets', v_updated_count
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_opportunity_to_ticket IS
'Syncs opportunity close outcome to all linked tickets.
Closes all open tickets when opportunity is closed.';

-- ============================================
-- PART 9: FIX SYNC LEAD TO QUOTATION (REVERSE SYNC)
-- ============================================

-- When lead is disqualified, reject all linked quotations
CREATE OR REPLACE FUNCTION public.sync_lead_to_quotation(
    p_lead_id TEXT,
    p_new_status TEXT  -- Lead triage status
)
RETURNS JSONB AS $$
DECLARE
    v_updated_count INTEGER := 0;
BEGIN
    -- Only act when lead is disqualified
    IF p_new_status = 'Disqualified' THEN
        -- Reject all active quotations
        UPDATE public.customer_quotations
        SET
            status = 'rejected',
            rejection_reason = 'Lead disqualified',
            updated_at = NOW()
        WHERE lead_id = p_lead_id
        AND status IN ('draft', 'sent');

        GET DIAGNOSTICS v_updated_count = ROW_COUNT;

        -- Also update operational costs
        UPDATE public.ticket_rate_quotes
        SET
            status = 'rejected'::quote_status,
            updated_at = NOW()
        WHERE lead_id = p_lead_id
        AND status IN ('submitted', 'sent_to_customer');
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'lead_id', p_lead_id,
        'lead_status', p_new_status,
        'updated_quotations', v_updated_count
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_lead_to_quotation IS
'Syncs lead status changes to linked quotations.
When lead is disqualified, all quotations are rejected.';

-- ============================================
-- PART 10: ADD TRIGGER FOR OPPORTUNITY CLOSE
-- ============================================

-- Ensure trigger exists for opportunity close sync
CREATE OR REPLACE FUNCTION public.trigger_sync_quotation_on_opportunity_close()
RETURNS TRIGGER AS $$
DECLARE
    v_outcome TEXT;
BEGIN
    -- Only trigger when stage changes to Closed Won or Closed Lost
    IF OLD.stage IS DISTINCT FROM NEW.stage THEN
        IF NEW.stage = 'Closed Won' THEN
            v_outcome := 'won';
        ELSIF NEW.stage = 'Closed Lost' THEN
            v_outcome := 'lost';
        ELSE
            -- Not a close event, skip
            RETURN NEW;
        END IF;

        -- Sync to quotations
        PERFORM public.sync_opportunity_to_quotation(NEW.opportunity_id, v_outcome);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_quotation_on_opportunity_close ON public.opportunities;
CREATE TRIGGER trg_sync_quotation_on_opportunity_close
    AFTER UPDATE OF stage ON public.opportunities
    FOR EACH ROW
    WHEN (OLD.stage IS DISTINCT FROM NEW.stage AND NEW.stage IN ('Closed Won', 'Closed Lost'))
    EXECUTE FUNCTION public.trigger_sync_quotation_on_opportunity_close();

COMMENT ON TRIGGER trg_sync_quotation_on_opportunity_close ON public.opportunities IS
'Trigger to sync quotation status when opportunity is closed.
Fires when stage changes to Closed Won or Closed Lost.';

-- ============================================
-- PART 11: ADD TRIGGER FOR LEAD DISQUALIFICATION
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_sync_quotation_on_lead_disqualify()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger when triage_status changes to Disqualified
    IF OLD.triage_status IS DISTINCT FROM NEW.triage_status AND NEW.triage_status = 'Disqualified' THEN
        -- Sync to quotations
        PERFORM public.sync_lead_to_quotation(NEW.lead_id, 'Disqualified');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_quotation_on_lead_disqualify ON public.leads;
CREATE TRIGGER trg_sync_quotation_on_lead_disqualify
    AFTER UPDATE OF triage_status ON public.leads
    FOR EACH ROW
    WHEN (OLD.triage_status IS DISTINCT FROM NEW.triage_status AND NEW.triage_status = 'Disqualified')
    EXECUTE FUNCTION public.trigger_sync_quotation_on_lead_disqualify();

COMMENT ON TRIGGER trg_sync_quotation_on_lead_disqualify ON public.leads IS
'Trigger to sync quotation status when lead is disqualified.
Rejects all linked quotations when lead becomes Disqualified.';

-- ============================================
-- PART 12: HELPER FUNCTION FOR QUOTATION STATS
-- ============================================

-- Function to get quotation statistics for an entity
CREATE OR REPLACE FUNCTION public.get_entity_quotation_stats(
    p_lead_id TEXT DEFAULT NULL,
    p_opportunity_id TEXT DEFAULT NULL,
    p_ticket_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_stats RECORD;
BEGIN
    SELECT
        COUNT(*) AS total_quotations,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft_count,
        COUNT(*) FILTER (WHERE status = 'sent') AS sent_count,
        COUNT(*) FILTER (WHERE status = 'accepted') AS accepted_count,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
        COALESCE(SUM(total_selling_rate) FILTER (WHERE status = 'accepted'), 0) AS total_accepted_value,
        MAX(sequence_number) AS latest_sequence,
        MAX(created_at) AS latest_quotation_at
    INTO v_stats
    FROM public.customer_quotations
    WHERE
        (p_lead_id IS NULL OR lead_id = p_lead_id)
        AND (p_opportunity_id IS NULL OR opportunity_id = p_opportunity_id)
        AND (p_ticket_id IS NULL OR ticket_id = p_ticket_id)
        AND (p_lead_id IS NOT NULL OR p_opportunity_id IS NOT NULL OR p_ticket_id IS NOT NULL);

    RETURN jsonb_build_object(
        'total_quotations', v_stats.total_quotations,
        'draft_count', v_stats.draft_count,
        'sent_count', v_stats.sent_count,
        'accepted_count', v_stats.accepted_count,
        'rejected_count', v_stats.rejected_count,
        'total_accepted_value', v_stats.total_accepted_value,
        'latest_sequence', v_stats.latest_sequence,
        'latest_sequence_label', public.get_quotation_sequence_label(v_stats.latest_sequence),
        'latest_quotation_at', v_stats.latest_quotation_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_entity_quotation_stats IS
'Returns quotation statistics for a lead, opportunity, or ticket.
Includes counts by status and total accepted value.';

-- ============================================
-- PART 13: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_quotation_sequence_label(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_quotation_sequence_label_id(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation_from_pipeline(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, DECIMAL, TEXT, DECIMAL, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL, DECIMAL, TEXT, TEXT, TEXT[], TEXT[], TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_opportunity_to_quotation(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_opportunity_to_ticket(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_lead_to_quotation(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_entity_quotation_stats(TEXT, TEXT, UUID) TO authenticated;

GRANT SELECT ON public.v_customer_quotations_enriched TO authenticated;

-- ============================================
-- SUMMARY OF CHANGES
-- ============================================

/*
MIGRATION 072 SUMMARY:

1. FOREIGN KEY CONSTRAINTS:
   - customer_quotations → leads (ON DELETE SET NULL)
   - customer_quotations → opportunities (ON DELETE SET NULL)
   - tickets → leads (ON DELETE SET NULL)
   - tickets → opportunities (ON DELETE SET NULL)
   - ticket_rate_quotes → leads (ON DELETE SET NULL)
   - ticket_rate_quotes → opportunities (ON DELETE SET NULL)
   - ticket_rate_quotes → customer_quotations (ON DELETE SET NULL)

2. VALIDATION:
   - validate_quotation_source() trigger ensures source_type matches IDs
   - Auto-determines source_type if not explicitly set

3. SEQUENCE LABELS:
   - get_quotation_sequence_label(n) → 1=First, 2=Second, etc.
   - get_quotation_sequence_label_id(n) → Indonesian labels

4. ENRICHED VIEW:
   - v_customer_quotations_enriched with all related info
   - Includes sequence labels, related entities, computed fields

5. PERFORMANCE INDEXES:
   - Indexes on all foreign key columns
   - Indexes on status and created_at for common queries

6. NEW RPC:
   - create_quotation_from_pipeline() - Creates quotation from opportunity

7. REVERSE SYNC FUNCTIONS:
   - sync_opportunity_to_quotation() - When opportunity closes
   - sync_opportunity_to_ticket() - When opportunity closes
   - sync_lead_to_quotation() - When lead is disqualified

8. TRIGGERS:
   - trg_sync_quotation_on_opportunity_close - Auto-sync on opportunity close
   - trg_sync_quotation_on_lead_disqualify - Auto-sync on lead disqualify

9. HELPER FUNCTIONS:
   - get_entity_quotation_stats() - Get quotation statistics

ENTITY FLOW (Complete):

Lead (Marketing)
  ↓ [convert/handover]
  ↓
Opportunity (Sales Pipeline)
  ↓ [create RFQ ticket] (optional)
  ↓
Ticket (RFQ)
  ↓ [ops creates cost]
  ↓
Operational Cost (ticket_rate_quotes)
  ↓ [sales creates quotation]
  ↓
Customer Quotation

BIDIRECTIONAL SYNC:

Forward (Quotation → All):
- Quotation sent → Ticket: pending, Opportunity: Quote Sent
- Quotation accepted → Ticket: closed/won, Opportunity: Closed Won
- Quotation rejected → Ticket: need_adjustment, Opportunity: Negotiation

Reverse (Entity → Quotation):
- Opportunity Closed Won → Quotations: accepted
- Opportunity Closed Lost → Quotations: rejected
- Lead Disqualified → Quotations: rejected
- Ticket Won → Quotations: accepted
- Ticket Lost → Quotations: rejected
*/
