-- ============================================
-- Migration: 062_fix_first_quote_metrics.sql
-- Fix first quote time calculation to include all submitted quotes
-- ============================================

-- Update the ticket_response_metrics function to properly track first quote
CREATE OR REPLACE FUNCTION public.update_ticket_response_metrics(
    p_ticket_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_ticket public.tickets;
    v_creator_metrics RECORD;
    v_assignee_metrics RECORD;
    v_first_quote RECORD;
BEGIN
    -- Get ticket
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id;

    IF v_ticket IS NULL THEN
        RETURN;
    END IF;

    -- Calculate creator metrics
    SELECT
        COUNT(*) as total_responses,
        COALESCE(AVG(raw_response_seconds), 0)::INTEGER as avg_raw,
        COALESCE(AVG(business_response_seconds), 0)::INTEGER as avg_business
    INTO v_creator_metrics
    FROM public.ticket_response_exchanges
    WHERE ticket_id = p_ticket_id
    AND responder_type = 'creator';

    -- Calculate assignee metrics
    SELECT
        COUNT(*) as total_responses,
        COALESCE(AVG(raw_response_seconds), 0)::INTEGER as avg_raw,
        COALESCE(AVG(business_response_seconds), 0)::INTEGER as avg_business,
        MIN(raw_response_seconds) FILTER (WHERE exchange_number = 1 OR previous_response_at = (SELECT created_at FROM public.tickets WHERE id = p_ticket_id)) as first_raw,
        MIN(business_response_seconds) FILTER (WHERE exchange_number = 1 OR previous_response_at = (SELECT created_at FROM public.tickets WHERE id = p_ticket_id)) as first_business
    INTO v_assignee_metrics
    FROM public.ticket_response_exchanges
    WHERE ticket_id = p_ticket_id
    AND responder_type = 'assignee';

    -- Get first quote time for RFQ tickets
    -- Uses ticket_rate_quotes table - the first quote with submitted/sent status
    IF v_ticket.ticket_type = 'RFQ' THEN
        SELECT
            EXTRACT(EPOCH FROM (MIN(q.created_at) - v_ticket.created_at))::INTEGER as raw_seconds,
            public.calculate_business_hours_seconds(v_ticket.created_at, MIN(q.created_at)) as business_seconds
        INTO v_first_quote
        FROM public.ticket_rate_quotes q
        WHERE q.ticket_id = p_ticket_id
        AND q.status IN ('submitted', 'sent', 'sent_to_customer', 'accepted', 'rejected'); -- Any submitted quote counts
    END IF;

    -- Upsert metrics
    INSERT INTO public.ticket_response_metrics (
        ticket_id,
        creator_total_responses,
        creator_avg_response_seconds,
        creator_avg_business_response_seconds,
        assignee_total_responses,
        assignee_avg_response_seconds,
        assignee_avg_business_response_seconds,
        assignee_first_response_seconds,
        assignee_first_response_business_seconds,
        time_to_first_quote_seconds,
        time_to_first_quote_business_seconds,
        time_to_resolution_seconds,
        time_to_resolution_business_seconds
    ) VALUES (
        p_ticket_id,
        v_creator_metrics.total_responses,
        v_creator_metrics.avg_raw,
        v_creator_metrics.avg_business,
        v_assignee_metrics.total_responses,
        v_assignee_metrics.avg_raw,
        v_assignee_metrics.avg_business,
        v_assignee_metrics.first_raw,
        v_assignee_metrics.first_business,
        v_first_quote.raw_seconds,
        v_first_quote.business_seconds,
        CASE WHEN v_ticket.resolved_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (v_ticket.resolved_at - v_ticket.created_at))::INTEGER
            ELSE NULL END,
        CASE WHEN v_ticket.resolved_at IS NOT NULL
            THEN public.calculate_business_hours_seconds(v_ticket.created_at, v_ticket.resolved_at)
            ELSE NULL END
    )
    ON CONFLICT (ticket_id) DO UPDATE SET
        creator_total_responses = EXCLUDED.creator_total_responses,
        creator_avg_response_seconds = EXCLUDED.creator_avg_response_seconds,
        creator_avg_business_response_seconds = EXCLUDED.creator_avg_business_response_seconds,
        assignee_total_responses = EXCLUDED.assignee_total_responses,
        assignee_avg_response_seconds = EXCLUDED.assignee_avg_response_seconds,
        assignee_avg_business_response_seconds = EXCLUDED.assignee_avg_business_response_seconds,
        assignee_first_response_seconds = COALESCE(EXCLUDED.assignee_first_response_seconds, public.ticket_response_metrics.assignee_first_response_seconds),
        assignee_first_response_business_seconds = COALESCE(EXCLUDED.assignee_first_response_business_seconds, public.ticket_response_metrics.assignee_first_response_business_seconds),
        time_to_first_quote_seconds = COALESCE(EXCLUDED.time_to_first_quote_seconds, public.ticket_response_metrics.time_to_first_quote_seconds),
        time_to_first_quote_business_seconds = COALESCE(EXCLUDED.time_to_first_quote_business_seconds, public.ticket_response_metrics.time_to_first_quote_business_seconds),
        time_to_resolution_seconds = EXCLUDED.time_to_resolution_seconds,
        time_to_resolution_business_seconds = EXCLUDED.time_to_resolution_business_seconds,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.update_ticket_response_metrics IS 'Updates aggregated response metrics for a ticket (uses operational_costs for first quote)';

-- ============================================
-- Trigger to update metrics when quote is created/submitted
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_update_quote_metrics_on_quote()
RETURNS TRIGGER AS $$
BEGIN
    -- Only for RFQ tickets
    IF EXISTS (
        SELECT 1 FROM public.tickets
        WHERE id = NEW.ticket_id
        AND ticket_type = 'RFQ'
    ) THEN
        -- Update metrics when a quote is submitted
        IF NEW.status IN ('submitted', 'sent', 'sent_to_customer', 'accepted', 'rejected') THEN
            PERFORM public.update_ticket_response_metrics(NEW.ticket_id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on ticket_rate_quotes
DROP TRIGGER IF EXISTS trigger_update_quote_metrics_on_quote ON public.ticket_rate_quotes;
CREATE TRIGGER trigger_update_quote_metrics_on_quote
    AFTER INSERT OR UPDATE OF status ON public.ticket_rate_quotes
    FOR EACH ROW
    WHEN (NEW.ticket_id IS NOT NULL)
    EXECUTE FUNCTION public.trigger_update_quote_metrics_on_quote();

-- ============================================
-- Backfill: Update metrics for all existing RFQ tickets with quotes
-- ============================================
DO $$
DECLARE
    v_ticket_id UUID;
BEGIN
    FOR v_ticket_id IN
        SELECT DISTINCT t.id
        FROM public.tickets t
        INNER JOIN public.ticket_rate_quotes q ON q.ticket_id = t.id
        WHERE t.ticket_type = 'RFQ'
        AND q.status IN ('submitted', 'sent', 'sent_to_customer', 'accepted', 'rejected')
    LOOP
        PERFORM public.update_ticket_response_metrics(v_ticket_id);
    END LOOP;
END $$;
