-- ============================================
-- Migration: 059_bidirectional_entity_links.sql
-- Purpose: Complete bidirectional linking between all entities
--
-- Reference Structure:
--   opportunity (source_lead_id) -> leads
--   ticket (lead_id, opportunity_id) -> leads, opportunities
--   operational_cost (lead_id, opportunity_id, ticket_id) -> leads, opportunities, tickets
--   quotation (lead_id, opportunity_id, ticket_id, operational_cost_id) -> all above
--
-- Bidirectional means: IDs propagate down on INSERT, status syncs up on UPDATE
-- ============================================

-- ============================================
-- 1. ADD CUSTOMER_QUOTATION_ID TO TICKET_RATE_QUOTES
-- ============================================
ALTER TABLE public.ticket_rate_quotes
ADD COLUMN IF NOT EXISTS customer_quotation_id UUID REFERENCES public.customer_quotations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_quotation ON public.ticket_rate_quotes(customer_quotation_id);

COMMENT ON COLUMN public.ticket_rate_quotes.customer_quotation_id IS 'Reference to customer quotation created from this operational cost';

-- ============================================
-- 2. ADD LEAD_ID AND OPPORTUNITY_ID TO TICKET_RATE_QUOTES
-- ============================================
ALTER TABLE public.ticket_rate_quotes
ADD COLUMN IF NOT EXISTS lead_id TEXT REFERENCES public.leads(lead_id) ON DELETE SET NULL;

ALTER TABLE public.ticket_rate_quotes
ADD COLUMN IF NOT EXISTS opportunity_id TEXT REFERENCES public.opportunities(opportunity_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_lead ON public.ticket_rate_quotes(lead_id);
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_opportunity ON public.ticket_rate_quotes(opportunity_id);

COMMENT ON COLUMN public.ticket_rate_quotes.lead_id IS 'Reference to lead (inherited from ticket)';
COMMENT ON COLUMN public.ticket_rate_quotes.opportunity_id IS 'Reference to opportunity (inherited from ticket)';

-- ============================================
-- 3. FUNCTION TO PROPAGATE IDS ON OPERATIONAL COST INSERT
-- ============================================
CREATE OR REPLACE FUNCTION public.propagate_ids_on_operational_cost_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket RECORD;
BEGIN
    -- If ticket_id is set, inherit lead_id and opportunity_id from ticket
    IF NEW.ticket_id IS NOT NULL THEN
        SELECT lead_id, opportunity_id INTO v_ticket
        FROM public.tickets
        WHERE id = NEW.ticket_id;

        IF v_ticket IS NOT NULL THEN
            NEW.lead_id := COALESCE(NEW.lead_id, v_ticket.lead_id);
            NEW.opportunity_id := COALESCE(NEW.opportunity_id, v_ticket.opportunity_id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for operational cost insert
DROP TRIGGER IF EXISTS trigger_propagate_ids_on_cost_insert ON public.ticket_rate_quotes;
CREATE TRIGGER trigger_propagate_ids_on_cost_insert
    BEFORE INSERT ON public.ticket_rate_quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.propagate_ids_on_operational_cost_insert();

-- ============================================
-- 4. FUNCTION TO UPDATE OPERATIONAL COST WHEN QUOTATION IS CREATED
-- ============================================
CREATE OR REPLACE FUNCTION public.link_quotation_to_operational_cost()
RETURNS TRIGGER AS $$
BEGIN
    -- When quotation is created with operational_cost_id, update the operational cost
    IF NEW.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET customer_quotation_id = NEW.id
        WHERE id = NEW.operational_cost_id
        AND customer_quotation_id IS NULL;  -- Only if not already linked
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for quotation insert
DROP TRIGGER IF EXISTS trigger_link_quotation_to_cost ON public.customer_quotations;
CREATE TRIGGER trigger_link_quotation_to_cost
    AFTER INSERT ON public.customer_quotations
    FOR EACH ROW
    EXECUTE FUNCTION public.link_quotation_to_operational_cost();

-- ============================================
-- 5. FUNCTION TO SYNC STATUS BIDIRECTIONALLY
-- ============================================
CREATE OR REPLACE FUNCTION public.sync_quotation_status_to_cost()
RETURNS TRIGGER AS $$
BEGIN
    -- When quotation status changes, update operational cost status if linked
    IF NEW.operational_cost_id IS NOT NULL AND OLD.status IS DISTINCT FROM NEW.status THEN
        -- Map quotation status to cost status
        UPDATE public.ticket_rate_quotes
        SET
            status = CASE NEW.status
                WHEN 'sent' THEN 'sent_to_customer'
                WHEN 'accepted' THEN 'won'
                WHEN 'rejected' THEN 'revise_requested'
                ELSE status
            END,
            updated_at = NOW()
        WHERE id = NEW.operational_cost_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for quotation status update
DROP TRIGGER IF EXISTS trigger_sync_quotation_status ON public.customer_quotations;
CREATE TRIGGER trigger_sync_quotation_status
    AFTER UPDATE OF status ON public.customer_quotations
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.sync_quotation_status_to_cost();

-- ============================================
-- 6. TRIGGER: TICKET INSERT - Inherit lead_id from opportunity
-- ============================================
CREATE OR REPLACE FUNCTION public.propagate_lead_id_on_ticket_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_opportunity RECORD;
BEGIN
    -- If opportunity_id is set but lead_id is not, inherit from opportunity.source_lead_id
    IF NEW.opportunity_id IS NOT NULL AND NEW.lead_id IS NULL THEN
        SELECT source_lead_id INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = NEW.opportunity_id;

        IF v_opportunity IS NOT NULL AND v_opportunity.source_lead_id IS NOT NULL THEN
            NEW.lead_id := v_opportunity.source_lead_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_propagate_lead_on_ticket_insert ON public.tickets;
CREATE TRIGGER trigger_propagate_lead_on_ticket_insert
    BEFORE INSERT ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.propagate_lead_id_on_ticket_insert();

-- ============================================
-- 7. TRIGGER: QUOTATION INSERT - Inherit all IDs from ticket
-- ============================================
CREATE OR REPLACE FUNCTION public.propagate_ids_on_quotation_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket RECORD;
    v_opportunity RECORD;
BEGIN
    -- If ticket_id is set, inherit lead_id and opportunity_id from ticket
    IF NEW.ticket_id IS NOT NULL THEN
        SELECT lead_id, opportunity_id INTO v_ticket
        FROM public.tickets
        WHERE id = NEW.ticket_id;

        IF v_ticket IS NOT NULL THEN
            NEW.lead_id := COALESCE(NEW.lead_id, v_ticket.lead_id);
            NEW.opportunity_id := COALESCE(NEW.opportunity_id, v_ticket.opportunity_id);
        END IF;
    END IF;

    -- If still no lead_id but has opportunity_id, get from opportunity.source_lead_id
    IF NEW.opportunity_id IS NOT NULL AND NEW.lead_id IS NULL THEN
        SELECT source_lead_id INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = NEW.opportunity_id;

        IF v_opportunity IS NOT NULL AND v_opportunity.source_lead_id IS NOT NULL THEN
            NEW.lead_id := v_opportunity.source_lead_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_propagate_ids_on_quotation_insert ON public.customer_quotations;
CREATE TRIGGER trigger_propagate_ids_on_quotation_insert
    BEFORE INSERT ON public.customer_quotations
    FOR EACH ROW
    EXECUTE FUNCTION public.propagate_ids_on_quotation_insert();

-- ============================================
-- 8. BACKFILL EXISTING DATA
-- ============================================

-- 8a. Backfill tickets: lead_id from opportunity.source_lead_id
UPDATE public.tickets t
SET lead_id = o.source_lead_id
FROM public.opportunities o
WHERE t.opportunity_id = o.opportunity_id
AND t.lead_id IS NULL
AND o.source_lead_id IS NOT NULL;

-- 8b. Backfill quotations: lead_id and opportunity_id from ticket
UPDATE public.customer_quotations cq
SET
    lead_id = COALESCE(cq.lead_id, t.lead_id),
    opportunity_id = COALESCE(cq.opportunity_id, t.opportunity_id)
FROM public.tickets t
WHERE cq.ticket_id = t.id
AND (cq.lead_id IS NULL OR cq.opportunity_id IS NULL);

-- 8c. Backfill quotations: lead_id from opportunity.source_lead_id if still missing
UPDATE public.customer_quotations cq
SET lead_id = o.source_lead_id
FROM public.opportunities o
WHERE cq.opportunity_id = o.opportunity_id
AND cq.lead_id IS NULL
AND o.source_lead_id IS NOT NULL;

-- 8d. Backfill ticket_rate_quotes: lead_id and opportunity_id from tickets
UPDATE public.ticket_rate_quotes trq
SET
    lead_id = t.lead_id,
    opportunity_id = t.opportunity_id
FROM public.tickets t
WHERE trq.ticket_id = t.id
AND (trq.lead_id IS NULL OR trq.opportunity_id IS NULL);

-- 8e. Backfill ticket_rate_quotes: customer_quotation_id from customer_quotations
UPDATE public.ticket_rate_quotes trq
SET customer_quotation_id = cq.id
FROM public.customer_quotations cq
WHERE cq.operational_cost_id = trq.id
AND trq.customer_quotation_id IS NULL;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON FUNCTION public.propagate_lead_id_on_ticket_insert() IS
'Automatically inherit lead_id from opportunity.source_lead_id when ticket is created';

COMMENT ON FUNCTION public.propagate_ids_on_quotation_insert() IS
'Automatically inherit lead_id and opportunity_id from ticket when quotation is created';

COMMENT ON FUNCTION public.propagate_ids_on_operational_cost_insert() IS
'Automatically inherit lead_id and opportunity_id from ticket when operational cost is created';

COMMENT ON FUNCTION public.link_quotation_to_operational_cost() IS
'Automatically link quotation back to operational cost when created';

COMMENT ON FUNCTION public.sync_quotation_status_to_cost() IS
'Sync quotation status changes to linked operational cost';

-- ============================================
-- SUMMARY OF PROPAGATION CHAIN
-- ============================================
-- ON INSERT (IDs propagate DOWN):
--   opportunity.source_lead_id → ticket.lead_id (trigger_propagate_lead_on_ticket_insert)
--   ticket.lead_id, ticket.opportunity_id → quotation (trigger_propagate_ids_on_quotation_insert)
--   ticket.lead_id, ticket.opportunity_id → operational_cost (trigger_propagate_ids_on_cost_insert)
--   quotation.id → operational_cost.customer_quotation_id (trigger_link_quotation_to_cost)
--
-- ON UPDATE (Status syncs UP):
--   quotation.status → operational_cost.status (trigger_sync_quotation_status)
--   quotation.status → ticket.status (sync_quotation_to_ticket in migration 058)
--   quotation.status → opportunity.stage/quotation_status (sync_quotation_to_opportunity in migration 053)
--   quotation.status → lead.quotation_status (sync_quotation_to_lead in migration 053)
