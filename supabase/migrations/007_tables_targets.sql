-- =====================================================
-- Migration 007: Prospecting Targets Table
-- SOURCE: PDF Section 1, Pages 2, 19, 23-24
-- =====================================================

-- =====================================================
-- PROSPECTING TARGETS TABLE
-- SOURCE: PDF Pages 23-24
-- =====================================================
CREATE TABLE prospecting_targets (
  target_id TEXT PRIMARY KEY,

  -- Company/Contact Info
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_mobile TEXT,
  job_title TEXT,
  industry TEXT,
  website TEXT,

  -- Target Details
  source TEXT,
  source_detail TEXT,
  notes TEXT,
  tags TEXT[],

  -- Status (SOURCE: PDF Page 23)
  status target_status NOT NULL DEFAULT 'new_target',

  -- Drop tracking
  drop_reason TEXT,
  dropped_at TIMESTAMPTZ,

  -- Conversion tracking
  converted_to_lead_id TEXT REFERENCES leads(lead_id),
  converted_to_account_id TEXT REFERENCES accounts(account_id),
  converted_at TIMESTAMPTZ,

  -- Ownership
  owner_user_id UUID REFERENCES profiles(user_id),

  -- Dedupe
  dedupe_key TEXT UNIQUE,

  -- Audit
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_targets_status ON prospecting_targets(status);
CREATE INDEX idx_targets_owner ON prospecting_targets(owner_user_id);
CREATE INDEX idx_targets_company ON prospecting_targets(company_name);
CREATE INDEX idx_targets_created ON prospecting_targets(created_at DESC);

-- Function to generate target ID
CREATE OR REPLACE FUNCTION generate_target_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_id IS NULL THEN
    NEW.target_id := 'TGT' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;

  -- Generate dedupe_key
  IF NEW.dedupe_key IS NULL THEN
    NEW.dedupe_key := LOWER(TRIM(COALESCE(NEW.company_name, ''))) || '-' ||
                      COALESCE(LOWER(TRIM(NEW.contact_email)), LOWER(TRIM(NEW.contact_phone)), '');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_target_id
  BEFORE INSERT ON prospecting_targets
  FOR EACH ROW
  EXECUTE FUNCTION generate_target_id();

-- =====================================================
-- TARGET STATUS TRANSITIONS TABLE
-- SOURCE: PDF Page 23
-- =====================================================
CREATE TABLE target_status_transitions (
  transition_id SERIAL PRIMARY KEY,
  from_status target_status NOT NULL,
  to_status target_status NOT NULL,
  is_allowed BOOLEAN DEFAULT true,
  requires_reason BOOLEAN DEFAULT false,
  UNIQUE(from_status, to_status)
);

-- Insert valid transitions
INSERT INTO target_status_transitions (from_status, to_status, is_allowed, requires_reason) VALUES
  ('new_target', 'contacted', true, false),
  ('new_target', 'dropped', true, true),
  ('contacted', 'engaged', true, false),
  ('contacted', 'dropped', true, true),
  ('contacted', 'new_target', true, false),
  ('engaged', 'qualified', true, false),
  ('engaged', 'dropped', true, true),
  ('engaged', 'contacted', true, false),
  ('qualified', 'converted', true, false),
  ('qualified', 'dropped', true, true),
  ('qualified', 'engaged', true, false);

-- Add FK for related_target_id in activities
ALTER TABLE activities
  ADD CONSTRAINT activities_target_fkey
  FOREIGN KEY (related_target_id) REFERENCES prospecting_targets(target_id) ON DELETE SET NULL;

-- Add FK for source_target_id in opportunities
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_source_target_fkey
  FOREIGN KEY (source_target_id) REFERENCES prospecting_targets(target_id) ON DELETE SET NULL;

-- Add FK for target_id in cadence_enrollments
ALTER TABLE cadence_enrollments
  ADD CONSTRAINT enrollments_target_fkey
  FOREIGN KEY (target_id) REFERENCES prospecting_targets(target_id) ON DELETE SET NULL;

COMMENT ON TABLE prospecting_targets IS 'Pre-lead prospects for cold outreach - SOURCE: PDF Page 2';
COMMENT ON TABLE target_status_transitions IS 'Valid state transitions for targets';
