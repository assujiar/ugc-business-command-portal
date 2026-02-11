-- ============================================
-- Migration: 066_fix_view_column_references.sql
--
-- Fixes column reference errors in views:
-- 1. a.status -> a.account_status in v_pipeline_with_updates
-- 2. l.lead_source -> l.source in vw_pipeline_detail
-- ============================================

-- ============================================
-- 1. Fix v_pipeline_with_updates view
-- ============================================

DROP VIEW IF EXISTS v_pipeline_with_updates CASCADE;

CREATE VIEW v_pipeline_with_updates AS
SELECT
  o.opportunity_id,
  o.name,
  o.account_id,
  o.source_lead_id,
  o.stage,
  o.estimated_value,
  o.deal_value,
  o.currency,
  o.probability,
  o.next_step,
  o.next_step_due_date,
  o.owner_user_id,
  o.created_by,
  o.created_at,
  o.updated_at,
  o.closed_at,
  o.outcome,
  o.lost_reason,
  o.competitor,
  o.attempt_number,
  -- Additional columns for Opportunity tab
  o.competitor_price,
  o.customer_budget,
  -- Use original_creator_id if set, otherwise fall back to lead.created_by
  COALESCE(o.original_creator_id, l.created_by) AS original_creator_id,
  a.company_name AS account_name,
  a.pic_name AS account_pic_name,
  a.pic_email AS account_pic_email,
  a.pic_phone AS account_pic_phone,
  a.account_status,
  a.original_lead_id AS account_original_lead_id,
  a.original_creator_id AS account_original_creator_id,
  p.name AS owner_name,
  p.email AS owner_email,
  l.company_name AS lead_company_name,
  l.created_by AS lead_created_by,
  l.marketing_owner_user_id AS lead_marketing_owner,
  -- Lead source - using 'source' column from leads table
  l.source AS lead_source,
  -- Get creator info (fallback to lead creator if original_creator_id is NULL)
  COALESCE(creator.name, lead_creator.name) AS original_creator_name,
  -- Cast role enum to text to avoid type mismatch
  COALESCE(creator.role::text, lead_creator.role::text) AS original_creator_role,
  COALESCE(creator.department, lead_creator.department) AS original_creator_department,
  -- Check if original creator is marketing (with fallback)
  CASE
    WHEN COALESCE(creator.department, lead_creator.department) IS NOT NULL
         AND LOWER(COALESCE(creator.department, lead_creator.department)) LIKE '%marketing%' THEN TRUE
    WHEN COALESCE(creator.role::text, lead_creator.role::text) IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO') THEN TRUE
    ELSE FALSE
  END AS original_creator_is_marketing,
  (SELECT COUNT(*) FROM pipeline_updates pu WHERE pu.opportunity_id = o.opportunity_id) AS update_count,
  (SELECT MAX(pu.created_at) FROM pipeline_updates pu WHERE pu.opportunity_id = o.opportunity_id) AS last_update_at,
  -- is_overdue calculation
  CASE
    WHEN o.next_step_due_date < NOW() AND o.stage NOT IN ('Closed Won', 'Closed Lost') THEN TRUE
    ELSE FALSE
  END AS is_overdue
FROM opportunities o
LEFT JOIN accounts a ON o.account_id = a.account_id
LEFT JOIN profiles p ON o.owner_user_id = p.user_id
LEFT JOIN leads l ON o.source_lead_id = l.lead_id
LEFT JOIN profiles creator ON o.original_creator_id = creator.user_id
LEFT JOIN profiles lead_creator ON l.created_by = lead_creator.user_id;

-- Grant access
GRANT SELECT ON v_pipeline_with_updates TO authenticated;

COMMENT ON VIEW v_pipeline_with_updates IS 'Pipeline/opportunities with update counts, creator info, deal_value for Pipeline and Opportunity tabs';

-- ============================================
-- 2. Fix vw_pipeline_detail view
-- ============================================

DROP VIEW IF EXISTS public.vw_pipeline_detail;

CREATE OR REPLACE VIEW public.vw_pipeline_detail AS
SELECT
    o.opportunity_id,
    o.name,
    o.stage,
    o.estimated_value,
    o.deal_value,
    o.currency,
    o.probability,
    o.next_step_due_date as expected_close_date,
    o.next_step,
    o.next_step_due_date,
    o.outcome as close_reason,
    o.lost_reason,
    o.competitor_price,
    o.customer_budget,
    o.closed_at,
    o.description as notes,
    o.created_at,
    o.updated_at,
    o.quotation_status,
    o.latest_quotation_id,
    -- Company info
    a.account_id,
    a.company_name,
    a.industry,
    a.address,
    a.city,
    a.account_status,
    -- PIC info
    a.pic_name,
    a.pic_email,
    a.pic_phone,
    -- Lead info
    o.source_lead_id as lead_id,
    l.potential_revenue,
    l.source AS lead_source,
    creator.name as lead_creator_name,
    creator.department as lead_creator_department,
    -- Owner info
    o.owner_user_id,
    owner.name as owner_name,
    owner.email as owner_email,
    owner.department as owner_department
FROM public.opportunities o
LEFT JOIN public.accounts a ON o.account_id = a.account_id
LEFT JOIN public.leads l ON o.source_lead_id = l.lead_id
LEFT JOIN public.profiles creator ON l.created_by = creator.user_id
LEFT JOIN public.profiles owner ON o.owner_user_id = owner.user_id;

-- Grant access
GRANT SELECT ON public.vw_pipeline_detail TO authenticated;
