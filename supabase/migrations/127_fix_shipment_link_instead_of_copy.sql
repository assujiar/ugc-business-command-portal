-- =====================================================
-- Migration 127: Fix Shipment Link Instead of Copy
-- =====================================================
-- Bug: When lead is claimed, copy_shipment_details_to_opportunity
-- was INSERTING new copies instead of UPDATING existing records
-- with the opportunity_id reference. This caused duplication.
--
-- Fix: Change from COPY (INSERT) to LINK (UPDATE) logic
-- =====================================================

-- =====================================================
-- PART 1: Create new link function (UPDATE instead of INSERT)
-- =====================================================

CREATE OR REPLACE FUNCTION public.link_shipment_details_to_opportunity(
    p_lead_id TEXT,
    p_opportunity_id TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_count INTEGER := 0;
    v_shipment_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Update all shipment_details for this lead to link to the opportunity
    -- This preserves the original records instead of duplicating them
    UPDATE public.shipment_details
    SET opportunity_id = p_opportunity_id,
        updated_at = NOW()
    WHERE lead_id = p_lead_id
      AND (opportunity_id IS NULL OR opportunity_id = p_opportunity_id);

    -- Get count and IDs of updated records
    SELECT
        COUNT(*),
        ARRAY_AGG(shipment_detail_id)
    INTO v_count, v_shipment_ids
    FROM public.shipment_details
    WHERE lead_id = p_lead_id
      AND opportunity_id = p_opportunity_id;

    IF v_count = 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'No shipment details found for lead'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'shipment_count', v_count,
        'shipment_ids', to_jsonb(v_shipment_ids),
        'action', 'linked'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.link_shipment_details_to_opportunity IS
'Links existing shipment_details from a lead to an opportunity by updating opportunity_id (no duplication)';

GRANT EXECUTE ON FUNCTION public.link_shipment_details_to_opportunity TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_shipment_details_to_opportunity TO service_role;

-- =====================================================
-- PART 2: Update copy function to use link logic
-- (Replace copy with link for backward compatibility)
-- =====================================================

CREATE OR REPLACE FUNCTION public.copy_shipment_details_to_opportunity(
    p_lead_id TEXT,
    p_opportunity_id TEXT,
    p_user_id UUID DEFAULT NULL  -- Kept for backward compatibility but not used
)
RETURNS JSONB AS $$
BEGIN
    -- Call the new link function instead of copying
    RETURN public.link_shipment_details_to_opportunity(p_lead_id, p_opportunity_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

COMMENT ON FUNCTION public.copy_shipment_details_to_opportunity IS
'[DEPRECATED] Now links shipment_details instead of copying. Use link_shipment_details_to_opportunity instead.';

-- =====================================================
-- PART 3: Clean up duplicate shipment_details
-- (Remove copies created by the old buggy function)
-- =====================================================

-- Find and delete duplicate shipments (keep the original one with earliest created_at)
-- A duplicate is identified as:
-- 1. Same lead_id
-- 2. Same shipment_order
-- 3. One has opportunity_id set, one doesn't (or both have same opportunity_id)
-- 4. Same key fields (service_type_code, origin_city, destination_city)

WITH duplicates AS (
    SELECT
        sd.shipment_detail_id,
        sd.lead_id,
        sd.shipment_order,
        sd.created_at,
        ROW_NUMBER() OVER (
            PARTITION BY sd.lead_id, sd.shipment_order,
                         COALESCE(sd.service_type_code, ''),
                         COALESCE(sd.origin_city, ''),
                         COALESCE(sd.destination_city, '')
            ORDER BY sd.created_at ASC
        ) as rn
    FROM public.shipment_details sd
),
to_delete AS (
    SELECT shipment_detail_id
    FROM duplicates
    WHERE rn > 1  -- Keep the first (oldest) one, delete the rest
)
DELETE FROM public.shipment_details
WHERE shipment_detail_id IN (SELECT shipment_detail_id FROM to_delete);

-- =====================================================
-- PART 4: Ensure all lead shipments are linked to their opportunities
-- =====================================================

-- For leads that have been claimed (have opportunity_id set),
-- make sure all their shipment_details are linked to the opportunity
UPDATE public.shipment_details sd
SET opportunity_id = l.opportunity_id
FROM public.leads l
WHERE sd.lead_id = l.lead_id
  AND l.opportunity_id IS NOT NULL
  AND sd.opportunity_id IS NULL;

-- Also link via source_lead_id in opportunities table
UPDATE public.shipment_details sd
SET opportunity_id = o.opportunity_id
FROM public.opportunities o
WHERE sd.lead_id = o.source_lead_id
  AND o.source_lead_id IS NOT NULL
  AND sd.opportunity_id IS NULL;
