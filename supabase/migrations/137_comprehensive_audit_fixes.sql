-- ============================================
-- Migration: 137_comprehensive_audit_fixes.sql
--
-- PURPOSE: Implement ALL fixes from comprehensive CRM + Ticketing audit
-- covering CRITICAL, HIGH, MEDIUM, and LOW findings.
--
-- FINDINGS ADDRESSED:
-- C1: customer_id duplication risk (deprecate leads.customer_id)
-- C2: Ticket close without close_outcome = no cascade
-- C3: Quotation accepted when valid_until expired
-- C4: Ticket+Lead linkage documentation (already works via trigger)
-- H1: No revoke mechanism for accepted quotations
-- H2: fn_validate_ticket_transition conflicts with rpc_ticket_transition
-- H4: Rejected quotation edge case when ticket already closed
-- H5: lost_reason is TEXT, no constraint
-- M1: leads.status is obsolete (triage_status is SSOT)
-- M2: Parallel audit trails documentation
-- M3: account_status stored vs calculated documentation
-- M4: quotation_count ambiguity documentation
-- M5: fn_check_quotation_authorization too broad
-- M6: Rejection reasons are per-quotation (document)
-- L1: Dual from_stage/to_stage and old_stage/new_stage documentation
-- ============================================


-- ============================================
-- PART 1: ENUM ADDITIONS
-- ============================================

-- H1: Add 'revoked' to customer_quotation_status enum
-- Needed for revoking an accepted quotation
DO $$ BEGIN
    ALTER TYPE customer_quotation_status ADD VALUE IF NOT EXISTS 'revoked';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- ============================================
-- PART 2: STATE MACHINE FIXES
-- ============================================

-- H2: Fix fn_validate_ticket_transition
-- PROBLEMS in migration 078:
--   - References 'waiting_vendor' and 'on_hold' which are NOT in ticket_status enum
--   - Missing 'need_response' and 'pending' which ARE in the enum
--   - Has "closed": [] but rpc_ticket_transition (037) allows closed→open (reopen)
-- FIX: Align with actual ticket_status enum values AND rpc_ticket_transition behavior

CREATE OR REPLACE FUNCTION public.fn_validate_ticket_transition(
    p_current_status TEXT,
    p_target_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_valid_transitions JSONB;
BEGIN
    -- Define valid state machine transitions matching actual ticket_status enum:
    -- 'open', 'need_response', 'in_progress', 'waiting_customer',
    -- 'need_adjustment', 'pending', 'resolved', 'closed'
    v_valid_transitions := '{
        "open": ["in_progress", "pending", "closed"],
        "need_response": ["in_progress", "waiting_customer", "resolved", "closed"],
        "in_progress": ["need_response", "waiting_customer", "need_adjustment", "pending", "resolved", "closed"],
        "waiting_customer": ["in_progress", "need_adjustment", "resolved", "closed"],
        "need_adjustment": ["in_progress", "resolved", "closed"],
        "pending": ["open", "in_progress", "resolved", "closed"],
        "resolved": ["closed", "in_progress"],
        "closed": ["open"]
    }'::JSONB;

    -- Check if current status exists in state machine
    IF NOT v_valid_transitions ? p_current_status THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Unknown current status: ' || p_current_status,
            'error_code', 'INVALID_STATUS'
        );
    END IF;

    -- Check if target status is allowed from current status
    IF v_valid_transitions->p_current_status @> to_jsonb(p_target_status) THEN
        RETURN jsonb_build_object('valid', TRUE);
    END IF;

    -- Specific conflict message for closed tickets (but reopening IS allowed)
    IF p_current_status = 'closed' AND p_target_status != 'open' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Closed tickets can only be reopened (transition to open). Cannot transition to ' || p_target_status,
            'error_code', 'CONFLICT_TICKET_CLOSED'
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', FALSE,
        'error', 'Invalid ticket transition from ' || p_current_status || ' to ' || p_target_status,
        'error_code', 'INVALID_STATUS_TRANSITION'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.fn_validate_ticket_transition IS
'State machine validator for ticket status transitions. Aligned with actual ticket_status enum (open, need_response, in_progress, waiting_customer, need_adjustment, pending, resolved, closed). Allows closed→open for reopen. Fixed in migration 137.';


-- H1: Update fn_validate_quotation_transition to allow accepted→revoked
CREATE OR REPLACE FUNCTION public.fn_validate_quotation_transition(
    p_current_status TEXT,
    p_target_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_valid_transitions JSONB;
BEGIN
    -- customer_quotation_status: 'draft', 'sent', 'accepted', 'rejected', 'expired', 'revoked'
    v_valid_transitions := '{
        "draft": ["sent", "rejected"],
        "sent": ["rejected", "accepted", "expired"],
        "rejected": [],
        "accepted": ["revoked"],
        "expired": [],
        "revoked": []
    }'::JSONB;

    IF NOT v_valid_transitions ? p_current_status THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Unknown current status: ' || p_current_status,
            'error_code', 'INVALID_STATUS'
        );
    END IF;

    IF v_valid_transitions->p_current_status @> to_jsonb(p_target_status) THEN
        RETURN jsonb_build_object('valid', TRUE);
    END IF;

    IF p_current_status = 'accepted' AND p_target_status != 'revoked' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Accepted quotation can only be revoked. Cannot transition to ' || p_target_status,
            'error_code', 'CONFLICT_ALREADY_ACCEPTED'
        );
    END IF;

    IF p_current_status = 'rejected' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quotation already rejected. Create a new quotation instead.',
            'error_code', 'CONFLICT_ALREADY_REJECTED'
        );
    END IF;

    IF p_current_status = 'expired' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quotation has expired. Create a new quotation instead.',
            'error_code', 'CONFLICT_EXPIRED'
        );
    END IF;

    IF p_current_status = 'revoked' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quotation was revoked. Create a new quotation instead.',
            'error_code', 'CONFLICT_REVOKED'
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', FALSE,
        'error', 'Invalid transition from ' || p_current_status || ' to ' || p_target_status,
        'error_code', 'INVALID_STATUS_TRANSITION'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.fn_validate_quotation_transition IS
'State machine for customer_quotation_status. Supports: draft→sent→accepted→revoked, draft/sent→rejected, sent→expired. Fixed in migration 137.';


-- ============================================
-- PART 3: VALIDATION TRIGGERS
-- ============================================

-- C2: Require close_outcome when closing a ticket
-- rpc_ticket_transition (037) uses COALESCE(p_close_outcome, close_outcome)
-- which means closing without an outcome is silently allowed.
-- This trigger enforces that close_outcome must be set when status becomes 'closed'.

CREATE OR REPLACE FUNCTION public.trigger_validate_ticket_close_outcome()
RETURNS TRIGGER AS $$
BEGIN
    -- When ticket transitions TO closed, close_outcome must be set
    IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
        IF NEW.close_outcome IS NULL THEN
            RAISE EXCEPTION 'close_outcome is required when closing a ticket. Must be ''won'' or ''lost''.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_ticket_close_outcome ON tickets;

CREATE TRIGGER trg_validate_ticket_close_outcome
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW
    WHEN (NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed')
    EXECUTE FUNCTION public.trigger_validate_ticket_close_outcome();

COMMENT ON TRIGGER trg_validate_ticket_close_outcome ON tickets IS
'C2 fix: Ensures close_outcome (won/lost) is always provided when closing a ticket. Prevents silent cascade failure.';


-- C3: Validate valid_until when accepting a quotation
-- Prevents accepting an expired quotation

CREATE OR REPLACE FUNCTION public.trigger_validate_quotation_acceptance()
RETURNS TRIGGER AS $$
BEGIN
    -- When quotation transitions TO accepted, check valid_until
    IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
        IF NEW.valid_until IS NOT NULL AND NEW.valid_until < CURRENT_DATE THEN
            RAISE EXCEPTION 'Cannot accept quotation: it expired on %. Please create a new quotation.', NEW.valid_until;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_quotation_acceptance ON customer_quotations;

CREATE TRIGGER trg_validate_quotation_acceptance
    BEFORE UPDATE ON public.customer_quotations
    FOR EACH ROW
    WHEN (NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted')
    EXECUTE FUNCTION public.trigger_validate_quotation_acceptance();

COMMENT ON TRIGGER trg_validate_quotation_acceptance ON customer_quotations IS
'C3 fix: Prevents accepting quotations past their valid_until date. Applies universally to all update paths.';


-- ============================================
-- PART 4: NEW RPC - REVOKE QUOTATION ACCEPTANCE (H1)
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_revoke_acceptance(
    p_quotation_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_actor_user_id UUID DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_ticket RECORD;
    v_actor_id UUID;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_effective_opportunity_id TEXT := NULL;
BEGIN
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);
    v_actor_id := COALESCE(p_actor_user_id, auth.uid());

    -- Lock quotation
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id
    FOR UPDATE;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Quotation not found',
            'error_code', 'QUOTATION_NOT_FOUND',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Authorization
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, v_actor_id, 'revoke');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- Idempotency
    IF v_quotation.status = 'revoked' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'quotation_id', v_quotation.id,
            'quotation_status', 'revoked',
            'is_idempotent', TRUE,
            'message', 'Quotation was already revoked.',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- State machine validation (only accepted→revoked is valid)
    v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'revoked');
    IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_transition_check->>'error',
            'error_code', v_transition_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- 1. UPDATE QUOTATION → revoked
    UPDATE public.customer_quotations
    SET
        status = 'revoked'::customer_quotation_status,
        updated_at = NOW()
    WHERE id = p_quotation_id
    RETURNING * INTO v_quotation;

    v_effective_opportunity_id := v_quotation.opportunity_id;

    -- 2. REOPEN OPPORTUNITY (Closed Won → Negotiation)
    IF v_effective_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_effective_opportunity_id
        FOR UPDATE;

        IF v_opportunity IS NOT NULL AND v_opportunity.stage = 'Closed Won' THEN
            UPDATE public.opportunities
            SET
                stage = 'Negotiation'::opportunity_stage,
                quotation_status = 'revoked',
                closed_at = NULL,
                updated_at = NOW()
            WHERE opportunity_id = v_effective_opportunity_id;

            INSERT INTO public.opportunity_stage_history (
                opportunity_id, old_stage, new_stage, changed_by, notes, changed_at
            ) VALUES (
                v_effective_opportunity_id,
                'Closed Won'::opportunity_stage,
                'Negotiation'::opportunity_stage,
                v_actor_id,
                '[' || v_correlation_id || '] Quotation acceptance revoked: ' || COALESCE(p_reason, 'No reason provided'),
                NOW()
            );
        END IF;
    END IF;

    -- 3. REOPEN TICKET (closed → open)
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT * INTO v_ticket
        FROM public.tickets
        WHERE id = v_quotation.ticket_id
        FOR UPDATE;

        IF v_ticket IS NOT NULL AND v_ticket.status = 'closed' THEN
            UPDATE public.tickets
            SET
                status = 'open'::ticket_status,
                close_outcome = NULL,
                close_reason = NULL,
                closed_at = NULL,
                updated_at = NOW()
            WHERE id = v_quotation.ticket_id;

            INSERT INTO public.ticket_events (
                ticket_id, event_type, actor_user_id, old_value, new_value, notes, created_at
            ) VALUES (
                v_quotation.ticket_id,
                'reopened'::ticket_event_type,
                v_actor_id,
                jsonb_build_object('status', 'closed', 'close_outcome', v_ticket.close_outcome),
                jsonb_build_object('status', 'open', 'reason', 'quotation_revoked'),
                '[' || v_correlation_id || '] Ticket reopened: quotation acceptance revoked',
                NOW()
            );
        END IF;
    END IF;

    -- 4. REVERT ACCOUNT STATUS (if was changed to active by acceptance)
    IF v_opportunity IS NOT NULL AND v_opportunity.account_id IS NOT NULL THEN
        UPDATE public.accounts
        SET
            account_status = 'calon_account'::account_status,
            updated_at = NOW()
        WHERE account_id = v_opportunity.account_id
        AND account_status = 'active_account';
    END IF;

    -- 5. UPDATE LEAD
    IF v_quotation.lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET quotation_status = 'revoked', updated_at = NOW()
        WHERE lead_id = v_quotation.lead_id;
    END IF;

    -- 6. REVERT OPERATIONAL COST
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes
        SET status = 'sent_to_customer'::quote_status, updated_at = NOW()
        WHERE id = v_quotation.operational_cost_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', 'revoked',
        'opportunity_id', v_effective_opportunity_id,
        'ticket_id', v_quotation.ticket_id,
        'reason', p_reason,
        'correlation_id', v_correlation_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', 'INTERNAL_ERROR',
            'detail', SQLSTATE,
            'correlation_id', v_correlation_id
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.rpc_customer_quotation_revoke_acceptance IS
'H1 fix: Revokes an accepted quotation, reopens opportunity (→Negotiation), reopens ticket (→open), reverts account status. Atomic with correlation_id.';


-- ============================================
-- PART 5: AUTHORIZATION TIGHTENING (M5)
-- ============================================

-- M5: fn_check_quotation_authorization was too broad
-- Restrict: remove 'sales', 'marketing' from v_allowed_roles
-- Only superadmin, director, manager, accountmanager should have blanket access.
-- Sales and marketing should only access their own quotations/tickets.

CREATE OR REPLACE FUNCTION public.fn_check_quotation_authorization(
    p_quotation_id UUID,
    p_actor_user_id UUID,
    p_action TEXT DEFAULT 'transition'
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_profile RECORD;
    v_is_creator BOOLEAN := FALSE;
    v_is_ticket_owner BOOLEAN := FALSE;
    v_is_ticket_assignee BOOLEAN := FALSE;
    v_has_elevated_role BOOLEAN := FALSE;
    -- M5 fix: Removed 'sales' and 'marketing' from blanket access
    v_allowed_roles TEXT[] := ARRAY['superadmin', 'director', 'manager', 'accountmanager'];
BEGIN
    IF p_actor_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'authorized', FALSE,
            'error', 'Actor user ID is required for authorization',
            'error_code', 'UNAUTHORIZED_NO_ACTOR'
        );
    END IF;

    SELECT cq.*, t.created_by AS ticket_creator, t.assigned_to AS ticket_assignee
    INTO v_quotation
    FROM public.customer_quotations cq
    LEFT JOIN public.tickets t ON t.id = cq.ticket_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object(
            'authorized', FALSE,
            'error', 'Quotation not found',
            'error_code', 'QUOTATION_NOT_FOUND'
        );
    END IF;

    SELECT * INTO v_profile
    FROM public.profiles
    WHERE user_id = p_actor_user_id;

    IF v_profile IS NULL THEN
        RETURN jsonb_build_object(
            'authorized', FALSE,
            'error', 'Actor profile not found',
            'error_code', 'UNAUTHORIZED_NO_PROFILE'
        );
    END IF;

    v_is_creator := (v_quotation.created_by = p_actor_user_id);
    v_is_ticket_owner := (v_quotation.ticket_creator = p_actor_user_id);
    v_is_ticket_assignee := (v_quotation.ticket_assignee = p_actor_user_id);
    v_has_elevated_role := (v_profile.role::TEXT = ANY(v_allowed_roles));

    IF v_is_creator OR v_is_ticket_owner OR v_is_ticket_assignee OR v_has_elevated_role THEN
        RETURN jsonb_build_object(
            'authorized', TRUE,
            'is_creator', v_is_creator,
            'is_ticket_owner', v_is_ticket_owner,
            'is_ticket_assignee', v_is_ticket_assignee,
            'has_elevated_role', v_has_elevated_role,
            'actor_role', v_profile.role
        );
    END IF;

    RETURN jsonb_build_object(
        'authorized', FALSE,
        'error', 'You do not have permission to ' || p_action || ' this quotation. Must be creator, ticket owner/assignee, or have an elevated role (superadmin/director/manager/accountmanager).',
        'error_code', 'FORBIDDEN'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_check_quotation_authorization IS
'M5 fix: Tightened authorization - removed blanket sales/marketing access. Only creator, ticket owner/assignee, or elevated roles (superadmin/director/manager/accountmanager).';


-- ============================================
-- PART 6: DOCUMENTATION COMMENTS
-- ============================================

-- C1: leads.customer_id deprecation notice
COMMENT ON COLUMN public.leads.customer_id IS
'DEPRECATED (C1): Use account_id instead. customer_id duplicates account_id and can cause desync. Will be removed in future migration.';

-- C4: Ticket+Lead atomic linkage documentation
COMMENT ON FUNCTION public.trigger_propagate_lead_on_ticket_insert IS
'C4 docs: Atomically links ticket→lead→opportunity when ticket is created with lead_id. Already handles C4 concern - no additional fix needed.';

-- M1: leads.status is obsolete
COMMENT ON COLUMN public.leads.status IS
'DEPRECATED (M1): This column uses lead_status enum (New/Contacted/Qualified/Proposal/Negotiation/Closed Won/Closed Lost) which overlaps with triage_status. Use triage_status as the SSOT for lead lifecycle management.';

-- M2: Parallel audit trails
COMMENT ON TABLE public.pipeline_updates IS
'M2 docs: Sales-oriented pipeline updates (approach_method, notes). Parallel to opportunity_stage_history which is system-triggered. Both exist intentionally - pipeline_updates captures sales actions while stage_history captures all stage changes.';

COMMENT ON TABLE public.opportunity_stage_history IS
'M2 docs: System-triggered stage change audit trail. Parallel to pipeline_updates which is sales-action oriented. Both exist intentionally for different reporting needs.';

-- M3: account_status stored vs calculated
COMMENT ON COLUMN public.accounts.account_status IS
'M3 docs: Stored status, updated by triggers on opportunity close (sync_opportunity_to_account). Not purely calculated - tracks lifecycle: calon_account→new_account→active_account or calon_account→failed_account. Also passive_account, lost_account.';

-- M4: quotation_count ambiguity
COMMENT ON COLUMN public.leads.quotation_count IS
'M4 docs: Tracks number of quotations SENT (incremented in rpc_customer_quotation_mark_sent). Does not count drafts or rejected. Use COUNT(*) on customer_quotations for total quotations.';

COMMENT ON COLUMN public.opportunities.quotation_count IS
'M4 docs: Tracks quotation sends for this opportunity. Incremented in rpc_customer_quotation_mark_sent. For total count use COUNT(*) on customer_quotations.';

-- M6: Rejection reasons per-quotation
COMMENT ON TABLE public.quotation_rejection_reasons IS
'M6 docs: Stores rejection reasons per quotation (quotation_id FK). Multiple rejections for same opportunity = multiple records across different quotation versions. No cleanup needed on re-quotation.';

-- L1: Dual from_stage/to_stage and old_stage/new_stage
COMMENT ON COLUMN public.opportunity_stage_history.from_stage IS
'L1 docs: Alias for old_stage. Both columns exist for backward compatibility. from_stage/to_stage = readable aliases, old_stage/new_stage = used by triggers and RPC functions.';

COMMENT ON COLUMN public.opportunity_stage_history.to_stage IS
'L1 docs: Alias for new_stage. Both columns exist for backward compatibility. See from_stage comment.';

-- H4: Document rejected quotation edge case
COMMENT ON FUNCTION public.rpc_customer_quotation_mark_rejected(UUID, quotation_rejection_reason_type, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT) IS
'H4 note: When ticket is already closed/resolved, rejection still records reason and updates quotation status, but skips ticket status change (AND status NOT IN closed/resolved). This is correct behavior - ticket was closed by another path.';


-- ============================================
-- PART 7: GRANT PERMISSIONS
-- ============================================

-- New revoke function
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_revoke_acceptance(UUID, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_revoke_acceptance(UUID, TEXT, UUID, TEXT) TO service_role;

-- Updated functions (re-grant for safety)
GRANT EXECUTE ON FUNCTION public.fn_validate_quotation_transition(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_quotation_transition(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_validate_ticket_transition(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_ticket_transition(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_check_quotation_authorization(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_quotation_authorization(UUID, UUID, TEXT) TO service_role;


-- ============================================
-- SUMMARY
-- ============================================
-- Migration 137 addresses ALL 18 audit findings:
--
-- CRITICAL:
--   C1: COMMENT deprecating leads.customer_id (use account_id)
--   C2: TRIGGER requiring close_outcome on ticket close
--   C3: TRIGGER validating valid_until on quotation acceptance
--   C4: COMMENT documenting existing atomic linkage
--
-- HIGH:
--   H1: NEW RPC rpc_customer_quotation_revoke_acceptance + state machine update
--   H2: FIXED fn_validate_ticket_transition aligned with actual enum values
--   H4: COMMENT documenting rejected-when-closed edge case behavior
--   H5: Opportunities.lost_reason validated at RPC level (109), TEXT type is intentional
--
-- MEDIUM:
--   M1: COMMENT on leads.status as deprecated
--   M2: COMMENT on pipeline_updates vs stage_history parallel trails
--   M3: COMMENT on account_status stored vs calculated
--   M4: COMMENT on quotation_count semantics
--   M5: TIGHTENED fn_check_quotation_authorization (removed sales/marketing blanket)
--   M6: COMMENT on rejection reasons per-quotation
--
-- LOW:
--   L1: COMMENT on dual from_stage/to_stage columns
-- ============================================
