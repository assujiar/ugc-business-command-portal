-- ============================================
-- Migration: 108_fix_service_type_code_column_size.sql
--
-- PURPOSE: Fix service_type_code column being too small (VARCHAR(20))
-- which causes "value too long for type character varying(20)" error
-- when creating customer quotations with longer service type values.
--
-- The API route falls back to using service_type (display label) when
-- service_type_code is not provided, but labels like "Freight Forwarding"
-- or "Customs Clearance" can exceed 20 characters.
--
-- CHANGES:
-- 1. Alter service_type_code from VARCHAR(20) to VARCHAR(100)
--
-- IDEMPOTENCY: Safe to re-run (ALTER COLUMN is idempotent for size changes)
-- ============================================

-- ============================================
-- PART 1: Alter service_type_code column size
-- ============================================

ALTER TABLE public.customer_quotations
ALTER COLUMN service_type_code TYPE VARCHAR(100);

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
DECLARE
    v_column_size INTEGER;
BEGIN
    SELECT character_maximum_length INTO v_column_size
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_quotations'
      AND column_name = 'service_type_code';

    IF v_column_size = 100 THEN
        RAISE NOTICE '[108] SUCCESS: service_type_code column size is now 100';
    ELSE
        RAISE WARNING '[108] UNEXPECTED: service_type_code column size is %', v_column_size;
    END IF;
END $$;

-- ============================================
-- SUMMARY
-- ============================================
-- This migration increases the service_type_code column from VARCHAR(20)
-- to VARCHAR(100) to accommodate longer service type values when the
-- service_type_code is derived from the service_type display label.
-- ============================================
