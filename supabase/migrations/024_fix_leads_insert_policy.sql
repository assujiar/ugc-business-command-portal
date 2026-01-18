-- =====================================================
-- Migration 024: Fix Leads INSERT RLS Policy
--
-- Problem: Sales users cannot create leads because the
-- INSERT policy only allows admin and marketing roles.
--
-- Error: "new row violates row-level security policy for table leads"
--
-- Fix: Add is_sales() to the INSERT policy so sales can
-- create their own leads.
-- =====================================================

-- Drop existing INSERT policy
DROP POLICY IF EXISTS leads_insert ON leads;

-- Recreate INSERT policy to include sales
CREATE POLICY leads_insert ON leads FOR INSERT
  WITH CHECK (
    is_admin()
    OR is_marketing()
    OR is_sales()
  );

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON POLICY leads_insert ON leads IS 'Admin, Marketing, and Sales can create leads';
