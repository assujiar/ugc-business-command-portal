-- =====================================================
-- Migration 139: Add shipments_data to tickets
-- =====================================================
-- Fix: Multi-shipment data was lost during ticket creation.
-- The form sends a full shipments array, but only the first
-- shipment was stored in rfq_data (flat JSON). Additional
-- shipments were silently dropped.
--
-- This adds a shipments_data JSONB column to tickets
-- (parallel to customer_quotations.shipments) to persist
-- the full multi-shipment array.
-- =====================================================

-- Add shipments_data JSONB column to tickets
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS shipments_data JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tickets.shipments_data IS 'Full array of shipment details for multi-shipment RFQ tickets. Stores all shipments including edits made during ticket creation.';

-- Backfill: For existing RFQ tickets that have rfq_data but no shipments_data,
-- wrap the rfq_data in an array so the detail view can display it.
UPDATE public.tickets
SET shipments_data = jsonb_build_array(rfq_data),
    shipment_count = 1
WHERE ticket_type = 'RFQ'
  AND rfq_data IS NOT NULL
  AND (shipments_data IS NULL OR shipments_data = '[]'::jsonb);
