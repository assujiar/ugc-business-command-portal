-- =====================================================
-- Migration 026: Add Pipeline Retry Tracking
--
-- Adds retry_count to track pipeline attempts for accounts
-- that have failed and are being re-prospected
-- =====================================================

-- Add retry_count column to accounts table
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Add retry_count column to opportunities table to track which attempt this pipeline is
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;

-- Add comment
COMMENT ON COLUMN accounts.retry_count IS 'Number of times this account has been re-prospected after failure';
COMMENT ON COLUMN opportunities.attempt_number IS 'Which attempt number this pipeline represents (1=first, 2=second, etc.)';

-- Create index for filtering failed accounts
CREATE INDEX IF NOT EXISTS idx_accounts_retry_count ON accounts(retry_count) WHERE retry_count > 0;

-- Update v_accounts_enriched to include retry_count
DROP VIEW IF EXISTS v_accounts_enriched CASCADE;

CREATE VIEW v_accounts_enriched (
  account_id, company_name, domain, npwp, industry, address, city, province, country, postal_code, phone,
  pic_name, pic_email, pic_phone, owner_user_id, tenure_status, activity_status, account_status,
  first_deal_date, last_transaction_date, is_active, tags, notes, dedupe_key, created_by, created_at, updated_at,
  lead_id, retry_count,
  owner_name, owner_email, open_opportunities, pipeline_value, contact_count, planned_activities, overdue_activities,
  revenue_total
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
  a.account_status,
  a.first_deal_date,
  a.last_transaction_date,
  a.is_active,
  a.tags,
  a.notes,
  a.dedupe_key,
  a.created_by,
  a.created_at,
  a.updated_at,
  a.lead_id,
  COALESCE(a.retry_count, 0) AS retry_count,
  p.name AS owner_name,
  p.email AS owner_email,
  COALESCE(opp_stats.open_opps, 0) AS open_opportunities,
  COALESCE(opp_stats.total_value, 0) AS pipeline_value,
  COALESCE(contact_count.cnt, 0) AS contact_count,
  COALESCE(activity_stats.planned_activities, 0) AS planned_activities,
  COALESCE(activity_stats.overdue_activities, 0) AS overdue_activities,
  -- Revenue Total placeholder - will be populated from DSO/AR module later
  0::DECIMAL(15,2) AS revenue_total
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

COMMENT ON VIEW v_accounts_enriched IS 'Accounts with computed badges, stats, status info, and retry tracking';
