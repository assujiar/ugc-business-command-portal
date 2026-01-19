-- =====================================================
-- Migration 028: Fix Marketing Pipeline Visibility
--
-- Problem: original_creator_id is NULL for existing opportunities
-- because it was just added. This causes marketing users to not see
-- any pipelines.
--
-- Solution:
-- 1. Backfill original_creator_id from leads for existing opportunities
-- 2. Update the view to use lead.created_by as fallback when original_creator_id is NULL
-- =====================================================

-- 1. Backfill original_creator_id for opportunities that don't have it set
-- Use the lead's created_by as the original creator
UPDATE opportunities o
SET original_creator_id = l.created_by
FROM leads l
WHERE o.source_lead_id = l.lead_id
  AND o.original_creator_id IS NULL
  AND l.created_by IS NOT NULL;

-- 2. Backfill original_creator_id for accounts that don't have it set
UPDATE accounts a
SET original_creator_id = l.created_by,
    original_lead_id = COALESCE(a.original_lead_id, a.lead_id)
FROM leads l
WHERE a.lead_id = l.lead_id
  AND a.original_creator_id IS NULL
  AND l.created_by IS NOT NULL;

-- 3. Update v_pipeline_with_updates view with fallback logic
-- If original_creator_id is NULL, use lead.created_by
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

COMMENT ON VIEW v_pipeline_with_updates IS 'Pipeline/opportunities with update counts, creator info for marketing visibility (with fallback to lead creator)';

-- 4. Also update RLS policies to use COALESCE for fallback
-- Drop and recreate opportunity select policy
DROP POLICY IF EXISTS opp_select ON opportunities;

CREATE POLICY opp_select ON opportunities FOR SELECT
  USING (
    -- Admin can see all
    is_admin()
    -- Sales can see their owned opportunities
    OR (is_sales() AND owner_user_id = auth.uid())
    -- Sales can see opportunities they created
    OR (is_sales() AND created_by = auth.uid())
    -- Marketing Manager/MACX: See all opportunities from marketing department leads
    -- Use COALESCE to check original_creator_id OR lead's created_by
    OR (is_marketing_manager_or_macx() AND (
      is_original_creator_marketing(original_creator_id)
      OR is_original_creator_marketing((SELECT created_by FROM leads WHERE lead_id = source_lead_id))
    ))
    -- Marketing staff (Marcomm/DGO/VSDO): See opportunities from leads THEY created
    OR (is_marketing_staff() AND (
      original_creator_id = auth.uid()
      OR (original_creator_id IS NULL AND EXISTS (
        SELECT 1 FROM leads WHERE lead_id = source_lead_id AND created_by = auth.uid()
      ))
    ))
    -- Fallback: Allow if original_creator_id is null (legacy data) and user is marketing owner of the lead
    OR (is_marketing() AND EXISTS (
      SELECT 1 FROM leads WHERE lead_id = source_lead_id AND marketing_owner_user_id = auth.uid()
    ))
  );

-- 5. Update accounts select policy similarly
DROP POLICY IF EXISTS accounts_select ON accounts;

CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (
    -- Admin can see all
    is_admin()
    -- Sales can see accounts they own
    OR (is_sales() AND owner_user_id = auth.uid())
    -- Sales can see all accounts (for prospecting)
    OR is_sales()
    -- Marketing Manager/MACX: See accounts from marketing department leads
    OR (is_marketing_manager_or_macx() AND (
      is_original_creator_marketing(original_creator_id)
      OR is_original_creator_marketing((SELECT created_by FROM leads WHERE lead_id = accounts.lead_id))
    ))
    -- Marketing staff: See accounts from leads THEY created
    OR (is_marketing_staff() AND (
      original_creator_id = auth.uid()
      OR (original_creator_id IS NULL AND EXISTS (
        SELECT 1 FROM leads WHERE lead_id = accounts.lead_id AND created_by = auth.uid()
      ))
    ))
    -- Fallback: Allow if original_creator_id is null (legacy data) and user is marketing owner
    OR (is_marketing() AND EXISTS (
      SELECT 1 FROM leads WHERE lead_id = accounts.lead_id AND marketing_owner_user_id = auth.uid()
    ))
  );
