-- =====================================================
-- Migration 164: Add TBT column to web vitals
-- TBT (Total Blocking Time) has 30% weight in Lighthouse score
-- Also add tbt_rating for consistency
-- =====================================================

ALTER TABLE marketing_seo_web_vitals ADD COLUMN IF NOT EXISTS tbt_ms NUMERIC(10,2);
ALTER TABLE marketing_seo_web_vitals ADD COLUMN IF NOT EXISTS tbt_rating TEXT;
