-- =====================================================
-- Migration 006: Cadence System Tables
-- SOURCE: PDF Section 4, Pages 11-15
-- =====================================================

-- =====================================================
-- CADENCES TABLE (Templates)
-- SOURCE: PDF Page 12
-- =====================================================
CREATE TABLE cadences (
  cadence_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  owner_user_id UUID REFERENCES profiles(user_id),
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CADENCE STEPS TABLE
-- SOURCE: PDF Page 12
-- =====================================================
CREATE TABLE cadence_steps (
  step_id SERIAL PRIMARY KEY,
  cadence_id INTEGER NOT NULL REFERENCES cadences(cadence_id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  activity_type activity_type_v2 NOT NULL,
  subject_template TEXT NOT NULL,
  description_template TEXT,
  delay_days INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: no duplicate step numbers per cadence
CREATE UNIQUE INDEX idx_cadence_step_unique ON cadence_steps(cadence_id, step_number);
CREATE INDEX idx_cadence_steps_cadence ON cadence_steps(cadence_id);

-- =====================================================
-- CADENCE ENROLLMENTS TABLE
-- SOURCE: PDF Page 12
-- =====================================================
CREATE TABLE cadence_enrollments (
  enrollment_id BIGSERIAL PRIMARY KEY,
  cadence_id INTEGER NOT NULL REFERENCES cadences(cadence_id),

  -- What is enrolled (one of these should be set)
  account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts(contact_id) ON DELETE SET NULL,
  opportunity_id TEXT REFERENCES opportunities(opportunity_id) ON DELETE SET NULL,
  target_id TEXT,

  -- Progress
  current_step INTEGER DEFAULT 1,
  status cadence_enrollment_status DEFAULT 'Active',

  -- Timestamps
  enrolled_by UUID REFERENCES profiles(user_id),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enrollments_cadence ON cadence_enrollments(cadence_id);
CREATE INDEX idx_enrollments_account ON cadence_enrollments(account_id);
CREATE INDEX idx_enrollments_opp ON cadence_enrollments(opportunity_id);
CREATE INDEX idx_enrollments_status ON cadence_enrollments(status);

-- Add FK to activities for cadence_enrollment_id
ALTER TABLE activities
  ADD CONSTRAINT activities_cadence_enrollment_fkey
  FOREIGN KEY (cadence_enrollment_id) REFERENCES cadence_enrollments(enrollment_id) ON DELETE SET NULL;

COMMENT ON TABLE cadences IS 'Automation sequence templates - SOURCE: PDF Section 4';
COMMENT ON TABLE cadence_steps IS 'Individual steps in a cadence with delay_days';
COMMENT ON TABLE cadence_enrollments IS 'Active cadence tracking for records';
