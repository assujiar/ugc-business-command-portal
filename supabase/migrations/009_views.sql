-- DROP existing views then recreate with explicit columns
DROP VIEW IF EXISTS v_lead_inbox CASCADE;
DROP VIEW IF EXISTS v_sales_inbox CASCADE;
DROP VIEW IF EXISTS v_my_leads CASCADE;
DROP VIEW IF EXISTS v_nurture_leads CASCADE;
DROP VIEW IF EXISTS v_disqualified_leads CASCADE;
DROP VIEW IF EXISTS v_pipeline_active CASCADE;
DROP VIEW IF EXISTS v_accounts_enriched CASCADE;
DROP VIEW IF EXISTS v_activities_planner CASCADE;
DROP VIEW IF EXISTS v_targets_active CASCADE;

-- Recreate views (same SQL as before)
-- V_LEAD_INBOX
CREATE VIEW v_lead_inbox (
  lead_id, company_name, contact_name, contact_email, contact_phone, job_title, source, source_detail, service_code, service_description, route, origin, destination, volume_estimate, timeline, notes, triage_status, status, handover_eligible, marketing_owner_user_id, sales_owner_user_id, opportunity_id, customer_id, qualified_at, disqualified_at, disqualified_reason, handed_over_at, claimed_at, converted_at, dedupe_key, created_by, created_at, updated_at, marketing_owner_name, marketing_owner_email
) AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name,
  l.contact_email,
  l.contact_phone,
  l.job_title,
  l.source,
  l.source_detail,
  l.service_code,
  l.service_description,
  l.route,
  l.origin,
  l.destination,
  l.volume_estimate,
  l.timeline,
  l.notes,
  l.triage_status,
  l.status,
  l.handover_eligible,
  l.marketing_owner_user_id,
  l.sales_owner_user_id,
  l.opportunity_id,
  l.customer_id,
  l.qualified_at,
  l.disqualified_at,
  l.disqualified_reason,
  l.handed_over_at,
  l.claimed_at,
  l.converted_at,
  l.dedupe_key,
  l.created_by,
  l.created_at,
  l.updated_at,
  p.name,
  p.email
FROM leads l
LEFT JOIN profiles p ON l.marketing_owner_user_id = p.user_id
WHERE l.triage_status IN ('New', 'In Review')
ORDER BY l.created_at DESC;
COMMENT ON VIEW v_lead_inbox IS 'Marketing lead queue - New and In Review leads';

-- V_SALES_INBOX
CREATE VIEW v_sales_inbox (
  lead_id, company_name, contact_name, contact_email, contact_phone, handover_pool_id, handed_over_at, handover_notes, priority, expires_at, handed_over_by_name, marketing_owner_user_id, sales_owner_user_id, handover_eligible, created_at, updated_at
) AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name,
  l.contact_email,
  l.contact_phone,
  hp.pool_id,
  hp.handed_over_at,
  hp.handover_notes,
  hp.priority,
  hp.expires_at,
  hb.name,
  l.marketing_owner_user_id,
  l.sales_owner_user_id,
  l.handover_eligible,
  l.created_at,
  l.updated_at
FROM leads l
INNER JOIN lead_handover_pool hp ON l.lead_id = hp.lead_id
LEFT JOIN profiles hb ON hp.handed_over_by = hb.user_id
WHERE hp.claimed_by IS NULL
  AND l.handover_eligible = true
ORDER BY hp.priority DESC, hp.handed_over_at ASC;
COMMENT ON VIEW v_sales_inbox IS 'Unclaimed leads in sales handover pool';

-- V_MY_LEADS
CREATE VIEW v_my_leads (
  lead_id, company_name, contact_name, contact_email, customer_account_name, linked_opportunity_id, opportunity_stage, sales_owner_user_id, triage_status, claimed_at, created_at, updated_at
) AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name,
  l.contact_email,
  a.company_name,
  o.opportunity_id,
  o.stage,
  l.sales_owner_user_id,
  l.triage_status,
  l.claimed_at,
  l.created_at,
  l.updated_at
FROM leads l
LEFT JOIN accounts a ON l.customer_id = a.account_id
LEFT JOIN opportunities o ON l.opportunity_id = o.opportunity_id
WHERE l.sales_owner_user_id IS NOT NULL
  AND l.triage_status = 'Handed Over'
ORDER BY l.claimed_at DESC;
COMMENT ON VIEW v_my_leads IS 'Leads claimed by salesperson (filter by sales_owner_user_id)';

-- V_NURTURE_LEADS
CREATE VIEW v_nurture_leads (
  lead_id, company_name, contact_name, marketing_owner_name, triage_status, updated_at, created_at
) AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name,
  p.name,
  l.triage_status,
  l.updated_at,
  l.created_at
FROM leads l
LEFT JOIN profiles p ON l.marketing_owner_user_id = p.user_id
WHERE l.triage_status = 'Nurture'
ORDER BY l.updated_at DESC;
COMMENT ON VIEW v_nurture_leads IS 'Leads in nurture status for marketing follow-up';

-- V_DISQUALIFIED_LEADS
CREATE VIEW v_disqualified_leads (
  lead_id, company_name, contact_name, disqualified_by_name, triage_status, disqualified_at
) AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name,
  p.name,
  l.triage_status,
  l.disqualified_at
FROM leads l
LEFT JOIN profiles p ON l.marketing_owner_user_id = p.user_id
WHERE l.triage_status = 'Disqualified'
ORDER BY l.disqualified_at DESC;
COMMENT ON VIEW v_disqualified_leads IS 'Disqualified leads archive';

-- V_PIPELINE_ACTIVE
CREATE VIEW v_pipeline_active (
  opportunity_id, account_id, opportunity_name, description, service_codes, route, origin, destination, estimated_value, currency, probability, stage, next_step, next_step_due_date, owner_user_id, closed_at, outcome, lost_reason, competitor, created_at, updated_at, account_name, account_pic, owner_name, owner_email, is_overdue
) AS
SELECT
  o.opportunity_id,
  o.account_id,
  o.name,
  o.description,
  o.service_codes,
  o.route,
  o.origin,
  o.destination,
  o.estimated_value,
  o.currency,
  o.probability,
  o.stage,
  o.next_step,
  o.next_step_due_date,
  o.owner_user_id,
  o.closed_at,
  o.outcome,
  o.lost_reason,
  o.competitor,
  o.created_at,
  o.updated_at,
  a.company_name,
  a.pic_name,
  p.name,
  p.email,
  CASE WHEN o.next_step_due_date < CURRENT_DATE THEN true ELSE false END
FROM opportunities o
INNER JOIN accounts a ON o.account_id = a.account_id
LEFT JOIN profiles p ON o.owner_user_id = p.user_id
WHERE o.stage NOT IN ('Closed Won', 'Closed Lost')
ORDER BY o.next_step_due_date ASC;
COMMENT ON VIEW v_pipeline_active IS 'Active opportunities not closed';

-- V_ACCOUNTS_ENRICHED
CREATE VIEW v_accounts_enriched (
  account_id, company_name, domain, npwp, industry, address, city, province, country, postal_code, phone, pic_name, pic_email, pic_phone, owner_user_id, tenure_status, activity_status, first_deal_date, last_transaction_date, is_active, tags, notes, dedupe_key, created_by, created_at, updated_at, owner_name, owner_email, open_opportunities, pipeline_value, contact_count, planned_activities, overdue_activities
) AS
SELECT
  a.account_id,
  a.company_name,
  a.domain,
  a.npwp,
  a.industry,
  a.address,
  a.city,
  a.province,
  a.country,
  a.postal_code,
  a.phone,
  a.pic_name,
  a.pic_email,
  a.pic_phone,
  a.owner_user_id,
  a.tenure_status,
  a.activity_status,
  a.first_deal_date,
  a.last_transaction_date,
  a.is_active,
  a.tags,
  a.notes,
  a.dedupe_key,
  a.created_by,
  a.created_at,
  a.updated_at,
  p.name,
  p.email,
  COALESCE(opp_stats.open_opps, 0),
  COALESCE(opp_stats.total_value, 0),
  COALESCE(contact_count.cnt, 0),
  COALESCE(activity_stats.planned_activities, 0),
  COALESCE(activity_stats.overdue_activities, 0)
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

-- V_ACTIVITIES_PLANNER
CREATE VIEW v_activities_planner (
  activity_id, activity_type, subject, description, outcome, status, due_date, due_time, completed_at, related_account_id, related_contact_id, related_opportunity_id, related_lead_id, cadence_enrollment_id, cadence_step_number, owner_user_id, assigned_to, created_by, created_at, updated_at, account_name, opportunity_name, lead_company, owner_name
) AS
SELECT
  act.activity_id,
  act.activity_type,
  act.subject,
  act.description,
  act.outcome,
  act.status,
  act.due_date,
  act.due_time,
  act.completed_at,
  act.related_account_id,
  act.related_contact_id,
  act.related_opportunity_id,
  act.related_lead_id,
  act.cadence_enrollment_id,
  act.cadence_step_number,
  act.owner_user_id,
  act.assigned_to,
  act.created_by,
  act.created_at,
  act.updated_at,
  a.company_name,
  o.name,
  l.company_name,
  p.name
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

-- V_TARGETS_ACTIVE
CREATE VIEW v_targets_active (
  target_id, company_name, contact_name, contact_email, contact_phone, job_title, industry, website, source, source_detail, notes, tags, status, drop_reason, dropped_at, converted_to_lead_id, converted_to_account_id, converted_at, owner_user_id, dedupe_key, created_by, created_at, updated_at, owner_name, owner_email
) AS
SELECT
  t.target_id,
  t.company_name,
  t.contact_name,
  t.contact_email,
  t.contact_phone,
  t.job_title,
  t.industry,
  t.website,
  t.source,
  t.source_detail,
  t.notes,
  t.tags,
  t.status,
  t.drop_reason,
  t.dropped_at,
  t.converted_to_lead_id,
  t.converted_to_account_id,
  t.converted_at,
  t.owner_user_id,
  t.dedupe_key,
  t.created_by,
  t.created_at,
  t.updated_at,
  p.name,
  p.email
FROM prospecting_targets t
LEFT JOIN profiles p ON t.owner_user_id = p.user_id
WHERE t.status NOT IN ('converted', 'dropped')
ORDER BY t.created_at DESC;
