-- =====================================================
-- Migration 005: Activities Table
-- SOURCE: PDF Section 4, Pages 11-15, 24
-- =====================================================

-- =====================================================
-- ACTIVITIES TABLE
-- SOURCE: PDF Page 24
-- =====================================================
CREATE TABLE activities (
  activity_id TEXT PRIMARY KEY,

  -- Activity Details
  activity_type activity_type_v2 NOT NULL DEFAULT 'Task',
  subject TEXT NOT NULL,
  description TEXT,
  outcome TEXT,

  -- Status
  status activity_status NOT NULL DEFAULT 'Planned',

  -- Scheduling
  due_date DATE NOT NULL,
  due_time TIME,
  completed_at TIMESTAMPTZ,

  -- Relations (can link to any CRM entity)
  related_account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
  related_contact_id TEXT REFERENCES contacts(contact_id) ON DELETE SET NULL,
  related_opportunity_id TEXT REFERENCES opportunities(opportunity_id) ON DELETE SET NULL,
  related_lead_id TEXT REFERENCES leads(lead_id) ON DELETE SET NULL,
  related_target_id TEXT,

  -- Cadence Link (SOURCE: PDF Page 12)
  cadence_enrollment_id BIGINT,
  cadence_step_number INTEGER,

  -- Ownership
  owner_user_id UUID NOT NULL REFERENCES profiles(user_id),
  assigned_to UUID REFERENCES profiles(user_id),

  -- Audit
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (SOURCE: PDF Page 25)
CREATE INDEX idx_activities_owner ON activities(owner_user_id);
CREATE INDEX idx_activities_status ON activities(status);
CREATE INDEX idx_activities_due_date ON activities(due_date);
CREATE INDEX idx_activities_owner_status ON activities(owner_user_id, status);
CREATE INDEX idx_activities_owner_due ON activities(owner_user_id, due_date) WHERE status = 'Planned';
CREATE INDEX idx_activities_opp ON activities(related_opportunity_id);
CREATE INDEX idx_activities_account ON activities(related_account_id);
CREATE INDEX idx_activities_lead ON activities(related_lead_id);
CREATE INDEX idx_activities_cadence ON activities(cadence_enrollment_id);

-- Function to generate activity ID
CREATE OR REPLACE FUNCTION generate_activity_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.activity_id IS NULL THEN
    NEW.activity_id := 'ACT' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activity_id
  BEFORE INSERT ON activities
  FOR EACH ROW
  EXECUTE FUNCTION generate_activity_id();

COMMENT ON TABLE activities IS 'Tasks/Activities linked to CRM records - SOURCE: PDF Section 4';
COMMENT ON COLUMN activities.cadence_enrollment_id IS 'Link to cadence if auto-generated';
COMMENT ON COLUMN activities.cadence_step_number IS 'Which step in the cadence sequence';
