-- =====================================================
-- Migration 014: Lead Management Enhancement
-- Consolidate lead management, add pipeline updates, account statuses
-- =====================================================

-- =====================================================
-- NEW ENUMS (with idempotent checks)
-- =====================================================

-- Add 'Assigned to Sales' to lead_triage_status
DO $$
BEGIN
    ALTER TYPE lead_triage_status ADD VALUE IF NOT EXISTS 'Assigned to Sales' AFTER 'Disqualified';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END$$;

-- Lead Claim Status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_claim_status') THEN
        CREATE TYPE lead_claim_status AS ENUM (
            'unclaimed',
            'claimed'
        );
    END IF;
END$$;

-- Account Status for tracking lifecycle
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
        CREATE TYPE account_status AS ENUM (
            'calon_account',
            'new_account',
            'failed_account',
            'active_account',
            'passive_account',
            'lost_account'
        );
    END IF;
END$$;

-- Lost Reason for pipeline
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lost_reason') THEN
        CREATE TYPE lost_reason AS ENUM (
            'harga_tidak_masuk',
            'kompetitor_lebih_murah',
            'budget_tidak_cukup',
            'timing_tidak_tepat',
            'tidak_ada_kebutuhan',
            'kompetitor_lebih_baik',
            'service_tidak_sesuai',
            'lokasi_tidak_terjangkau',
            'lainnya'
        );
    END IF;
END$$;

-- Approach Method for pipeline updates
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approach_method') THEN
        CREATE TYPE approach_method AS ENUM (
            'Call',
            'Email',
            'Meeting',
            'Site Visit',
            'WhatsApp',
            'Proposal',
            'Contract Review'
        );
    END IF;
END$$;

-- Add 'Completed' to activity_status if not exists
DO $$
BEGIN
    ALTER TYPE activity_status ADD VALUE IF NOT EXISTS 'Completed' AFTER 'Done';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END$$;

-- =====================================================
-- ALTER LEADS TABLE
-- =====================================================
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS potential_revenue DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS claim_status lead_claim_status DEFAULT 'unclaimed',
  ADD COLUMN IF NOT EXISTS claimed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(account_id);

-- Index for claim status
CREATE INDEX IF NOT EXISTS idx_leads_claim_status ON leads(claim_status);

-- =====================================================
-- ALTER ACCOUNTS TABLE
-- =====================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS account_status account_status DEFAULT 'calon_account',
  ADD COLUMN IF NOT EXISTS first_transaction_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_transaction_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_id TEXT REFERENCES leads(lead_id);

-- Index for account status
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(account_status);
CREATE INDEX IF NOT EXISTS idx_accounts_first_transaction ON accounts(first_transaction_date);
CREATE INDEX IF NOT EXISTS idx_accounts_last_transaction ON accounts(last_transaction_date);

-- =====================================================
-- ALTER OPPORTUNITIES TABLE
-- =====================================================
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS lost_reason lost_reason,
  ADD COLUMN IF NOT EXISTS competitor_price DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS customer_budget DECIMAL(15,2);

-- Index for lost opportunities
CREATE INDEX IF NOT EXISTS idx_opportunities_lost_reason ON opportunities(lost_reason) WHERE stage = 'Closed Lost';

-- =====================================================
-- CREATE PIPELINE_UPDATES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS pipeline_updates (
  update_id TEXT PRIMARY KEY DEFAULT 'PU' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8)),
  opportunity_id TEXT NOT NULL REFERENCES opportunities(opportunity_id) ON DELETE CASCADE,

  -- Update Details
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  approach_method approach_method NOT NULL,

  -- Evidence
  evidence_url TEXT,
  evidence_file_name TEXT,

  -- Location Tagging
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  location_address TEXT,

  -- Stage Tracking
  old_stage opportunity_stage,
  new_stage opportunity_stage NOT NULL,

  -- Audit
  updated_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for pipeline_updates
CREATE INDEX IF NOT EXISTS idx_pipeline_updates_opportunity ON pipeline_updates(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_updates_date ON pipeline_updates(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_updates_method ON pipeline_updates(approach_method);

-- Function to generate pipeline update ID
CREATE OR REPLACE FUNCTION generate_pipeline_update_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.update_id IS NULL THEN
    NEW.update_id := 'PU' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pipeline_update_id ON pipeline_updates;
CREATE TRIGGER trg_pipeline_update_id
  BEFORE INSERT ON pipeline_updates
  FOR EACH ROW
  EXECUTE FUNCTION generate_pipeline_update_id();

-- =====================================================
-- UPDATED VIEWS
-- =====================================================

-- Drop and recreate v_lead_inbox to include all marketing statuses
DROP VIEW IF EXISTS v_lead_inbox;
CREATE VIEW v_lead_inbox AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name AS pic_name,
  l.contact_email AS pic_email,
  l.triage_status,
  l.source,
  l.priority,
  l.potential_revenue,
  l.claim_status,
  l.claimed_by_name,
  l.created_at,
  l.marketing_owner_user_id,
  l.sales_owner_user_id,
  l.disqualified_at,
  l.disqualified_reason,
  pm.name AS marketing_owner_name,
  pm.email AS marketing_owner_email,
  ps.name AS sales_owner_name
FROM leads l
LEFT JOIN profiles pm ON l.marketing_owner_user_id = pm.user_id
LEFT JOIN profiles ps ON l.sales_owner_user_id = ps.user_id;

-- Create view for lead management consolidated page
CREATE OR REPLACE VIEW v_lead_management AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name AS pic_name,
  l.contact_email AS pic_email,
  l.contact_phone AS pic_phone,
  l.triage_status,
  l.source,
  l.priority,
  l.potential_revenue,
  l.claim_status,
  l.claimed_by_name,
  l.inquiry_text,
  l.notes,
  l.created_at,
  l.updated_at,
  l.marketing_owner_user_id,
  l.sales_owner_user_id,
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
  a.company_name AS account_company_name,
  a.account_status
FROM leads l
LEFT JOIN profiles pm ON l.marketing_owner_user_id = pm.user_id
LEFT JOIN profiles ps ON l.sales_owner_user_id = ps.user_id
LEFT JOIN accounts a ON l.account_id = a.account_id;

-- Create view for pipeline with updates
CREATE OR REPLACE VIEW v_pipeline_with_updates AS
SELECT
  o.opportunity_id,
  o.name,
  o.stage,
  o.estimated_value,
  o.currency,
  o.probability,
  o.expected_close_date,
  o.next_step,
  o.next_step_due_date,
  o.close_reason,
  o.lost_reason,
  o.competitor_price,
  o.customer_budget,
  o.closed_at,
  o.notes,
  o.owner_user_id,
  o.account_id,
  o.lead_id,
  o.created_at,
  o.updated_at,
  a.company_name AS account_name,
  a.account_status,
  p.name AS owner_name,
  l.company_name AS lead_company_name,
  (SELECT COUNT(*) FROM pipeline_updates pu WHERE pu.opportunity_id = o.opportunity_id) AS update_count,
  (SELECT MAX(updated_at) FROM pipeline_updates pu WHERE pu.opportunity_id = o.opportunity_id) AS last_update_at,
  CASE
    WHEN o.next_step_due_date < NOW() AND o.stage NOT IN ('Closed Won', 'Closed Lost')
    THEN true
    ELSE false
  END AS is_overdue
FROM opportunities o
LEFT JOIN accounts a ON o.account_id = a.account_id
LEFT JOIN profiles p ON o.owner_user_id = p.user_id
LEFT JOIN leads l ON o.lead_id = l.lead_id;

-- Create view for sales inbox (Lead Bidding) - unclaimed leads from Assigned to Sales
CREATE OR REPLACE VIEW v_lead_bidding AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name AS pic_name,
  l.contact_email AS pic_email,
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

-- Update v_my_leads to include leads created by sales and claimed leads
DROP VIEW IF EXISTS v_my_leads;
CREATE VIEW v_my_leads AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name AS pic_name,
  l.contact_email AS pic_email,
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
  a.account_status,
  o.stage AS opportunity_stage,
  o.estimated_value,
  o.name AS opportunity_name
FROM leads l
LEFT JOIN accounts a ON l.account_id = a.account_id
LEFT JOIN opportunities o ON l.opportunity_id = o.opportunity_id
WHERE l.sales_owner_user_id IS NOT NULL
  OR l.claim_status = 'claimed';

-- View for accounts with status tracking
CREATE OR REPLACE VIEW v_accounts_with_status AS
SELECT
  a.account_id,
  a.company_name,
  a.pic_name,
  a.pic_email,
  a.pic_phone,
  a.industry,
  a.address,
  a.city,
  a.province,
  a.country,
  a.account_status,
  a.first_transaction_date,
  a.last_transaction_date,
  a.lead_id,
  a.owner_user_id,
  a.created_at,
  a.updated_at,
  p.name AS owner_name,
  p.email AS owner_email,
  (SELECT COUNT(*) FROM opportunities o WHERE o.account_id = a.account_id) AS opportunity_count,
  (SELECT SUM(estimated_value) FROM opportunities o WHERE o.account_id = a.account_id AND o.stage NOT IN ('Closed Lost')) AS total_pipeline_value,
  (SELECT COUNT(*) FROM opportunities o WHERE o.account_id = a.account_id AND o.stage = 'Closed Won') AS won_opportunities,
  -- Calculate status based on dates
  CASE
    WHEN a.account_status = 'new_account' AND a.first_transaction_date IS NOT NULL
         AND a.first_transaction_date + INTERVAL '3 months' < NOW()
    THEN 'active_account'
    WHEN a.account_status IN ('new_account', 'active_account')
         AND a.last_transaction_date IS NOT NULL
         AND a.last_transaction_date + INTERVAL '3 months' < NOW()
    THEN 'lost_account'
    WHEN a.account_status IN ('new_account', 'active_account')
         AND a.last_transaction_date IS NOT NULL
         AND a.last_transaction_date + INTERVAL '1 month' < NOW()
    THEN 'passive_account'
    ELSE a.account_status
  END AS calculated_status
FROM accounts a
LEFT JOIN profiles p ON a.owner_user_id = p.user_id;

-- =====================================================
-- STORAGE BUCKET FOR EVIDENCE
-- =====================================================
-- Note: This needs to be executed via Supabase dashboard or CLI
-- INSERT INTO storage.buckets (id, name, public, file_size_limit)
-- VALUES ('evidence', 'evidence', false, 10485760)
-- ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- RLS POLICIES (with idempotent drops first)
-- =====================================================
ALTER TABLE pipeline_updates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own pipeline updates" ON pipeline_updates;
DROP POLICY IF EXISTS "Users can insert own pipeline updates" ON pipeline_updates;
DROP POLICY IF EXISTS "Users can update own pipeline updates" ON pipeline_updates;

-- Policy: Users can view their own pipeline updates
CREATE POLICY "Users can view own pipeline updates"
  ON pipeline_updates FOR SELECT
  USING (
    updated_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM opportunities o
      WHERE o.opportunity_id = pipeline_updates.opportunity_id
      AND o.owner_user_id = auth.uid()
    )
  );

-- Policy: Users can insert their own pipeline updates
CREATE POLICY "Users can insert own pipeline updates"
  ON pipeline_updates FOR INSERT
  WITH CHECK (updated_by = auth.uid());

-- Policy: Users can update their own pipeline updates
CREATE POLICY "Users can update own pipeline updates"
  ON pipeline_updates FOR UPDATE
  USING (updated_by = auth.uid());

-- =====================================================
-- COMMENTS (wrapped in exception handlers)
-- =====================================================
DO $$
BEGIN
    COMMENT ON TYPE lead_claim_status IS 'Status of lead claiming by sales - unclaimed/claimed';
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
    COMMENT ON TYPE account_status IS 'Account lifecycle status based on pipeline and transaction history';
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
    COMMENT ON TYPE lost_reason IS 'Reasons for lost opportunities in pipeline';
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

DO $$
BEGIN
    COMMENT ON TYPE approach_method IS 'Methods used for approaching opportunities';
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

COMMENT ON TABLE pipeline_updates IS 'Tracking pipeline update activities with evidence and location';
COMMENT ON COLUMN leads.potential_revenue IS 'Estimated revenue potential when handing over to sales';
COMMENT ON COLUMN leads.claim_status IS 'Whether the lead has been claimed by sales';
COMMENT ON COLUMN accounts.account_status IS 'Current lifecycle status of the account';
COMMENT ON COLUMN opportunities.lost_reason IS 'Reason for losing the opportunity';
