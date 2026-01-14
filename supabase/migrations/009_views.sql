-- =====================================================
-- Migration 009: Database Views
-- SOURCE: PDF Section 5, Pages 16-20
-- =====================================================

-- =====================================================
-- V_LEAD_INBOX - Marketing Lead Queue
-- SOURCE: PDF Page 16
-- "triage_status IN ('New','In Review')"
-- =====================================================
CREATE OR REPLACE VIEW v_lead_inbox AS
SELECT
  l.*,
  p.name AS marketing_owner_name,
  p.email AS marketing_owner_email
FROM leads l
LEFT JOIN profiles p ON l.marketing_owner_user_id = p.user_id
WHERE l.triage_status IN ('New', 'In Review')
ORDER BY l.created_at DESC;

COMMENT ON VIEW v_lead_inbox IS 'Marketing lead queue - New and In Review leads';

-- =====================================================
-- V_SALES_INBOX - Sales Handover Pool
-- SOURCE: PDF Page 16
-- "leads handed over but not yet claimed"
-- =====================================================
CREATE OR REPLACE VIEW v_sales_inbox AS
SELECT
  l.*,
  hp.pool_id,
  hp.handed_over_at,
  hp.handover_notes,
  hp.priority,
  hp.expires_at,
  hb.name AS handed_over_by_name
FROM leads l
INNER JOIN lead_handover_pool hp ON l.lead_id = hp.lead_id
LEFT JOIN profiles hb ON hp.handed_over_by = hb.user_id
WHERE hp.claimed_by IS NULL
  AND l.handover_eligible = true
ORDER BY hp.priority DESC, hp.handed_over_at ASC;

COMMENT ON VIEW v_sales_inbox IS 'Unclaimed leads in sales handover pool';

-- =====================================================
-- V_MY_LEADS - Claimed Leads by User
-- SOURCE: PDF Page 17
-- =====================================================
CREATE OR REPLACE VIEW v_my_leads AS
SELECT
  l.*,
  a.company_name AS account_name,
  o.opportunity_id AS linked_opportunity_id,
  o.stage AS opportunity_stage
FROM leads l
LEFT JOIN accounts a ON l.customer_id = a.account_id
LEFT JOIN opportunities o ON l.opportunity_id = o.opportunity_id
WHERE l.sales_owner_user_id IS NOT NULL
  AND l.triage_status = 'Handed Over'
ORDER BY l.claimed_at DESC;

COMMENT ON VIEW v_my_leads IS 'Leads claimed by salesperson (filter by sales_owner_user_id)';

-- =====================================================
-- V_NURTURE_LEADS - Nurture Status Leads
-- SOURCE: PDF Page 17
-- =====================================================
CREATE OR REPLACE VIEW v_nurture_leads AS
SELECT
  l.*,
  p.name AS marketing_owner_name
FROM leads l
LEFT JOIN profiles p ON l.marketing_owner_user_id = p.user_id
WHERE l.triage_status = 'Nurture'
ORDER BY l.updated_at DESC;

COMMENT ON VIEW v_nurture_leads IS 'Leads in nurture status for marketing follow-up';

-- =====================================================
-- V_DISQUALIFIED_LEADS - Disqualified Archive
-- SOURCE: PDF Page 17
-- =====================================================
CREATE OR REPLACE VIEW v_disqualified_leads AS
SELECT
  l.*,
  p.name AS disqualified_by_name
FROM leads l
LEFT JOIN profiles p ON l.marketing_owner_user_id = p.user_id
WHERE l.triage_status = 'Disqualified'
ORDER BY l.disqualified_at DESC;

COMMENT ON VIEW v_disqualified_leads IS 'Disqualified leads archive';

-- =====================================================
-- V_PIPELINE_ACTIVE - Active Opportunities
-- SOURCE: PDF Page 17
-- =====================================================
CREATE OR REPLACE VIEW v_pipeline_active AS
SELECT
  o.*,
  a.company_name AS account_name,
  a.pic_name AS account_pic,
  p.name AS owner_name,
  p.email AS owner_email,
  CASE
    WHEN o.next_step_due_date < CURRENT_DATE THEN true
    ELSE false
  END AS is_overdue
FROM opportunities o
INNER JOIN accounts a ON o.account_id = a.account_id
LEFT JOIN profiles p ON o.owner_user_id = p.user_id
WHERE o.stage NOT IN ('Closed Won', 'Closed Lost')
ORDER BY o.next_step_due_date ASC;

COMMENT ON VIEW v_pipeline_active IS 'Active opportunities not closed';

-- =====================================================
-- V_ACCOUNTS_ENRICHED - Accounts with Computed Status
-- SOURCE: PDF Page 18
-- =====================================================
CREATE OR REPLACE VIEW v_accounts_enriched AS
SELECT
  a.*,
  p.name AS owner_name,
  p.email AS owner_email,
  COALESCE(opp_stats.open_opps, 0) AS open_opportunities,
  COALESCE(opp_stats.total_value, 0) AS pipeline_value,
  COALESCE(contact_count.cnt, 0) AS contact_count,
  COALESCE(activity_stats.planned_activities, 0) AS planned_activities,
  COALESCE(activity_stats.overdue_activities, 0) AS overdue_activities
FROM accounts a
LEFT JOIN profiles p ON a.owner_user_id = p.user_id
LEFT JOIN (
  SELECT
    account_id,
    COUNT(*) AS open_opps,
    SUM(estimated_value) AS total_value
  FROM opportunities
  WHERE stage NOT IN ('Closed Won', 'Closed Lost')
  GROUP BY account_id
) opp_stats ON a.account_id = opp_stats.account_id
LEFT JOIN (
  SELECT account_id, COUNT(*) AS cnt
  FROM contacts
  GROUP BY account_id
) contact_count ON a.account_id = contact_count.account_id
LEFT JOIN (
  SELECT
    related_account_id,
    COUNT(*) FILTER (WHERE status = 'Planned') AS planned_activities,
    COUNT(*) FILTER (WHERE status = 'Planned' AND due_date < CURRENT_DATE) AS overdue_activities
  FROM activities
  WHERE related_account_id IS NOT NULL
  GROUP BY related_account_id
) activity_stats ON a.account_id = activity_stats.related_account_id
ORDER BY a.company_name;

COMMENT ON VIEW v_accounts_enriched IS 'Accounts with computed badges and stats';

-- =====================================================
-- V_ACTIVITIES_PLANNER - Activities by Owner
-- =====================================================
CREATE OR REPLACE VIEW v_activities_planner AS
SELECT
  act.*,
  a.company_name AS account_name,
  o.name AS opportunity_name,
  l.company_name AS lead_company,
  p.name AS owner_name
FROM activities act
LEFT JOIN accounts a ON act.related_account_id = a.account_id
LEFT JOIN opportunities o ON act.related_opportunity_id = o.opportunity_id
LEFT JOIN leads l ON act.related_lead_id = l.lead_id
LEFT JOIN profiles p ON act.owner_user_id = p.user_id
WHERE act.status IN ('Planned', 'Done')
ORDER BY
  CASE act.status WHEN 'Planned' THEN 0 ELSE 1 END,
  act.due_date ASC;

COMMENT ON VIEW v_activities_planner IS 'Activities with related entity names';

-- =====================================================
-- V_TARGETS_ACTIVE - Active Prospecting Targets
-- =====================================================
CREATE OR REPLACE VIEW v_targets_active AS
SELECT
  t.*,
  p.name AS owner_name,
  p.email AS owner_email
FROM prospecting_targets t
LEFT JOIN profiles p ON t.owner_user_id = p.user_id
WHERE t.status NOT IN ('converted', 'dropped')
ORDER BY t.created_at DESC;

COMMENT ON VIEW v_targets_active IS 'Active prospecting targets (not converted/dropped)';
