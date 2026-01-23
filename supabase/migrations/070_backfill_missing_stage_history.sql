-- ============================================
-- Migration: 070_backfill_missing_stage_history.sql
-- Backfill missing stage history entries for auto-updated pipeline stages
--
-- This script creates missing opportunity_stage_history entries for
-- opportunities that were auto-updated by quotation sync before migration 069.
-- ============================================

-- ============================================
-- 1. Backfill 'Quote Sent' stage history from sent quotations
-- ============================================

INSERT INTO public.opportunity_stage_history (
    opportunity_id,
    old_stage,
    new_stage,
    changed_by,
    changed_at,
    notes
)
SELECT DISTINCT ON (cq.opportunity_id)
    cq.opportunity_id,
    'Discovery' AS old_stage,  -- Assume was Discovery before Quote Sent
    'Quote Sent' AS new_stage,
    cq.created_by AS changed_by,
    COALESCE(cq.sent_at, cq.updated_at) AS changed_at,
    'Auto-updated: Quotation sent to customer (backfilled)' AS notes
FROM public.customer_quotations cq
INNER JOIN public.opportunities o ON o.opportunity_id = cq.opportunity_id
WHERE cq.status IN ('sent', 'accepted', 'rejected')  -- Quotation was sent at some point
  AND cq.opportunity_id IS NOT NULL
  -- Only insert if there's no existing 'Quote Sent' history entry
  AND NOT EXISTS (
      SELECT 1 FROM public.opportunity_stage_history osh
      WHERE osh.opportunity_id = cq.opportunity_id
      AND osh.new_stage = 'Quote Sent'
  )
ORDER BY cq.opportunity_id, cq.sent_at ASC NULLS LAST;

-- ============================================
-- 2. Backfill 'Negotiation' stage history from rejected quotations
-- ============================================

INSERT INTO public.opportunity_stage_history (
    opportunity_id,
    old_stage,
    new_stage,
    changed_by,
    changed_at,
    notes
)
SELECT DISTINCT ON (cq.opportunity_id)
    cq.opportunity_id,
    'Quote Sent' AS old_stage,
    'Negotiation' AS new_stage,
    cq.created_by AS changed_by,
    cq.updated_at AS changed_at,
    'Auto-updated: Quotation rejected by customer (backfilled)' AS notes
FROM public.customer_quotations cq
INNER JOIN public.opportunities o ON o.opportunity_id = cq.opportunity_id
WHERE cq.status = 'rejected'
  AND cq.opportunity_id IS NOT NULL
  AND o.stage IN ('Negotiation', 'Closed Won', 'Closed Lost')  -- Stage moved past Quote Sent
  -- Only insert if there's no existing 'Negotiation' history entry from rejection
  AND NOT EXISTS (
      SELECT 1 FROM public.opportunity_stage_history osh
      WHERE osh.opportunity_id = cq.opportunity_id
      AND osh.new_stage = 'Negotiation'
      AND osh.notes LIKE '%rejected%'
  )
ORDER BY cq.opportunity_id, cq.updated_at ASC;

-- ============================================
-- 3. Report backfilled entries
-- ============================================

DO $$
DECLARE
    v_quote_sent_count INTEGER;
    v_negotiation_count INTEGER;
BEGIN
    -- Count Quote Sent entries that were just added
    SELECT COUNT(*) INTO v_quote_sent_count
    FROM public.opportunity_stage_history
    WHERE notes LIKE '%backfilled%'
    AND new_stage = 'Quote Sent';

    -- Count Negotiation entries that were just added
    SELECT COUNT(*) INTO v_negotiation_count
    FROM public.opportunity_stage_history
    WHERE notes LIKE '%backfilled%'
    AND new_stage = 'Negotiation';

    RAISE NOTICE 'Backfilled stage history: % Quote Sent entries, % Negotiation entries',
        v_quote_sent_count, v_negotiation_count;
END $$;
