-- ============================================
-- Migration: 060_extend_rate_component_types.sql
-- Extend rate_component_type enum with additional logistics values
-- and fix sync function type casting
-- ============================================

-- Add missing enum values to rate_component_type
-- PostgreSQL doesn't support IF NOT EXISTS for enum values, so we check manually

DO $$
DECLARE
    enum_values TEXT[] := ARRAY[
        -- Freight & Transportation (new)
        'trucking_door_to_door',
        'local_delivery',
        'pickup_charge',
        'first_mile',
        'last_mile',
        'cross_docking',
        'transshipment',
        'express_delivery',
        'same_day_delivery',

        -- Port & Terminal (new)
        'doc_fee_origin',
        'doc_fee_destination',
        'isps_fee',
        'container_tracking',
        'equipment_handover',
        'gate_in_out',
        'ams_fee',
        'ens_fee',
        'vgm_fee',
        'chassis_fee',

        -- Customs & Documentation (new)
        'customs_clearance_import',
        'customs_clearance_export',
        'export_duty',
        'ppn_import',
        'pph_23',
        'peb_fee',
        'pib_fee',
        'ls_lartas',
        'sni_fee',
        'bpom_fee',
        'health_certificate',
        'phytosanitary',
        'halal_certificate',
        'notul_fee',
        'pnbp_bea_cukai',

        -- Handling & Storage (new)
        'loading_charge',
        'unloading_charge',
        'crane_charge',
        'reach_stacker',
        'storage_origin',
        'storage_destination',
        'stuffing',
        'unstuffing',
        'strapping',
        'shrink_wrap',
        'crating',
        'repackaging',
        'segregation',
        'sorting',
        'lashing',
        'unlashing',
        'dunnage',
        'tally_service',
        'inventory_management',
        'pick_and_pack',
        'kitting',
        'return_handling',

        -- Insurance & Security (new)
        'all_risk_insurance',
        'transit_insurance',
        'escort_service',
        'security_seal',
        'gps_tracking',

        -- Container & Equipment (new)
        'demurrage_detention',
        'reefer_monitoring',
        'genset_rental',
        'pallet_rental',
        'crate_rental',
        'container_deposit',
        'equipment_return',
        'flexi_bag',
        'iso_tank',
        'flat_rack',
        'open_top',

        -- Documentation & Admin (new)
        'airway_bill_fee',
        'seaway_bill',
        'courier_fee',
        'original_doc_fee',
        'amendment_fee',
        'switch_bl',
        'letter_of_credit',
        'banking_charge',
        'translation_fee',
        'notary_fee',

        -- Special Services (new)
        'hazmat_handling',
        'overlength_surcharge',
        'overheight_surcharge',
        'overwidth_surcharge',
        'roll_on_roll_off',
        'pre_shipment_inspection',
        'temperature_controlled',
        'cold_chain',
        'pharma_handling',
        'special_equipment',
        'waiting_time',
        'overnight_charge',
        'weekend_surcharge',
        'holiday_surcharge',
        'rush_order',
        'project_cargo',
        'breakbulk',
        'heavy_lift',

        -- Surcharges (new)
        'bunker_adjustment_factor',
        'port_congestion',
        'imo_2020',
        'emergency_bunker_surcharge',
        'general_rate_increase',
        'carrier_security_fee',
        'clean_truck_fee',
        'remote_area_surcharge',
        'residential_surcharge',
        'toll_fee',
        'highway_fee',

        -- Fulfillment & E-commerce (new)
        'fulfillment_fee',
        'order_processing',
        'value_added_service',
        'gift_wrapping',
        'insert_packing',
        'cod_handling',
        'cod_remittance',
        'reverse_logistics',
        'rts_return_to_sender',
        'address_correction',
        'redelivery',
        'proof_of_delivery',
        'signature_required',

        -- Other (new)
        'miscellaneous'
    ];
    v_value TEXT;
    v_exists BOOLEAN;
BEGIN
    FOREACH v_value IN ARRAY enum_values
    LOOP
        -- Check if the value already exists in the enum
        SELECT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = v_value
            AND enumtypid = 'rate_component_type'::regtype
        ) INTO v_exists;

        IF NOT v_exists THEN
            -- Add the new value to the enum
            EXECUTE format('ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS %L', v_value);
        END IF;
    END LOOP;
END $$;

-- ============================================
-- Fix sync_quotation_to_all to handle TEXT parameter properly
-- The issue is when passing status from customer_quotations table,
-- it's passed as customer_quotation_status enum but function expects TEXT
-- ============================================

-- Drop the existing function first
DROP FUNCTION IF EXISTS public.sync_quotation_to_all(UUID, TEXT, UUID);

-- Recreate with explicit TEXT casting
CREATE OR REPLACE FUNCTION public.sync_quotation_to_all(
    p_quotation_id UUID,
    p_new_status TEXT,
    p_actor_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_ticket RECORD;
    v_ticket_result JSONB;
    v_lead_result JSONB;
    v_opportunity_result JSONB;
    v_propagated_lead_id TEXT;
    v_propagated_opportunity_id TEXT;
    v_status_text TEXT;
BEGIN
    -- Ensure status is TEXT
    v_status_text := p_new_status::TEXT;

    -- Get quotation with all relations
    SELECT * INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Quotation not found');
    END IF;

    -- Sync to ticket if directly linked
    IF v_quotation.ticket_id IS NOT NULL THEN
        v_ticket_result := public.sync_quotation_to_ticket(p_quotation_id, v_status_text, p_actor_user_id);

        -- Also get ticket's lead/opportunity links for propagation
        SELECT lead_id, opportunity_id INTO v_propagated_lead_id, v_propagated_opportunity_id
        FROM public.tickets
        WHERE id = v_quotation.ticket_id;
    END IF;

    -- Sync to lead if directly linked OR via ticket
    IF v_quotation.lead_id IS NOT NULL THEN
        v_lead_result := public.sync_quotation_to_lead(p_quotation_id, v_status_text, p_actor_user_id);
    ELSIF v_propagated_lead_id IS NOT NULL THEN
        -- Update lead quotation status via propagation from ticket
        UPDATE public.leads
        SET
            quotation_status = v_status_text,
            updated_at = NOW()
        WHERE lead_id = v_propagated_lead_id;
        v_lead_result := jsonb_build_object('success', TRUE, 'synced', TRUE, 'lead_id', v_propagated_lead_id, 'propagated', TRUE);
    END IF;

    -- Sync to opportunity if directly linked OR via ticket
    IF v_quotation.opportunity_id IS NOT NULL THEN
        v_opportunity_result := public.sync_quotation_to_opportunity(p_quotation_id, v_status_text, p_actor_user_id);
    ELSIF v_propagated_opportunity_id IS NOT NULL THEN
        -- Update opportunity quotation status via propagation from ticket
        UPDATE public.opportunities
        SET
            quotation_status = v_status_text,
            updated_at = NOW()
        WHERE opportunity_id = v_propagated_opportunity_id;

        -- Auto-transition opportunity stage for propagated updates
        IF v_status_text = 'sent' THEN
            UPDATE public.opportunities
            SET stage = 'Quote Sent', updated_at = NOW()
            WHERE opportunity_id = v_propagated_opportunity_id
            AND stage IN ('Prospecting', 'Discovery');
        ELSIF v_status_text = 'rejected' THEN
            UPDATE public.opportunities
            SET stage = 'Negotiation', updated_at = NOW()
            WHERE opportunity_id = v_propagated_opportunity_id
            AND stage = 'Quote Sent';
        END IF;

        v_opportunity_result := jsonb_build_object('success', TRUE, 'synced', TRUE, 'opportunity_id', v_propagated_opportunity_id, 'propagated', TRUE);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', p_quotation_id,
        'new_status', v_status_text,
        'ticket_sync', v_ticket_result,
        'lead_sync', v_lead_result,
        'opportunity_sync', v_opportunity_result
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.sync_quotation_to_all(UUID, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.sync_quotation_to_all(UUID, TEXT, UUID) IS 'Master sync function that propagates quotation status to ticket, lead, and opportunity - accepts TEXT status';
