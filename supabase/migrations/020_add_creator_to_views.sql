-- Migration: Add creator info to lead views
-- This fixes the duplicate 016_ migration issue where creator fields were missing

-- Update v_lead_management to include creator info
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

-- Update v_lead_inbox to include creator info
DROP VIEW IF EXISTS v_lead_inbox CASCADE;
CREATE VIEW v_lead_inbox AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name,
  l.contact_email,
  l.industry,
  l.triage_status,
  l.source,
  l.priority,
  l.potential_revenue,
  l.claim_status,
  l.claimed_by_name,
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

-- Update v_lead_bidding to include creator info and contact_phone
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

-- Update v_my_leads to include creator info
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
