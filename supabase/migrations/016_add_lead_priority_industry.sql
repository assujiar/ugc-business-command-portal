-- =====================================================
-- Migration 016: Add Missing Columns to Leads Table
-- Fix for missing columns that are used in the application
-- =====================================================

-- =====================================================
-- ADD ENUM VALUE FOR TRIAGE STATUS
-- =====================================================
-- Add 'Assigned to Sales' to lead_triage_status if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'Assigned to Sales'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'lead_triage_status')
  ) THEN
    ALTER TYPE lead_triage_status ADD VALUE 'Assigned to Sales' AFTER 'Disqualified';
  END IF;
END$$;

-- =====================================================
-- CREATE LEAD CLAIM STATUS ENUM IF NOT EXISTS
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_claim_status') THEN
    CREATE TYPE lead_claim_status AS ENUM ('unclaimed', 'claimed');
  END IF;
END$$;

-- =====================================================
-- ADD PRIORITY COLUMN
-- Default value 2 = Medium priority
-- =====================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 2;

-- Add check constraint for valid priority values (1-4) if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_priority_check'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_priority_check CHECK (priority >= 1 AND priority <= 4);
  END IF;
END$$;

COMMENT ON COLUMN leads.priority IS 'Lead priority level: 1=Low, 2=Medium, 3=High, 4=Critical';

-- =====================================================
-- ADD INDUSTRY COLUMN
-- =====================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS industry TEXT;

COMMENT ON COLUMN leads.industry IS 'Industry type of the lead company';

-- =====================================================
-- ADD POTENTIAL REVENUE COLUMN
-- =====================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS potential_revenue DECIMAL(15,2);

COMMENT ON COLUMN leads.potential_revenue IS 'Estimated revenue potential when handing over to sales';

-- =====================================================
-- ADD CLAIM STATUS COLUMN
-- =====================================================
-- First check if the column exists as text, if so drop it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'claim_status' AND data_type = 'text'
  ) THEN
    ALTER TABLE leads DROP COLUMN claim_status;
  END IF;
END$$;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS claim_status lead_claim_status DEFAULT 'unclaimed';

COMMENT ON COLUMN leads.claim_status IS 'Whether the lead has been claimed by sales';

-- =====================================================
-- ADD CLAIMED BY NAME COLUMN
-- =====================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS claimed_by_name TEXT;

COMMENT ON COLUMN leads.claimed_by_name IS 'Name of the salesperson who claimed the lead';

-- =====================================================
-- ADD ACCOUNT ID COLUMN
-- =====================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS account_id TEXT;

-- Add foreign key constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_account_id_fkey'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES accounts(account_id);
  END IF;
END$$;

COMMENT ON COLUMN leads.account_id IS 'Reference to the account created from this lead';

-- =====================================================
-- CREATE INDEXES FOR NEW COLUMNS
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_claim_status ON leads(claim_status);
CREATE INDEX IF NOT EXISTS idx_leads_account_id ON leads(account_id);

-- =====================================================
-- UPDATE EXISTING VIEWS TO INCLUDE NEW COLUMNS
-- =====================================================

-- Update v_lead_inbox to include priority and industry
DROP VIEW IF EXISTS v_lead_inbox CASCADE;
CREATE VIEW v_lead_inbox AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name AS pic_name,
  l.contact_email AS pic_email,
  l.contact_phone AS pic_phone,
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
  pm.name AS marketing_owner_name,
  pm.email AS marketing_owner_email,
  ps.name AS sales_owner_name
FROM leads l
LEFT JOIN profiles pm ON l.marketing_owner_user_id = pm.user_id
LEFT JOIN profiles ps ON l.sales_owner_user_id = ps.user_id;

-- Update v_lead_management to include industry (without account_status)
DROP VIEW IF EXISTS v_lead_management CASCADE;
CREATE VIEW v_lead_management AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name AS pic_name,
  l.contact_email AS pic_email,
  l.contact_phone AS pic_phone,
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
  a.company_name AS account_company_name
FROM leads l
LEFT JOIN profiles pm ON l.marketing_owner_user_id = pm.user_id
LEFT JOIN profiles ps ON l.sales_owner_user_id = ps.user_id
LEFT JOIN accounts a ON l.account_id = a.account_id;

-- Update v_lead_bidding to include industry
DROP VIEW IF EXISTS v_lead_bidding CASCADE;
CREATE VIEW v_lead_bidding AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name AS pic_name,
  l.contact_email AS pic_email,
  l.industry,
  l.triage_status,
  l.source,
  l.priority,
  l.potential_revenue,
  l.claim_status,
  l.claimed_by_name,
  l.created_at,
  l.qualified_at,
  hp.pool_id,
  hp.handed_over_at,
  hp.handover_notes,
  hp.expires_at,
  pm.name AS handed_over_by_name
FROM leads l
LEFT JOIN lead_handover_pool hp ON l.lead_id = hp.lead_id
LEFT JOIN profiles pm ON hp.handed_over_by = pm.user_id
WHERE l.triage_status = 'Assigned to Sales'
  AND (l.claim_status = 'unclaimed' OR l.claim_status IS NULL);

-- Update v_my_leads to include industry (without account_status)
DROP VIEW IF EXISTS v_my_leads CASCADE;
CREATE VIEW v_my_leads AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name AS pic_name,
  l.contact_email AS pic_email,
  l.industry,
  l.triage_status,
  l.source,
  l.priority,
  l.potential_revenue,
  l.claim_status,
  l.claimed_by_name,
  l.sales_owner_user_id,
  l.claimed_at,
  l.created_at,
  l.account_id,
  l.opportunity_id,
  a.company_name AS account_name,
  o.stage AS opportunity_stage,
  o.estimated_value,
  o.name AS opportunity_name
FROM leads l
LEFT JOIN accounts a ON l.account_id = a.account_id
LEFT JOIN opportunities o ON l.opportunity_id = o.opportunity_id
WHERE l.sales_owner_user_id IS NOT NULL
  OR l.claim_status = 'claimed';
