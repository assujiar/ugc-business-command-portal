-- =====================================================
-- Migration 012: Update Lead Sources
-- DATE: 2026-01-14
-- DESCRIPTION: Update lead source values to new format
-- =====================================================

-- Note: The source field is TEXT type, so no schema changes needed.
-- This migration documents the new lead source values and provides
-- optional data migration for existing records.

-- New Lead Sources:
-- 1. Webform (SEM)
-- 2. Webform (Organic)
-- 3. Instagram
-- 4. TikTok
-- 5. Facebook
-- 6. Event
-- 7. Referral
-- 8. Outbound
-- 9. Lainnya (with source_detail for custom source)

-- Optional: Migrate existing data to new source values
-- Uncomment and run if you have existing data that needs to be updated

-- UPDATE leads SET source = 'Webform (Organic)' WHERE source = 'Website Form';
-- UPDATE leads SET source = 'Instagram' WHERE source = 'Social Media' AND source_detail ILIKE '%instagram%';
-- UPDATE leads SET source = 'TikTok' WHERE source = 'Social Media' AND source_detail ILIKE '%tiktok%';
-- UPDATE leads SET source = 'Facebook' WHERE source = 'Social Media' AND source_detail ILIKE '%facebook%';
-- UPDATE leads SET source = 'Lainnya', source_detail = 'WhatsApp' WHERE source = 'WhatsApp';
-- UPDATE leads SET source = 'Lainnya', source_detail = 'Email Inquiry' WHERE source = 'Email Inquiry';
-- UPDATE leads SET source = 'Outbound' WHERE source = 'Cold Outbound';
-- UPDATE leads SET source = 'Lainnya', source_detail = 'Partner' WHERE source = 'Partner';
-- UPDATE leads SET source = 'Lainnya', source_detail = 'Import' WHERE source = 'Import';
-- UPDATE leads SET source = 'Lainnya', source_detail = 'Manual Entry' WHERE source = 'Manual';

COMMENT ON COLUMN leads.source IS 'Lead source: Webform (SEM), Webform (Organic), Instagram, TikTok, Facebook, Event, Referral, Outbound, Lainnya';
