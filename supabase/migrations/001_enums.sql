-- =====================================================
-- Migration 001: Create all CRM Enums
-- SOURCE: PDF Section 6, Pages 21-24
-- =====================================================

-- Lead Triage Status (SOURCE: PDF Page 21)
CREATE TYPE lead_triage_status AS ENUM (
  'New',
  'In Review',
  'Qualified',
  'Nurture',
  'Disqualified',
  'Handed Over'
);

-- Lead Status (Legacy, for backwards compatibility)
CREATE TYPE lead_status AS ENUM (
  'New',
  'Contacted',
  'Qualified',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost'
);

-- Opportunity Stage (SOURCE: PDF Page 7)
CREATE TYPE opportunity_stage AS ENUM (
  'Prospecting',
  'Discovery',
  'Quote Sent',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
  'On Hold'
);

-- Activity Type (SOURCE: PDF Page 24)
CREATE TYPE activity_type_v2 AS ENUM (
  'Call',
  'Email',
  'Meeting',
  'Task',
  'Note',
  'Follow Up',
  'Site Visit',
  'Proposal',
  'Contract Review'
);

-- Activity Status (SOURCE: PDF Page 24)
CREATE TYPE activity_status AS ENUM (
  'Planned',
  'Done',
  'Cancelled'
);

-- Target Status (SOURCE: PDF Page 23)
CREATE TYPE target_status AS ENUM (
  'new_target',
  'contacted',
  'engaged',
  'qualified',
  'dropped',
  'converted'
);

-- Cadence Enrollment Status
CREATE TYPE cadence_enrollment_status AS ENUM (
  'Active',
  'Paused',
  'Completed',
  'Stopped'
);

-- Account Tenure Status (SOURCE: PDF Page 7)
CREATE TYPE account_tenure_status AS ENUM (
  'Prospect',
  'New Customer',
  'Active Customer',
  'Winback Target'
);

-- Account Activity Status (SOURCE: PDF Page 7)
CREATE TYPE account_activity_status AS ENUM (
  'Active',
  'Passive',
  'Inactive'
);

-- Import Batch Status
CREATE TYPE import_batch_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- User Role (FIXED per Blueprint - exactly 15 roles)
CREATE TYPE user_role AS ENUM (
  'Director',
  'super admin',
  'Marketing Manager',
  'Marcomm',
  'DGO',
  'MACX',
  'VDCO',
  'sales manager',
  'salesperson',
  'sales support',
  'EXIM Ops',
  'domestics Ops',
  'Import DTD Ops',
  'traffic & warehous',
  'finance'
);

COMMENT ON TYPE lead_triage_status IS 'Lead marketing qualification states - SOURCE: PDF Section 2.1';
COMMENT ON TYPE opportunity_stage IS 'Sales opportunity pipeline stages - SOURCE: PDF Page 7';
COMMENT ON TYPE target_status IS 'Prospecting target lifecycle states - SOURCE: PDF Page 23';
