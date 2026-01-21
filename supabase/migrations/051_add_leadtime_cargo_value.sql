-- =====================================================
-- Migration: Add estimated leadtime and cargo value fields
-- Description: Add estimated_leadtime and estimated_cargo_value to customer_quotations
-- =====================================================

-- Add new columns to customer_quotations table
ALTER TABLE public.customer_quotations
ADD COLUMN IF NOT EXISTS estimated_leadtime TEXT,
ADD COLUMN IF NOT EXISTS estimated_cargo_value NUMERIC,
ADD COLUMN IF NOT EXISTS cargo_value_currency TEXT DEFAULT 'IDR';

-- Add comment for documentation
COMMENT ON COLUMN public.customer_quotations.estimated_leadtime IS 'Estimated delivery leadtime (e.g., "3-5 hari", "1 minggu")';
COMMENT ON COLUMN public.customer_quotations.estimated_cargo_value IS 'Estimated value of the cargo being shipped';
COMMENT ON COLUMN public.customer_quotations.cargo_value_currency IS 'Currency for the estimated cargo value';
