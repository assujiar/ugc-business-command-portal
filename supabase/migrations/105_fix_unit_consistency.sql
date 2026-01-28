-- ============================================
-- Migration: 105_fix_unit_consistency.sql
--
-- PURPOSE: Fix unit consistency issues in cargo_volume_unit and cargo_quantity_unit
--
-- ISSUES FIXED:
-- 1. RPC create_quotation_from_pipeline had wrong defaults:
--    - p_cargo_volume_unit was 'm3' but should be 'cbm' (database schema canonical)
--    - p_cargo_quantity_unit was 'unit' but should be 'units' (UI standard)
--
-- CHANGES:
-- 1. Update RPC defaults to match database schema and UI standards
-- 2. Clean up existing data with incorrect units
--
-- IDEMPOTENCY: Safe to re-run (CREATE OR REPLACE + idempotent updates)
-- ============================================


-- ============================================
-- PART 1: DATA CLEANUP
-- Fix any existing records with incorrect unit values
-- ============================================

-- Fix cargo_volume_unit: 'm3' -> 'cbm'
UPDATE public.customer_quotations
SET cargo_volume_unit = 'cbm'
WHERE cargo_volume_unit = 'm3';

-- Fix cargo_quantity_unit: 'unit' -> 'units' (singular to plural)
UPDATE public.customer_quotations
SET cargo_quantity_unit = 'units'
WHERE cargo_quantity_unit = 'unit';

-- Also fix in tickets table if columns exist (schema-guarded)
-- NOTE: tickets table uses rfq_data JSONB, not separate columns
-- This guard ensures migration doesn't fail if columns don't exist
DO $$
BEGIN
    -- Check and update cargo_volume_unit if column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'tickets'
        AND column_name = 'cargo_volume_unit'
    ) THEN
        EXECUTE $q$ UPDATE public.tickets SET cargo_volume_unit = 'cbm' WHERE cargo_volume_unit = 'm3' $q$;
    END IF;

    -- Check and update cargo_quantity_unit if column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'tickets'
        AND column_name = 'cargo_quantity_unit'
    ) THEN
        EXECUTE $q$ UPDATE public.tickets SET cargo_quantity_unit = 'units' WHERE cargo_quantity_unit = 'unit' $q$;
    END IF;
END $$;


-- ============================================
-- PART 2: Update create_quotation_from_pipeline RPC
-- Fix the default values for unit parameters
-- ============================================

CREATE OR REPLACE FUNCTION public.create_quotation_from_pipeline(
    p_opportunity_id TEXT,
    -- Customer info
    p_customer_name TEXT,
    p_customer_company TEXT DEFAULT NULL,
    p_customer_email TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL,
    p_customer_address TEXT DEFAULT NULL,
    -- Service details (now with both service_type and service_type_code)
    p_service_type TEXT DEFAULT NULL,
    p_service_type_code TEXT DEFAULT NULL,
    p_fleet_type TEXT DEFAULT NULL,
    p_fleet_quantity INTEGER DEFAULT NULL,
    p_incoterm TEXT DEFAULT NULL,
    -- Cargo
    p_commodity TEXT DEFAULT NULL,
    p_cargo_description TEXT DEFAULT NULL,
    p_cargo_weight NUMERIC DEFAULT NULL,
    p_cargo_weight_unit TEXT DEFAULT 'kg',
    p_cargo_volume NUMERIC DEFAULT NULL,
    p_cargo_volume_unit TEXT DEFAULT 'cbm',  -- FIX: was 'm3', now 'cbm' (canonical)
    p_cargo_quantity INTEGER DEFAULT NULL,
    p_cargo_quantity_unit TEXT DEFAULT 'units',  -- FIX: was 'unit', now 'units' (plural)
    -- Route
    p_origin_address TEXT DEFAULT NULL,
    p_origin_city TEXT DEFAULT NULL,
    p_origin_country TEXT DEFAULT 'Indonesia',
    p_origin_port TEXT DEFAULT NULL,
    p_destination_address TEXT DEFAULT NULL,
    p_destination_city TEXT DEFAULT NULL,
    p_destination_country TEXT DEFAULT NULL,
    p_destination_port TEXT DEFAULT NULL,
    -- Pricing (optional - will use latest ops cost if available)
    p_rate_structure TEXT DEFAULT 'bundling',
    p_total_cost NUMERIC DEFAULT NULL,
    p_target_margin_percent NUMERIC DEFAULT 15,
    p_total_selling_rate NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'IDR',
    -- Terms
    p_scope_of_work TEXT DEFAULT NULL,
    p_terms_includes TEXT[] DEFAULT NULL,
    p_terms_excludes TEXT[] DEFAULT NULL,
    p_terms_notes TEXT DEFAULT NULL,
    p_validity_days INTEGER DEFAULT 14
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_lead_id TEXT;
    v_quotation_id UUID;
    v_quotation_number TEXT;
    v_sequence_number INTEGER;
    v_valid_until DATE;
    v_latest_rate_quote RECORD;
    v_effective_total_cost NUMERIC;
    v_effective_margin NUMERIC;
    v_effective_selling_rate NUMERIC;
    v_effective_currency TEXT;
    v_source_rate_quote_id UUID;
    v_effective_service_type TEXT;
    v_effective_service_type_code TEXT;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Not authenticated');
    END IF;

    -- Get lead_id from opportunity
    SELECT source_lead_id INTO v_lead_id
    FROM public.opportunities
    WHERE opportunity_id = p_opportunity_id;

    -- FIX: Properly handle service_type and service_type_code
    -- service_type_code is the canonical identifier
    -- service_type is the display label
    v_effective_service_type_code := COALESCE(p_service_type_code, p_service_type);
    v_effective_service_type := p_service_type; -- Keep label as provided or NULL

    -- Look for latest submitted ops cost for this opportunity/lead
    SELECT * INTO v_latest_rate_quote
    FROM public.ticket_rate_quotes
    WHERE status = 'submitted'
    AND (
        opportunity_id = p_opportunity_id
        OR (lead_id = v_lead_id AND v_lead_id IS NOT NULL)
        OR ticket_id IN (
            SELECT id FROM public.tickets
            WHERE opportunity_id = p_opportunity_id
        )
    )
    ORDER BY
        CASE WHEN opportunity_id = p_opportunity_id THEN 0 ELSE 1 END,
        COALESCE(submitted_at, updated_at, created_at) DESC
    LIMIT 1;

    -- Use latest rate quote data if available, otherwise use parameters
    IF v_latest_rate_quote IS NOT NULL THEN
        v_effective_total_cost := COALESCE(p_total_cost, v_latest_rate_quote.amount);
        v_effective_currency := COALESCE(p_currency, v_latest_rate_quote.currency, 'IDR');
        v_source_rate_quote_id := v_latest_rate_quote.id;

        -- Calculate selling rate if not provided
        IF p_total_selling_rate IS NOT NULL THEN
            v_effective_selling_rate := p_total_selling_rate;
            -- Calculate actual margin
            IF v_effective_total_cost > 0 THEN
                v_effective_margin := ((v_effective_selling_rate - v_effective_total_cost) / v_effective_total_cost) * 100;
            ELSE
                v_effective_margin := p_target_margin_percent;
            END IF;
        ELSE
            -- Calculate selling rate from cost + margin
            v_effective_margin := COALESCE(p_target_margin_percent, 15);
            v_effective_selling_rate := v_effective_total_cost * (1 + v_effective_margin / 100);
        END IF;
    ELSE
        -- No rate quote found, use parameters directly
        v_effective_total_cost := COALESCE(p_total_cost, 0);
        v_effective_margin := COALESCE(p_target_margin_percent, 15);
        v_effective_selling_rate := COALESCE(p_total_selling_rate, v_effective_total_cost * (1 + v_effective_margin / 100));
        v_effective_currency := COALESCE(p_currency, 'IDR');
        v_source_rate_quote_id := NULL;
    END IF;

    -- Generate quotation number
    v_quotation_number := public.generate_customer_quotation_number();

    -- Get sequence number for this opportunity
    SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_sequence_number
    FROM public.customer_quotations
    WHERE opportunity_id = p_opportunity_id;

    -- Calculate valid_until date
    v_valid_until := CURRENT_DATE + p_validity_days;

    -- Insert quotation with both service_type and service_type_code
    INSERT INTO public.customer_quotations (
        opportunity_id,
        lead_id,
        source_type,
        sequence_number,
        operational_cost_id,
        quotation_number,
        customer_name,
        customer_company,
        customer_email,
        customer_phone,
        customer_address,
        service_type,
        service_type_code,
        fleet_type,
        fleet_quantity,
        incoterm,
        commodity,
        cargo_description,
        cargo_weight,
        cargo_weight_unit,
        cargo_volume,
        cargo_volume_unit,
        cargo_quantity,
        cargo_quantity_unit,
        origin_address,
        origin_city,
        origin_country,
        origin_port,
        destination_address,
        destination_city,
        destination_country,
        destination_port,
        rate_structure,
        total_cost,
        target_margin_percent,
        total_selling_rate,
        currency,
        scope_of_work,
        terms_includes,
        terms_excludes,
        terms_notes,
        validity_days,
        valid_until,
        created_by
    ) VALUES (
        p_opportunity_id,
        v_lead_id,
        'opportunity',
        v_sequence_number,
        v_source_rate_quote_id,
        v_quotation_number,
        p_customer_name,
        p_customer_company,
        p_customer_email,
        p_customer_phone,
        p_customer_address,
        v_effective_service_type,
        v_effective_service_type_code,
        p_fleet_type,
        p_fleet_quantity,
        p_incoterm,
        p_commodity,
        p_cargo_description,
        p_cargo_weight,
        p_cargo_weight_unit,
        p_cargo_volume,
        p_cargo_volume_unit,
        p_cargo_quantity,
        p_cargo_quantity_unit,
        p_origin_address,
        p_origin_city,
        p_origin_country,
        p_origin_port,
        p_destination_address,
        p_destination_city,
        p_destination_country,
        p_destination_port,
        p_rate_structure::rate_structure_type,
        v_effective_total_cost,
        v_effective_margin,
        v_effective_selling_rate,
        v_effective_currency,
        p_scope_of_work,
        p_terms_includes,
        p_terms_excludes,
        p_terms_notes,
        p_validity_days,
        v_valid_until,
        v_user_id
    )
    RETURNING id INTO v_quotation_id;

    -- Sync to opportunity
    UPDATE public.opportunities
    SET
        quotation_status = 'draft',
        latest_quotation_id = v_quotation_id,
        quotation_count = COALESCE(quotation_count, 0) + 1,
        updated_at = NOW()
    WHERE opportunity_id = p_opportunity_id;

    -- Sync to lead if linked
    IF v_lead_id IS NOT NULL THEN
        UPDATE public.leads
        SET
            quotation_status = 'draft',
            latest_quotation_id = v_quotation_id,
            quotation_count = COALESCE(quotation_count, 0) + 1,
            updated_at = NOW()
        WHERE lead_id = v_lead_id;
    END IF;

    -- Create activity record
    INSERT INTO public.activities (
        activity_type,
        subject,
        description,
        status,
        due_date,
        completed_at,
        related_opportunity_id,
        related_lead_id,
        owner_user_id,
        created_by
    ) VALUES (
        'Note'::activity_type_v2,
        'Quotation Created from Pipeline',
        'Customer quotation ' || v_quotation_number || ' created directly from pipeline opportunity.',
        'Completed'::activity_status,
        CURRENT_DATE,
        NOW(),
        p_opportunity_id,
        v_lead_id,
        v_user_id,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation_id,
        'quotation_number', v_quotation_number,
        'sequence_number', v_sequence_number,
        'sequence_label', 'Revision ' || v_sequence_number,
        'lead_id', v_lead_id,
        'opportunity_id', p_opportunity_id,
        'operational_cost_id', v_source_rate_quote_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'detail', SQLSTATE
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.create_quotation_from_pipeline IS
'Creates a customer quotation directly from pipeline opportunity.
Supports both service_type (display label) and service_type_code (canonical identifier).
Uses latest submitted operational cost if available.
Unit defaults: cargo_volume_unit=cbm, cargo_quantity_unit=units';


-- ============================================
-- PART 3: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.create_quotation_from_pipeline(
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, TEXT, TEXT, INTEGER, TEXT,
    TEXT, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, INTEGER, TEXT,
    TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT,
    TEXT, TEXT[], TEXT[], TEXT, INTEGER
) TO authenticated;


-- ============================================
-- SUMMARY
-- ============================================
-- This migration fixes unit consistency issues:
-- 1. cargo_volume_unit: 'm3' -> 'cbm' (database canonical default)
-- 2. cargo_quantity_unit: 'unit' -> 'units' (UI standard, plural form)
--
-- Changes made:
-- - Cleaned up existing data with incorrect units
-- - Updated RPC create_quotation_from_pipeline with correct defaults
-- - API routes also updated to use correct defaults
-- ============================================
