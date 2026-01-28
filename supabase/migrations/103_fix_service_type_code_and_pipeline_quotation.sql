-- ============================================
-- Migration: 103_fix_service_type_code_and_pipeline_quotation.sql
--
-- PURPOSE: Fix service_type_code handling in quotation creation
-- and ensure proper data consistency between ticket RFQ and quotation.
--
-- CHANGES:
-- 1. Update create_quotation_from_pipeline to accept and store service_type_code
-- 2. Ensure both service_type (label) and service_type_code (canonical) are stored
--
-- IDEMPOTENCY: Safe to re-run (DROP + CREATE)
-- ============================================

-- ============================================
-- PART 0: Drop all existing overloads of create_quotation_from_pipeline
-- This prevents "function name is not unique" errors from multiple overloads
-- ============================================

DO $$
DECLARE
    v_proc RECORD;
BEGIN
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'create_quotation_from_pipeline'
    LOOP
        RAISE NOTICE '[103] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;
END $$;

-- ============================================
-- PART 1: Create create_quotation_from_pipeline RPC
-- With service_type_code parameter and both fields stored
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
    p_cargo_volume_unit TEXT DEFAULT 'm3',
    p_cargo_quantity INTEGER DEFAULT NULL,
    p_cargo_quantity_unit TEXT DEFAULT 'unit',
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
Now supports both service_type (display label) and service_type_code (canonical identifier).
Uses latest submitted operational cost if available.';


-- ============================================
-- PART 2: GRANT PERMISSIONS
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
-- This migration adds service_type_code support to the create_quotation_from_pipeline
-- RPC function. Both service_type (display label) and service_type_code (canonical
-- identifier) are now properly stored when creating quotations from the pipeline.
--
-- Combined with the API route changes, this ensures:
-- 1. Quotations always have service_type_code populated
-- 2. service_type label is derived or stored when available
-- 3. Data consistency between ticket RFQ and customer quotation
-- ============================================
