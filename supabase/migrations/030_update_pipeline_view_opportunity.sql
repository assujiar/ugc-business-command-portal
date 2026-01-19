-- =====================================================
-- Migration 030: Update Pipeline View with Opportunity Details
--
-- Adds missing columns for Opportunity tab:
-- - competitor_price, customer_budget (from opportunities)
-- - lead_source (from leads)
-- =====================================================

-- Update v_pipeline_with_updates view with additional columns
DROP VIEW IF EXISTS v_pipeline_with_updates CASCADE;

CREATE VIEW v_pipeline_with_updates AS
SELECT
  o.opportunity_id,
  o.name,
  o.account_id,
  o.source_lead_id,
  o.stage,
  o.estimated_value,
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
  l.lead_source AS lead_source,
  -- Get creator info (fallback to lead creator if original_creator_id is NULL)
  COALESCE(creator.name, lead_creator.name) AS original_creator_name,
  COALESCE(creator.role, lead_creator.role)::text AS original_creator_role,
  COALESCE(creator.department, lead_creator.department) AS original_creator_department,
  -- Check if original creator is marketing (with fallback)
  CASE
    WHEN COALESCE(creator.department, lead_creator.department) IS NOT NULL
         AND LOWER(COALESCE(creator.department, lead_creator.department)) LIKE '%marketing%' THEN TRUE
    WHEN COALESCE(creator.role, lead_creator.role) IN ('Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO') THEN TRUE
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
LEFT JOIN profiles lead_creator ON l.created_by = lead_creator.user_id
ORDER BY o.next_step_due_date ASC;

COMMENT ON VIEW v_pipeline_with_updates IS 'Pipeline/opportunities with update counts, creator info, opportunity details for Pipeline and Opportunity tabs';
