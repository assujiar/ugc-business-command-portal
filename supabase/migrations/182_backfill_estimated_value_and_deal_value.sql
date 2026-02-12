-- Migration 182: Backfill estimated_value and deal_value
--
-- Problem: mark_sent and mark_accepted RPCs were overwriting estimated_value
-- with quotation.total_selling_rate. The correct behavior is:
--   - estimated_value: stays as original pipeline/lead value (leads.potential_revenue)
--   - deal_value: set from the ACCEPTED quotation's total_selling_rate
--
-- This migration restores the correct values for existing data.

-- ============================================
-- PART 1: Restore estimated_value from lead's potential_revenue
-- ============================================
-- For opportunities that have a source_lead with potential_revenue,
-- restore estimated_value to that original value.

UPDATE public.opportunities opp
SET estimated_value = ld.potential_revenue,
    updated_at = NOW()
FROM public.leads ld
WHERE opp.source_lead_id = ld.lead_id
  AND ld.potential_revenue IS NOT NULL
  AND opp.estimated_value IS DISTINCT FROM ld.potential_revenue;

-- ============================================
-- PART 2: Backfill deal_value from accepted quotation
-- ============================================
-- For won opportunities, set deal_value from the accepted quotation's total_selling_rate.
-- If multiple quotations are accepted for the same opportunity, use the latest one.

UPDATE public.opportunities opp
SET deal_value = cq.total_selling_rate,
    updated_at = NOW()
FROM (
    SELECT DISTINCT ON (cq_inner.opportunity_id)
        cq_inner.opportunity_id,
        cq_inner.total_selling_rate
    FROM public.customer_quotations cq_inner
    WHERE cq_inner.status = 'accepted'
      AND cq_inner.opportunity_id IS NOT NULL
      AND cq_inner.total_selling_rate IS NOT NULL
    ORDER BY cq_inner.opportunity_id, cq_inner.accepted_at DESC NULLS LAST, cq_inner.updated_at DESC
) cq
WHERE opp.opportunity_id = cq.opportunity_id
  AND opp.deal_value IS DISTINCT FROM cq.total_selling_rate;
