-- ============================================
-- Migration: 084_ticket_events_mirror_and_quotation_cost_link.sql
--
-- PURPOSE: Fix Issues 8 and 9
-- Issue 8: Ticket events should also populate ticket_comments + ticket_responses + ticket_response_exchanges
-- Issue 9: Create quotation should use "latest submitted ops cost"
-- ============================================

-- ============================================
-- ISSUE 8: MIRROR TICKET EVENTS TO RESPONSE TABLES
-- Create trigger that mirrors ticket_events to ticket_comments, ticket_responses
-- This ensures SLA/response time analytics are complete
-- ============================================

-- Add source_event_id to ticket_comments for tracking which events created which comments
ALTER TABLE public.ticket_comments
ADD COLUMN IF NOT EXISTS source_event_id BIGINT REFERENCES public.ticket_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_comments_source_event ON public.ticket_comments(source_event_id);

-- Function to mirror ticket_events to response tables
CREATE OR REPLACE FUNCTION public.mirror_ticket_event_to_response_tables()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket RECORD;
    v_comment_id UUID;
    v_comment_content TEXT;
    v_responder_role VARCHAR(20);
    v_response_time_seconds INTEGER;
    v_last_response_at TIMESTAMPTZ;
BEGIN
    -- Skip if this is a comment_added event (already handled by rpc_ticket_add_comment)
    IF NEW.event_type = 'comment_added' THEN
        RETURN NEW;
    END IF;

    -- Get ticket info
    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = NEW.ticket_id;

    IF v_ticket IS NULL THEN
        RETURN NEW;
    END IF;

    -- Determine responder role based on actor vs ticket creator/assignee
    IF NEW.actor_user_id = v_ticket.created_by THEN
        v_responder_role := 'creator';
    ELSIF NEW.actor_user_id = v_ticket.assigned_to THEN
        v_responder_role := 'assignee';
    ELSIF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = NEW.actor_user_id
        AND role = 'Admin'
    ) THEN
        v_responder_role := 'admin';
    ELSE
        v_responder_role := 'ops';
    END IF;

    -- Calculate response time from last response
    SELECT MAX(responded_at) INTO v_last_response_at
    FROM public.ticket_responses
    WHERE ticket_id = NEW.ticket_id;

    IF v_last_response_at IS NOT NULL THEN
        v_response_time_seconds := EXTRACT(EPOCH FROM (NEW.created_at - v_last_response_at))::INTEGER;
    ELSE
        v_response_time_seconds := EXTRACT(EPOCH FROM (NEW.created_at - v_ticket.created_at))::INTEGER;
    END IF;

    -- Generate comment content from event
    v_comment_content := CASE NEW.event_type::TEXT
        WHEN 'status_changed' THEN
            'Status changed from ' || COALESCE((NEW.old_value->>'status')::TEXT, 'unknown') ||
            ' to ' || COALESCE((NEW.new_value->>'status')::TEXT, 'unknown')
        WHEN 'assigned' THEN
            'Ticket assigned'
        WHEN 'reassigned' THEN
            'Ticket reassigned'
        WHEN 'priority_changed' THEN
            'Priority changed from ' || COALESCE((NEW.old_value->>'priority')::TEXT, 'unknown') ||
            ' to ' || COALESCE((NEW.new_value->>'priority')::TEXT, 'unknown')
        WHEN 'request_adjustment' THEN
            'Adjustment requested' || COALESCE(': ' || NEW.notes, '')
        WHEN 'cost_submitted' THEN
            'Operational cost submitted'
        WHEN 'cost_sent_to_customer' THEN
            'Cost sent to customer'
        WHEN 'customer_quotation_created' THEN
            'Customer quotation created: ' || COALESCE((NEW.new_value->>'quotation_number')::TEXT, '')
        WHEN 'customer_quotation_sent' THEN
            'Customer quotation sent: ' || COALESCE((NEW.new_value->>'quotation_number')::TEXT, '')
        WHEN 'won' THEN
            'Ticket marked as won'
        WHEN 'lost' THEN
            'Ticket marked as lost' || COALESCE(': ' || NEW.notes, '')
        WHEN 'closed' THEN
            'Ticket closed'
        WHEN 'reopened' THEN
            'Ticket reopened'
        ELSE
            'Event: ' || NEW.event_type::TEXT || COALESCE(' - ' || NEW.notes, '')
    END;

    -- Append notes if available and not already included
    IF NEW.notes IS NOT NULL AND v_comment_content NOT LIKE '%' || NEW.notes || '%' THEN
        v_comment_content := v_comment_content || ' | Notes: ' || NEW.notes;
    END IF;

    -- Create auto-generated comment (only for significant events)
    -- Skip for events that don't need visible comments
    IF NEW.event_type::TEXT NOT IN ('escalation_timer_started', 'escalation_timer_stopped', 'sla_checked') THEN
        INSERT INTO public.ticket_comments (
            ticket_id,
            user_id,
            content,
            is_internal,
            response_time_seconds,
            response_direction,
            source_event_id
        ) VALUES (
            NEW.ticket_id,
            COALESCE(NEW.actor_user_id, v_ticket.created_by),
            '[Auto] ' || v_comment_content,
            TRUE,  -- Auto-generated comments are internal by default
            v_response_time_seconds,
            CASE WHEN COALESCE(NEW.actor_user_id, v_ticket.created_by) = v_ticket.created_by
                 THEN 'inbound' ELSE 'outbound' END,
            NEW.id
        )
        RETURNING id INTO v_comment_id;
    END IF;

    -- Create ticket_responses entry for SLA tracking
    INSERT INTO public.ticket_responses (
        ticket_id,
        user_id,
        responder_role,
        ticket_stage,
        responded_at,
        response_time_seconds,
        comment_id
    ) VALUES (
        NEW.ticket_id,
        COALESCE(NEW.actor_user_id, v_ticket.created_by),
        v_responder_role,
        v_ticket.status::TEXT,
        NEW.created_at,
        v_response_time_seconds,
        v_comment_id
    );

    -- Record response exchange for analytics
    -- This updates ticket_response_exchanges table
    PERFORM public.record_response_exchange(
        NEW.ticket_id,
        COALESCE(NEW.actor_user_id, v_ticket.created_by),
        v_comment_id
    );

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the original insert
        RAISE WARNING 'Error mirroring ticket event to response tables: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.mirror_ticket_event_to_response_tables IS
'Trigger function that mirrors ticket_events to ticket_comments, ticket_responses, and ticket_response_exchanges.
This ensures SLA/response time analytics are complete for all ticket actions, not just comments.
Skips comment_added events as they are already handled by rpc_ticket_add_comment.';

-- Create trigger on ticket_events
DROP TRIGGER IF EXISTS trg_mirror_ticket_event_to_responses ON public.ticket_events;
CREATE TRIGGER trg_mirror_ticket_event_to_responses
    AFTER INSERT ON public.ticket_events
    FOR EACH ROW
    EXECUTE FUNCTION public.mirror_ticket_event_to_response_tables();

-- ============================================
-- ISSUE 9: QUOTATION FROM PIPELINE USES LATEST SUBMITTED OPS COST
-- Update create_quotation_from_pipeline to fetch latest submitted rate quote
-- ============================================

-- Add source_rate_quote_id to customer_quotations for audit trail
ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS source_rate_quote_id UUID REFERENCES public.ticket_rate_quotes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.customer_quotations.source_rate_quote_id IS
'Reference to the ticket_rate_quotes record that was used as source for cost data when creating this quotation from pipeline';

CREATE INDEX IF NOT EXISTS idx_customer_quotations_source_rate_quote ON public.customer_quotations(source_rate_quote_id);

-- Updated function to use latest submitted ops cost
CREATE OR REPLACE FUNCTION public.create_quotation_from_pipeline(
    p_opportunity_id TEXT,
    -- Customer info
    p_customer_name TEXT,
    p_customer_company TEXT DEFAULT NULL,
    p_customer_email TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_customer_address TEXT DEFAULT NULL,
    -- Service details
    p_service_type TEXT DEFAULT NULL,
    p_fleet_type TEXT DEFAULT NULL,
    p_fleet_quantity INTEGER DEFAULT NULL,
    p_incoterm TEXT DEFAULT NULL,
    -- Cargo
    p_commodity TEXT DEFAULT NULL,
    p_cargo_description TEXT DEFAULT NULL,
    p_cargo_weight NUMERIC DEFAULT NULL,
    p_cargo_weight_unit TEXT DEFAULT 'kg',
    p_cargo_volume NUMERIC DEFAULT NULL,
    p_cargo_volume_unit TEXT DEFAULT 'm3',
    p_cargo_quantity INTEGER DEFAULT NULL,
    p_cargo_quantity_unit TEXT DEFAULT 'unit',
    -- Route
    p_origin_address TEXT DEFAULT NULL,
    p_origin_city TEXT DEFAULT NULL,
    p_origin_country TEXT DEFAULT 'Indonesia',
    p_origin_port TEXT DEFAULT NULL,
    p_destination_address TEXT DEFAULT NULL,
    p_destination_city TEXT DEFAULT NULL,
    p_destination_country TEXT DEFAULT NULL,
    p_destination_port TEXT DEFAULT NULL,
    -- Pricing (optional - will use latest ops cost if available)
    p_rate_structure TEXT DEFAULT 'bundling',
    p_total_cost NUMERIC DEFAULT NULL,
    p_target_margin_percent NUMERIC DEFAULT 15,
    p_total_selling_rate NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'IDR',
    -- Terms
    p_scope_of_work TEXT DEFAULT NULL,
    p_terms_includes TEXT[] DEFAULT NULL,
    p_terms_excludes TEXT[] DEFAULT NULL,
    p_terms_notes TEXT DEFAULT NULL,
    p_validity_days INTEGER DEFAULT 14
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_lead_id TEXT;
    v_quotation_id UUID;
    v_quotation_number TEXT;
    v_sequence_number INTEGER;
    v_valid_until DATE;
    v_latest_rate_quote RECORD;
    v_effective_total_cost NUMERIC;
    v_effective_margin NUMERIC;
    v_effective_selling_rate NUMERIC;
    v_effective_currency TEXT;
    v_source_rate_quote_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Not authenticated');
    END IF;

    -- Get lead_id from opportunity
    SELECT source_lead_id INTO v_lead_id
    FROM public.opportunities
    WHERE opportunity_id = p_opportunity_id;

    -- FIX Issue 9: Look for latest submitted ops cost for this opportunity/lead
    -- Priority: opportunity_id match > lead_id match > ticket linked to opportunity
    SELECT * INTO v_latest_rate_quote
    FROM public.ticket_rate_quotes
    WHERE status = 'submitted'
    AND (
        opportunity_id = p_opportunity_id
        OR (lead_id = v_lead_id AND v_lead_id IS NOT NULL)
        OR ticket_id IN (
            SELECT id FROM public.tickets
            WHERE opportunity_id = p_opportunity_id
        )
    )
    ORDER BY
        CASE WHEN opportunity_id = p_opportunity_id THEN 0 ELSE 1 END,
        COALESCE(submitted_at, updated_at, created_at) DESC
    LIMIT 1;

    -- Use latest rate quote data if available, otherwise use parameters
    IF v_latest_rate_quote IS NOT NULL THEN
        v_effective_total_cost := COALESCE(p_total_cost, v_latest_rate_quote.amount);
        v_effective_currency := COALESCE(p_currency, v_latest_rate_quote.currency, 'IDR');
        v_source_rate_quote_id := v_latest_rate_quote.id;

        -- Calculate selling rate if not provided
        IF p_total_selling_rate IS NOT NULL THEN
            v_effective_selling_rate := p_total_selling_rate;
            -- Calculate actual margin
            IF v_effective_total_cost > 0 THEN
                v_effective_margin := ((v_effective_selling_rate - v_effective_total_cost) / v_effective_total_cost) * 100;
            ELSE
                v_effective_margin := p_target_margin_percent;
            END IF;
        ELSE
            v_effective_margin := COALESCE(p_target_margin_percent, 15);
            v_effective_selling_rate := v_effective_total_cost * (1 + v_effective_margin / 100);
        END IF;
    ELSE
        -- No rate quote found, use parameters as-is
        v_effective_total_cost := p_total_cost;
        v_effective_margin := p_target_margin_percent;
        v_effective_selling_rate := COALESCE(p_total_selling_rate,
            CASE WHEN p_total_cost IS NOT NULL
                 THEN p_total_cost * (1 + COALESCE(p_target_margin_percent, 15) / 100)
                 ELSE NULL
            END);
        v_effective_currency := p_currency;
        v_source_rate_quote_id := NULL;
    END IF;

    -- Generate sequence number
    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_sequence_number
    FROM public.customer_quotations
    WHERE opportunity_id = p_opportunity_id;

    -- Generate quotation number
    v_quotation_number := 'QUO' || TO_CHAR(NOW(), 'YYYYMMDD') ||
                          UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    -- Calculate valid until
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
        source_rate_quote_id,
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
        v_effective_total_cost,
        v_effective_margin,
        v_effective_selling_rate,
        v_effective_currency,
        p_scope_of_work,
        p_terms_includes,
        p_terms_excludes,
        p_terms_notes,
        p_validity_days,
        v_valid_until,
        v_source_rate_quote_id,
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
        'opportunity_id', p_opportunity_id,
        'source_rate_quote_id', v_source_rate_quote_id,
        'used_rate_quote', v_latest_rate_quote IS NOT NULL,
        'effective_cost', v_effective_total_cost,
        'effective_selling_rate', v_effective_selling_rate,
        'effective_margin', v_effective_margin
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_quotation_from_pipeline IS
'Creates a customer quotation directly from pipeline/opportunity.
FIX Issue 9: Now automatically uses latest submitted ops cost (ticket_rate_quotes) if available.
Priority: opportunity_id match > lead_id match > ticket linked to opportunity.
Stores source_rate_quote_id for audit trail.';

-- ============================================
-- BACKFILL: Link existing quotations to their source rate quotes
-- ============================================

-- Link quotations to rate quotes where they share the same ticket
UPDATE public.customer_quotations cq
SET source_rate_quote_id = (
    SELECT id FROM public.ticket_rate_quotes trq
    WHERE trq.ticket_id = cq.ticket_id
    AND trq.status IN ('submitted', 'sent_to_customer', 'accepted')
    ORDER BY COALESCE(trq.submitted_at, trq.updated_at) DESC
    LIMIT 1
)
WHERE cq.source_rate_quote_id IS NULL
AND cq.ticket_id IS NOT NULL
AND cq.operational_cost_id IS NULL;  -- Only if not already linked via operational_cost_id

-- ============================================
-- SUMMARY
-- ============================================
-- Issue 8:
--   - Added source_event_id column to ticket_comments
--   - Created mirror_ticket_event_to_response_tables trigger function
--   - Trigger creates: ticket_comments, ticket_responses, calls record_response_exchange
--   - Skips comment_added events (already handled separately)
--   - Auto-generated comments marked as internal
--
-- Issue 9:
--   - Added source_rate_quote_id column to customer_quotations
--   - Updated create_quotation_from_pipeline to use latest submitted ops cost
--   - Returns used_rate_quote flag and effective values in response
--   - Backfill links existing quotations to their source rate quotes
-- ============================================
