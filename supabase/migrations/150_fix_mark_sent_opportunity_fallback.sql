-- =====================================================
-- Migration 150: Fix mark_sent missing opportunity fallback
-- =====================================================
--
-- BUG: rpc_customer_quotation_mark_sent relies ENTIRELY on
-- fn_resolve_or_create_opportunity to return the opportunity_id.
-- If the resolve function returns no rows or NULL opportunity_id
-- (without an error code), v_effective_opportunity_id stays NULL.
-- This causes the ENTIRE opportunity section (stage transition,
-- pipeline_updates, activities) and ticket section to be skipped,
-- even when the quotation already has opportunity_id set.
--
-- CONTRAST with mark_rejected (migration 143): That function
-- correctly starts with v_effective_opportunity_id := v_quotation.opportunity_id
-- and then derives from lead/ticket if null.
--
-- EVIDENCE from production response:
--   old_stage: null, new_stage: null, ticket_status: null,
--   opportunity_id: "OPP20260209FEE5E1" (from COALESCE fallback in RETURN),
--   previous_rejected_count: 1 (found via lead_id, not opportunity_id),
--   quotation_sequence: 1 (no other quotation with same opp_id found)
--
-- FIX: After the resolve call, if v_effective_opportunity_id is still NULL,
-- fall back to v_quotation.opportunity_id. This matches mark_rejected's pattern.
-- =====================================================

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

    RAISE NOTICE '[150][%] rpc_customer_quotation_mark_sent started for quotation_id=%', v_correlation_id, p_quotation_id;

    SELECT cq.* INTO v_quotation FROM public.customer_quotations cq WHERE cq.id = p_quotation_id FOR UPDATE;
    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found', 'error_code', 'QUOTATION_NOT_FOUND', 'correlation_id', v_correlation_id);
    END IF;

    RAISE NOTICE '[150][%] Quotation found: number=%, ticket_id=%, lead_id=%, opportunity_id=%, status=%',
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

        -- FIX (migration 150): Fallback to quotation's own opportunity_id
        -- The resolve function may return no rows (e.g., edge case in RETURNS TABLE
        -- functions) or NULL opportunity_id without an error code. In that case,
        -- fall back to the quotation's existing opportunity_id (same pattern as
        -- mark_rejected which starts with v_effective_opportunity_id := v_quotation.opportunity_id).
        IF v_effective_opportunity_id IS NULL AND v_quotation.opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_quotation.opportunity_id;
            RAISE NOTICE '[150][%] Fallback: resolve returned no opportunity, using quotation.opportunity_id=%',
                v_correlation_id, v_quotation.opportunity_id;
        END IF;
    ELSE
        v_effective_opportunity_id := v_quotation.opportunity_id;
    END IF;

    -- Quotation sequence (by opportunity_id for consistency)
    SELECT COUNT(*) INTO v_quotation_sequence FROM public.customer_quotations cq2
    WHERE cq2.opportunity_id = v_effective_opportunity_id AND cq2.id != p_quotation_id AND cq2.created_at < v_quotation.created_at;
    v_quotation_sequence := v_quotation_sequence + 1;

    -- Broaden v_previous_rejected_count to also check by ticket_id and lead_id
    SELECT COUNT(*) INTO v_previous_rejected_count FROM public.customer_quotations cq2
    WHERE cq2.id != p_quotation_id
      AND cq2.status = 'rejected'
      AND (
          (v_effective_opportunity_id IS NOT NULL AND cq2.opportunity_id = v_effective_opportunity_id)
          OR (v_quotation.ticket_id IS NOT NULL AND cq2.ticket_id = v_quotation.ticket_id)
          OR (v_quotation.ticket_id IS NULL AND v_quotation.lead_id IS NOT NULL AND cq2.lead_id = v_quotation.lead_id)
      );

    RAISE NOTICE '[150][%] Sequence: %, previous_rejected_count: %, effective_opp_id: %',
        v_correlation_id, v_quotation_sequence, v_previous_rejected_count, v_effective_opportunity_id;

    v_sequence_label := CASE v_quotation_sequence WHEN 1 THEN '1st' WHEN 2 THEN '2nd' WHEN 3 THEN '3rd' ELSE v_quotation_sequence::TEXT || 'th' END;

    -- 3. UPDATE OPPORTUNITY
    IF v_effective_opportunity_id IS NOT NULL AND NOT v_is_resend THEN
        SELECT opp.* INTO v_opportunity FROM public.opportunities opp WHERE opp.opportunity_id = v_effective_opportunity_id FOR UPDATE;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            RAISE NOTICE '[150][%] Opportunity found: id=%, stage=%, previous_rejected=%',
                v_correlation_id, v_opportunity.opportunity_id, v_opportunity.stage, v_previous_rejected_count;

            -- Prioritize rejection check BEFORE stage-based transitions
            IF v_previous_rejected_count > 0 AND v_opportunity.stage NOT IN ('Negotiation', 'Closed Won', 'Closed Lost') THEN
                v_new_opp_stage := 'Negotiation'::opportunity_stage;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage,
                    estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;

                RAISE NOTICE '[150][%] Stage transition: % → Negotiation (previous rejections: %)',
                    v_correlation_id, v_old_opp_stage, v_previous_rejected_count;

            ELSIF v_opportunity.stage IN ('Prospecting', 'Discovery') AND v_previous_rejected_count = 0 THEN
                v_new_opp_stage := 'Quote Sent'::opportunity_stage;
                UPDATE public.opportunities opp_upd
                SET stage = v_new_opp_stage,
                    estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;
                v_pipeline_updated := TRUE;

            ELSIF v_opportunity.stage IN ('Quote Sent', 'Negotiation') THEN
                v_new_opp_stage := v_opportunity.stage;
                UPDATE public.opportunities opp_upd
                SET estimated_value = COALESCE(v_quotation.total_selling_rate, opp_upd.estimated_value),
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

            ELSIF v_opportunity.stage NOT IN ('Closed Won', 'Closed Lost') THEN
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

            -- Comment with is_internal = FALSE (visible to sales users in activity timeline)
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

    RAISE NOTICE '[150][%] rpc_customer_quotation_mark_sent completed: old_stage=%, new_stage=%, pipeline_updated=%, effective_opp_id=%',
        v_correlation_id, v_old_opp_stage, v_new_opp_stage, v_pipeline_updated, v_effective_opportunity_id;

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
    RAISE WARNING '[150][%] rpc_customer_quotation_mark_sent FAILED: % (SQLSTATE: %)', v_correlation_id, SQLERRM, SQLSTATE;
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'error_code', 'INTERNAL_ERROR', 'detail', SQLSTATE, 'correlation_id', v_correlation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS
'Migration 150 fix: Added fallback to quotation.opportunity_id when fn_resolve_or_create_opportunity
returns no rows or NULL opportunity_id. Without this, the entire opportunity section (stage transitions,
pipeline_updates, activities) and ticket section were skipped when the resolve function failed silently.
This matches mark_rejected pattern which starts with v_effective_opportunity_id := v_quotation.opportunity_id.

Preserves all migration 144 fixes:
1. v_previous_rejected_count checks by ticket_id, lead_id, AND opportunity_id
2. Stage transition prioritizes rejection check (→ Negotiation if previous rejections exist)
3. Sent comment uses is_internal=FALSE
4. RAISE NOTICE for debugging';


-- ============================================
-- GRANT (same signature, but re-grant for safety)
-- ============================================
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO service_role;
