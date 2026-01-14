-- =====================================================
-- Migration 003: Leads and Handover Pool Tables
-- SOURCE: PDF Section 2 & 6, Pages 4-6, 21-22
-- =====================================================

-- =====================================================
-- LEADS TABLE
-- SOURCE: PDF Pages 21-22
-- =====================================================
CREATE TABLE leads (
  lead_id TEXT PRIMARY KEY,

  -- Company/Contact Info
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_mobile TEXT,
  job_title TEXT,

  -- Lead Details
  source TEXT,
  source_detail TEXT,
  service_code TEXT,
  service_description TEXT,
  route TEXT,
  origin TEXT,
  destination TEXT,
  volume_estimate TEXT,
  timeline TEXT,
  notes TEXT,

  -- Triage Status (SOURCE: PDF Page 21 - lead_triage_status enum)
  triage_status lead_triage_status NOT NULL DEFAULT 'New',
  status lead_status DEFAULT 'New',

  -- Handover Fields
  handover_eligible BOOLEAN DEFAULT false,

  -- Ownership
  marketing_owner_user_id UUID REFERENCES profiles(user_id),
  sales_owner_user_id UUID REFERENCES profiles(user_id),

  -- Conversion Tracking
  opportunity_id TEXT,
  customer_id TEXT REFERENCES accounts(account_id),

  -- Timestamps
  qualified_at TIMESTAMPTZ,
  disqualified_at TIMESTAMPTZ,
  disqualified_reason TEXT,
  handed_over_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,

  -- Dedupe
  dedupe_key TEXT UNIQUE,

  -- Audit
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries (SOURCE: PDF Section 6)
CREATE INDEX idx_leads_triage ON leads(triage_status);
CREATE INDEX idx_leads_sales_owner ON leads(sales_owner_user_id);
CREATE INDEX idx_leads_marketing_owner ON leads(marketing_owner_user_id);
CREATE INDEX idx_leads_handover ON leads(handover_eligible) WHERE handover_eligible = true;
CREATE INDEX idx_leads_created ON leads(created_at DESC);
CREATE INDEX idx_leads_company ON leads(company_name);

-- Function to generate lead ID
CREATE OR REPLACE FUNCTION generate_lead_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN
    NEW.lead_id := 'LEAD' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;

  -- Generate dedupe_key
  IF NEW.dedupe_key IS NULL THEN
    NEW.dedupe_key := LOWER(TRIM(COALESCE(NEW.company_name, ''))) || '-' ||
                      COALESCE(LOWER(TRIM(NEW.contact_email)), LOWER(TRIM(NEW.contact_phone)), '');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_id
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION generate_lead_id();

-- =====================================================
-- LEAD HANDOVER POOL TABLE
-- SOURCE: PDF Pages 5, 22
-- "lead_handover_pool for tracking handover"
-- =====================================================
CREATE TABLE lead_handover_pool (
  pool_id BIGSERIAL PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE REFERENCES leads(lead_id) ON DELETE CASCADE,

  -- Handover Info
  handed_over_by UUID NOT NULL REFERENCES profiles(user_id),
  handed_over_at TIMESTAMPTZ DEFAULT NOW(),
  handover_notes TEXT,
  priority INTEGER DEFAULT 0,

  -- Claim Info
  claimed_by UUID REFERENCES profiles(user_id),
  claimed_at TIMESTAMPTZ,

  -- Expiry (optional, for auto-release)
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for unclaimed leads query (SOURCE: PDF Page 22)
CREATE INDEX idx_pool_unclaimed ON lead_handover_pool(claimed_by) WHERE claimed_by IS NULL;
CREATE INDEX idx_pool_claimed_by ON lead_handover_pool(claimed_by);
CREATE INDEX idx_pool_priority ON lead_handover_pool(priority DESC);

COMMENT ON TABLE leads IS 'Lead records with triage workflow - SOURCE: PDF Section 2.1';
COMMENT ON TABLE lead_handover_pool IS 'Tracking lead handover from marketing to sales - SOURCE: PDF Page 5';
COMMENT ON COLUMN leads.triage_status IS 'Marketing qualification status - New/In Review/Qualified/Nurture/Disqualified/Handed Over';
COMMENT ON COLUMN leads.handover_eligible IS 'Flag set when lead is qualified and ready for sales';
