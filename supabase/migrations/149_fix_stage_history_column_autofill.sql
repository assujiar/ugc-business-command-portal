-- =====================================================
-- Migration 149: Fix opportunity_stage_history column compatibility
-- =====================================================
--
-- ROOT CAUSE OF BUG:
-- rpc_customer_quotation_mark_rejected and rpc_customer_quotation_mark_sent
-- INSERT into opportunity_stage_history with only (old_stage, new_stage) columns.
-- But to_stage has a NOT NULL constraint (from migration 004).
--
-- When using adminClient (service_role), the log_stage_change() trigger
-- SKIPS because auth.uid() = NULL (migration 023 design). So the RPC's
-- manual INSERT runs, but fails with:
--   "null value in column to_stage violates not-null constraint"
--
-- The EXCEPTION WHEN OTHERS handler catches this error and ROLLS BACK
-- the entire transaction — including ticket_events and ticket_comments
-- insertions. This is why quotation rejection events never appear in
-- the ticket activity timeline.
--
-- WHY mark_sent appears to work:
-- mark_sent only changes stage on FIRST send (Prospecting→Quote Sent).
-- Resends and re-sends after rejection (already at Quote Sent or Negotiation)
-- don't change stage, so the problematic INSERT is never reached.
-- mark_rejected ALWAYS changes stage on first rejection (→Negotiation),
-- so it always hits the failing INSERT.
--
-- FIX:
-- Add a BEFORE INSERT trigger on opportunity_stage_history that auto-fills
-- missing columns between the two column pairs:
--   to_stage   ← COALESCE(to_stage, new_stage)
--   from_stage ← COALESCE(from_stage, old_stage)
--   old_stage  ← COALESCE(old_stage, from_stage)
--   new_stage  ← COALESCE(new_stage, to_stage)
--
-- This ensures any INSERT that provides EITHER column pair will succeed.
-- No changes needed to any RPC functions.
-- =====================================================


-- ============================================
-- PART 1: Auto-fill function for stage history columns
-- ============================================
-- The table has two pairs of stage columns for historical reasons:
--   Legacy pair: from_stage (nullable), to_stage (NOT NULL)  — migration 004
--   New pair:    old_stage  (nullable), new_stage (NOT NULL) — migration 023
-- Both pairs store the same data. This trigger keeps them in sync
-- so code can INSERT with either pair.

CREATE OR REPLACE FUNCTION public.fn_autofill_stage_history_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-fill legacy columns from new columns
    NEW.from_stage := COALESCE(NEW.from_stage, NEW.old_stage);
    NEW.to_stage   := COALESCE(NEW.to_stage, NEW.new_stage);

    -- Auto-fill new columns from legacy columns
    NEW.old_stage  := COALESCE(NEW.old_stage, NEW.from_stage);
    NEW.new_stage  := COALESCE(NEW.new_stage, NEW.to_stage);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_autofill_stage_history ON public.opportunity_stage_history;
CREATE TRIGGER trg_autofill_stage_history
    BEFORE INSERT ON public.opportunity_stage_history
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_autofill_stage_history_columns();


-- ============================================
-- SUMMARY
-- ============================================
-- 1. fn_autofill_stage_history_columns: BEFORE INSERT trigger function
--    that auto-fills from_stage/to_stage ↔ old_stage/new_stage
-- 2. trg_autofill_stage_history: Fires BEFORE INSERT on opportunity_stage_history
--
-- Impact:
-- - Fixes rpc_customer_quotation_mark_rejected: stage history INSERT
--   no longer fails when stage changes (e.g., Quote Sent → Negotiation)
-- - Fixes rpc_customer_quotation_mark_sent: same issue on first send
--   (e.g., Prospecting → Quote Sent)
-- - No changes to existing RPC functions needed
-- - Backward compatible: code using only legacy columns (from_stage/to_stage)
--   also gets new columns auto-filled
-- =====================================================
