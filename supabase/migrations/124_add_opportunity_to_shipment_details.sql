-- =====================================================
-- Migration 124: Add opportunity_id to shipment_details
-- =====================================================
-- Allow shipment_details to be linked to opportunities
-- When opportunity is auto-created from lead, copy shipment_details
-- =====================================================

-- =====================================================
-- PART 1: Add opportunity_id column to shipment_details
-- =====================================================

ALTER TABLE public.shipment_details
ADD COLUMN IF NOT EXISTS opportunity_id TEXT REFERENCES public.opportunities(opportunity_id) ON DELETE SET NULL;

-- Index for faster lookups by opportunity
CREATE INDEX IF NOT EXISTS idx_shipment_details_opportunity ON public.shipment_details(opportunity_id);

COMMENT ON COLUMN public.shipment_details.opportunity_id IS 'Optional link to opportunity - used when opportunity has shipment data';

-- =====================================================
-- PART 2: Helper function to copy shipment_details
-- =====================================================

CREATE OR REPLACE FUNCTION public.copy_shipment_details_to_opportunity(
    p_lead_id TEXT,
    p_opportunity_id TEXT,
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_source RECORD;
    v_new_id TEXT;
BEGIN
    -- Get the shipment details from the lead
    SELECT * INTO v_source
    FROM public.shipment_details
    WHERE lead_id = p_lead_id
    LIMIT 1;

    IF v_source IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'No shipment details found for lead'
        );
    END IF;

    -- Generate new shipment_detail_id
    v_new_id := 'SHIP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    -- Insert new shipment_details linked to opportunity
    INSERT INTO public.shipment_details (
        shipment_detail_id,
        lead_id,
        opportunity_id,
        service_type_id,
        service_type_code,
        department,
        fleet_type,
        fleet_quantity,
        incoterm,
        cargo_category,
        cargo_description,
        origin_address,
        origin_city,
        origin_country,
        destination_address,
        destination_city,
        destination_country,
        quantity,
        unit_of_measure,
        weight_per_unit_kg,
        weight_total_kg,
        length_cm,
        width_cm,
        height_cm,
        volume_total_cbm,
        scope_of_work,
        additional_services,
        notes,
        created_by
    ) VALUES (
        v_new_id,
        p_lead_id,  -- Keep reference to original lead
        p_opportunity_id,  -- Link to new opportunity
        v_source.service_type_id,
        v_source.service_type_code,
        v_source.department,
        v_source.fleet_type,
        v_source.fleet_quantity,
        v_source.incoterm,
        v_source.cargo_category,
        v_source.cargo_description,
        v_source.origin_address,
        v_source.origin_city,
        v_source.origin_country,
        v_source.destination_address,
        v_source.destination_city,
        v_source.destination_country,
        v_source.quantity,
        v_source.unit_of_measure,
        v_source.weight_per_unit_kg,
        v_source.weight_total_kg,
        v_source.length_cm,
        v_source.width_cm,
        v_source.height_cm,
        v_source.volume_total_cbm,
        v_source.scope_of_work,
        v_source.additional_services,
        v_source.notes,
        p_user_id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'shipment_detail_id', v_new_id,
        'source_id', v_source.shipment_detail_id
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

COMMENT ON FUNCTION public.copy_shipment_details_to_opportunity IS
'Copies shipment_details from a lead to a newly created opportunity';

GRANT EXECUTE ON FUNCTION public.copy_shipment_details_to_opportunity TO authenticated;
GRANT EXECUTE ON FUNCTION public.copy_shipment_details_to_opportunity TO service_role;

-- =====================================================
-- PART 3: Update existing opportunities from their leads
-- (One-time backfill for existing data)
-- =====================================================

-- For existing opportunities that have source_lead_id,
-- update the shipment_details to link to the opportunity
UPDATE public.shipment_details sd
SET opportunity_id = o.opportunity_id
FROM public.opportunities o
WHERE sd.lead_id = o.source_lead_id
  AND sd.opportunity_id IS NULL
  AND o.source_lead_id IS NOT NULL;
