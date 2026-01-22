-- =====================================================
-- Migration 057: Extend Rate Component Type Enum
-- Adds all missing enum values for quotation breakdown items
-- =====================================================

-- Add new enum values to rate_component_type
-- Note: PostgreSQL requires adding values one at a time

-- Freight & Transportation
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'trucking_door_to_door';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'local_delivery';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'pickup_charge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'first_mile';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'last_mile';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'cross_docking';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'transshipment';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'express_delivery';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'same_day_delivery';

-- Port & Terminal
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'doc_fee_origin';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'doc_fee_destination';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'isps_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'container_tracking';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'equipment_handover';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'gate_in_out';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'ams_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'ens_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'vgm_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'chassis_fee';

-- Customs & Documentation
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'customs_clearance_import';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'customs_clearance_export';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'export_duty';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'ppn_import';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'pph_23';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'peb_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'pib_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'ls_lartas';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'sni_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'bpom_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'health_certificate';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'phytosanitary';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'halal_certificate';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'notul_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'pnbp_bea_cukai';

-- Handling & Storage
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'loading_charge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'unloading_charge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'crane_charge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'reach_stacker';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'storage_origin';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'storage_destination';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'stuffing';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'unstuffing';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'strapping';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'shrink_wrap';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'crating';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'repackaging';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'segregation';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'sorting';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'lashing';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'unlashing';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'dunnage';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'tally_service';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'inventory_management';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'pick_and_pack';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'kitting';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'return_handling';

-- Insurance & Security
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'all_risk_insurance';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'transit_insurance';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'escort_service';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'security_seal';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'gps_tracking';

-- Container & Equipment
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'demurrage_detention';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'reefer_monitoring';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'genset_rental';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'pallet_rental';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'crate_rental';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'container_deposit';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'equipment_return';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'flexi_bag';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'iso_tank';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'flat_rack';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'open_top';

-- Documentation & Admin
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'airway_bill_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'seaway_bill';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'courier_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'original_doc_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'amendment_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'switch_bl';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'letter_of_credit';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'banking_charge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'translation_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'notary_fee';

-- Special Services
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'hazmat_handling';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'overlength_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'overheight_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'overwidth_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'roll_on_roll_off';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'pre_shipment_inspection';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'temperature_controlled';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'cold_chain';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'pharma_handling';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'special_equipment';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'waiting_time';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'overnight_charge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'weekend_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'holiday_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'rush_order';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'project_cargo';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'breakbulk';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'heavy_lift';

-- Surcharges
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'fuel_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'bunker_adjustment_factor';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'currency_adjustment_factor';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'peak_season_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'congestion_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'port_congestion';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'low_sulphur_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'imo_2020';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'war_risk_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'piracy_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'emergency_bunker_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'general_rate_increase';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'carrier_security_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'clean_truck_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'remote_area_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'residential_surcharge';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'toll_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'highway_fee';

-- Fulfillment & E-commerce
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'fulfillment_fee';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'order_processing';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'value_added_service';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'gift_wrapping';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'insert_packing';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'cod_handling';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'cod_remittance';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'reverse_logistics';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'rts_return_to_sender';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'address_correction';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'redelivery';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'proof_of_delivery';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'signature_required';

-- Other
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'miscellaneous';
ALTER TYPE rate_component_type ADD VALUE IF NOT EXISTS 'other';

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TYPE rate_component_type IS 'Extended logistics rate component types for quotation breakdown items';
