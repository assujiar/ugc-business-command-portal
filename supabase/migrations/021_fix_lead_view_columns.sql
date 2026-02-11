-- =====================================================
-- Migration 021: Fix Lead View Columns
-- Fixes column naming inconsistency in v_lead_management and related views
--
-- Issue: Migration 016_macx ran after 016_add_lead_priority_industry and
-- created views with:
-- - pic_name, pic_email, pic_phone aliases instead of contact_name, etc.
-- - Missing industry column
--
-- This migration ensures all views use consistent column names matching
-- the frontend component expectations.
-- =====================================================

-- =====================================================
-- FIX v_lead_management VIEW
-- =====================================================
DROP VIEW IF EXISTS v_lead_management CASCADE;
CREATE VIEW v_lead_management AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name,
  l.contact_email,
  l.contact_phone,
  l.industry,
  l.triage_status,
  l.source,
  l.source_detail,
  l.priority,
  l.potential_revenue,
  l.claim_status,
  l.claimed_by_name,
  l.notes,
  l.created_at,
  l.updated_at,
  l.marketing_owner_user_id,
  l.sales_owner_user_id,
  l.created_by,
  l.disqualified_at,
  l.disqualified_reason,
  l.qualified_at,
  l.claimed_at,
  l.account_id,
  l.opportunity_id,
  pm.name AS marketing_owner_name,
  pm.email AS marketing_owner_email,
  pm.department AS marketing_department,
  ps.name AS sales_owner_name,
  -- Creator info
  pc.name AS creator_name,
  pc.department AS creator_department,
  pc.role AS creator_role,
  CASE
    WHEN pc.department IS NOT NULL AND LOWER(pc.department) LIKE '%marketing%' THEN TRUE
    WHEN pc.role IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO') THEN TRUE
    ELSE FALSE
  END AS creator_is_marketing,
  a.company_name AS account_company_name
FROM leads l
LEFT JOIN profiles pm ON l.marketing_owner_user_id = pm.user_id
LEFT JOIN profiles ps ON l.sales_owner_user_id = ps.user_id
LEFT JOIN profiles pc ON l.created_by = pc.user_id
LEFT JOIN accounts a ON l.account_id = a.account_id;

-- =====================================================
-- FIX v_lead_inbox VIEW
-- =====================================================
DROP VIEW IF EXISTS v_lead_inbox CASCADE;
CREATE VIEW v_lead_inbox AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name,
  l.contact_email,
  l.contact_phone,
  l.industry,
  l.triage_status,
  l.source,
  l.source_detail,
  l.priority,
  l.potential_revenue,
  l.claim_status,
  l.claimed_by_name,
  l.notes,
  l.created_at,
  l.created_by,
  l.marketing_owner_user_id,
  l.sales_owner_user_id,
  l.disqualified_at,
  l.disqualified_reason,
  pm.name AS marketing_owner_name,
  pm.email AS marketing_owner_email,
  ps.name AS sales_owner_name,
  -- Creator info
  pc.name AS creator_name,
  pc.department AS creator_department,
  pc.role AS creator_role,
  CASE
    WHEN pc.department IS NOT NULL AND LOWER(pc.department) LIKE '%marketing%' THEN TRUE
    WHEN pc.role IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO') THEN TRUE
    ELSE FALSE
  END AS creator_is_marketing
FROM leads l
LEFT JOIN profiles pm ON l.marketing_owner_user_id = pm.user_id
LEFT JOIN profiles ps ON l.sales_owner_user_id = ps.user_id
LEFT JOIN profiles pc ON l.created_by = pc.user_id;

-- =====================================================
-- FIX v_lead_bidding VIEW
-- =====================================================
DROP VIEW IF EXISTS v_lead_bidding CASCADE;
CREATE VIEW v_lead_bidding AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name,
  l.contact_email,
  l.contact_phone,
  l.industry,
  l.triage_status,
  l.source,
  l.priority,
  l.potential_revenue,
  l.claim_status,
  l.claimed_by_name,
  l.created_at,
  l.qualified_at,
  l.created_by,
  hp.pool_id,
  hp.handed_over_at,
  hp.handover_notes,
  pm.name AS handed_over_by_name,
  -- Creator info
  pc.name AS creator_name,
  pc.department AS creator_department
FROM leads l
LEFT JOIN lead_handover_pool hp ON l.lead_id = hp.lead_id
LEFT JOIN profiles pm ON hp.handed_over_by = pm.user_id
LEFT JOIN profiles pc ON l.created_by = pc.user_id
WHERE l.triage_status = 'Assign to Sales'
  AND (l.claim_status = 'unclaimed' OR l.claim_status IS NULL);

-- =====================================================
-- FIX v_my_leads VIEW
-- =====================================================
DROP VIEW IF EXISTS v_my_leads CASCADE;
CREATE VIEW v_my_leads AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name,
  l.contact_email,
  l.contact_phone,
  l.industry,
  l.triage_status,
  l.source,
  l.priority,
  l.potential_revenue,
  l.claim_status,
  l.claimed_by_name,
  l.notes,
  l.created_at,
  l.updated_at,
  l.sales_owner_user_id,
  l.qualified_at,
  l.claimed_at,
  l.account_id,
  l.opportunity_id,
  l.created_by,
  a.company_name AS account_company_name,
  -- Creator info
  pc.name AS creator_name,
  pc.department AS creator_department
FROM leads l
LEFT JOIN accounts a ON l.account_id = a.account_id
LEFT JOIN profiles pc ON l.created_by = pc.user_id
WHERE l.triage_status = 'Assign to Sales'
  AND l.claim_status = 'claimed';

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON VIEW v_lead_management IS 'Lead management view with proper column names (contact_name, contact_email, contact_phone, industry)';
COMMENT ON VIEW v_lead_inbox IS 'Lead inbox view for marketing with proper column names';
COMMENT ON VIEW v_lead_bidding IS 'Lead bidding view for sales with proper column names';
COMMENT ON VIEW v_my_leads IS 'My leads view for sales users with proper column names';
