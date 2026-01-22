-- ============================================
-- Migration: 055_update_service_types.sql
-- Update service type codes to new format: [Scope] | [Service Name]
-- ============================================

-- ============================================
-- SERVICE TYPE MAPPING TABLE (for reference)
-- ============================================
-- Old Code              -> New Code                -> Display Format
-- LTL                   -> DOM_LTL                 -> Domestics | LTL (Less than Truck Load)
-- FTL                   -> DOM_FTL                 -> Domestics | FTL (Full Trucking Load)
-- AF                    -> DOM_AIRFREIGHT          -> Domestics | Airfreight
-- LCL                   -> DOM_SEAFREIGHT_LCL      -> Domestics | Seafreight LCL
-- FCL                   -> DOM_SEAFREIGHT_FCL      -> Domestics | Seafreight FCL
-- WAREHOUSING           -> DOM_WAREHOUSING         -> Domestics | Warehousing
-- FULFILLMENT           -> DOM_FULFILLMENT         -> Domestics | Fulfillment
-- LCL_EXPORT            -> EXP_SEAFREIGHT_LCL      -> Export | Seafreight LCL
-- FCL_EXPORT            -> EXP_SEAFREIGHT_FCL      -> Export | Seafreight FCL
-- AIRFREIGHT_EXPORT     -> EXP_AIRFREIGHT          -> Export | Airfreight
-- LCL_IMPORT            -> IMP_SEAFREIGHT_LCL      -> Import | Seafreight LCL
-- FCL_IMPORT            -> IMP_SEAFREIGHT_FCL      -> Import | Seafreight FCL
-- AIRFREIGHT_IMPORT     -> IMP_AIRFREIGHT          -> Import | Airfreight
-- CUSTOMS_CLEARANCE     -> IMP_CUSTOMS_CLEARANCE   -> Import | Customs Clearance
-- LCL_DTD               -> DTD_SEAFREIGHT_LCL      -> Import DTD | Seafreight LCL
-- FCL_DTD               -> DTD_SEAFREIGHT_FCL      -> Import DTD | Seafreight FCL
-- AIRFREIGHT_DTD        -> DTD_AIRFREIGHT          -> Import DTD | Airfreight

-- ============================================
-- 1. UPDATE CUSTOMER QUOTATIONS - service_type field
-- ============================================
UPDATE public.customer_quotations
SET service_type = CASE service_type
    -- Domestics
    WHEN 'LTL' THEN 'Domestics | LTL (Less than Truck Load)'
    WHEN 'LTL (Less Than Truckload)' THEN 'Domestics | LTL (Less than Truck Load)'
    WHEN 'FTL' THEN 'Domestics | FTL (Full Trucking Load)'
    WHEN 'FTL (Full Truckload)' THEN 'Domestics | FTL (Full Trucking Load)'
    WHEN 'AF' THEN 'Domestics | Airfreight'
    WHEN 'Air Freight' THEN 'Domestics | Airfreight'
    WHEN 'LCL' THEN 'Domestics | Seafreight LCL'
    WHEN 'LCL (Less Container Load)' THEN 'Domestics | Seafreight LCL'
    WHEN 'FCL' THEN 'Domestics | Seafreight FCL'
    WHEN 'FCL (Full Container Load)' THEN 'Domestics | Seafreight FCL'
    WHEN 'Sea Freight' THEN 'Domestics | Seafreight FCL'
    WHEN 'WAREHOUSING' THEN 'Domestics | Warehousing'
    WHEN 'Warehousing' THEN 'Domestics | Warehousing'
    WHEN 'FULFILLMENT' THEN 'Domestics | Fulfillment'
    WHEN 'Fulfillment' THEN 'Domestics | Fulfillment'
    WHEN 'Door to Door' THEN 'Import DTD | Seafreight FCL'
    -- Export
    WHEN 'LCL Export' THEN 'Export | Seafreight LCL'
    WHEN 'LCL_EXPORT' THEN 'Export | Seafreight LCL'
    WHEN 'FCL Export' THEN 'Export | Seafreight FCL'
    WHEN 'FCL_EXPORT' THEN 'Export | Seafreight FCL'
    WHEN 'Airfreight Export' THEN 'Export | Airfreight'
    WHEN 'AIRFREIGHT_EXPORT' THEN 'Export | Airfreight'
    -- Import
    WHEN 'LCL Import' THEN 'Import | Seafreight LCL'
    WHEN 'LCL_IMPORT' THEN 'Import | Seafreight LCL'
    WHEN 'FCL Import' THEN 'Import | Seafreight FCL'
    WHEN 'FCL_IMPORT' THEN 'Import | Seafreight FCL'
    WHEN 'Airfreight Import' THEN 'Import | Airfreight'
    WHEN 'AIRFREIGHT_IMPORT' THEN 'Import | Airfreight'
    WHEN 'Customs Clearance' THEN 'Import | Customs Clearance'
    WHEN 'CUSTOMS_CLEARANCE' THEN 'Import | Customs Clearance'
    -- Import DTD
    WHEN 'LCL DTD' THEN 'Import DTD | Seafreight LCL'
    WHEN 'LCL_DTD' THEN 'Import DTD | Seafreight LCL'
    WHEN 'LCL DTD (Door to Door)' THEN 'Import DTD | Seafreight LCL'
    WHEN 'FCL DTD' THEN 'Import DTD | Seafreight FCL'
    WHEN 'FCL_DTD' THEN 'Import DTD | Seafreight FCL'
    WHEN 'FCL DTD (Door to Door)' THEN 'Import DTD | Seafreight FCL'
    WHEN 'Airfreight DTD' THEN 'Import DTD | Airfreight'
    WHEN 'AIRFREIGHT_DTD' THEN 'Import DTD | Airfreight'
    WHEN 'Airfreight DTD (Door to Door)' THEN 'Import DTD | Airfreight'
    ELSE service_type
END
WHERE service_type IS NOT NULL
  AND service_type NOT LIKE '%|%'; -- Skip already converted

-- ============================================
-- 2. UPDATE CUSTOMER QUOTATIONS - service_type_code field
-- ============================================
UPDATE public.customer_quotations
SET service_type_code = CASE service_type_code
    -- Domestics
    WHEN 'LTL' THEN 'DOM_LTL'
    WHEN 'FTL' THEN 'DOM_FTL'
    WHEN 'AF' THEN 'DOM_AIRFREIGHT'
    WHEN 'LCL' THEN 'DOM_SEAFREIGHT_LCL'
    WHEN 'FCL' THEN 'DOM_SEAFREIGHT_FCL'
    WHEN 'WAREHOUSING' THEN 'DOM_WAREHOUSING'
    WHEN 'FULFILLMENT' THEN 'DOM_FULFILLMENT'
    -- Export
    WHEN 'LCL_EXPORT' THEN 'EXP_SEAFREIGHT_LCL'
    WHEN 'FCL_EXPORT' THEN 'EXP_SEAFREIGHT_FCL'
    WHEN 'AIRFREIGHT_EXPORT' THEN 'EXP_AIRFREIGHT'
    -- Import
    WHEN 'LCL_IMPORT' THEN 'IMP_SEAFREIGHT_LCL'
    WHEN 'FCL_IMPORT' THEN 'IMP_SEAFREIGHT_FCL'
    WHEN 'AIRFREIGHT_IMPORT' THEN 'IMP_AIRFREIGHT'
    WHEN 'CUSTOMS_CLEARANCE' THEN 'IMP_CUSTOMS_CLEARANCE'
    -- Import DTD
    WHEN 'LCL_DTD' THEN 'DTD_SEAFREIGHT_LCL'
    WHEN 'FCL_DTD' THEN 'DTD_SEAFREIGHT_FCL'
    WHEN 'AIRFREIGHT_DTD' THEN 'DTD_AIRFREIGHT'
    ELSE service_type_code
END
WHERE service_type_code IS NOT NULL
  AND service_type_code NOT LIKE 'DOM_%'
  AND service_type_code NOT LIKE 'EXP_%'
  AND service_type_code NOT LIKE 'IMP_%'
  AND service_type_code NOT LIKE 'DTD_%';

-- ============================================
-- 3. UPDATE TICKETS - rfq_data->service_type_code
-- ============================================
UPDATE public.tickets
SET rfq_data = jsonb_set(
    rfq_data,
    '{service_type_code}',
    to_jsonb(CASE rfq_data->>'service_type_code'
        -- Domestics
        WHEN 'LTL' THEN 'DOM_LTL'
        WHEN 'FTL' THEN 'DOM_FTL'
        WHEN 'AF' THEN 'DOM_AIRFREIGHT'
        WHEN 'LCL' THEN 'DOM_SEAFREIGHT_LCL'
        WHEN 'FCL' THEN 'DOM_SEAFREIGHT_FCL'
        WHEN 'WAREHOUSING' THEN 'DOM_WAREHOUSING'
        WHEN 'FULFILLMENT' THEN 'DOM_FULFILLMENT'
        -- Export
        WHEN 'LCL_EXPORT' THEN 'EXP_SEAFREIGHT_LCL'
        WHEN 'FCL_EXPORT' THEN 'EXP_SEAFREIGHT_FCL'
        WHEN 'AIRFREIGHT_EXPORT' THEN 'EXP_AIRFREIGHT'
        -- Import
        WHEN 'LCL_IMPORT' THEN 'IMP_SEAFREIGHT_LCL'
        WHEN 'FCL_IMPORT' THEN 'IMP_SEAFREIGHT_FCL'
        WHEN 'AIRFREIGHT_IMPORT' THEN 'IMP_AIRFREIGHT'
        WHEN 'CUSTOMS_CLEARANCE' THEN 'IMP_CUSTOMS_CLEARANCE'
        -- Import DTD
        WHEN 'LCL_DTD' THEN 'DTD_SEAFREIGHT_LCL'
        WHEN 'FCL_DTD' THEN 'DTD_SEAFREIGHT_FCL'
        WHEN 'AIRFREIGHT_DTD' THEN 'DTD_AIRFREIGHT'
        ELSE rfq_data->>'service_type_code'
    END)
)
WHERE rfq_data IS NOT NULL
  AND rfq_data->>'service_type_code' IS NOT NULL
  AND rfq_data->>'service_type_code' NOT LIKE 'DOM_%'
  AND rfq_data->>'service_type_code' NOT LIKE 'EXP_%'
  AND rfq_data->>'service_type_code' NOT LIKE 'IMP_%'
  AND rfq_data->>'service_type_code' NOT LIKE 'DTD_%';

-- ============================================
-- 4. UPDATE TICKETS - rfq_data->service_type (display format)
-- ============================================
UPDATE public.tickets
SET rfq_data = jsonb_set(
    rfq_data,
    '{service_type}',
    to_jsonb(CASE rfq_data->>'service_type_code'
        -- Domestics
        WHEN 'DOM_LTL' THEN 'Domestics | LTL (Less than Truck Load)'
        WHEN 'DOM_FTL' THEN 'Domestics | FTL (Full Trucking Load)'
        WHEN 'DOM_AIRFREIGHT' THEN 'Domestics | Airfreight'
        WHEN 'DOM_SEAFREIGHT_LCL' THEN 'Domestics | Seafreight LCL'
        WHEN 'DOM_SEAFREIGHT_FCL' THEN 'Domestics | Seafreight FCL'
        WHEN 'DOM_WAREHOUSING' THEN 'Domestics | Warehousing'
        WHEN 'DOM_FULFILLMENT' THEN 'Domestics | Fulfillment'
        WHEN 'DOM_WAREHOUSING_FULFILLMENT' THEN 'Domestics | Warehousing-Fulfillment'
        -- Export
        WHEN 'EXP_AIRFREIGHT' THEN 'Export | Airfreight'
        WHEN 'EXP_SEAFREIGHT_LCL' THEN 'Export | Seafreight LCL'
        WHEN 'EXP_SEAFREIGHT_FCL' THEN 'Export | Seafreight FCL'
        WHEN 'EXP_CUSTOMS_CLEARANCE' THEN 'Export | Customs Clearance'
        -- Import
        WHEN 'IMP_AIRFREIGHT' THEN 'Import | Airfreight'
        WHEN 'IMP_SEAFREIGHT_LCL' THEN 'Import | Seafreight LCL'
        WHEN 'IMP_SEAFREIGHT_FCL' THEN 'Import | Seafreight FCL'
        WHEN 'IMP_CUSTOMS_CLEARANCE' THEN 'Import | Customs Clearance'
        -- Import DTD
        WHEN 'DTD_AIRFREIGHT' THEN 'Import DTD | Airfreight'
        WHEN 'DTD_SEAFREIGHT_LCL' THEN 'Import DTD | Seafreight LCL'
        WHEN 'DTD_SEAFREIGHT_FCL' THEN 'Import DTD | Seafreight FCL'
        ELSE COALESCE(rfq_data->>'service_type', '')
    END)
)
WHERE rfq_data IS NOT NULL
  AND rfq_data->>'service_type_code' IS NOT NULL
  AND rfq_data->>'service_type_code' LIKE 'DOM_%'
     OR rfq_data->>'service_type_code' LIKE 'EXP_%'
     OR rfq_data->>'service_type_code' LIKE 'IMP_%'
     OR rfq_data->>'service_type_code' LIKE 'DTD_%';

-- ============================================
-- 5. UPDATE LEADS - service_code field
-- ============================================
UPDATE public.leads
SET service_code = CASE service_code
    -- Domestics
    WHEN 'LTL' THEN 'DOM_LTL'
    WHEN 'FTL' THEN 'DOM_FTL'
    WHEN 'AF' THEN 'DOM_AIRFREIGHT'
    WHEN 'LCL' THEN 'DOM_SEAFREIGHT_LCL'
    WHEN 'FCL' THEN 'DOM_SEAFREIGHT_FCL'
    WHEN 'WAREHOUSING' THEN 'DOM_WAREHOUSING'
    WHEN 'FULFILLMENT' THEN 'DOM_FULFILLMENT'
    -- Export
    WHEN 'LCL_EXPORT' THEN 'EXP_SEAFREIGHT_LCL'
    WHEN 'FCL_EXPORT' THEN 'EXP_SEAFREIGHT_FCL'
    WHEN 'AIRFREIGHT_EXPORT' THEN 'EXP_AIRFREIGHT'
    -- Import
    WHEN 'LCL_IMPORT' THEN 'IMP_SEAFREIGHT_LCL'
    WHEN 'FCL_IMPORT' THEN 'IMP_SEAFREIGHT_FCL'
    WHEN 'AIRFREIGHT_IMPORT' THEN 'IMP_AIRFREIGHT'
    WHEN 'CUSTOMS_CLEARANCE' THEN 'IMP_CUSTOMS_CLEARANCE'
    -- Import DTD
    WHEN 'LCL_DTD' THEN 'DTD_SEAFREIGHT_LCL'
    WHEN 'FCL_DTD' THEN 'DTD_SEAFREIGHT_FCL'
    WHEN 'AIRFREIGHT_DTD' THEN 'DTD_AIRFREIGHT'
    ELSE service_code
END
WHERE service_code IS NOT NULL
  AND service_code NOT LIKE 'DOM_%'
  AND service_code NOT LIKE 'EXP_%'
  AND service_code NOT LIKE 'IMP_%'
  AND service_code NOT LIKE 'DTD_%';

-- Also update service_description to new format
UPDATE public.leads
SET service_description = CASE service_code
    -- Domestics
    WHEN 'DOM_LTL' THEN 'Domestics | LTL (Less than Truck Load)'
    WHEN 'DOM_FTL' THEN 'Domestics | FTL (Full Trucking Load)'
    WHEN 'DOM_AIRFREIGHT' THEN 'Domestics | Airfreight'
    WHEN 'DOM_SEAFREIGHT_LCL' THEN 'Domestics | Seafreight LCL'
    WHEN 'DOM_SEAFREIGHT_FCL' THEN 'Domestics | Seafreight FCL'
    WHEN 'DOM_WAREHOUSING' THEN 'Domestics | Warehousing'
    WHEN 'DOM_FULFILLMENT' THEN 'Domestics | Fulfillment'
    WHEN 'DOM_WAREHOUSING_FULFILLMENT' THEN 'Domestics | Warehousing-Fulfillment'
    -- Export
    WHEN 'EXP_AIRFREIGHT' THEN 'Export | Airfreight'
    WHEN 'EXP_SEAFREIGHT_LCL' THEN 'Export | Seafreight LCL'
    WHEN 'EXP_SEAFREIGHT_FCL' THEN 'Export | Seafreight FCL'
    WHEN 'EXP_CUSTOMS_CLEARANCE' THEN 'Export | Customs Clearance'
    -- Import
    WHEN 'IMP_AIRFREIGHT' THEN 'Import | Airfreight'
    WHEN 'IMP_SEAFREIGHT_LCL' THEN 'Import | Seafreight LCL'
    WHEN 'IMP_SEAFREIGHT_FCL' THEN 'Import | Seafreight FCL'
    WHEN 'IMP_CUSTOMS_CLEARANCE' THEN 'Import | Customs Clearance'
    -- Import DTD
    WHEN 'DTD_AIRFREIGHT' THEN 'Import DTD | Airfreight'
    WHEN 'DTD_SEAFREIGHT_LCL' THEN 'Import DTD | Seafreight LCL'
    WHEN 'DTD_SEAFREIGHT_FCL' THEN 'Import DTD | Seafreight FCL'
    ELSE service_description
END
WHERE service_code IS NOT NULL
  AND service_code LIKE 'DOM_%' OR service_code LIKE 'EXP_%' OR service_code LIKE 'IMP_%' OR service_code LIKE 'DTD_%';

-- ============================================
-- 6. ADD service_scope FIELD TO rfq_data (for new tickets)
-- ============================================
-- This adds the scope field based on the service_type_code
UPDATE public.tickets
SET rfq_data = rfq_data || jsonb_build_object(
    'service_scope',
    CASE
        WHEN rfq_data->>'service_type_code' LIKE 'DOM_%' THEN 'Domestics'
        WHEN rfq_data->>'service_type_code' LIKE 'EXP_%' THEN 'Export'
        WHEN rfq_data->>'service_type_code' LIKE 'IMP_%' THEN 'Import'
        WHEN rfq_data->>'service_type_code' LIKE 'DTD_%' THEN 'Import DTD'
        ELSE NULL
    END
)
WHERE rfq_data IS NOT NULL
  AND rfq_data->>'service_type_code' IS NOT NULL
  AND (rfq_data->>'service_scope' IS NULL OR rfq_data->>'service_scope' = '');

-- ============================================
-- 7. UPDATE department FIELD IN rfq_data
-- ============================================
UPDATE public.tickets
SET rfq_data = jsonb_set(
    rfq_data,
    '{department}',
    to_jsonb(CASE
        WHEN rfq_data->>'service_type_code' LIKE 'DOM_%' THEN 'Domestics Ops Dept'
        WHEN rfq_data->>'service_type_code' LIKE 'EXP_%' THEN 'Exim Ops Dept'
        WHEN rfq_data->>'service_type_code' LIKE 'IMP_%' THEN 'Exim Ops Dept'
        WHEN rfq_data->>'service_type_code' LIKE 'DTD_%' THEN 'Import DTD Ops Dept'
        ELSE COALESCE(rfq_data->>'department', '')
    END)
)
WHERE rfq_data IS NOT NULL
  AND rfq_data->>'service_type_code' IS NOT NULL;

-- ============================================
-- VERIFICATION QUERIES (run manually to check)
-- ============================================
-- Check customer_quotations service types:
-- SELECT DISTINCT service_type, service_type_code FROM customer_quotations WHERE service_type IS NOT NULL;

-- Check tickets rfq_data service types:
-- SELECT DISTINCT rfq_data->>'service_type_code', rfq_data->>'service_type' FROM tickets WHERE rfq_data IS NOT NULL;

-- Check leads service_code:
-- SELECT DISTINCT service_code, service_description FROM leads WHERE service_code IS NOT NULL;

COMMENT ON TABLE public.customer_quotations IS 'Customer quotations with service types in format: [Scope] | [Service Name]';
