-- =====================================================
-- Migration 125: Multi-Shipment Support
-- =====================================================
-- Enable multiple shipments per lead/opportunity/ticket/quotation
-- =====================================================

-- =====================================================
-- PART 1: Add shipment_order to shipment_details
-- =====================================================

-- Add order/sequence column for multiple shipments
ALTER TABLE public.shipment_details
ADD COLUMN IF NOT EXISTS shipment_order INTEGER DEFAULT 1;

-- Add shipment label/name for easy identification
ALTER TABLE public.shipment_details
ADD COLUMN IF NOT EXISTS shipment_label TEXT;

COMMENT ON COLUMN public.shipment_details.shipment_order IS 'Order/sequence of shipment (1, 2, 3...) for multi-shipment support';
COMMENT ON COLUMN public.shipment_details.shipment_label IS 'Optional label to identify shipment (e.g., "Shipment A", "Jakarta Route")';

-- Index for ordering
CREATE INDEX IF NOT EXISTS idx_shipment_details_lead_order ON public.shipment_details(lead_id, shipment_order);
CREATE INDEX IF NOT EXISTS idx_shipment_details_opp_order ON public.shipment_details(opportunity_id, shipment_order);

-- =====================================================
-- PART 2: Add shipments array to tickets (rfq_data enhancement)
-- =====================================================
-- Note: rfq_data is already JSONB and can store array
-- We'll update code to check for array vs single object

-- Add shipment count tracking
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS shipment_count INTEGER DEFAULT 1;

COMMENT ON COLUMN public.tickets.shipment_count IS 'Number of shipments in this RFQ ticket';

-- =====================================================
-- PART 3: Add shipments JSON to customer_quotations
-- =====================================================

-- Add shipments array column (JSONB) for multiple shipments
ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS shipments JSONB DEFAULT '[]'::jsonb;

-- Add shipment count tracking
ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS shipment_count INTEGER DEFAULT 1;

COMMENT ON COLUMN public.customer_quotations.shipments IS 'Array of shipment details for multi-shipment quotations';
COMMENT ON COLUMN public.customer_quotations.shipment_count IS 'Number of shipments in this quotation';

-- =====================================================
-- PART 4: Update copy function for multi-shipment
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
    v_count INTEGER := 0;
    v_shipment_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Loop through ALL shipment details from the lead (not just one)
    FOR v_source IN
        SELECT * FROM public.shipment_details
        WHERE lead_id = p_lead_id
        ORDER BY shipment_order ASC
    LOOP
        -- Generate new shipment_detail_id
        v_new_id := 'SHIP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || v_count::TEXT) FROM 1 FOR 6));

        -- Insert new shipment_details linked to opportunity
        INSERT INTO public.shipment_details (
            shipment_detail_id,
            lead_id,
            opportunity_id,
            shipment_order,
            shipment_label,
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
            p_lead_id,
            p_opportunity_id,
            v_source.shipment_order,
            v_source.shipment_label,
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

        v_count := v_count + 1;
        v_shipment_ids := array_append(v_shipment_ids, v_new_id);
    END LOOP;

    IF v_count = 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'No shipment details found for lead'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'shipment_count', v_count,
        'shipment_ids', to_jsonb(v_shipment_ids)
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

-- =====================================================
-- PART 5: Helper function to get all shipments for entity
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_entity_shipments(
    p_lead_id TEXT DEFAULT NULL,
    p_opportunity_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_shipments JSONB;
BEGIN
    IF p_opportunity_id IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'shipment_detail_id', shipment_detail_id,
                'shipment_order', shipment_order,
                'shipment_label', shipment_label,
                'service_type_code', service_type_code,
                'department', department,
                'fleet_type', fleet_type,
                'fleet_quantity', fleet_quantity,
                'incoterm', incoterm,
                'cargo_category', cargo_category,
                'cargo_description', cargo_description,
                'origin_address', origin_address,
                'origin_city', origin_city,
                'origin_country', origin_country,
                'destination_address', destination_address,
                'destination_city', destination_city,
                'destination_country', destination_country,
                'quantity', quantity,
                'unit_of_measure', unit_of_measure,
                'weight_per_unit_kg', weight_per_unit_kg,
                'weight_total_kg', weight_total_kg,
                'length_cm', length_cm,
                'width_cm', width_cm,
                'height_cm', height_cm,
                'volume_total_cbm', volume_total_cbm,
                'scope_of_work', scope_of_work,
                'additional_services', additional_services
            ) ORDER BY shipment_order
        ), '[]'::jsonb) INTO v_shipments
        FROM public.shipment_details
        WHERE opportunity_id = p_opportunity_id;
    ELSIF p_lead_id IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'shipment_detail_id', shipment_detail_id,
                'shipment_order', shipment_order,
                'shipment_label', shipment_label,
                'service_type_code', service_type_code,
                'department', department,
                'fleet_type', fleet_type,
                'fleet_quantity', fleet_quantity,
                'incoterm', incoterm,
                'cargo_category', cargo_category,
                'cargo_description', cargo_description,
                'origin_address', origin_address,
                'origin_city', origin_city,
                'origin_country', origin_country,
                'destination_address', destination_address,
                'destination_city', destination_city,
                'destination_country', destination_country,
                'quantity', quantity,
                'unit_of_measure', unit_of_measure,
                'weight_per_unit_kg', weight_per_unit_kg,
                'weight_total_kg', weight_total_kg,
                'length_cm', length_cm,
                'width_cm', width_cm,
                'height_cm', height_cm,
                'volume_total_cbm', volume_total_cbm,
                'scope_of_work', scope_of_work,
                'additional_services', additional_services
            ) ORDER BY shipment_order
        ), '[]'::jsonb) INTO v_shipments
        FROM public.shipment_details
        WHERE lead_id = p_lead_id
        AND opportunity_id IS NULL;
    ELSE
        v_shipments := '[]'::jsonb;
    END IF;

    RETURN v_shipments;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.get_entity_shipments TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_entity_shipments TO service_role;

-- =====================================================
-- PART 6: Migrate existing single shipment data
-- =====================================================

-- Set shipment_order = 1 for all existing shipments that don't have it
UPDATE public.shipment_details
SET shipment_order = 1
WHERE shipment_order IS NULL;

-- Migrate existing quotation shipment data to shipments array
-- Only for quotations that have the legacy single shipment fields populated
UPDATE public.customer_quotations
SET shipments = jsonb_build_array(
    jsonb_build_object(
        'shipment_order', 1,
        'service_type', service_type,
        'service_type_code', service_type_code,
        'fleet_type', fleet_type,
        'fleet_quantity', fleet_quantity,
        'incoterm', incoterm,
        'commodity', commodity,
        'cargo_description', cargo_description,
        'cargo_weight', cargo_weight,
        'cargo_weight_unit', cargo_weight_unit,
        'cargo_volume', cargo_volume,
        'cargo_volume_unit', cargo_volume_unit,
        'cargo_quantity', cargo_quantity,
        'cargo_quantity_unit', cargo_quantity_unit,
        'origin_address', origin_address,
        'origin_city', origin_city,
        'origin_country', origin_country,
        'origin_port', origin_port,
        'destination_address', destination_address,
        'destination_city', destination_city,
        'destination_country', destination_country,
        'destination_port', destination_port,
        'scope_of_work', scope_of_work
    )
),
shipment_count = 1
WHERE (shipments IS NULL OR shipments = '[]'::jsonb)
AND (service_type IS NOT NULL OR origin_city IS NOT NULL OR destination_city IS NOT NULL);

-- Migrate existing ticket rfq_data to array format if needed
-- (This is handled in code to maintain backward compatibility)

COMMENT ON FUNCTION public.copy_shipment_details_to_opportunity IS
'Copies ALL shipment_details from a lead to a newly created opportunity (supports multi-shipment)';

COMMENT ON FUNCTION public.get_entity_shipments IS
'Returns all shipments for a lead or opportunity as JSONB array';
