-- =====================================================
-- Migration 144: Fix Quotation Sent Pipeline Stage & Ticket Visibility
-- =====================================================
-- ROOT CAUSE ANALYSIS:
--
-- Bug 1: When 2nd customer quotation is sent after 1st was rejected,
-- the pipeline/opportunity stage does NOT update from Quote Sent to Negotiation.
--
-- Root cause: rpc_customer_quotation_mark_sent counts v_previous_rejected_count
-- ONLY by opportunity_id. If Q1 and Q2 resolve to different opportunity_ids
-- (due to fn_resolve_or_create_opportunity resolution paths), the count is 0
-- and the stage transition to 'Negotiation' never fires.
--
-- Additionally, if the new opportunity starts at 'Prospecting' (e.g., auto-created),
-- the 1st branch fires (→ Quote Sent) instead of going directly to Negotiation.
--
-- Bug 2: ticketId shows as 0/null in the quotation listing despite the database
-- having the correct ticket_id UUID.
--
-- Root cause: The GET endpoint joins to the tickets table using the authenticated
-- client, which respects RLS. The tickets_select_policy (migration 075) only allows
-- admin, ops (department), ticket creator, or ticket assignee. Quotation creators
-- are NOT included, so the ticket join returns null.
--
-- Bug 3 (inherited from migration 142): mark_sent comment uses is_internal = TRUE,
-- hiding the "quotation sent" activity from sales users (same issue we fixed for
-- rejection comments in migration 143).
--
-- FIXES:
-- 1. Update rpc_customer_quotation_mark_sent:
--    a) Broaden v_previous_rejected_count to check by ticket_id, lead_id, AND opportunity_id
--    b) Reorder stage transitions: if previous rejections exist, go to Negotiation first
--    c) Change is_internal = TRUE to FALSE for sent comment
--    d) Add RAISE NOTICE for debugging
-- 2. Update tickets_select_policy to include quotation creators
-- 3. Re-grant permissions
-- =====================================================


-- ============================================
-- PART 1: Fix rpc_customer_quotation_mark_sent
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_mark_sent(
    p_quotation_id UUID,
    p_sent_via TEXT,
    p_sent_to TEXT,
    p_actor_user_id UUID,
    p_correlation_id TEXT DEFAULT NULL,
    p_allow_autocreate BOOLEAN DEFAULT TRUE
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_ticket RECORD;
    v_lead RECORD;
    v_resolved_opp RECORD;
    v_old_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_new_opp_stage opportunity_stage := NULL;
    v_effective_opportunity_id TEXT := NULL;
    v_is_resend BOOLEAN := FALSE;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_pipeline_updated BOOLEAN := FALSE;
    v_opportunity_auto_created BOOLEAN := FALSE;
    v_stage_history_inserted BOOLEAN := FALSE;
    v_pipeline_updates_inserted BOOLEAN := FALSE;
    v_activities_inserted BOOLEAN := FALSE;
    v_quotation_sequence INTEGER := 1;
    v_sequence_label TEXT := '';
    v_previous_rejected_count INTEGER := 0;
    v_multi_cost_count INTEGER := 0;
    v_return_ticket_status TEXT := NULL;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    RAISE NOTICE '[144][%] rpc_customer_quotation_mark_sent started for quotation_id=%', v_correlation_id, p_quotation_id;

    SELECT cq.* INTO v_quotation FROM public.customer_quotations cq WHERE cq.id = p_quotation_id FOR UPDATE;
    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found', 'error_code', 'QUOTATION_NOT_FOUND', 'correlation_id', v_correlation_id);
    END IF;

    RAISE NOTICE '[144][%] Quotation found: number=%, ticket_id=%, lead_id=%, opportunity_id=%, status=%',
        v_correlation_id, v_quotation.quotation_number, v_quotation.ticket_id, v_quotation.lead_id, v_quotation.opportunity_id, v_quotation.status;

    v_auth_check := fn_check_quotation_authorization(p_quotation_id, p_actor_user_id, 'send');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object('success', FALSE, 'error', v_auth_check->>'error', 'error_code', v_auth_check->>'error_code', 'correlation_id', v_correlation_id);
    END IF;

    IF v_quotation.status = 'sent' THEN v_is_resend := TRUE; END IF;

    IF NOT v_is_resend THEN
        v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'sent');
        IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
            RETURN jsonb_build_object('success', FALSE, 'error', v_transition_check->>'error', 'error_code', v_transition_check->>'error_code', 'correlation_id', v_correlation_id);
        END IF;
    END IF;

    -- 1. UPDATE QUOTATION
    UPDATE public.customer_quotations cq_upd
    SET status = 'sent'::customer_quotation_status, sent_via = COALESCE(p_sent_via, cq_upd.sent_via),
        sent_to = COALESCE(p_sent_to, cq_upd.sent_to), sent_at = COALESCE(cq_upd.sent_at, NOW()), updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id RETURNING * INTO v_quotation;

    -- 2. RESOLVE OPPORTUNITY
    IF NOT v_is_resend THEN
        SELECT resolved.* INTO v_resolved_opp FROM public.fn_resolve_or_create_opportunity(p_quotation_id, p_actor_user_id, p_allow_autocreate) resolved;
        IF v_resolved_opp.error_code IS NOT NULL THEN
            RETURN jsonb_build_object('success', FALSE, 'error', COALESCE(v_resolved_opp.error_message, 'Failed to resolve opportunity'),
                'error_code', v_resolved_opp.error_code, 'quotation_id', v_quotation.id, 'correlation_id', v_correlation_id);
        END IF;
        IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_resolved_opp.opportunity_id;
            v_opportunity_auto_created := v_resolved_opp.was_created;
            IF v_quotation.opportunity_id IS NULL THEN
                UPDATE public.customer_quotations SET opportunity_id = v_effective_opportunity_id WHERE id = p_quotation_id;
            END IF;
        END IF;
    ELSE
        v_effective_opportunity_id := v_quotation.opportunity_id;
    END IF;

    -- Quotation sequence (by opportunity_id for consistency)
    SELECT COUNT(*) INTO v_quotation_sequence FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;

    -- FIX (migration 144): Broaden v_previous_rejected_count to also check by ticket_id
    -- This handles cases where Q1 and Q2 resolve to different opportunity_ids
    -- (e.g., orphan repair, account-based resolution, or auto-creation)
    -- Note: lead_id is only used as fallback when ticket_id is null, to avoid
    -- false positives from unrelated tickets sharing the same lead
    SELECT COUNT(*) INTO v_previous_rejected_count FROM public.customer_quotations cq2
    WHERE cq2.id != p_quotation_id
      AND cq2.status = 'rejected'
      AND (
          (v_effective_opportunity_id IS NOT NULL AND cq2.opportunity_id = v_effective_opportunity_id)
          OR (v_quotation.ticket_id IS NOT NULL AND cq2.ticket_id = v_quotation.ticket_id)
          OR (v_quotation.ticket_id IS NULL AND v_quotation.lead_id IS NOT NULL AND cq2.lead_id = v_quotation.lead_id)
      );

    RAISE NOTICE '[144][%] Sequence: %, previous_rejected_count: %, effective_opp_id: %',
        v_correlation_id, v_quotation_sequence, v_previous_rejected_count, v_effective_opportunity_id;

    v_sequence_label := CASE v_quotation_sequence WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE v_quotation_sequence::TEXT || 'th' END;

    -- 3. UPDATE OPPORTUNITY
    IF v_effective_opportunity_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            RAISE NOTICE '[144][%] Opportunity found: id=%, stage=%, previous_rejected=%',
                v_correlation_id, v_opportunity.opportunity_id, v_opportunity.stage, v_previous_rejected_count;

            -- FIX (migration 144): Prioritize rejection check BEFORE stage-based transitions
            -- If there are previous rejections, the pipeline should be in Negotiation
            -- regardless of what stage the opportunity happens to be in
            IF v_previous_rejected_count > 0 AND v_opportunity.stage NOT IN ('Negotiation', 'Closed Won', 'Closed Lost') THEN
                -- Previous rejections exist: go directly to Negotiation
                -- This handles cases where:
                --   - Rejection didn't update the stage (old migration)
                --   - Different opportunity was resolved (orphan repair, etc.)
                --   - Stage was manually moved back
                v_new_opp_stage := 'Negotiation'::opportunity_stage;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage,
                    estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;

                RAISE NOTICE '[144][%] Stage transition: % → Negotiation (previous rejections: %)',
                    v_correlation_id, v_old_opp_stage, v_previous_rejected_count;

            ELSIF v_opportunity.stage IN ('Prospecting', 'Discovery') AND v_previous_rejected_count = 0 THEN
                -- First quotation sent (no prior rejections): Prospecting/Discovery → Quote Sent
                v_new_opp_stage := 'Quote Sent'::opportunity_stage;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage,
                    estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;

            ELSIF v_opportunity.stage IN ('Quote Sent', 'Negotiation') THEN
                -- Already in Quote Sent or Negotiation: stay but update estimated_value
                v_new_opp_stage := v_opportunity.stage;
                UPDATE public.opportunities opp_upd
                SET estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

            ELSIF v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost') THEN
                -- Other non-terminal stages: stay but update estimated_value
                v_new_opp_stage := v_opportunity.stage;
                UPDATE public.opportunities opp_upd
                SET estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

            ELSE
                -- Terminal stages (Closed Won/Closed Lost): don't change anything
                v_new_opp_stage := v_opportunity.stage;
            END IF;

            -- Stage history
            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.old_stage = v_old_opp_stage AND osh.new_stage = v_new_opp_stage
                    AND osh.changed_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (opportunity_id, old_stage, new_stage, changed_by, notes, changed_at)
                    VALUES (v_effective_opportunity_id, v_old_opp_stage, v_new_opp_stage, p_actor_user_id,
                        '[' || v_correlation_id || '] Stage changed due to quotation sent (previous_rejected: ' || v_previous_rejected_count || ')', NOW());
                    v_stage_history_inserted := TRUE;
                END IF;
            END IF;

            -- Pipeline updates
            IF NOT EXISTS (
                SELECT 1 FROM public.pipeline_updates pu
                WHERE pu.opportunity_id = v_effective_opportunity_id
                AND pu.old_stage = v_old_opp_stage
                AND pu.new_stage = COALESCE(v_new_opp_stage, v_old_opp_stage)
                AND pu.created_at > NOW() - INTERVAL '1 minute'
            ) THEN
                INSERT INTO public.pipeline_updates (
                    opportunity_id, notes, approach_method, old_stage, new_stage, updated_by, updated_at
                ) VALUES (
                    v_effective_opportunity_id,
                    '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer'
                        || CASE WHEN v_previous_rejected_count > 0
                            THEN ' (revised after ' || v_previous_rejected_count || ' rejection(s))'
                            ELSE '' END,
                    'Email'::approach_method,
                    v_old_opp_stage,
                    COALESCE(v_new_opp_stage, v_old_opp_stage),
                    p_actor_user_id,
                    NOW()
                );
                v_pipeline_updates_inserted := TRUE;
            END IF;

            -- Activity
            v_activity_subject := v_sequence_label || ' Quotation Sent';
            IF v_old_opp_stage IS DISTINCT FROM v_new_opp_stage THEN
                v_activity_subject := v_activity_subject || ' → Stage moved to ' || v_new_opp_stage::TEXT;
            ELSIF v_previous_rejected_count > 0 THEN
                v_activity_subject := v_activity_subject || ' (Negotiation in progress)';
            END IF;
            v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' sent via ' || COALESCE(p_sent_via, 'system') || ' to ' || COALESCE(p_sent_to, 'customer');

            INSERT INTO public.activities (
                related_opportunity_id, related_lead_id, related_account_id, owner_user_id, created_by,
                activity_type, subject, description, status, due_date, completed_at, created_at, updated_at
            ) VALUES (
                v_effective_opportunity_id, v_quotation.lead_id, v_opportunity.account_id, p_actor_user_id, p_actor_user_id,
                'Email'::activity_type_v2, v_activity_subject, v_activity_description,
                'Completed'::activity_status, CURRENT_DATE, NOW(), NOW(), NOW()
            );
            v_activities_inserted := TRUE;
        END IF;
    END IF;

    -- 3b. UPDATE TICKET
    IF v_quotation.ticket_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT t.* INTO v_ticket FROM public.tickets t WHERE t.id = v_quotation.ticket_id FOR UPDATE;
        IF v_ticket IS NOT NULL THEN
            v_old_ticket_status := v_ticket.status;
            UPDATE public.tickets t_upd
            SET status = 'waiting_customer'::ticket_status,
                pending_response_from = 'creator',
                updated_at = NOW()
            WHERE t_upd.id = v_quotation.ticket_id
            RETURNING * INTO v_ticket;
            v_return_ticket_status := v_ticket.status::TEXT;

            -- Ticket event
            INSERT INTO public.ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at)
            VALUES (v_quotation.ticket_id, 'customer_quotation_sent'::ticket_event_type, p_actor_user_id,
                jsonb_build_object('status', v_old_ticket_status::TEXT),
                jsonb_build_object('status', 'waiting_customer', 'sent_via', p_sent_via, 'sent_to', p_sent_to,
                    'quotation_number', v_quotation.quotation_number, 'correlation_id', v_correlation_id),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system'), NOW());

            -- FIX (migration 144): Use is_internal = FALSE so sales users can see "sent" in activity
            -- (Same fix as migration 143 applied to rejection comments)
            INSERT INTO public.ticket_comments (ticket_id, user_id, content, is_internal, created_at)
            VALUES (v_quotation.ticket_id, p_actor_user_id,
                v_sequence_label || ' quotation (' || v_quotation.quotation_number || ') sent to customer via ' || COALESCE(p_sent_via, 'system') || ' to ' || COALESCE(p_sent_to, 'customer') || '.',
                FALSE, NOW());
        END IF;
    END IF;

    -- 4. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        IF v_is_resend THEN
            UPDATE public.leads ld SET quotation_status = 'sent', latest_quotation_id = v_quotation.id, updated_at = NOW() WHERE ld.lead_id = v_quotation.lead_id;
        ELSE
            UPDATE public.leads ld SET quotation_status = 'sent', latest_quotation_id = v_quotation.id, quotation_count = COALESCE(ld.quotation_count, 0) + 1, updated_at = NOW() WHERE ld.lead_id = v_quotation.lead_id;
        END IF;
    END IF;

    -- 5. UPDATE OPERATIONAL COSTS
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes trq SET status = 'sent_to_customer'::quote_status, updated_at = NOW() WHERE trq.id = v_quotation.operational_cost_id;
    END IF;
    IF v_quotation.operational_cost_ids IS NOT NULL AND array_length(v_quotation.operational_cost_ids, 1) > 0 THEN
        UPDATE public.ticket_rate_quotes trq SET status = 'sent_to_customer'::quote_status, updated_at = NOW()
        WHERE trq.id = ANY(v_quotation.operational_cost_ids) AND trq.status = 'submitted';
        GET DIAGNOSTICS v_multi_cost_count = ROW_COUNT;
    END IF;

    RAISE NOTICE '[144][%] rpc_customer_quotation_mark_sent completed: old_stage=%, new_stage=%, pipeline_updated=%',
        v_correlation_id, v_old_opp_stage, v_new_opp_stage, v_pipeline_updated;

    RETURN jsonb_build_object(
        'success', TRUE, 'quotation_id', v_quotation.id, 'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status, 'opportunity_id', COALESCE(v_effective_opportunity_id, v_quotation.opportunity_id),
        'old_stage', v_old_opp_stage, 'new_stage', v_new_opp_stage, 'ticket_id', v_quotation.ticket_id,
        'ticket_status', v_return_ticket_status, 'is_resend', v_is_resend,
        'pipeline_updated', v_pipeline_updated, 'opportunity_auto_created', v_opportunity_auto_created,
        'stage_history_inserted', v_stage_history_inserted, 'pipeline_updates_inserted', v_pipeline_updates_inserted,
        'activities_inserted', v_activities_inserted, 'quotation_sequence', v_quotation_sequence,
        'sequence_label', v_sequence_label, 'previous_rejected_count', v_previous_rejected_count,
        'multi_shipment_costs_updated', v_multi_cost_count,
        'correlation_id', v_correlation_id
    );
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[144][%] rpc_customer_quotation_mark_sent FAILED: % (SQLSTATE: %)', v_correlation_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS
'Migration 144 fixes:
1. v_previous_rejected_count now checks by ticket_id, lead_id, AND opportunity_id
   (handles mismatched opportunity_ids across quotations for same ticket/lead)
2. Stage transition prioritizes rejection check: if previous rejections exist,
   go directly to Negotiation regardless of current stage (unless already Negotiation/terminal)
3. Sent comment uses is_internal=FALSE (visible to sales users in activity timeline)
4. RAISE NOTICE added for debugging pipeline stage transitions';


-- ============================================
-- PART 2: Fix mirror trigger to prevent duplicate ticket_responses
-- The mirror trigger (migration 143) skips auto-comments for events with
-- direct RPC comments (customer_quotation_rejected, customer_quotation_sent),
-- but still creates ticket_responses entries. The direct comment INSERT also
-- fires trigger_auto_record_response which creates another ticket_responses entry.
-- Fix: Skip the entire trigger processing for these event types (return early),
-- since the RPC handles all tracking (comment + response) directly.
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
    -- Skip events that are fully handled by their respective RPCs
    -- (which create their own comments + trigger_auto_record_response handles SLA tracking)
    -- This prevents duplicate ticket_responses entries
    IF NEW.event_type::TEXT IN (
        'comment_added',
        'customer_quotation_rejected',
        'customer_quotation_sent'
    ) THEN
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

    -- Create auto-generated comment for significant events
    -- Skip SLA-only events that don't need visible comments
    IF NEW.event_type::TEXT NOT IN (
        'escalation_timer_started', 'escalation_timer_stopped', 'sla_checked'
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
            NEW.id  -- UUID, matching ticket_events.id type
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
        RAISE WARNING '[144] Error mirroring ticket event to response tables: % (event_type: %, ticket_id: %)',
            SQLERRM, NEW.event_type, NEW.ticket_id;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.mirror_ticket_event_to_response_tables IS
'Migration 144 fix: Events with direct RPC comments (customer_quotation_rejected,
customer_quotation_sent) now skip entirely (RETURN NEW) to prevent duplicate
ticket_responses entries. Previously, the trigger created one ticket_responses
entry and the direct comment trigger created another.';

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_mirror_ticket_event_to_responses ON public.ticket_events;
CREATE TRIGGER trg_mirror_ticket_event_to_responses
    AFTER INSERT ON public.ticket_events
    FOR EACH ROW
    EXECUTE FUNCTION public.mirror_ticket_event_to_response_tables();


-- ============================================
-- PART 3: Update tickets_select_policy
-- Allow quotation creators to see tickets linked to their quotations
-- This fixes the ticket join returning null in the GET endpoint
-- ============================================

DROP POLICY IF EXISTS "tickets_select_policy" ON public.tickets;
CREATE POLICY "tickets_select_policy" ON public.tickets
    FOR SELECT
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (
            -- Admin sees all
            public.is_ticketing_admin(auth.uid())
            -- Ops sees their department's tickets (origin or target)
            OR (
                public.is_ticketing_ops(auth.uid())
                AND (
                    origin_dept = public.get_user_ticketing_department(auth.uid())
                    OR target_dept = public.get_user_ticketing_department(auth.uid())
                    OR department = public.get_user_ticketing_department(auth.uid())
                )
            )
            -- Creator sees own tickets
            OR created_by = auth.uid()
            -- Assignee sees assigned tickets
            OR assigned_to = auth.uid()
            -- FIX (migration 144): Quotation creators can see tickets linked to their quotations
            -- This ensures the ticket join in GET /api/ticketing/customer-quotations returns data
            OR EXISTS (
                SELECT 1 FROM public.customer_quotations cq
                WHERE cq.ticket_id = tickets.id
                AND cq.created_by = auth.uid()
            )
        )
    );


-- ============================================
-- PART 4: Re-grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_ticket_event_to_response_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_ticket_event_to_response_tables() TO service_role;


-- ============================================
-- SUMMARY
-- ============================================
-- 1. Fixed rpc_customer_quotation_mark_sent:
--    a) v_previous_rejected_count now checks by ticket_id AND opportunity_id
--       (lead_id used as fallback only when ticket_id is null)
--    b) Stage transition logic reordered: if previous rejections exist → Negotiation
--       regardless of current stage (unless already Negotiation or terminal)
--    c) Sent comment now uses is_internal=FALSE (visible to sales users)
--    d) Added quotation_number to the ticket event new_value JSONB
--    e) Added RAISE NOTICE for debugging pipeline stage transitions
-- 2. Fixed mirror_ticket_event_to_response_tables trigger:
--    Events with direct RPC comments (customer_quotation_rejected, customer_quotation_sent)
--    now skip entirely (RETURN NEW) to prevent duplicate ticket_responses entries
-- 3. Updated tickets_select_policy:
--    Quotation creators can now see tickets linked to their quotations
--    (fixes ticket join returning null in GET endpoint)
-- 4. Re-granted all permissions
-- ============================================
