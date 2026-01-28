-- ============================================
-- Migration: 097_state_machine_versioning_locks.sql
--
-- PURPOSE: Implement locked state machines with versioning for:
-- 1. ticket_status - Clean state transitions with pending_response_from enforcement
-- 2. quote_status (ticket_rate_quotes) - Versioned records with is_current tracking
-- 3. customer_quotation_status - Snapshot locks after sent
--
-- GOALS:
-- - Eliminate stuck statuses and pointer drift
-- - Enforce snapshot vs versioned vs terminal rules
-- - All transitions are systematic, non-ambiguous, and auditable
--
-- FIX: Reordered to backfill BEFORE creating unique index
-- FIX: Changed AFTER INSERT to BEFORE INSERT trigger with advisory lock
-- ============================================

-- ============================================
-- PART 1: ADD VERSIONING COLUMNS TO ticket_rate_quotes
-- ============================================

ALTER TABLE public.ticket_rate_quotes
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES public.ticket_rate_quotes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.ticket_rate_quotes.is_current IS 'TRUE if this is the current active quote for the ticket. Only one quote per ticket should have is_current=TRUE.';
COMMENT ON COLUMN public.ticket_rate_quotes.superseded_by_id IS 'Reference to the quote that replaced this one. NULL if this is the current quote.';
COMMENT ON COLUMN public.ticket_rate_quotes.superseded_at IS 'Timestamp when this quote was superseded by a newer version.';

-- ============================================
-- PART 2: BACKFILL is_current FOR EXISTING QUOTES
-- IMPORTANT: Must run BEFORE creating unique index!
-- ============================================

-- Step 1: Set ALL to FALSE first
UPDATE public.ticket_rate_quotes SET is_current = FALSE WHERE is_current = TRUE;

-- Step 2: Set latest per ticket to TRUE
WITH latest_quotes AS (
    SELECT DISTINCT ON (ticket_id) id
    FROM public.ticket_rate_quotes
    WHERE ticket_id IS NOT NULL
    ORDER BY ticket_id, created_at DESC, id DESC
)
UPDATE public.ticket_rate_quotes
SET is_current = TRUE
WHERE id IN (SELECT id FROM latest_quotes);

-- Step 3: Set superseded_by_id chain for non-current quotes
WITH quote_chain AS (
    SELECT q1.id,
           (SELECT id FROM public.ticket_rate_quotes q2
            WHERE q2.ticket_id = q1.ticket_id
            AND q2.created_at > q1.created_at
            ORDER BY q2.created_at ASC LIMIT 1) as next_quote_id
    FROM public.ticket_rate_quotes q1
    WHERE q1.is_current = FALSE AND q1.superseded_by_id IS NULL
)
UPDATE public.ticket_rate_quotes q
SET superseded_by_id = qc.next_quote_id, superseded_at = NOW()
FROM quote_chain qc
WHERE q.id = qc.id AND qc.next_quote_id IS NOT NULL;

-- ============================================
-- PART 3: CREATE UNIQUE INDEX (now safe - data is consistent)
-- ============================================

DROP INDEX IF EXISTS idx_ticket_rate_quotes_one_current_per_ticket;
CREATE UNIQUE INDEX idx_ticket_rate_quotes_one_current_per_ticket
    ON public.ticket_rate_quotes (ticket_id)
    WHERE is_current = TRUE;

COMMENT ON INDEX idx_ticket_rate_quotes_one_current_per_ticket IS
'Enforces that only one ticket_rate_quote can be current (is_current=TRUE) per ticket_id.';

-- Index for faster lookups of current quotes
CREATE INDEX IF NOT EXISTS idx_ticket_rate_quotes_is_current ON public.ticket_rate_quotes(is_current) WHERE is_current = TRUE;

-- ============================================
-- PART 4: BEFORE INSERT TRIGGER - Supersede Previous Quotes
-- Uses advisory lock to prevent race conditions
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_supersede_previous_quotes()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_current = TRUE AND NEW.ticket_id IS NOT NULL THEN
        -- Advisory lock to serialize per-ticket inserts (prevents race conditions)
        PERFORM pg_advisory_xact_lock(hashtext(NEW.ticket_id::text)::bigint);

        -- Mark all previous current quotes for this ticket as superseded
        UPDATE public.ticket_rate_quotes
        SET
            is_current = FALSE,
            superseded_by_id = NEW.id,
            superseded_at = NOW(),
            updated_at = NOW()
        WHERE ticket_id = NEW.ticket_id
        AND is_current = TRUE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_supersede_previous_quotes IS
'BEFORE INSERT trigger that marks previous current quotes as superseded.
Uses advisory lock to prevent race conditions with concurrent inserts.
Ensures only one is_current=TRUE quote exists per ticket_id.';

DROP TRIGGER IF EXISTS trg_supersede_previous_quotes ON public.ticket_rate_quotes;
CREATE TRIGGER trg_supersede_previous_quotes
    BEFORE INSERT ON public.ticket_rate_quotes
    FOR EACH ROW
    WHEN (NEW.is_current = TRUE)
    EXECUTE FUNCTION public.fn_supersede_previous_quotes();

-- ============================================
-- PART 5: TRIGGER - Block Edits on Non-Current or Terminal Quotes
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_block_non_current_quote_edits()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow status changes (needed for state machine transitions)
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    -- Block amount/terms edits on non-current quotes
    IF OLD.is_current = FALSE THEN
        IF OLD.amount IS DISTINCT FROM NEW.amount OR
           OLD.terms IS DISTINCT FROM NEW.terms OR
           OLD.valid_until IS DISTINCT FROM NEW.valid_until THEN
            RAISE EXCEPTION 'Cannot modify non-current quote. Create a new quote instead.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    -- Block edits on terminal status quotes (won, rejected)
    IF OLD.status IN ('won', 'rejected') THEN
        IF OLD.amount IS DISTINCT FROM NEW.amount OR
           OLD.terms IS DISTINCT FROM NEW.terms OR
           OLD.valid_until IS DISTINCT FROM NEW.valid_until THEN
            RAISE EXCEPTION 'Cannot modify quote in terminal status: %. Quote is immutable.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_block_non_current_quote_edits IS
'Trigger function that blocks modifications to amount/terms on non-current or terminal quotes.
Allows status changes for state machine transitions.';

DROP TRIGGER IF EXISTS trg_block_non_current_quote_edits ON public.ticket_rate_quotes;
CREATE TRIGGER trg_block_non_current_quote_edits
    BEFORE UPDATE ON public.ticket_rate_quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_block_non_current_quote_edits();

-- ============================================
-- PART 6: ADD revoked TO customer_quotation_status ENUM
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'revoked' AND enumtypid = 'customer_quotation_status'::regtype) THEN
        ALTER TYPE customer_quotation_status ADD VALUE 'revoked';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- PART 7: SNAPSHOT LOCK FOR customer_quotations
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_enforce_quotation_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    -- If old status was not draft, block changes to snapshot fields
    IF OLD.status != 'draft' THEN
        IF OLD.operational_cost_id IS DISTINCT FROM NEW.operational_cost_id THEN
            RAISE EXCEPTION 'Cannot change operational_cost_id after quotation is sent. Status: %', OLD.status
                USING ERRCODE = '23514',
                      HINT = 'Quotation is a snapshot. Create a new quotation instead.';
        END IF;

        IF OLD.total_cost IS DISTINCT FROM NEW.total_cost THEN
            RAISE EXCEPTION 'Cannot change total_cost after quotation is sent. Status: %', OLD.status
                USING ERRCODE = '23514';
        END IF;

        IF OLD.total_selling_rate IS DISTINCT FROM NEW.total_selling_rate THEN
            RAISE EXCEPTION 'Cannot change total_selling_rate after quotation is sent. Status: %', OLD.status
                USING ERRCODE = '23514';
        END IF;

        IF OLD.target_margin_percent IS DISTINCT FROM NEW.target_margin_percent THEN
            RAISE EXCEPTION 'Cannot change target_margin_percent after quotation is sent. Status: %', OLD.status
                USING ERRCODE = '23514';
        END IF;

        IF OLD.terms_includes IS DISTINCT FROM NEW.terms_includes THEN
            RAISE EXCEPTION 'Cannot change terms_includes after quotation is sent. Status: %', OLD.status
                USING ERRCODE = '23514';
        END IF;

        IF OLD.terms_excludes IS DISTINCT FROM NEW.terms_excludes THEN
            RAISE EXCEPTION 'Cannot change terms_excludes after quotation is sent. Status: %', OLD.status
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_enforce_quotation_snapshot IS
'Trigger function that enforces snapshot rules on customer_quotations.
After status != draft, blocks changes to: operational_cost_id, total_cost,
total_selling_rate, target_margin_percent, terms_includes, terms_excludes.
Allows changes to: status, sent_at, sent_via, sent_to, rejection_reason, timestamps.';

DROP TRIGGER IF EXISTS trg_enforce_quotation_snapshot ON public.customer_quotations;
CREATE TRIGGER trg_enforce_quotation_snapshot
    BEFORE UPDATE ON public.customer_quotations
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_quotation_snapshot();

-- ============================================
-- PART 8: STATE MACHINE VALIDATORS
-- ============================================

-- Ticket Status Validator
CREATE OR REPLACE FUNCTION public.fn_validate_ticket_transition(
    p_current_status TEXT,
    p_target_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_valid_transitions JSONB;
BEGIN
    v_valid_transitions := '{
        "open": ["need_response", "in_progress", "waiting_customer", "need_adjustment", "pending", "resolved", "closed"],
        "need_response": ["in_progress", "waiting_customer", "need_adjustment", "pending", "resolved", "closed"],
        "in_progress": ["need_response", "waiting_customer", "need_adjustment", "pending", "resolved", "closed"],
        "waiting_customer": ["in_progress", "need_response", "need_adjustment", "pending", "resolved", "closed"],
        "need_adjustment": ["in_progress", "waiting_customer", "need_response", "pending", "resolved", "closed"],
        "pending": ["in_progress", "waiting_customer", "need_adjustment", "need_response", "resolved", "closed"],
        "resolved": ["closed", "in_progress"],
        "closed": []
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

    IF p_current_status = 'closed' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Ticket is closed (terminal state). Cannot transition. Use admin reopen if needed.',
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
'State machine validator for ticket status transitions.
Terminal: closed. Returns 409 error codes for invalid transitions.';

-- Quote Status Validator
CREATE OR REPLACE FUNCTION public.fn_validate_quote_status_transition(
    p_current_status TEXT,
    p_target_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_valid_transitions JSONB;
BEGIN
    v_valid_transitions := '{
        "draft": ["submitted"],
        "submitted": ["accepted", "revise_requested", "rejected", "sent_to_customer"],
        "accepted": ["sent_to_customer", "won"],
        "sent_to_customer": ["won", "rejected"],
        "revise_requested": [],
        "won": [],
        "rejected": [],
        "sent": ["sent_to_customer", "accepted", "rejected"]
    }'::JSONB;

    IF NOT v_valid_transitions ? p_current_status THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Unknown current quote status: ' || p_current_status,
            'error_code', 'INVALID_STATUS'
        );
    END IF;

    IF v_valid_transitions->p_current_status @> to_jsonb(p_target_status) THEN
        RETURN jsonb_build_object('valid', TRUE);
    END IF;

    IF p_current_status = 'won' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quote already won (terminal state). Cannot transition.',
            'error_code', 'CONFLICT_QUOTE_WON'
        );
    END IF;

    IF p_current_status = 'rejected' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quote already rejected (terminal state). Cannot transition.',
            'error_code', 'CONFLICT_QUOTE_REJECTED'
        );
    END IF;

    IF p_current_status = 'revise_requested' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quote is in revise_requested status (snapshot). Create a NEW quote instead.',
            'error_code', 'CONFLICT_QUOTE_SNAPSHOT'
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', FALSE,
        'error', 'Invalid quote status transition from ' || p_current_status || ' to ' || p_target_status,
        'error_code', 'INVALID_STATUS_TRANSITION'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.fn_validate_quote_status_transition IS
'State machine validator for quote_status. Terminal: won, rejected. Snapshot: revise_requested.';

-- Customer Quotation Status Validator
CREATE OR REPLACE FUNCTION public.fn_validate_customer_quotation_transition(
    p_current_status TEXT,
    p_target_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_valid_transitions JSONB;
BEGIN
    v_valid_transitions := '{
        "draft": ["sent", "revoked"],
        "sent": ["accepted", "rejected", "expired", "revoked"],
        "accepted": [],
        "rejected": [],
        "expired": [],
        "revoked": []
    }'::JSONB;

    IF NOT v_valid_transitions ? p_current_status THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Unknown current quotation status: ' || p_current_status,
            'error_code', 'INVALID_STATUS'
        );
    END IF;

    IF v_valid_transitions->p_current_status @> to_jsonb(p_target_status) THEN
        RETURN jsonb_build_object('valid', TRUE);
    END IF;

    IF p_current_status = 'accepted' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quotation already accepted (terminal state). Cannot transition.',
            'error_code', 'CONFLICT_ALREADY_ACCEPTED'
        );
    END IF;

    IF p_current_status = 'rejected' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quotation already rejected (terminal state). Create a new quotation instead.',
            'error_code', 'CONFLICT_ALREADY_REJECTED'
        );
    END IF;

    IF p_current_status = 'expired' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quotation has expired (terminal state). Create a new quotation.',
            'error_code', 'CONFLICT_EXPIRED'
        );
    END IF;

    IF p_current_status = 'revoked' THEN
        RETURN jsonb_build_object(
            'valid', FALSE,
            'error', 'Quotation has been revoked (terminal state). Create a new quotation.',
            'error_code', 'CONFLICT_REVOKED'
        );
    END IF;

    RETURN jsonb_build_object(
        'valid', FALSE,
        'error', 'Invalid quotation transition from ' || p_current_status || ' to ' || p_target_status,
        'error_code', 'INVALID_STATUS_TRANSITION'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.fn_validate_customer_quotation_transition IS
'State machine validator for customer_quotation_status. Terminal: accepted, rejected, expired, revoked.';

-- ============================================
-- PART 9: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.fn_validate_ticket_transition(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_quote_status_transition(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_validate_customer_quotation_transition(TEXT, TEXT) TO authenticated;

-- ============================================
-- SUMMARY
-- ============================================
-- Fixed migration implements:
--
-- 1. VERSIONING for ticket_rate_quotes:
--    - is_current, superseded_by_id, superseded_at columns
--    - Backfill runs BEFORE unique index creation
--    - BEFORE INSERT trigger with advisory lock (prevents race conditions)
--    - Partial unique index enforces one current per ticket
--
-- 2. SNAPSHOT LOCK for customer_quotations:
--    - After status != draft, blocks changes to core fields
--    - Added 'revoked' status to enum
--
-- 3. STATE MACHINE VALIDATORS:
--    - fn_validate_ticket_transition: Terminal closed
--    - fn_validate_quote_status_transition: Terminal won/rejected
--    - fn_validate_customer_quotation_transition: Terminal accepted/rejected/expired/revoked
-- ============================================
