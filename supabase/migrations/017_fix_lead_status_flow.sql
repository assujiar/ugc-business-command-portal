-- =====================================================
-- Migration 017: Fix Lead Status Flow - Part 1
-- Add 'Assign to Sales' to enum
-- =====================================================
-- IMPORTANT: This migration must be run FIRST, then run 018_fix_lead_status_flow_part2.sql
-- PostgreSQL requires enum values to be committed before they can be used

-- Add new value to enum (if not exists)
DO $$
BEGIN
  -- Check if 'Assign to Sales' already exists in enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'Assign to Sales'
    AND enumtypid = 'lead_triage_status'::regtype
  ) THEN
    ALTER TYPE lead_triage_status ADD VALUE 'Assign to Sales';
  END IF;
END $$;

-- =====================================================
-- Note: Run 018_fix_lead_status_flow_part2.sql after this migration completes
-- =====================================================
