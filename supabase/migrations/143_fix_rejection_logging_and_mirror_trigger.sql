-- =====================================================
-- Migration 143: Fix Quotation Rejection Logging & Mirror Trigger
-- =====================================================
-- ROOT CAUSE ANALYSIS:
--
-- Bug: When a customer quotation is rejected, the rejection is NOT
-- recorded in the ticket activity visible to sales users.
--
-- Three combined issues:
--
-- 1. source_event_id column type mismatch (BIGINT vs UUID)
--    Migration 084 defined: source_event_id BIGINT REFERENCES ticket_events(id)
--    But ticket_events.id is UUID. The ALTER TABLE failed, so:
--    - source_event_id column does NOT exist
--    - Mirror trigger fires but always fails silently (EXCEPTION handler)
--    - No auto-comments or ticket_responses created from events
--
-- 2. Direct rejection comment is_internal = TRUE
--    Migration 142 added direct ticket_comment insertion in the RPC.
--    But it uses is_internal = TRUE. The RLS policy on ticket_comments
--    hides internal comments from non-admin/ops users.
--    Sales users (who typically reject quotations) CANNOT see these.
--
-- 3. Missing quotation_number in rejection event new_value
--    The mirror trigger extracts quotation_number from new_value JSONB.
--    But the RPC doesn't include it, so auto-comments are incomplete.
--
-- FIXES:
-- 1. Add source_event_id as UUID (correct type)
-- 2. Recreate mirror trigger with robust error handling
-- 3. Update rpc_customer_quotation_mark_rejected:
--    - is_internal = FALSE for rejection comments
--    - Include quotation_number in event new_value
-- 4. Update RLS to allow quotation creators to view ticket events/comments
-- =====================================================


-- ============================================
-- PART 1: Fix source_event_id column type
-- ============================================

-- Drop the column if it exists with wrong type (BIGINT)
-- and re-add as UUID to match ticket_events.id
DO $$
BEGIN
    -- Check if column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'ticket_comments'
        AND column_name = 'source_event_id'
    ) THEN
        -- Drop existing column (may be BIGINT from failed migration 084)
        ALTER TABLE public.ticket_comments DROP COLUMN source_event_id;
        RAISE NOTICE '[143] Dropped existing source_event_id column';
    END IF;

    -- Add column with correct UUID type
    ALTER TABLE public.ticket_comments
    ADD COLUMN source_event_id UUID REFERENCES public.ticket_events(id) ON DELETE SET NULL;
    RAISE NOTICE '[143] Added source_event_id as UUID';
EXCEPTION
    WHEN duplicate_column THEN
        RAISE NOTICE '[143] source_event_id already exists with correct type';
END $$;

-- Re-create index
DROP INDEX IF EXISTS idx_ticket_comments_source_event;
CREATE INDEX IF NOT EXISTS idx_ticket_comments_source_event
ON public.ticket_comments(source_event_id)
WHERE source_event_id IS NOT NULL;


-- ============================================
-- PART 2: Recreate mirror trigger function
-- Fixed: source_event_id is now UUID, matching ticket_events.id
-- Fixed: Include quotation_number extraction for rejected/accepted events
-- ============================================

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
    -- Skip events that already create their own comments in the RPC
    -- comment_added: handled by rpc_ticket_add_comment
    -- customer_quotation_rejected: direct comment created by rpc_customer_quotation_mark_rejected
    -- customer_quotation_sent: direct comment created by rpc_customer_quotation_mark_sent
    -- We still need ticket_responses for SLA tracking, so we skip ONLY the auto-comment
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
        AND role IN ('Director', 'super admin')
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
        WHEN 'customer_quotation_rejected' THEN
            'Customer quotation rejected: ' || COALESCE((NEW.new_value->>'quotation_number')::TEXT, '') ||
            CASE WHEN (NEW.new_value->>'rejection_reason') IS NOT NULL
                 THEN '. Reason: ' || (NEW.new_value->>'rejection_reason')
                 ELSE '' END
        WHEN 'customer_quotation_accepted' THEN
            'Customer quotation accepted: ' || COALESCE((NEW.new_value->>'quotation_number')::TEXT, '')
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
    IF NEW.notes IS NOT NULL AND v_comment_content NOT LIKE '%' || LEFT(NEW.notes, 50) || '%' THEN
        v_comment_content := v_comment_content || ' | Notes: ' || NEW.notes;
    END IF;

    -- Create auto-generated comment (only for significant events)
    -- Skip events that already have direct comments created by their respective RPCs
    -- to avoid duplicate content in the activity timeline
    IF NEW.event_type::TEXT NOT IN (
        'escalation_timer_started', 'escalation_timer_stopped', 'sla_checked',
        'customer_quotation_rejected', 'customer_quotation_sent'
    ) THEN
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
            TRUE,  -- Auto-generated comments are internal
            v_response_time_seconds,
            CASE WHEN COALESCE(NEW.actor_user_id, v_ticket.created_by) = v_ticket.created_by
                 THEN 'inbound' ELSE 'outbound' END,
            NEW.id  -- Now UUID, matching ticket_events.id type
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

    -- Skip record_response_exchange for events that already call it in RPC
    IF NEW.event_type::TEXT NOT IN ('request_adjustment') THEN
        PERFORM public.record_response_exchange(
            NEW.ticket_id,
            COALESCE(NEW.actor_user_id, v_ticket.created_by),
            v_comment_id
        );
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't fail the original insert
        RAISE WARNING '[143] Error mirroring ticket event to response tables: % (event_type: %, ticket_id: %)',
            SQLERRM, NEW.event_type, NEW.ticket_id;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.mirror_ticket_event_to_response_tables IS
'Trigger function that mirrors ticket_events to ticket_comments, ticket_responses, and ticket_response_exchanges.
Migration 143 fix: source_event_id now uses UUID type matching ticket_events.id.
Includes proper quotation_number extraction for rejected/accepted events.';

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_mirror_ticket_event_to_responses ON public.ticket_events;
CREATE TRIGGER trg_mirror_ticket_event_to_responses
    AFTER INSERT ON public.ticket_events
    FOR EACH ROW
    EXECUTE FUNCTION public.mirror_ticket_event_to_response_tables();


-- ============================================
-- PART 3: Fix rpc_customer_quotation_mark_rejected
-- Changes from migration 142:
--   a) is_internal = FALSE for rejection comment (visible to all users with ticket access)
--   b) Include quotation_id and quotation_number in event new_value
--   c) Add RAISE NOTICE for debugging
--   d) Create rejection comment even when ticket is closed/resolved
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_mark_rejected(
    p_quotation_id UUID,
    p_reason_type quotation_rejection_reason_type,
    p_competitor_name TEXT DEFAULT NULL,
    p_competitor_amount NUMERIC DEFAULT NULL,
    p_customer_budget NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'IDR',
    p_notes TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_ticket RECORD;
    v_old_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_new_opp_stage opportunity_stage := NULL;
    v_actor_id UUID;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_effective_opportunity_id TEXT := NULL;
    v_derived_opportunity_id TEXT := NULL;
    v_pipeline_updated BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_quotation_sequence INTEGER := 1;
    v_sequence_label TEXT := '';
    v_previous_rejected_count INTEGER := 0;
    v_multi_cost_count INTEGER := 0;
    v_return_ticket_status TEXT := NULL;
    v_ticket_events_created INTEGER := 0;
    v_ticket_comment_created BOOLEAN := FALSE;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    RAISE NOTICE '[143][%] rpc_customer_quotation_mark_rejected started for quotation_id=%', v_correlation_id, p_quotation_id;

    -- Numeric validation
    IF p_reason_type = 'kompetitor_lebih_murah' AND p_competitor_amount IS NULL AND p_competitor_name IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Competitor name or amount required for kompetitor_lebih_murah',
            'error_code', 'VALIDATION_ERROR', 'correlation_id', v_correlation_id);
    END IF;
    IF p_reason_type = 'budget_customer_tidak_cukup' AND p_customer_budget IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Customer budget required for budget_customer_tidak_cukup',
            'error_code', 'VALIDATION_ERROR', 'correlation_id', v_correlation_id);
    END IF;
    IF p_reason_type = 'tarif_tidak_masuk' AND p_competitor_amount IS NULL AND p_customer_budget IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Either competitor amount or customer budget required for tarif_tidak_masuk',
            'error_code', 'VALIDATION_ERROR', 'correlation_id', v_correlation_id);
    END IF;

    -- Lock quotation
    SELECT cq.* INTO v_quotation FROM public.customer_quotations cq WHERE cq.id = p_quotation_id FOR UPDATE;
    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found', 'error_code', 'QUOTATION_NOT_FOUND', 'correlation_id', v_correlation_id);
    END IF;

    RAISE NOTICE '[143][%] Quotation found: number=%, ticket_id=%, status=%', v_correlation_id, v_quotation.quotation_number, v_quotation.ticket_id, v_quotation.status;

    -- Authorization check
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'reject');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object('success', FALSE, 'error', v_auth_check->>'error', 'error_code', v_auth_check->>'error_code', 'correlation_id', v_correlation_id);
    END IF;

    -- Idempotency: already rejected
    IF v_quotation.status = 'rejected' THEN
        RETURN jsonb_build_object('success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
            'quotation_status', v_quotation.status, 'is_idempotent', TRUE, 'message', 'Already rejected.', 'correlation_id', v_correlation_id);
    END IF;

    -- State machine validation
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'rejected');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object('success', FALSE, 'error', v_transition_check->>'error', 'error_code', v_transition_check->>'error_code', 'correlation_id', v_correlation_id);
    END IF;

    -- Derive opportunity_id from lead or ticket if not directly set
    v_effective_opportunity_id := v_quotation.opportunity_id;
    IF v_effective_opportunity_id IS NULL AND v_quotation.lead_id IS NOT NULL THEN
        SELECT ld.opportunity_id INTO v_derived_opportunity_id FROM public.leads ld WHERE ld.lead_id = v_quotation.lead_id AND ld.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;
    IF v_effective_opportunity_id IS NULL AND v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.opportunity_id INTO v_derived_opportunity_id FROM public.tickets t WHERE t.id = v_quotation.ticket_id AND t.opportunity_id IS NOT NULL;
        IF v_derived_opportunity_id IS NOT NULL THEN v_effective_opportunity_id := v_derived_opportunity_id; END IF;
    END IF;

    -- 1. UPDATE QUOTATION
    UPDATE public.customer_quotations cq_upd
    SET status = 'rejected'::customer_quotation_status, rejected_at = NOW(), rejection_reason = p_reason_type::TEXT, updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id RETURNING * INTO v_quotation;

    INSERT INTO public.quotation_rejection_reasons (quotation_id, reason_type, competitor_name, competitor_amount, customer_budget, currency, notes, created_by)
    VALUES (p_quotation_id, p_reason_type, p_competitor_name, p_competitor_amount, p_customer_budget, p_currency, p_notes, v_actor_id);

    -- Quotation sequence
    SELECT COUNT(*) INTO v_quotation_sequence FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;
    SELECT COUNT(*) INTO v_previous_rejected_count FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.status = 'rejected';
    v_sequence_label := CASE v_quotation_sequence WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE v_quotation_sequence::TEXT || 'th' END;

    -- 2. UPDATE OPPORTUNITY -> Negotiation
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            IF v_opportunity.stage NOT IN ('Negotiation', 'Closed Won', 'Closed Lost') THEN
                v_new_opp_stage := 'Negotiation'::opportunity_stage;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage,
                    competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                    competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                    customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;
            ELSE
                UPDATE public.opportunities opp_upd
                SET competitor = COALESCE(p_competitor_name, opp_upd.competitor),
                    competitor_price = COALESCE(p_competitor_amount, opp_upd.competitor_price),
                    customer_budget = COALESCE(p_customer_budget, opp_upd.customer_budget),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_new_opp_stage := v_opportunity.stage;
            END IF;

            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.old_stage = v_old_opp_stage AND osh.new_stage = v_new_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (opportunity_id, old_stage, new_stage, changed_by, notes, changed_at)
                    VALUES (v_effective_opportunity_id, v_old_opp_stage, v_new_opp_stage, v_actor_id,
                        '[' || v_correlation_id || '] Stage changed due to quotation rejection', NOW());
                    v_stage_history_inserted := TRUE;
                END IF;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.old_stage = v_old_opp_stage AND pu.new_stage = COALESCE(v_new_opp_stage, v_old_opp_stage)
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at)
                VALUES (v_effective_opportunity_id,
                    '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected by customer',
                    'Email'::approach_method, v_old_opp_stage, COALESCE(v_new_opp_stage, v_old_opp_stage), v_actor_id, NOW());
                v_pipeline_updates_inserted := TRUE;
            END IF;

            v_activity_subject := v_sequence_label || ' Quotation Rejected';
            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                v_activity_subject := v_activity_subject || ' → Stage moved to ' || v_new_opp_stage::TEXT;
            END IF;
            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' rejected. Reason: ' || p_reason_type::TEXT;
            IF p_competitor_name IS NOT NULL THEN v_activity_description := v_activity_description || '. Competitor: ' || p_competitor_name; END IF;
            IF p_competitor_amount IS NOT NULL THEN v_activity_description := v_activity_description || '. Competitor price: ' || p_currency || ' ' || p_competitor_amount::TEXT; END IF;

            INSERT INTO public.activities (
                related_opportunity_id, related_lead_id, related_account_id, owner_user_id, created_by,
                activity_type, subject, description, status, due_date, completed_at, created_at, updated_at
            ) VALUES (
                v_effective_opportunity_id, v_quotation.lead_id, v_opportunity.account_id, v_actor_id, v_actor_id,
                'Email'::activity_type_v2, v_activity_subject, v_activity_description,
                'Completed'::activity_status, CURRENT_DATE, NOW(), NOW(), NOW()
            );
            v_activities_inserted := TRUE;
        END IF;
    END IF;

    -- 3. UPDATE TICKET -> need_adjustment
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.* INTO v_ticket FROM public.tickets t WHERE t.id = v_quotation.ticket_id FOR UPDATE;

        IF v_ticket IS NOT NULL AND v_ticket.status NOT IN ('closed', 'resolved') THEN
            v_old_ticket_status := v_ticket.status;
            UPDATE public.tickets t_upd
            SET status = 'need_adjustment'::ticket_status, pending_response_from = 'assignee', updated_at = NOW()
            WHERE t_upd.id = v_quotation.ticket_id RETURNING * INTO v_ticket;
            v_return_ticket_status := v_ticket.status::TEXT;

            -- FIX (migration 143): Include quotation_id and quotation_number in new_value
            -- so the mirror trigger can generate proper auto-comments
            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_quotation.ticket_id, 'customer_quotation_rejected'::ticket_event_type, v_actor_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object(
                    'status', 'need_adjustment',
                    'quotation_id', v_quotation.id,
                    'quotation_number', v_quotation.quotation_number,
                    'quotation_status', 'rejected',
                    'rejection_reason', p_reason_type::TEXT,
                    'competitor_name', p_competitor_name,
                    'competitor_amount', p_competitor_amount,
                    'customer_budget', p_customer_budget,
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected. Reason: ' || p_reason_type::TEXT, NOW());
            v_ticket_events_created := v_ticket_events_created + 1;

            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, new_value, notes, created_at)
            VALUES (v_quotation.ticket_id, 'request_adjustment'::ticket_event_type, v_actor_id,
                jsonb_build_object('reason', p_reason_type::TEXT, 'triggered_by', 'quotation_rejection', 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Rate adjustment requested due to quotation rejection', NOW());
            v_ticket_events_created := v_ticket_events_created + 1;

            -- FIX (migration 143): Use is_internal = FALSE so sales users can see rejection in activity
            INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
            VALUES (v_quotation.ticket_id, v_actor_id,
                'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT ||
                CASE WHEN p_competitor_name IS NOT NULL THEN '. Competitor: ' || p_competitor_name ELSE '' END ||
                CASE WHEN p_competitor_amount IS NOT NULL THEN '. Competitor price: ' || p_currency || ' ' || p_competitor_amount::TEXT ELSE '' END ||
                CASE WHEN p_customer_budget IS NOT NULL THEN '. Customer budget: ' || p_currency || ' ' || p_customer_budget::TEXT ELSE '' END ||
                CASE WHEN p_notes IS NOT NULL THEN '. Notes: ' || p_notes ELSE '' END,
                FALSE, NOW());
            v_ticket_comment_created := TRUE;

        ELSE
            -- Ticket already closed/resolved - still record event AND comment
            v_return_ticket_status := COALESCE(v_ticket.status::TEXT, 'unknown');
            IF v_ticket IS NOT NULL THEN
                v_old_ticket_status := v_ticket.status;

                INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
                VALUES (v_quotation.ticket_id, 'customer_quotation_rejected'::ticket_event_type, v_actor_id,
                    jsonb_build_object('status', v_ticket.status::TEXT),
                    jsonb_build_object(
                        'quotation_id', v_quotation.id,
                        'quotation_number', v_quotation.quotation_number,
                        'rejection_reason', p_reason_type::TEXT,
                        'ticket_status_unchanged', TRUE,
                        'correlation_id', v_correlation_id
                    ),
                    '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' rejected (ticket already ' || v_ticket.status::TEXT || ', status unchanged)', NOW());
                v_ticket_events_created := v_ticket_events_created + 1;

                -- FIX (migration 143): Also create comment even when ticket is closed/resolved
                INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
                VALUES (v_quotation.ticket_id, v_actor_id,
                    'Quotation ' || v_quotation.quotation_number || ' rejected by customer. Reason: ' || p_reason_type::TEXT ||
                    ' (ticket already ' || v_ticket.status::TEXT || ', status unchanged)' ||
                    CASE WHEN p_notes IS NOT NULL THEN '. Notes: ' || p_notes ELSE '' END,
                    FALSE, NOW());
                v_ticket_comment_created := TRUE;
            END IF;
        END IF;

        RAISE NOTICE '[143][%] Ticket update: ticket_id=%, old_status=%, new_status=%, events_created=%, comment_created=%',
            v_correlation_id, v_quotation.ticket_id, v_old_ticket_status, v_return_ticket_status, v_ticket_events_created, v_ticket_comment_created;
    ELSE
        RAISE NOTICE '[143][%] No ticket_id on quotation - skipping ticket update', v_correlation_id;
    END IF;

    -- 4. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads SET quotation_status = 'rejected', updated_at = NOW() WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 5. UPDATE OPERATIONAL COSTS
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes SET status = 'revise_requested'::quote_status, updated_at = NOW() WHERE id = v_quotation.operational_cost_id;
    END IF;
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq SET status = 'revise_requested'::quote_status, updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids) AND trq.status IN ('submitted', 'sent_to_customer');
        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    RAISE NOTICE '[143][%] rpc_customer_quotation_mark_rejected completed successfully', v_correlation_id;

    RETURN jsonb_build_object(
        'success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status, 'rejection_reason', p_reason_type::TEXT,
        'opportunity_id', v_effective_opportunity_id, 'old_stage', v_old_opp_stage, 'new_stage', v_new_opp_stage,
        'ticket_id', v_quotation.ticket_id, 'ticket_status', v_return_ticket_status,
        'stage_history_inserted', v_stage_history_inserted, 'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted, 'multi_shipment_costs_updated', v_multi_cost_count,
        'quotation_sequence', v_quotation_sequence, 'sequence_label', v_sequence_label,
        'previous_rejected_count', v_previous_rejected_count,
        'ticket_events_created', v_ticket_events_created,
        'ticket_comment_created', v_ticket_comment_created,
        'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[143][%] rpc_customer_quotation_mark_rejected FAILED: % (SQLSTATE: %)', v_correlation_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_rejected IS
'Migration 143 fix: Rejection comment now uses is_internal=FALSE for visibility to sales users.
Event new_value includes quotation_id/quotation_number for proper mirror trigger auto-comments.
Creates comment even when ticket is closed/resolved. Includes RAISE NOTICE for debugging.';


-- ============================================
-- PART 4: Update RLS policies
-- Allow quotation creators to see ticket events and comments
-- for tickets linked to their quotations
-- ============================================

-- Update ticket_events SELECT policy to include quotation creators
DROP POLICY IF EXISTS "ticket_events_select_policy" ON public.ticket_events;
CREATE POLICY "ticket_events_select_policy" ON public.ticket_events
    FOR SELECT
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR public.is_ticketing_ops(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
                -- FIX (migration 143): Allow quotation creators to see ticket events
                OR EXISTS (
                    SELECT 1 FROM public.customer_quotations cq
                    WHERE cq.ticket_id = t.id
                    AND cq.created_by = auth.uid()
                )
            )
        )
    );

-- Update ticket_comments SELECT policy to include quotation creators
-- and make non-internal rejection comments visible to them
DROP POLICY IF EXISTS "ticket_comments_select_policy" ON public.ticket_comments;
CREATE POLICY "ticket_comments_select_policy" ON public.ticket_comments
    FOR SELECT
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.id = ticket_id
            AND (
                public.is_ticketing_admin(auth.uid())
                OR public.is_ticketing_ops(auth.uid())
                OR t.created_by = auth.uid()
                OR t.assigned_to = auth.uid()
                -- FIX (migration 143): Allow quotation creators to see ticket comments
                OR EXISTS (
                    SELECT 1 FROM public.customer_quotations cq
                    WHERE cq.ticket_id = t.id
                    AND cq.created_by = auth.uid()
                )
            )
        )
        -- Hide internal comments from non-ops/non-admin users
        AND (
            is_internal = FALSE
            OR public.is_ticketing_ops(auth.uid())
            OR public.is_ticketing_admin(auth.uid())
        )
    );


-- ============================================
-- PART 5: Performance index for RLS subquery
-- The new RLS policies query customer_quotations(ticket_id, created_by)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_customer_quotations_ticket_created_by
ON public.customer_quotations(ticket_id, created_by)
WHERE ticket_id IS NOT NULL;


-- ============================================
-- PART 6: Re-grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_ticket_event_to_response_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_ticket_event_to_response_tables() TO service_role;


-- ============================================
-- SUMMARY
-- ============================================
-- 1. Fixed source_event_id column: BIGINT → UUID (matching ticket_events.id)
-- 2. Recreated mirror trigger with:
--    a) Proper quotation_number extraction for rejected/accepted events
--    b) SET search_path for security
--    c) Skip auto-comments for events that have direct RPC comments (avoids duplicates)
--    d) Still creates ticket_responses for SLA tracking
-- 3. Updated rpc_customer_quotation_mark_rejected:
--    a) Rejection comment now is_internal = FALSE (visible to sales users)
--    b) Event new_value includes quotation_id, quotation_number, competitor details
--    c) Comment created even when ticket is closed/resolved
--    d) Return value includes ticket_events_created and ticket_comment_created counts
--    e) RAISE NOTICE for debugging
-- 4. Updated RLS policies:
--    a) ticket_events_select_policy: quotation creators can see ticket events
--    b) ticket_comments_select_policy: quotation creators can see ticket comments
-- 5. Performance index on customer_quotations(ticket_id, created_by) for RLS subquery
-- 6. Re-granted all permissions
-- ============================================
