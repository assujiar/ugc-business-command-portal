-- =====================================================
-- Migration 140: Deep Audit Fixes
-- =====================================================
-- Fixes found during comprehensive CRM + Ticketing audit:
-- 1. Add 'WhatsApp' to activity_type_v2 enum (was in approach_method but not activity_type_v2)
-- 2. Fix trigger cascade: trg_sync_ticket_status_to_quotation sets ALL quotations to accepted
-- 3. Fix mark_rejected: SKIPPED - had compile-time errors, properly fixed in migration 141
-- 4. Fix mark_sent: add missing SET search_path
-- 5. Fix revoke: SKIPPED - had compile-time errors, properly fixed in migration 141
-- 6. Add missing service_role GRANTs
-- =====================================================


-- ============================================
-- PART 1: Add 'WhatsApp' to activity_type_v2 enum
-- Pipeline update uses approach_method as activity_type,
-- but 'WhatsApp' only existed in approach_method, not activity_type_v2.
-- This caused silent INSERT failures for WhatsApp activities.
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'WhatsApp' AND enumtypid = 'activity_type_v2'::regtype) THEN
        ALTER TYPE activity_type_v2 ADD VALUE 'WhatsApp';
    END IF;
END $$;


-- ============================================
-- PART 2: Fix trigger cascade - trg_sync_ticket_status_to_quotation
-- PROBLEM: When ticket closes with close_outcome='won', the trigger
-- sets ALL draft/sent quotations to 'accepted'. This is wrong -
-- only the specifically accepted quotation should be 'accepted'.
-- Other draft/sent quotations should be set to 'expired' instead.
--
-- Also: When ticket closes with close_outcome='won', the specific
-- quotation was already set to 'accepted' by the RPC. So the trigger
-- should only handle the OTHER quotations (set them to 'expired').
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
        IF NEW.close_outcome = 'won' THEN
            -- Ticket closed as won: the accepted quotation was already set by RPC.
            -- Set remaining draft/sent quotations to 'expired' (not 'accepted').
            FOR v_quotation IN
                SELECT * FROM public.customer_quotations
                WHERE ticket_id = NEW.id
                AND status IN ('draft', 'sent')
            LOOP
                UPDATE public.customer_quotations
                SET status = 'expired'::customer_quotation_status, updated_at = NOW()
                WHERE id = v_quotation.id;

                -- Also expire linked operational costs
                IF v_quotation.operational_cost_id IS NOT NULL THEN
                    UPDATE public.ticket_rate_quotes
                    SET status = 'rejected'::quote_status, updated_at = NOW()
                    WHERE id = v_quotation.operational_cost_id
                    AND status NOT IN ('accepted', 'rejected', 'won');
                END IF;
            END LOOP;

        ELSIF NEW.close_outcome = 'lost' THEN
            v_quotation_status := 'rejected';

            -- Update all active quotations for this ticket
            FOR v_quotation IN
                SELECT * FROM public.customer_quotations
                WHERE ticket_id = NEW.id
                AND status IN ('draft', 'sent')
            LOOP
                UPDATE public.customer_quotations
                SET status = v_quotation_status::customer_quotation_status, updated_at = NOW()
                WHERE id = v_quotation.id;

                IF v_quotation.operational_cost_id IS NOT NULL THEN
                    UPDATE public.ticket_rate_quotes
                    SET status = 'rejected'::quote_status, updated_at = NOW()
                    WHERE id = v_quotation.operational_cost_id
                    AND status NOT IN ('accepted', 'rejected', 'won');
                END IF;
            END LOOP;
        ELSE
            -- Other outcomes → no quotation sync
            RETURN NEW;
        END IF;

        -- Update linked lead and opportunity quotation_status
        IF NEW.lead_id IS NOT NULL THEN
            UPDATE public.leads
            SET quotation_status = CASE NEW.close_outcome WHEN 'won' THEN 'accepted' ELSE 'rejected' END,
                updated_at = NOW()
            WHERE lead_id = NEW.lead_id;
        END IF;

        IF NEW.opportunity_id IS NOT NULL THEN
            UPDATE public.opportunities
            SET quotation_status = CASE NEW.close_outcome WHEN 'won' THEN 'accepted' ELSE 'rejected' END,
                updated_at = NOW()
            WHERE opportunity_id = NEW.opportunity_id;
        END IF;

    ELSIF NEW.status = 'need_adjustment' AND OLD.status != 'need_adjustment' THEN
        -- Ticket moved to need_adjustment → reject current 'sent' quotations
        v_quotation_status := 'rejected';

        UPDATE public.customer_quotations
        SET status = v_quotation_status::customer_quotation_status, updated_at = NOW()
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- PART 3: Fix mark_rejected - SKIPPED
-- This function had compile-time errors (undeclared v_activity_subject,
-- JSONB used as BOOLEAN, wrong parameter names/order).
-- Properly fixed in migration 141 instead.
-- ============================================


-- ============================================
-- PART 4: Fix mark_sent - add SET search_path (was missing in migration 138)
-- Only need to re-declare with SET search_path, function body unchanged.
-- ============================================

-- Read mark_sent from migration 138 and add SET search_path
-- We use a targeted ALTER approach instead of full re-create
ALTER FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN)
SET search_path = public, pg_temp;


-- ============================================
-- PART 5: Fix revoke - SKIPPED
-- This function had compile-time errors (JSONB used as BOOLEAN).
-- Properly fixed in migration 141 instead.
-- ============================================


-- ============================================
-- PART 6: Missing service_role GRANTs
-- ============================================

-- Functions currently missing service_role grant
GRANT EXECUTE ON FUNCTION public.rpc_ticket_assign TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_ticket_add_comment TO service_role;

-- Re-grant updated functions
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_revoke_acceptance(UUID, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_revoke_acceptance(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_sync_ticket_status_to_quotation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_sync_ticket_status_to_quotation() TO service_role;


-- ============================================
-- SUMMARY OF FIXES IN MIGRATION 140
-- ============================================
-- 1. Added 'WhatsApp' to activity_type_v2 enum (was causing silent activity INSERT failures)
-- 2. Fixed trigger_sync_ticket_status_to_quotation: won→expire other quotations (not accept them all)
-- 3. SKIPPED mark_rejected (compile errors) - fixed in migration 141
-- 4. Fixed mark_sent: added SET search_path for security consistency
-- 5. SKIPPED revoke (compile errors) - fixed in migration 141
-- 6. Added missing service_role GRANTs for rpc_ticket_assign, rpc_ticket_add_comment
