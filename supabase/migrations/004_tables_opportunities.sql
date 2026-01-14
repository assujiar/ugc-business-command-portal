-- =====================================================
-- Migration 004: Opportunities and Stage History
-- SOURCE: PDF Section 2.2, Pages 6-7, 22
-- =====================================================

-- =====================================================
-- OPPORTUNITIES TABLE
-- SOURCE: PDF Page 22
-- =====================================================
CREATE TABLE opportunities (
  opportunity_id TEXT PRIMARY KEY,

  -- Relations
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  primary_contact_id TEXT REFERENCES contacts(contact_id),
  source_lead_id TEXT REFERENCES leads(lead_id),
  source_target_id TEXT,

  -- Opportunity Details
  name TEXT NOT NULL,
  description TEXT,
  service_codes TEXT[],
  route TEXT,
  origin TEXT,
  destination TEXT,

  -- Value
  estimated_value DECIMAL(15, 2),
  currency TEXT DEFAULT 'IDR',
  probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),

  -- Stage (SOURCE: PDF Page 7)
  stage opportunity_stage NOT NULL DEFAULT 'Prospecting',

  -- Next Action (SOURCE: PDF - "every opp has next_step and next_step_due_date")
  next_step TEXT NOT NULL,
  next_step_due_date DATE NOT NULL,

  -- Ownership
  owner_user_id UUID NOT NULL REFERENCES profiles(user_id),

  -- Closure
  closed_at TIMESTAMPTZ,
  outcome TEXT,
  lost_reason TEXT,
  competitor TEXT,

  -- Audit
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_opp_account ON opportunities(account_id);
CREATE INDEX idx_opp_owner ON opportunities(owner_user_id);
CREATE INDEX idx_opp_stage ON opportunities(stage);
CREATE INDEX idx_opp_source_lead ON opportunities(source_lead_id);
CREATE INDEX idx_opp_next_due ON opportunities(next_step_due_date);
CREATE INDEX idx_opp_owner_stage ON opportunities(owner_user_id, stage);
CREATE INDEX idx_opp_overdue ON opportunities(owner_user_id, next_step_due_date)
  WHERE stage NOT IN ('Closed Won', 'Closed Lost');

-- Function to generate opportunity ID
CREATE OR REPLACE FUNCTION generate_opportunity_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.opportunity_id IS NULL THEN
    NEW.opportunity_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_opportunity_id
  BEFORE INSERT ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION generate_opportunity_id();

-- =====================================================
-- OPPORTUNITY STAGE HISTORY TABLE
-- SOURCE: PDF Page 7 - "stage history table for auditing"
-- =====================================================
CREATE TABLE opportunity_stage_history (
  history_id BIGSERIAL PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(opportunity_id) ON DELETE CASCADE,
  from_stage opportunity_stage,
  to_stage opportunity_stage NOT NULL,
  changed_by UUID NOT NULL REFERENCES profiles(user_id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  notes TEXT
);

CREATE INDEX idx_stage_history_opp ON opportunity_stage_history(opportunity_id);
CREATE INDEX idx_stage_history_date ON opportunity_stage_history(changed_at DESC);

-- Trigger to auto-log stage changes
CREATE OR REPLACE FUNCTION log_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, changed_by)
    VALUES (NEW.opportunity_id, OLD.stage, NEW.stage, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_log_stage_change
  AFTER UPDATE OF stage ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION log_stage_change();

-- Add FK to leads for opportunity_id after opportunities table exists
ALTER TABLE leads
  ADD CONSTRAINT leads_opportunity_id_fkey
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(opportunity_id);

COMMENT ON TABLE opportunities IS 'Sales opportunities/deals - SOURCE: PDF Section 2.2';
COMMENT ON TABLE opportunity_stage_history IS 'Audit trail of stage changes - SOURCE: PDF Page 7';
COMMENT ON COLUMN opportunities.next_step IS 'Required: every opp must have a next action';
COMMENT ON COLUMN opportunities.next_step_due_date IS 'Required: every opp must have next action date';
