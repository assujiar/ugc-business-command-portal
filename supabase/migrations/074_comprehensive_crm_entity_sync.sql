-- ============================================
-- Migration: 074_comprehensive_crm_entity_sync.sql
-- Fix: Comprehensive multi-directional sync between CRM entities
--
-- Issues Fixed:
-- 1. Operational Cost (ticket_rate_quotes) direct updates don't propagate
--    to Customer Quotations
-- 2. Closing an Opportunity via simple PATCH doesn't update Account status
--    (calon_account → new_account or failed_account)
-- 3. Direct Ticket status changes don't sync to Customer Quotations
--
-- Solution:
-- 1. Add trigger on ticket_rate_quotes to sync status changes to quotations
-- 2. Add trigger on opportunities to update account status on close
-- 3. Add trigger on tickets for status change sync to quotations
-- ============================================

-- ============================================
-- 1. OPERATIONAL COST → CUSTOMER QUOTATION SYNC
-- When ticket_rate_quotes status changes, update linked quotation
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_operational_cost_to_quotation(
    p_cost_id UUID,
    p_new_status quote_status
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_quotation_status TEXT;
    v_updated_count INTEGER := 0;
BEGIN
    -- Map operational cost status to quotation status
    v_quotation_status := CASE p_new_status::TEXT
        WHEN 'sent_to_customer' THEN 'sent'
        WHEN 'accepted' THEN 'accepted'
        WHEN 'rejected' THEN 'rejected'
        ELSE NULL
    END;

    -- If no valid mapping, skip sync (e.g., 'draft', 'submitted' statuses)
    IF v_quotation_status IS NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'synced', FALSE,
            'message', 'No status mapping for: ' || p_new_status::TEXT
        );
    END IF;

    -- Find and update all quotations linked to this operational cost
    UPDATE public.customer_quotations
    SET
        status = v_quotation_status,
        updated_at = NOW()
    WHERE operational_cost_id = p_cost_id
    AND status NOT IN ('accepted', 'rejected', 'expired')
    RETURNING * INTO v_quotation;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- If a quotation was updated, trigger full sync to propagate to other entities
    IF v_updated_count > 0 AND v_quotation IS NOT NULL THEN
        -- Sync to ticket, lead, opportunity (but not back to operational cost to avoid loop)
        IF v_quotation.ticket_id IS NOT NULL THEN
            PERFORM public.sync_quotation_to_ticket(v_quotation.id, v_quotation_status, v_quotation.created_by);
        END IF;

        IF v_quotation.lead_id IS NOT NULL THEN
            UPDATE public.leads
            SET quotation_status = v_quotation_status, updated_at = NOW()
            WHERE lead_id = v_quotation.lead_id;
        END IF;

        IF v_quotation.opportunity_id IS NOT NULL THEN
            UPDATE public.opportunities
            SET quotation_status = v_quotation_status, updated_at = NOW()
            WHERE opportunity_id = v_quotation.opportunity_id;

            -- Auto-transition opportunity stage
            IF v_quotation_status = 'sent' THEN
                UPDATE public.opportunities
                SET stage = 'Quote Sent', updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id
                AND stage IN ('Prospecting', 'Discovery');
            ELSIF v_quotation_status = 'rejected' THEN
                UPDATE public.opportunities
                SET stage = 'Negotiation', updated_at = NOW()
                WHERE opportunity_id = v_quotation.opportunity_id
                AND stage = 'Quote Sent';
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'synced', v_updated_count > 0,
        'updated_count', v_updated_count,
        'new_quotation_status', v_quotation_status
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function for ticket_rate_quotes status changes
CREATE OR REPLACE FUNCTION public.trigger_sync_operational_cost_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger when status changes to a syncable status
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('sent_to_customer', 'accepted', 'rejected') THEN
        PERFORM public.sync_operational_cost_to_quotation(NEW.id, NEW.status);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_sync_operational_cost_status_change ON ticket_rate_quotes;

-- Create trigger on ticket_rate_quotes
CREATE TRIGGER trg_sync_operational_cost_status_change
    AFTER UPDATE ON public.ticket_rate_quotes
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('sent_to_customer', 'accepted', 'rejected'))
    EXECUTE FUNCTION public.trigger_sync_operational_cost_status_change();

-- ============================================
-- 2. OPPORTUNITY CLOSE → ACCOUNT STATUS SYNC
-- When opportunity closes (Won/Lost), update linked account status
-- ============================================

CREATE OR REPLACE FUNCTION public.sync_opportunity_to_account(
    p_opportunity_id TEXT,
    p_outcome TEXT -- 'won' or 'lost'
)
RETURNS JSONB AS $$
DECLARE
    v_opportunity RECORD;
    v_new_account_status TEXT;
    v_update_time TIMESTAMPTZ := NOW();
BEGIN
    -- Get opportunity with account
    SELECT o.*, a.account_id, a.account_status as current_account_status
    INTO v_opportunity
    FROM public.opportunities o
    LEFT JOIN public.accounts a ON a.account_id = o.account_id
    WHERE o.opportunity_id = p_opportunity_id;

    IF v_opportunity IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Opportunity not found');
    END IF;

    -- If no account linked, nothing to sync
    IF v_opportunity.account_id IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'synced', FALSE, 'message', 'No account linked');
    END IF;

    -- Determine new account status based on outcome
    IF p_outcome = 'won' THEN
        v_new_account_status := 'new_account';

        -- Update account to new_account with transaction dates
        UPDATE public.accounts
        SET
            account_status = v_new_account_status,
            first_transaction_date = COALESCE(first_transaction_date, v_update_time),
            last_transaction_date = v_update_time,
            updated_at = v_update_time
        WHERE account_id = v_opportunity.account_id;

    ELSIF p_outcome = 'lost' THEN
        -- Only mark as failed if account is still calon_account (first pipeline failed)
        IF v_opportunity.current_account_status = 'calon_account' THEN
            v_new_account_status := 'failed_account';

            UPDATE public.accounts
            SET
                account_status = v_new_account_status,
                updated_at = v_update_time
            WHERE account_id = v_opportunity.account_id;
        ELSE
            -- For existing accounts (not calon), don't change status on lost
            RETURN jsonb_build_object(
                'success', TRUE,
                'synced', FALSE,
                'message', 'Account not calon_account, status unchanged'
            );
        END IF;
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid outcome: ' || p_outcome);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'synced', TRUE,
        'account_id', v_opportunity.account_id,
        'old_status', v_opportunity.current_account_status,
        'new_status', v_new_account_status
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger_sync_quotation_on_opportunity_close to also sync account status
CREATE OR REPLACE FUNCTION trigger_sync_quotation_on_opportunity_close()
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
            RETURN NEW;
        END IF;

        -- Sync to quotations AND tickets (existing behavior)
        PERFORM public.sync_opportunity_to_quotation(NEW.opportunity_id, v_outcome);

        -- NEW: Also sync to account status
        PERFORM public.sync_opportunity_to_account(NEW.opportunity_id, v_outcome);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger with updated function
DROP TRIGGER IF EXISTS trg_sync_quotation_on_opportunity_close ON opportunities;

CREATE TRIGGER trg_sync_quotation_on_opportunity_close
    AFTER UPDATE ON opportunities
    FOR EACH ROW
    WHEN (OLD.stage IS DISTINCT FROM NEW.stage AND NEW.stage IN ('Closed Won', 'Closed Lost'))
    EXECUTE FUNCTION trigger_sync_quotation_on_opportunity_close();

-- ============================================
-- 3. TICKET STATUS CHANGE → QUOTATION SYNC
-- When ticket status changes directly (via API or DB), sync to quotations
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_sync_ticket_status_to_quotation()
RETURNS TRIGGER AS $$
DECLARE
    v_quotation_status TEXT;
    v_quotation RECORD;
BEGIN
    -- Map ticket status changes to quotation status
    -- Only handle meaningful status transitions
    IF NEW.status = 'closed' AND NEW.close_outcome IS NOT NULL THEN
        -- Ticket closed with outcome → sync to quotations
        IF NEW.close_outcome = 'won' THEN
            v_quotation_status := 'accepted';
        ELSIF NEW.close_outcome = 'lost' THEN
            v_quotation_status := 'rejected';
        ELSE
            -- Other outcomes (cancelled, etc.) → no quotation sync
            RETURN NEW;
        END IF;

        -- Update all active quotations for this ticket
        FOR v_quotation IN
            SELECT * FROM public.customer_quotations
            WHERE ticket_id = NEW.id
            AND status IN ('draft', 'sent')
        LOOP
            UPDATE public.customer_quotations
            SET status = v_quotation_status, updated_at = NOW()
            WHERE id = v_quotation.id;

            -- Also update linked operational cost
            IF v_quotation.operational_cost_id IS NOT NULL THEN
                UPDATE public.ticket_rate_quotes
                SET
                    status = CASE v_quotation_status
                        WHEN 'accepted' THEN 'accepted'::quote_status
                        WHEN 'rejected' THEN 'rejected'::quote_status
                    END,
                    updated_at = NOW()
                WHERE id = v_quotation.operational_cost_id;
            END IF;
        END LOOP;

        -- Update linked lead and opportunity quotation_status
        IF NEW.lead_id IS NOT NULL THEN
            UPDATE public.leads
            SET quotation_status = v_quotation_status, updated_at = NOW()
            WHERE lead_id = NEW.lead_id;
        END IF;

        IF NEW.opportunity_id IS NOT NULL THEN
            UPDATE public.opportunities
            SET quotation_status = v_quotation_status, updated_at = NOW()
            WHERE opportunity_id = NEW.opportunity_id;
        END IF;

    ELSIF NEW.status = 'need_adjustment' AND OLD.status != 'need_adjustment' THEN
        -- Ticket moved to need_adjustment → quotation should be rejected (to create new version)
        v_quotation_status := 'rejected';

        UPDATE public.customer_quotations
        SET status = v_quotation_status, updated_at = NOW()
        WHERE ticket_id = NEW.id
        AND status = 'sent';

        -- Update linked lead and opportunity
        IF NEW.lead_id IS NOT NULL THEN
            UPDATE public.leads
            SET quotation_status = v_quotation_status, updated_at = NOW()
            WHERE lead_id = NEW.lead_id;
        END IF;

        IF NEW.opportunity_id IS NOT NULL THEN
            UPDATE public.opportunities
            SET
                quotation_status = v_quotation_status,
                stage = CASE
                    WHEN stage = 'Quote Sent' THEN 'Negotiation'
                    ELSE stage
                END,
                updated_at = NOW()
            WHERE opportunity_id = NEW.opportunity_id
            AND stage NOT IN ('Closed Won', 'Closed Lost');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_sync_ticket_status_to_quotation ON tickets;

-- Create trigger on tickets for status changes
-- Note: This fires AFTER UPDATE to avoid interfering with the update itself
CREATE TRIGGER trg_sync_ticket_status_to_quotation
    AFTER UPDATE ON public.tickets
    FOR EACH ROW
    WHEN (
        OLD.status IS DISTINCT FROM NEW.status
        AND (
            (NEW.status = 'closed' AND NEW.close_outcome IN ('won', 'lost'))
            OR (NEW.status = 'need_adjustment' AND OLD.status != 'need_adjustment')
        )
    )
    EXECUTE FUNCTION public.trigger_sync_ticket_status_to_quotation();

-- ============================================
-- 4. UPDATE rpc_opportunity_change_stage TO INCLUDE ACCOUNT SYNC
-- ============================================

CREATE OR REPLACE FUNCTION rpc_opportunity_change_stage(
    p_opportunity_id TEXT,
    p_new_stage opportunity_stage,
    p_notes TEXT DEFAULT NULL,
    p_close_reason TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_opp RECORD;
    v_existing JSONB;
    v_result JSONB;
    v_quotation_sync JSONB;
    v_account_sync JSONB;
BEGIN
    -- Check idempotency
    IF p_idempotency_key IS NOT NULL THEN
        v_existing := check_idempotency(p_idempotency_key);
        IF v_existing IS NOT NULL THEN
            RETURN v_existing;
        END IF;
    END IF;

    -- Lock opportunity
    SELECT * INTO v_opp FROM opportunities WHERE opportunity_id = p_opportunity_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Opportunity not found: %', p_opportunity_id;
    END IF;

    IF v_opp.stage IN ('Closed Won', 'Closed Lost') THEN
        RAISE EXCEPTION 'Cannot change stage of closed opportunity';
    END IF;

    -- Update opportunity
    UPDATE opportunities SET
        stage = p_new_stage,
        close_reason = CASE WHEN p_new_stage IN ('Closed Won', 'Closed Lost') THEN p_close_reason ELSE close_reason END,
        closed_at = CASE WHEN p_new_stage IN ('Closed Won', 'Closed Lost') THEN NOW() ELSE NULL END,
        updated_at = NOW()
    WHERE opportunity_id = p_opportunity_id;

    -- Stage history is auto-logged by trigger (004_tables_opportunities.sql)

    -- Sync quotation status and account status when opportunity is closed
    IF p_new_stage = 'Closed Won' THEN
        v_quotation_sync := public.sync_opportunity_to_quotation(p_opportunity_id, 'won');
        v_account_sync := public.sync_opportunity_to_account(p_opportunity_id, 'won');
    ELSIF p_new_stage = 'Closed Lost' THEN
        v_quotation_sync := public.sync_opportunity_to_quotation(p_opportunity_id, 'lost');
        v_account_sync := public.sync_opportunity_to_account(p_opportunity_id, 'lost');
    END IF;

    v_result := jsonb_build_object(
        'success', true,
        'opportunity_id', p_opportunity_id,
        'old_stage', v_opp.stage::TEXT,
        'new_stage', p_new_stage::TEXT,
        'quotation_sync', v_quotation_sync,
        'account_sync', v_account_sync
    );

    IF p_idempotency_key IS NOT NULL THEN
        PERFORM store_idempotency(p_idempotency_key, 'stage_change-' || p_opportunity_id, v_result);
    END IF;

    INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
    VALUES ('opportunities', 'stage_change', 'opportunity', p_opportunity_id, auth.uid(), v_result);

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.sync_operational_cost_to_quotation(UUID, quote_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_opportunity_to_account(TEXT, TEXT) TO authenticated;

-- ============================================
-- 6. ADD COMMENTS
-- ============================================

COMMENT ON FUNCTION public.sync_operational_cost_to_quotation(UUID, quote_status) IS 'Syncs operational cost status changes to linked customer quotations and propagates to other entities';
COMMENT ON TRIGGER trg_sync_operational_cost_status_change ON ticket_rate_quotes IS 'Auto-sync operational cost status changes to linked quotations';

COMMENT ON FUNCTION public.sync_opportunity_to_account(TEXT, TEXT) IS 'Updates account status (calon→new_account or calon→failed_account) when opportunity closes';
COMMENT ON TRIGGER trg_sync_quotation_on_opportunity_close ON opportunities IS 'Auto-sync opportunity close to quotations, tickets, AND account status';

COMMENT ON FUNCTION public.trigger_sync_ticket_status_to_quotation() IS 'Syncs ticket status changes (closed/need_adjustment) to linked quotations and entities';
COMMENT ON TRIGGER trg_sync_ticket_status_to_quotation ON tickets IS 'Auto-sync ticket status changes to linked quotations';

COMMENT ON FUNCTION public.rpc_opportunity_change_stage(TEXT, opportunity_stage, TEXT, TEXT, TEXT) IS 'Opportunity stage transition with quotation, ticket, AND account sync';

-- ============================================
-- SUMMARY OF SYNC RELATIONSHIPS
-- ============================================
--
-- The CRM entities now have full multi-directional synchronization:
--
-- 1. Operational Cost (ticket_rate_quotes) → Customer Quotation → Ticket/Lead/Opportunity
--    Trigger: trg_sync_operational_cost_status_change
--    Status mapping: sent_to_customer→sent, accepted→accepted, rejected→rejected
--
-- 2. Customer Quotation → Operational Cost/Ticket/Lead/Opportunity
--    Trigger: trg_sync_quotation_status_change (migration 058)
--    Calls: sync_quotation_to_all()
--
-- 3. Opportunity Close → Customer Quotation/Ticket/Account
--    Trigger: trg_sync_quotation_on_opportunity_close
--    Account status: won→new_account, lost→failed_account (if calon_account)
--
-- 4. Ticket Status Change → Customer Quotation/Operational Cost/Lead/Opportunity
--    Trigger: trg_sync_ticket_status_to_quotation
--    Handles: closed (won/lost) and need_adjustment
--
-- 5. Lead Disqualified → Customer Quotation (existing)
--    Function: sync_lead_to_quotation (migration 058)
-- ============================================
