-- =====================================================
-- UGC Business Command Portal - Complete Database Schema
-- Generated SQL for creating all tables from scratch
-- =====================================================
-- IMPORTANT: This file is intended to create the entire schema.
-- Tables are ordered by dependencies.
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- SECTION 1: ENUM TYPES
-- All custom enum types must be created before tables
-- =====================================================

-- Lead Triage Status
CREATE TYPE lead_triage_status AS ENUM (
  'New',
  'In Review',
  'Qualified',
  'Nurture',
  'Disqualified',
  'Handed Over',
  'Assigned to Sales'
);

-- Lead Status (Legacy)
CREATE TYPE lead_status AS ENUM (
  'New',
  'Contacted',
  'Qualified',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost'
);

-- Lead Claim Status
CREATE TYPE lead_claim_status AS ENUM (
  'unclaimed',
  'claimed'
);

-- Opportunity Stage
CREATE TYPE opportunity_stage AS ENUM (
  'Prospecting',
  'Discovery',
  'Quote Sent',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
  'On Hold'
);

-- Activity Type V2
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

-- Activity Status
CREATE TYPE activity_status AS ENUM (
  'Planned',
  'Done',
  'Completed',
  'Cancelled'
);

-- Target Status
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

-- Account Tenure Status
CREATE TYPE account_tenure_status AS ENUM (
  'Prospect',
  'New Customer',
  'Active Customer',
  'Winback Target'
);

-- Account Activity Status
CREATE TYPE account_activity_status AS ENUM (
  'Active',
  'Passive',
  'Inactive'
);

-- Account Status
CREATE TYPE account_status AS ENUM (
  'calon_account',
  'new_account',
  'failed_account',
  'active_account',
  'passive_account',
  'lost_account'
);

-- Import Batch Status
CREATE TYPE import_batch_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- User Role
CREATE TYPE user_role AS ENUM (
  'Director',
  'super admin',
  'Marketing Manager',
  'Marcomm',
  'DGO',
  'MACX',
  'VSDO',
  'sales manager',
  'salesperson',
  'sales support',
  'EXIM Ops',
  'domestics Ops',
  'Import DTD Ops',
  'traffic & warehous',
  'finance'
);

-- Approach Method
CREATE TYPE approach_method AS ENUM (
  'Call',
  'Email',
  'Meeting',
  'Site Visit',
  'WhatsApp',
  'Proposal',
  'Contract Review'
);

-- Lost Reason
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

-- Sales Plan Type
CREATE TYPE sales_plan_type AS ENUM (
  'maintenance_existing',
  'hunting_new',
  'winback_lost'
);

-- Potential Status
CREATE TYPE potential_status AS ENUM (
  'pending',
  'potential',
  'not_potential'
);

-- Department Owner
CREATE TYPE department_owner AS ENUM (
  'Domestics Operations',
  'Exim Operations',
  'Import DTD Operations'
);

-- Service Type Enum
CREATE TYPE service_type AS ENUM (
  'LTL',
  'FTL',
  'AF',
  'LCL',
  'FCL',
  'WAREHOUSING',
  'FULFILLMENT',
  'LCL Export',
  'FCL Export',
  'Airfreight Export',
  'LCL Import',
  'FCL Import',
  'Airfreight Import',
  'Customs Clearance',
  'LCL DTD',
  'FCL DTD',
  'Airfreight DTD'
);

-- Fleet Type
CREATE TYPE fleet_type AS ENUM (
  'Blindvan',
  'Pickup',
  'CDE Box',
  'CDE Bak',
  'CDD Box',
  'CDD Bak',
  'CDD Long',
  'CDD Refer',
  'Fuso Box',
  'Fuso Bak',
  'TWB',
  'Trailer 20 Feet',
  'Trailer 40 Feet',
  'Flatbed',
  'Lainnya'
);

-- Incoterm
CREATE TYPE incoterm AS ENUM (
  'EXW',
  'FCA',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
  'FAS',
  'FOB',
  'CFR',
  'CIF'
);

-- Cargo Category
CREATE TYPE cargo_category AS ENUM (
  'General Cargo',
  'Dangerous Goods'
);

-- Unit of Measure
CREATE TYPE unit_of_measure AS ENUM (
  'Boxes',
  'Drum',
  'Wood Package',
  'Pallet',
  'Carton',
  'Bag',
  'Bundle',
  'Roll',
  'Piece',
  'Crate',
  'Container',
  'Sack',
  'Tank',
  'Cylinder',
  'Other'
);

-- Additional Service
CREATE TYPE additional_service AS ENUM (
  'Loading',
  'Unloading',
  'Handling',
  'Packing',
  'Wrapping',
  'Labeling',
  'Palletizing',
  'Fumigation',
  'Insurance',
  'Customs Documentation',
  'Warehouse Storage',
  'Cross Docking',
  'Door to Door',
  'Express Delivery',
  'Temperature Controlled',
  'Hazmat Handling',
  'Lashing',
  'Inspection',
  'Repacking',
  'Assembly'
);

-- Ticket Type
CREATE TYPE ticket_type AS ENUM ('RFQ', 'GEN');

-- Ticket Status
CREATE TYPE ticket_status AS ENUM (
  'open',
  'need_response',
  'in_progress',
  'waiting_customer',
  'need_adjustment',
  'pending',
  'resolved',
  'closed'
);

-- Ticket Priority
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Ticket Close Outcome
CREATE TYPE ticket_close_outcome AS ENUM ('won', 'lost');

-- Quote Status
CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'need_adjustment');

-- Ticket Event Type
CREATE TYPE ticket_event_type AS ENUM (
  'created',
  'assigned',
  'reassigned',
  'status_changed',
  'priority_changed',
  'comment_added',
  'attachment_added',
  'quote_created',
  'quote_sent',
  'resolved',
  'closed',
  'reopened',
  'quote_sent_to_customer',
  'customer_quotation_created',
  'customer_quotation_sent'
);

-- Ticketing Department
CREATE TYPE ticketing_department AS ENUM (
  'MKT',
  'SAL',
  'DOM',
  'EXI',
  'DTD',
  'TRF'
);

-- Response Owner
CREATE TYPE response_owner AS ENUM ('creator', 'assignee');

-- Rate Structure Type
CREATE TYPE rate_structure_type AS ENUM ('bundling', 'breakdown');

-- Customer Quotation Status
CREATE TYPE customer_quotation_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');

-- Rate Component Type
CREATE TYPE rate_component_type AS ENUM (
  'freight_charge',
  'trucking_origin',
  'trucking_destination',
  'sea_freight',
  'air_freight',
  'rail_freight',
  'barge_freight',
  'interisland_freight',
  'thc_origin',
  'thc_destination',
  'terminal_handling',
  'wharfage',
  'port_charges',
  'container_seal',
  'customs_clearance',
  'customs_broker_fee',
  'import_duty',
  'vat_ppn',
  'pph_import',
  'quarantine_fee',
  'fumigation',
  'certificate_of_origin',
  'legalization_fee',
  'handling_charge',
  'loading_unloading',
  'forklift_charge',
  'warehouse_storage',
  'stuffing_unstuffing',
  'palletization',
  'wrapping_packing',
  'labeling',
  'cargo_insurance',
  'marine_insurance',
  'security_charge',
  'container_rental',
  'container_cleaning',
  'container_repair',
  'demurrage',
  'detention',
  'reefer_plug_in',
  'documentation_fee',
  'bill_of_lading_fee',
  'telex_release',
  'manifest_fee',
  'admin_fee',
  'communication_fee',
  'dangerous_goods_surcharge',
  'overweight_surcharge',
  'oversized_surcharge',
  'lift_on_lift_off',
  'surveyor_fee',
  'sampling_fee',
  'inspection_fee',
  'fuel_surcharge',
  'currency_adjustment_factor',
  'peak_season_surcharge',
  'congestion_surcharge',
  'low_sulphur_surcharge',
  'war_risk_surcharge',
  'piracy_surcharge',
  'other'
);

-- Quotation Rejection Reason Type
CREATE TYPE quotation_rejection_reason_type AS ENUM (
  'tarif_tidak_masuk',
  'kompetitor_lebih_murah',
  'budget_customer_tidak_cukup',
  'service_tidak_sesuai',
  'waktu_tidak_sesuai',
  'other'
);

-- Operational Cost Rejection Reason Type
CREATE TYPE operational_cost_rejection_reason_type AS ENUM (
  'harga_terlalu_tinggi',
  'margin_tidak_mencukupi',
  'vendor_tidak_sesuai',
  'waktu_tidak_sesuai',
  'perlu_revisi',
  'other'
);

-- =====================================================
-- SECTION 2: CORE TABLES
-- Tables with no foreign key dependencies on other custom tables
-- =====================================================

-- PROFILES TABLE (User Profiles) - depends on auth.users
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'salesperson',
  department TEXT,
  avatar_url TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_department ON profiles(department);

-- =====================================================
-- SECTION 3: CRM TABLES
-- =====================================================

-- ACCOUNTS TABLE
CREATE TABLE accounts (
  account_id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  domain TEXT,
  npwp TEXT,
  industry TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  country TEXT DEFAULT 'Indonesia',
  postal_code TEXT,
  phone TEXT,
  pic_name TEXT,
  pic_email TEXT,
  pic_phone TEXT,
  owner_user_id UUID REFERENCES profiles(user_id),
  tenure_status account_tenure_status DEFAULT 'Prospect',
  activity_status account_activity_status DEFAULT 'Inactive',
  account_status account_status DEFAULT 'calon_account',
  first_deal_date TIMESTAMPTZ,
  first_transaction_date TIMESTAMPTZ,
  last_transaction_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  tags TEXT[],
  notes TEXT,
  dedupe_key TEXT UNIQUE,
  lead_id TEXT,
  retry_count INTEGER DEFAULT 0,
  original_lead_id TEXT,
  original_creator_id UUID REFERENCES profiles(user_id),
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_accounts_owner ON accounts(owner_user_id);
CREATE INDEX idx_accounts_company ON accounts(company_name);
CREATE UNIQUE INDEX idx_accounts_domain ON accounts(domain) WHERE domain IS NOT NULL;
CREATE UNIQUE INDEX idx_accounts_npwp ON accounts(npwp) WHERE npwp IS NOT NULL;
CREATE INDEX idx_accounts_tenure ON accounts(tenure_status);
CREATE INDEX idx_accounts_activity ON accounts(activity_status);
CREATE INDEX idx_accounts_status ON accounts(account_status);
CREATE INDEX idx_accounts_first_transaction ON accounts(first_transaction_date);
CREATE INDEX idx_accounts_last_transaction ON accounts(last_transaction_date);

-- CONTACTS TABLE
CREATE TABLE contacts (
  contact_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  job_title TEXT,
  department TEXT,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_account ON contacts(account_id);
CREATE UNIQUE INDEX idx_contacts_account_email ON contacts(account_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_contacts_account_phone ON contacts(account_id, phone) WHERE phone IS NOT NULL;

-- LEADS TABLE
CREATE TABLE leads (
  lead_id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_mobile TEXT,
  job_title TEXT,
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
  triage_status lead_triage_status NOT NULL DEFAULT 'New',
  status lead_status DEFAULT 'New',
  handover_eligible BOOLEAN DEFAULT false,
  marketing_owner_user_id UUID REFERENCES profiles(user_id),
  sales_owner_user_id UUID REFERENCES profiles(user_id),
  opportunity_id TEXT,
  customer_id TEXT REFERENCES accounts(account_id),
  account_id TEXT REFERENCES accounts(account_id),
  qualified_at TIMESTAMPTZ,
  disqualified_at TIMESTAMPTZ,
  disqualified_reason TEXT,
  handed_over_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  dedupe_key TEXT UNIQUE,
  priority INTEGER DEFAULT 2 CHECK (priority >= 1 AND priority <= 4),
  industry TEXT,
  potential_revenue NUMERIC(15,2),
  claim_status lead_claim_status DEFAULT 'unclaimed',
  claimed_by_name TEXT,
  quotation_status VARCHAR,
  latest_quotation_id UUID,
  quotation_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_triage ON leads(triage_status);
CREATE INDEX idx_leads_sales_owner ON leads(sales_owner_user_id);
CREATE INDEX idx_leads_marketing_owner ON leads(marketing_owner_user_id);
CREATE INDEX idx_leads_handover ON leads(handover_eligible) WHERE handover_eligible = true;
CREATE INDEX idx_leads_created ON leads(created_at DESC);
CREATE INDEX idx_leads_company ON leads(company_name);
CREATE INDEX idx_leads_claim_status ON leads(claim_status);

-- OPPORTUNITIES TABLE
CREATE TABLE opportunities (
  opportunity_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(account_id),
  primary_contact_id TEXT REFERENCES contacts(contact_id),
  source_lead_id TEXT REFERENCES leads(lead_id),
  name TEXT NOT NULL,
  description TEXT,
  service_codes TEXT[],
  route TEXT,
  origin TEXT,
  destination TEXT,
  estimated_value NUMERIC(15, 2),
  currency TEXT DEFAULT 'IDR',
  probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  stage opportunity_stage NOT NULL DEFAULT 'Prospecting',
  next_step TEXT NOT NULL,
  next_step_due_date DATE NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES profiles(user_id),
  closed_at TIMESTAMPTZ,
  outcome TEXT,
  lost_reason TEXT,
  competitor TEXT,
  competitor_price NUMERIC(15,2),
  customer_budget NUMERIC(15,2),
  attempt_number INTEGER DEFAULT 1,
  original_creator_id UUID REFERENCES profiles(user_id),
  quotation_status VARCHAR,
  latest_quotation_id UUID,
  quotation_count INTEGER DEFAULT 0,
  deal_value NUMERIC,
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_opp_account ON opportunities(account_id);
CREATE INDEX idx_opp_owner ON opportunities(owner_user_id);
CREATE INDEX idx_opp_stage ON opportunities(stage);
CREATE INDEX idx_opp_source_lead ON opportunities(source_lead_id);
CREATE INDEX idx_opp_next_due ON opportunities(next_step_due_date);
CREATE INDEX idx_opp_owner_stage ON opportunities(owner_user_id, stage);
CREATE INDEX idx_opp_overdue ON opportunities(owner_user_id, next_step_due_date)
  WHERE stage NOT IN ('Closed Won', 'Closed Lost');
CREATE INDEX idx_opportunities_lost_reason ON opportunities(lost_reason) WHERE stage = 'Closed Lost';

-- Add FK from leads to opportunities
ALTER TABLE leads
  ADD CONSTRAINT leads_opportunity_id_fkey
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(opportunity_id);

-- Add FK from accounts to leads
ALTER TABLE accounts
  ADD CONSTRAINT accounts_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES leads(lead_id);

ALTER TABLE accounts
  ADD CONSTRAINT accounts_original_lead_id_fkey
  FOREIGN KEY (original_lead_id) REFERENCES leads(lead_id);

-- OPPORTUNITY STAGE HISTORY TABLE
CREATE TABLE opportunity_stage_history (
  history_id BIGSERIAL PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(opportunity_id) ON DELETE CASCADE,
  from_stage opportunity_stage,
  to_stage opportunity_stage NOT NULL,
  old_stage opportunity_stage,
  new_stage opportunity_stage NOT NULL,
  changed_by UUID NOT NULL REFERENCES profiles(user_id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  reason TEXT,
  notes TEXT
);

CREATE INDEX idx_stage_history_opp ON opportunity_stage_history(opportunity_id);
CREATE INDEX idx_stage_history_date ON opportunity_stage_history(changed_at DESC);

-- LEAD HANDOVER POOL TABLE
CREATE TABLE lead_handover_pool (
  pool_id BIGSERIAL PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE REFERENCES leads(lead_id) ON DELETE CASCADE,
  handed_over_by UUID NOT NULL REFERENCES profiles(user_id),
  handed_over_at TIMESTAMPTZ DEFAULT NOW(),
  handover_notes TEXT,
  priority INTEGER DEFAULT 0,
  claimed_by UUID REFERENCES profiles(user_id),
  claimed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pool_unclaimed ON lead_handover_pool(claimed_by) WHERE claimed_by IS NULL;
CREATE INDEX idx_pool_claimed_by ON lead_handover_pool(claimed_by);
CREATE INDEX idx_pool_priority ON lead_handover_pool(priority DESC);

-- PIPELINE UPDATES TABLE
CREATE TABLE pipeline_updates (
  update_id TEXT PRIMARY KEY DEFAULT 'PU' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8)),
  opportunity_id TEXT NOT NULL REFERENCES opportunities(opportunity_id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  approach_method approach_method NOT NULL,
  evidence_url TEXT,
  evidence_file_name TEXT,
  evidence_original_url TEXT,
  location_lat NUMERIC(10,8),
  location_lng NUMERIC(11,8),
  location_address TEXT,
  old_stage opportunity_stage,
  new_stage opportunity_stage NOT NULL,
  updated_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pipeline_updates_opportunity ON pipeline_updates(opportunity_id);
CREATE INDEX idx_pipeline_updates_date ON pipeline_updates(updated_at DESC);
CREATE INDEX idx_pipeline_updates_method ON pipeline_updates(approach_method);

-- CADENCES TABLE
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

-- CADENCE STEPS TABLE
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

CREATE UNIQUE INDEX idx_cadence_step_unique ON cadence_steps(cadence_id, step_number);
CREATE INDEX idx_cadence_steps_cadence ON cadence_steps(cadence_id);

-- CADENCE ENROLLMENTS TABLE
CREATE TABLE cadence_enrollments (
  enrollment_id BIGSERIAL PRIMARY KEY,
  cadence_id INTEGER NOT NULL REFERENCES cadences(cadence_id),
  account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts(contact_id) ON DELETE SET NULL,
  opportunity_id TEXT REFERENCES opportunities(opportunity_id) ON DELETE SET NULL,
  current_step INTEGER DEFAULT 1,
  status cadence_enrollment_status DEFAULT 'Active',
  enrolled_by UUID REFERENCES profiles(user_id),
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enrollments_cadence ON cadence_enrollments(cadence_id);
CREATE INDEX idx_enrollments_account ON cadence_enrollments(account_id);
CREATE INDEX idx_enrollments_opp ON cadence_enrollments(opportunity_id);
CREATE INDEX idx_enrollments_status ON cadence_enrollments(status);

-- ACTIVITIES TABLE
CREATE TABLE activities (
  activity_id TEXT PRIMARY KEY,
  activity_type activity_type_v2 NOT NULL DEFAULT 'Task',
  subject TEXT NOT NULL,
  description TEXT,
  outcome TEXT,
  status activity_status NOT NULL DEFAULT 'Planned',
  due_date DATE NOT NULL,
  due_time TIME,
  completed_at TIMESTAMPTZ,
  related_account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
  related_contact_id TEXT REFERENCES contacts(contact_id) ON DELETE SET NULL,
  related_opportunity_id TEXT REFERENCES opportunities(opportunity_id) ON DELETE SET NULL,
  related_lead_id TEXT REFERENCES leads(lead_id) ON DELETE SET NULL,
  cadence_enrollment_id BIGINT REFERENCES cadence_enrollments(enrollment_id) ON DELETE SET NULL,
  cadence_step_number INTEGER,
  owner_user_id UUID NOT NULL REFERENCES profiles(user_id),
  assigned_to UUID REFERENCES profiles(user_id),
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_owner ON activities(owner_user_id);
CREATE INDEX idx_activities_status ON activities(status);
CREATE INDEX idx_activities_due_date ON activities(due_date);
CREATE INDEX idx_activities_owner_status ON activities(owner_user_id, status);
CREATE INDEX idx_activities_owner_due ON activities(owner_user_id, due_date) WHERE status = 'Planned';
CREATE INDEX idx_activities_opp ON activities(related_opportunity_id);
CREATE INDEX idx_activities_account ON activities(related_account_id);
CREATE INDEX idx_activities_lead ON activities(related_lead_id);
CREATE INDEX idx_activities_cadence ON activities(cadence_enrollment_id);

-- SALES PLANS TABLE
CREATE TABLE sales_plans (
  plan_id TEXT PRIMARY KEY,
  plan_type sales_plan_type NOT NULL,
  company_name TEXT NOT NULL,
  pic_name TEXT,
  pic_phone TEXT,
  pic_email TEXT,
  source_account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
  planned_date DATE NOT NULL,
  planned_activity_method approach_method NOT NULL,
  plan_notes TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),
  realized_at TIMESTAMPTZ,
  actual_activity_method approach_method,
  method_change_reason TEXT,
  realization_notes TEXT,
  evidence_url TEXT,
  evidence_file_name TEXT,
  evidence_original_url TEXT,
  location_lat NUMERIC(10,8),
  location_lng NUMERIC(11,8),
  location_address TEXT,
  potential_status potential_status DEFAULT 'pending',
  not_potential_reason TEXT,
  created_lead_id TEXT REFERENCES leads(lead_id) ON DELETE SET NULL,
  created_account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
  created_opportunity_id TEXT REFERENCES opportunities(opportunity_id) ON DELETE SET NULL,
  owner_user_id UUID NOT NULL REFERENCES profiles(user_id),
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sales_plans_owner ON sales_plans(owner_user_id);
CREATE INDEX idx_sales_plans_status ON sales_plans(status);
CREATE INDEX idx_sales_plans_planned_date ON sales_plans(planned_date);
CREATE INDEX idx_sales_plans_plan_type ON sales_plans(plan_type);
CREATE INDEX idx_sales_plans_potential ON sales_plans(potential_status) WHERE plan_type = 'hunting_new';
CREATE INDEX idx_sales_plans_source_account ON sales_plans(source_account_id);

-- =====================================================
-- SECTION 4: SHIPMENT TABLES
-- =====================================================

-- SERVICE TYPES TABLE
CREATE TABLE service_types (
  id SERIAL PRIMARY KEY,
  service_code TEXT UNIQUE NOT NULL,
  service_name TEXT NOT NULL,
  department department_owner NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_types_department ON service_types(department);
CREATE INDEX idx_service_types_active ON service_types(is_active) WHERE is_active = true;

-- SHIPMENT DETAILS TABLE
CREATE TABLE shipment_details (
  shipment_detail_id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,
  service_type_id INTEGER REFERENCES service_types(id),
  service_type_code TEXT,
  department department_owner,
  fleet_type fleet_type,
  fleet_quantity INTEGER DEFAULT 1,
  incoterm incoterm,
  cargo_category cargo_category DEFAULT 'General Cargo',
  cargo_description TEXT,
  origin_address TEXT,
  origin_city TEXT,
  origin_country TEXT DEFAULT 'Indonesia',
  destination_address TEXT,
  destination_city TEXT,
  destination_country TEXT DEFAULT 'Indonesia',
  quantity INTEGER DEFAULT 1,
  unit_of_measure unit_of_measure DEFAULT 'Boxes',
  weight_per_unit_kg NUMERIC(10, 2),
  weight_total_kg NUMERIC(10, 2),
  length_cm NUMERIC(10, 2),
  width_cm NUMERIC(10, 2),
  height_cm NUMERIC(10, 2),
  volume_total_cbm NUMERIC(10, 4),
  scope_of_work TEXT,
  additional_services additional_service[],
  notes TEXT,
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shipment_lead ON shipment_details(lead_id);
CREATE INDEX idx_shipment_service ON shipment_details(service_type_id);
CREATE INDEX idx_shipment_department ON shipment_details(department);

-- SHIPMENT ATTACHMENTS TABLE
CREATE TABLE shipment_attachments (
  attachment_id TEXT PRIMARY KEY,
  shipment_detail_id TEXT NOT NULL REFERENCES shipment_details(shipment_detail_id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  uploaded_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shipment_attachments ON shipment_attachments(shipment_detail_id);

-- =====================================================
-- SECTION 5: TICKETING TABLES
-- =====================================================

-- TICKET SEQUENCES TABLE
CREATE TABLE ticket_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type ticket_type NOT NULL,
  department ticketing_department NOT NULL,
  date_key VARCHAR(6) NOT NULL,
  last_sequence INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticket_type, department, date_key)
);

-- TICKETING SLA CONFIG TABLE
CREATE TABLE ticketing_sla_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department ticketing_department NOT NULL,
  ticket_type ticket_type NOT NULL,
  first_response_hours INTEGER DEFAULT 24,
  resolution_hours INTEGER DEFAULT 72,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(department, ticket_type)
);

-- TICKETS TABLE
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_code VARCHAR(20) UNIQUE NOT NULL,
  ticket_type ticket_type NOT NULL,
  status ticket_status DEFAULT 'open',
  priority ticket_priority DEFAULT 'medium',
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  department ticketing_department NOT NULL,
  account_id TEXT REFERENCES accounts(account_id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts(contact_id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  assigned_to UUID REFERENCES profiles(user_id),
  rfq_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  close_outcome ticket_close_outcome,
  close_reason TEXT,
  competitor_name VARCHAR(255),
  competitor_cost NUMERIC(15, 2),
  pending_response_from response_owner DEFAULT 'assignee',
  sender_name VARCHAR(255),
  sender_email VARCHAR(255),
  sender_phone VARCHAR(255),
  show_sender_to_ops BOOLEAN DEFAULT true,
  lead_id TEXT REFERENCES leads(lead_id),
  opportunity_id TEXT REFERENCES opportunities(opportunity_id),
  origin_department ticketing_department,
  origin_dept ticketing_department,
  target_dept ticketing_department
);

CREATE INDEX idx_tickets_ticket_code ON tickets(ticket_code);
CREATE INDEX idx_tickets_ticket_type ON tickets(ticket_type);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_department ON tickets(department);
CREATE INDEX idx_tickets_account_id ON tickets(account_id);
CREATE INDEX idx_tickets_created_by ON tickets(created_by);
CREATE INDEX idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX idx_tickets_status_dept ON tickets(status, department);
CREATE INDEX idx_tickets_pending_response_from ON tickets(pending_response_from);

-- TICKET EVENTS TABLE
CREATE TABLE ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_type ticket_event_type NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES profiles(user_id),
  old_value JSONB,
  new_value JSONB,
  notes TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_events_ticket_id ON ticket_events(ticket_id);
CREATE INDEX idx_ticket_events_event_type ON ticket_events(event_type);
CREATE INDEX idx_ticket_events_actor ON ticket_events(actor_user_id);
CREATE INDEX idx_ticket_events_created_at ON ticket_events(created_at DESC);

-- TICKET ASSIGNMENTS TABLE
CREATE TABLE ticket_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES profiles(user_id),
  assigned_by UUID NOT NULL REFERENCES profiles(user_id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX idx_ticket_assignments_ticket_id ON ticket_assignments(ticket_id);
CREATE INDEX idx_ticket_assignments_assigned_to ON ticket_assignments(assigned_to);
CREATE INDEX idx_ticket_assignments_assigned_at ON ticket_assignments(assigned_at DESC);

-- TICKET COMMENTS TABLE
CREATE TABLE ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(user_id),
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  response_time_seconds INTEGER,
  response_direction VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX idx_ticket_comments_user_id ON ticket_comments(user_id);
CREATE INDEX idx_ticket_comments_created_at ON ticket_comments(created_at DESC);

-- TICKET ATTACHMENTS TABLE
CREATE TABLE ticket_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES ticket_comments(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  file_path TEXT,
  uploaded_by UUID NOT NULL REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_attachments_ticket_id ON ticket_attachments(ticket_id);
CREATE INDEX idx_ticket_attachments_comment_id ON ticket_attachments(comment_id);
CREATE INDEX idx_ticket_attachments_uploaded_by ON ticket_attachments(uploaded_by);

-- TICKET RATE QUOTES TABLE
CREATE TABLE ticket_rate_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  quote_number VARCHAR(30) UNIQUE NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'IDR',
  valid_until DATE NOT NULL,
  terms TEXT,
  status quote_status DEFAULT 'draft',
  rate_structure VARCHAR(20) DEFAULT 'bundling' CHECK (rate_structure IN ('bundling', 'breakdown')),
  customer_quotation_id UUID,
  lead_id TEXT REFERENCES leads(lead_id),
  opportunity_id TEXT REFERENCES opportunities(opportunity_id),
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_rate_quotes_ticket_id ON ticket_rate_quotes(ticket_id);
CREATE INDEX idx_ticket_rate_quotes_quote_number ON ticket_rate_quotes(quote_number);
CREATE INDEX idx_ticket_rate_quotes_status ON ticket_rate_quotes(status);
CREATE INDEX idx_ticket_rate_quotes_created_by ON ticket_rate_quotes(created_by);

-- TICKET RATE QUOTE ITEMS TABLE
CREATE TABLE ticket_rate_quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES ticket_rate_quotes(id) ON DELETE CASCADE,
  component_type VARCHAR(100) NOT NULL,
  component_name VARCHAR(255),
  description TEXT,
  cost_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  quantity NUMERIC(10,2),
  unit VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_rate_quote_items_quote ON ticket_rate_quote_items(quote_id);

-- TICKET SLA TRACKING TABLE
CREATE TABLE ticket_sla_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID UNIQUE NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  first_response_at TIMESTAMPTZ,
  first_response_sla_hours INTEGER NOT NULL,
  first_response_met BOOLEAN,
  resolution_at TIMESTAMPTZ,
  resolution_sla_hours INTEGER NOT NULL,
  resolution_met BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_sla_tracking_ticket_id ON ticket_sla_tracking(ticket_id);

-- TICKET RESPONSES TABLE
CREATE TABLE ticket_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(user_id),
  responder_role VARCHAR(20) NOT NULL CHECK (responder_role IN ('creator', 'assignee', 'ops', 'admin')),
  ticket_stage VARCHAR(50),
  responded_at TIMESTAMPTZ DEFAULT NOW(),
  response_time_seconds INTEGER,
  comment_id UUID REFERENCES ticket_comments(id) ON DELETE SET NULL,
  sla_target_seconds INTEGER,
  sla_met BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_responses_ticket_id ON ticket_responses(ticket_id);
CREATE INDEX idx_ticket_responses_user_id ON ticket_responses(user_id);
CREATE INDEX idx_ticket_responses_responder_role ON ticket_responses(responder_role);
CREATE INDEX idx_ticket_responses_responded_at ON ticket_responses(responded_at DESC);

-- =====================================================
-- SECTION 6: SLA TABLES
-- =====================================================

-- SLA BUSINESS HOURS TABLE
CREATE TABLE sla_business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INTEGER NOT NULL UNIQUE CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_working_day BOOLEAN DEFAULT true,
  start_time TIME NOT NULL DEFAULT '08:00:00',
  end_time TIME NOT NULL DEFAULT '18:00:00',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SLA HOLIDAYS TABLE
CREATE TABLE sla_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_recurring BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sla_holidays_date ON sla_holidays(holiday_date);

-- TICKET RESPONSE EXCHANGES TABLE
CREATE TABLE ticket_response_exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  responder_user_id UUID NOT NULL REFERENCES profiles(user_id),
  responder_type response_owner NOT NULL,
  comment_id UUID REFERENCES ticket_comments(id) ON DELETE SET NULL,
  previous_response_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_response_seconds INTEGER,
  business_response_seconds INTEGER,
  exchange_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_response_exchanges_ticket_id ON ticket_response_exchanges(ticket_id);
CREATE INDEX idx_ticket_response_exchanges_responder ON ticket_response_exchanges(responder_user_id);
CREATE INDEX idx_ticket_response_exchanges_responder_type ON ticket_response_exchanges(responder_type);

-- TICKET RESPONSE METRICS TABLE
CREATE TABLE ticket_response_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID UNIQUE NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  creator_total_responses INTEGER DEFAULT 0,
  creator_avg_response_seconds INTEGER DEFAULT 0,
  creator_avg_business_response_seconds INTEGER DEFAULT 0,
  assignee_total_responses INTEGER DEFAULT 0,
  assignee_avg_response_seconds INTEGER DEFAULT 0,
  assignee_avg_business_response_seconds INTEGER DEFAULT 0,
  assignee_first_response_seconds INTEGER,
  assignee_first_response_business_seconds INTEGER,
  time_to_first_quote_seconds INTEGER,
  time_to_first_quote_business_seconds INTEGER,
  time_to_resolution_seconds INTEGER,
  time_to_resolution_business_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_response_metrics_ticket_id ON ticket_response_metrics(ticket_id);

-- =====================================================
-- SECTION 7: QUOTATION TABLES
-- =====================================================

-- CUSTOMER QUOTATION SEQUENCES TABLE
CREATE TABLE customer_quotation_sequences (
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  last_sequence INTEGER DEFAULT 0,
  PRIMARY KEY (year, month)
);

-- CUSTOMER QUOTATIONS TABLE
CREATE TABLE customer_quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  operational_cost_id UUID REFERENCES ticket_rate_quotes(id) ON DELETE SET NULL,
  quotation_number VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_company VARCHAR(255),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_address TEXT,
  service_type VARCHAR(100),
  service_type_code VARCHAR(20),
  fleet_type VARCHAR(100),
  fleet_quantity INTEGER,
  incoterm VARCHAR(20),
  commodity VARCHAR(255),
  cargo_description TEXT,
  cargo_weight NUMERIC(15,2),
  cargo_weight_unit VARCHAR(10) DEFAULT 'kg',
  cargo_volume NUMERIC(15,2),
  cargo_volume_unit VARCHAR(10) DEFAULT 'cbm',
  cargo_quantity INTEGER,
  cargo_quantity_unit VARCHAR(50),
  origin_address TEXT,
  origin_city VARCHAR(100),
  origin_country VARCHAR(100),
  origin_port VARCHAR(100),
  destination_address TEXT,
  destination_city VARCHAR(100),
  destination_country VARCHAR(100),
  destination_port VARCHAR(100),
  rate_structure rate_structure_type NOT NULL DEFAULT 'bundling',
  total_cost NUMERIC(15,2),
  target_margin_percent NUMERIC(5,2),
  total_selling_rate NUMERIC(15,2),
  currency VARCHAR(3) DEFAULT 'IDR',
  scope_of_work TEXT,
  terms_includes JSONB DEFAULT '[]',
  terms_excludes JSONB DEFAULT '[]',
  terms_notes TEXT,
  validity_days INTEGER DEFAULT 14,
  valid_until DATE,
  status customer_quotation_status DEFAULT 'draft',
  pdf_url TEXT,
  pdf_generated_at TIMESTAMPTZ,
  sent_via VARCHAR(20),
  sent_at TIMESTAMPTZ,
  sent_to VARCHAR(255),
  validation_code UUID DEFAULT gen_random_uuid(),
  estimated_leadtime TEXT,
  estimated_cargo_value NUMERIC(15,2),
  cargo_value_currency TEXT DEFAULT 'IDR',
  lead_id TEXT REFERENCES leads(lead_id),
  opportunity_id TEXT REFERENCES opportunities(opportunity_id),
  sequence_number INTEGER DEFAULT 1,
  source_type VARCHAR(50) DEFAULT 'ticket',
  rejection_reason TEXT,
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_quotations_ticket ON customer_quotations(ticket_id);
CREATE INDEX idx_customer_quotations_status ON customer_quotations(status);
CREATE INDEX idx_customer_quotations_validation ON customer_quotations(validation_code);
CREATE INDEX idx_customer_quotations_number ON customer_quotations(quotation_number);

-- Add FK from leads and opportunities to customer_quotations
ALTER TABLE leads
  ADD CONSTRAINT leads_latest_quotation_id_fkey
  FOREIGN KEY (latest_quotation_id) REFERENCES customer_quotations(id);

ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_latest_quotation_id_fkey
  FOREIGN KEY (latest_quotation_id) REFERENCES customer_quotations(id);

-- Add FK from ticket_rate_quotes to customer_quotations
ALTER TABLE ticket_rate_quotes
  ADD CONSTRAINT ticket_rate_quotes_customer_quotation_id_fkey
  FOREIGN KEY (customer_quotation_id) REFERENCES customer_quotations(id);

-- CUSTOMER QUOTATION ITEMS TABLE
CREATE TABLE customer_quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES customer_quotations(id) ON DELETE CASCADE,
  component_type rate_component_type NOT NULL,
  component_name VARCHAR(255),
  description TEXT,
  cost_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  target_margin_percent NUMERIC(5,2) DEFAULT 0,
  selling_rate NUMERIC(15,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(15,2),
  quantity NUMERIC(10,2),
  unit VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotation_items_quotation ON customer_quotation_items(quotation_id);

-- QUOTATION TERM TEMPLATES TABLE
CREATE TABLE quotation_term_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_type VARCHAR(20) NOT NULL CHECK (term_type IN ('include', 'exclude')),
  term_text TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- QUOTATION REJECTION REASONS TABLE
CREATE TABLE quotation_rejection_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES customer_quotations(id) ON DELETE CASCADE,
  reason_type quotation_rejection_reason_type NOT NULL,
  competitor_name TEXT,
  competitor_amount NUMERIC(15, 2),
  customer_budget NUMERIC(15, 2),
  currency VARCHAR(3) DEFAULT 'IDR',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotation_rejection_reasons_quotation_id ON quotation_rejection_reasons(quotation_id);
CREATE INDEX idx_quotation_rejection_reasons_reason_type ON quotation_rejection_reasons(reason_type);

-- OPERATIONAL COST REJECTION REASONS TABLE
CREATE TABLE operational_cost_rejection_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operational_cost_id UUID NOT NULL REFERENCES ticket_rate_quotes(id) ON DELETE CASCADE,
  reason_type operational_cost_rejection_reason_type NOT NULL,
  suggested_amount NUMERIC(15, 2),
  currency VARCHAR(3) DEFAULT 'IDR',
  notes TEXT,
  competitor_name TEXT,
  competitor_amount NUMERIC(15, 2),
  customer_budget NUMERIC(15, 2),
  created_by UUID NOT NULL REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_operational_cost_rejection_reasons_cost_id ON operational_cost_rejection_reasons(operational_cost_id);
CREATE INDEX idx_operational_cost_rejection_reasons_reason_type ON operational_cost_rejection_reasons(reason_type);
CREATE INDEX idx_operational_cost_rejection_reasons_created_at ON operational_cost_rejection_reasons(created_at);

-- =====================================================
-- SECTION 8: SYSTEM TABLES
-- =====================================================

-- IMPORT BATCHES TABLE
CREATE TABLE import_batches (
  batch_id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  file_name TEXT,
  file_url TEXT,
  status import_batch_status DEFAULT 'pending',
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  imported_by UUID NOT NULL REFERENCES profiles(user_id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_import_batches_status ON import_batches(status);
CREATE INDEX idx_import_batches_user ON import_batches(imported_by);
CREATE INDEX idx_import_batches_created ON import_batches(created_at DESC);

-- AUDIT LOGS TABLE
CREATE TABLE audit_logs (
  log_id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(user_id),
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  record_id TEXT,
  record_type TEXT,
  before_data JSONB,
  after_data JSONB,
  correlation_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_module ON audit_logs(module);
CREATE INDEX idx_audit_record ON audit_logs(record_type, record_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id);

-- CRM IDEMPOTENCY TABLE
CREATE TABLE crm_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  request_fingerprint TEXT,
  response JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_idempotency_expires ON crm_idempotency(expires_at);

-- CRM NOTIFICATION LOGS TABLE
CREATE TABLE crm_notification_logs (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event TEXT NOT NULL,
  threshold INTEGER,
  recipient_emails TEXT[],
  cc_emails TEXT[],
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  metadata JSONB,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crm_notification_logs_entity ON crm_notification_logs(entity_type, entity_id);
CREATE INDEX idx_crm_notification_logs_event ON crm_notification_logs(event);
CREATE INDEX idx_crm_notification_logs_sent_at ON crm_notification_logs(sent_at DESC);
CREATE INDEX idx_crm_notification_logs_status ON crm_notification_logs(status);

-- INSIGHTS GROWTH TABLE
CREATE TABLE insights_growth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key TEXT NOT NULL,
  filters_hash TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  role_view TEXT NOT NULL,
  generated_by_user_id UUID REFERENCES profiles(user_id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metrics_snapshot JSONB NOT NULL DEFAULT '{}',
  insight_json JSONB NOT NULL DEFAULT '{}',
  model TEXT DEFAULT 'gemini-1.5-flash',
  latency_ms INTEGER,
  tokens_in INTEGER,
  tokens_out INTEGER,
  is_latest BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_insights_growth_scope ON insights_growth(scope_key);
CREATE INDEX idx_insights_growth_filters_hash ON insights_growth(filters_hash);
CREATE INDEX idx_insights_growth_is_latest ON insights_growth(is_latest) WHERE is_latest = TRUE;
CREATE INDEX idx_insights_growth_generated_at ON insights_growth(generated_at DESC);

-- =====================================================
-- SECTION 9: TRIGGER FUNCTIONS
-- =====================================================

-- Generate Account ID
CREATE OR REPLACE FUNCTION generate_account_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.account_id IS NULL THEN
    NEW.account_id := 'ACCT' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;
  IF NEW.dedupe_key IS NULL THEN
    NEW.dedupe_key := LOWER(TRIM(COALESCE(NEW.company_name, ''))) || '-' || COALESCE(LOWER(TRIM(NEW.domain)), LOWER(TRIM(NEW.pic_email)), '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_account_id
  BEFORE INSERT ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION generate_account_id();

-- Generate Contact ID
CREATE OR REPLACE FUNCTION generate_contact_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contact_id IS NULL THEN
    NEW.contact_id := 'CONT' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contact_id
  BEFORE INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION generate_contact_id();

-- Generate Lead ID
CREATE OR REPLACE FUNCTION generate_lead_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN
    NEW.lead_id := 'LEAD' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;
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

-- Generate Opportunity ID
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

-- Generate Activity ID
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

-- Generate Sales Plan ID
CREATE OR REPLACE FUNCTION generate_sales_plan_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan_id IS NULL THEN
    NEW.plan_id := 'SP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sales_plan_id
  BEFORE INSERT ON sales_plans
  FOR EACH ROW
  EXECUTE FUNCTION generate_sales_plan_id();

-- Generate Pipeline Update ID
CREATE OR REPLACE FUNCTION generate_pipeline_update_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.update_id IS NULL THEN
    NEW.update_id := 'PU' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pipeline_update_id
  BEFORE INSERT ON pipeline_updates
  FOR EACH ROW
  EXECUTE FUNCTION generate_pipeline_update_id();

-- Generate Shipment Detail ID
CREATE OR REPLACE FUNCTION generate_shipment_detail_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.shipment_detail_id IS NULL THEN
    NEW.shipment_detail_id := 'SHIP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;
  IF NEW.quantity IS NOT NULL AND NEW.weight_per_unit_kg IS NOT NULL THEN
    NEW.weight_total_kg := NEW.quantity * NEW.weight_per_unit_kg;
  END IF;
  IF NEW.length_cm IS NOT NULL AND NEW.width_cm IS NOT NULL AND NEW.height_cm IS NOT NULL AND NEW.quantity IS NOT NULL THEN
    NEW.volume_total_cbm := (NEW.length_cm * NEW.width_cm * NEW.height_cm * NEW.quantity) / 1000000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_shipment_detail_id
  BEFORE INSERT ON shipment_details
  FOR EACH ROW
  EXECUTE FUNCTION generate_shipment_detail_id();

-- Generate Attachment ID
CREATE OR REPLACE FUNCTION generate_attachment_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.attachment_id IS NULL THEN
    NEW.attachment_id := 'ATT' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_attachment_id
  BEFORE INSERT ON shipment_attachments
  FOR EACH ROW
  EXECUTE FUNCTION generate_attachment_id();

-- Log Stage Change
CREATE OR REPLACE FUNCTION log_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, old_stage, new_stage, changed_by)
    VALUES (NEW.opportunity_id, OLD.stage, NEW.stage, OLD.stage, NEW.stage, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_log_stage_change
  AFTER UPDATE OF stage ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION log_stage_change();

-- Handle Updated At for Ticketing
CREATE OR REPLACE FUNCTION handle_ticketing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ticketing_updated_at ON tickets
  BEFORE UPDATE FOR EACH ROW
  EXECUTE FUNCTION handle_ticketing_updated_at();

CREATE TRIGGER set_ticketing_updated_at ON ticket_sequences
  BEFORE UPDATE FOR EACH ROW
  EXECUTE FUNCTION handle_ticketing_updated_at();

CREATE TRIGGER set_ticketing_updated_at ON ticketing_sla_config
  BEFORE UPDATE FOR EACH ROW
  EXECUTE FUNCTION handle_ticketing_updated_at();

CREATE TRIGGER set_ticketing_updated_at ON ticket_comments
  BEFORE UPDATE FOR EACH ROW
  EXECUTE FUNCTION handle_ticketing_updated_at();

CREATE TRIGGER set_ticketing_updated_at ON ticket_rate_quotes
  BEFORE UPDATE FOR EACH ROW
  EXECUTE FUNCTION handle_ticketing_updated_at();

CREATE TRIGGER set_ticketing_updated_at ON ticket_sla_tracking
  BEFORE UPDATE FOR EACH ROW
  EXECUTE FUNCTION handle_ticketing_updated_at();

CREATE TRIGGER set_sla_business_hours_updated_at ON sla_business_hours
  BEFORE UPDATE FOR EACH ROW
  EXECUTE FUNCTION handle_ticketing_updated_at();

CREATE TRIGGER set_sla_holidays_updated_at ON sla_holidays
  BEFORE UPDATE FOR EACH ROW
  EXECUTE FUNCTION handle_ticketing_updated_at();

CREATE TRIGGER set_ticket_response_metrics_updated_at ON ticket_response_metrics
  BEFORE UPDATE FOR EACH ROW
  EXECUTE FUNCTION handle_ticketing_updated_at();

-- =====================================================
-- SECTION 10: SEED DATA
-- =====================================================

-- Seed Service Types
INSERT INTO service_types (service_code, service_name, department, description) VALUES
  ('LTL', 'LTL', 'Domestics Operations', 'Less Than Truckload'),
  ('FTL', 'FTL', 'Domestics Operations', 'Full Truckload'),
  ('AF', 'AF', 'Domestics Operations', 'Air Freight Domestic'),
  ('LCL', 'LCL', 'Domestics Operations', 'Less Container Load Domestic'),
  ('FCL', 'FCL', 'Domestics Operations', 'Full Container Load Domestic'),
  ('WAREHOUSING', 'WAREHOUSING', 'Domestics Operations', 'Warehousing Services'),
  ('FULFILLMENT', 'FULFILLMENT', 'Domestics Operations', 'Fulfillment Services'),
  ('LCL_EXPORT', 'LCL Export', 'Exim Operations', 'LCL Export Services'),
  ('FCL_EXPORT', 'FCL Export', 'Exim Operations', 'FCL Export Services'),
  ('AIRFREIGHT_EXPORT', 'Airfreight Export', 'Exim Operations', 'Airfreight Export Services'),
  ('LCL_IMPORT', 'LCL Import', 'Exim Operations', 'LCL Import Services'),
  ('FCL_IMPORT', 'FCL Import', 'Exim Operations', 'FCL Import Services'),
  ('AIRFREIGHT_IMPORT', 'Airfreight Import', 'Exim Operations', 'Airfreight Import Services'),
  ('CUSTOMS_CLEARANCE', 'Customs Clearance', 'Exim Operations', 'Customs Clearance Services'),
  ('LCL_DTD', 'LCL DTD', 'Import DTD Operations', 'LCL Door to Door'),
  ('FCL_DTD', 'FCL DTD', 'Import DTD Operations', 'FCL Door to Door'),
  ('AIRFREIGHT_DTD', 'Airfreight DTD', 'Import DTD Operations', 'Airfreight Door to Door')
ON CONFLICT (service_code) DO NOTHING;

-- Seed SLA Config
INSERT INTO ticketing_sla_config (department, ticket_type, first_response_hours, resolution_hours) VALUES
  ('MKT', 'RFQ', 4, 48),
  ('MKT', 'GEN', 4, 24),
  ('SAL', 'RFQ', 4, 48),
  ('SAL', 'GEN', 4, 24),
  ('DOM', 'RFQ', 4, 48),
  ('DOM', 'GEN', 4, 24),
  ('EXI', 'RFQ', 4, 48),
  ('EXI', 'GEN', 4, 24),
  ('DTD', 'RFQ', 4, 48),
  ('DTD', 'GEN', 4, 24),
  ('TRF', 'RFQ', 4, 48),
  ('TRF', 'GEN', 4, 24)
ON CONFLICT (department, ticket_type) DO NOTHING;

-- Seed SLA Business Hours
INSERT INTO sla_business_hours (day_of_week, is_working_day, start_time, end_time) VALUES
  (0, FALSE, '08:00:00', '18:00:00'),
  (1, TRUE, '08:00:00', '18:00:00'),
  (2, TRUE, '08:00:00', '18:00:00'),
  (3, TRUE, '08:00:00', '18:00:00'),
  (4, TRUE, '08:00:00', '18:00:00'),
  (5, TRUE, '08:00:00', '18:00:00'),
  (6, FALSE, '08:00:00', '18:00:00')
ON CONFLICT (day_of_week) DO NOTHING;

-- Seed Quotation Term Templates
INSERT INTO quotation_term_templates (term_type, term_text, is_default, sort_order) VALUES
  ('include', 'Door to door delivery service', true, 1),
  ('include', 'Pickup from origin address', true, 2),
  ('include', 'Delivery to destination address', true, 3),
  ('include', 'Standard packaging', true, 4),
  ('include', 'Cargo insurance coverage', false, 5),
  ('include', 'Customs clearance handling', false, 6),
  ('include', 'Documentation processing', true, 7),
  ('include', 'Real-time tracking', true, 8),
  ('include', 'Loading and unloading service', false, 9),
  ('include', 'Warehouse handling', false, 10),
  ('include', 'Container seal', false, 11),
  ('include', 'Bill of Lading issuance', false, 12),
  ('exclude', 'Import duties and taxes', true, 1),
  ('exclude', 'Storage charges beyond free days', true, 2),
  ('exclude', 'Demurrage and detention charges', true, 3),
  ('exclude', 'Re-delivery charges', true, 4),
  ('exclude', 'Additional handling for fragile items', false, 5),
  ('exclude', 'Special equipment requirements', false, 6),
  ('exclude', 'Overtime charges for weekend/holiday delivery', false, 7),
  ('exclude', 'Insurance claims processing', false, 8),
  ('exclude', 'Fumigation costs', false, 9),
  ('exclude', 'Quarantine inspection fees', false, 10),
  ('exclude', 'Certificate of origin', false, 11),
  ('exclude', 'Legalization fees', false, 12)
ON CONFLICT DO NOTHING;

-- =====================================================
-- SECTION 11: COMMENTS
-- =====================================================

COMMENT ON TABLE profiles IS 'User profiles linked to auth.users';
COMMENT ON TABLE accounts IS 'Customer/company accounts - SSOT for customer data';
COMMENT ON TABLE contacts IS 'Contacts linked to accounts';
COMMENT ON TABLE leads IS 'Lead records with triage workflow';
COMMENT ON TABLE opportunities IS 'Sales opportunities/deals';
COMMENT ON TABLE opportunity_stage_history IS 'Audit trail of stage changes';
COMMENT ON TABLE activities IS 'Tasks/Activities linked to CRM records';
COMMENT ON TABLE cadences IS 'Automation sequence templates';
COMMENT ON TABLE cadence_steps IS 'Individual steps in a cadence with delay_days';
COMMENT ON TABLE cadence_enrollments IS 'Active cadence tracking for records';
COMMENT ON TABLE lead_handover_pool IS 'Tracking lead handover from marketing to sales';
COMMENT ON TABLE pipeline_updates IS 'Tracking pipeline update activities with evidence and location';
COMMENT ON TABLE sales_plans IS 'Sales activity planning for maintenance, hunting, and winback';
COMMENT ON TABLE service_types IS 'Reference table for service types with department mapping';
COMMENT ON TABLE shipment_details IS 'Shipment details linked to leads';
COMMENT ON TABLE shipment_attachments IS 'File attachments for shipment details';
COMMENT ON TABLE tickets IS 'All ticket records (RFQ and GEN types) - links to CRM accounts';
COMMENT ON TABLE ticket_events IS 'Append-only audit trail for all ticket actions';
COMMENT ON TABLE ticket_assignments IS 'Ticket assignment history';
COMMENT ON TABLE ticket_comments IS 'Ticket comments (internal notes and customer communications)';
COMMENT ON TABLE ticket_attachments IS 'File attachments for tickets';
COMMENT ON TABLE ticket_rate_quotes IS 'Rate quotes/proposals for RFQ tickets';
COMMENT ON TABLE ticket_sla_tracking IS 'Actual SLA performance tracking per ticket';
COMMENT ON TABLE ticketing_sla_config IS 'SLA targets per department and ticket type';
COMMENT ON TABLE ticket_sequences IS 'Sequence tracking for ticket code generation';
COMMENT ON TABLE sla_business_hours IS 'Business hours configuration for SLA calculations';
COMMENT ON TABLE sla_holidays IS 'Holidays excluded from SLA business hours calculations';
COMMENT ON TABLE ticket_response_exchanges IS 'Tracks response time exchanges between ticket creator and assignee';
COMMENT ON TABLE ticket_response_metrics IS 'Aggregated response time metrics per ticket';
COMMENT ON TABLE customer_quotations IS 'Customer quotations for sending to end customers';
COMMENT ON TABLE customer_quotation_items IS 'Line items for customer quotations (breakdown mode)';
COMMENT ON TABLE quotation_term_templates IS 'Templates for quotation terms and conditions';
COMMENT ON TABLE quotation_rejection_reasons IS 'Stores rejection reasons for customer quotations for analytics';
COMMENT ON TABLE operational_cost_rejection_reasons IS 'Stores rejection reasons for operational costs for analytics';
COMMENT ON TABLE import_batches IS 'Track bulk import jobs';
COMMENT ON TABLE audit_logs IS 'Central audit trail for all CRM actions';
COMMENT ON TABLE crm_idempotency IS 'Prevent duplicate processing of requests';
COMMENT ON TABLE crm_notification_logs IS 'Email notification logs for CRM events';
COMMENT ON TABLE insights_growth IS 'AI-generated growth insights cache';

-- =====================================================
-- SECTION 12: HELPER FUNCTIONS FOR RLS
-- =====================================================

-- Get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
BEGIN
  RETURN (SELECT role FROM profiles WHERE user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() IN ('Director', 'super admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is marketing
CREATE OR REPLACE FUNCTION is_marketing()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() IN ('Director', 'super admin', 'Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is sales
CREATE OR REPLACE FUNCTION is_sales()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() IN ('Director', 'super admin', 'sales manager', 'salesperson', 'sales support');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user can access ticketing module
CREATE OR REPLACE FUNCTION can_access_ticketing(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE profiles.user_id = can_access_ticketing.user_id AND is_active = TRUE;

  IF v_role = 'finance' THEN
    RETURN FALSE;
  END IF;

  RETURN v_role IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is ticketing admin
CREATE OR REPLACE FUNCTION is_ticketing_admin(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE profiles.user_id = is_ticketing_admin.user_id AND is_active = TRUE;

  RETURN v_role IN ('Director', 'super admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is ticketing ops
CREATE OR REPLACE FUNCTION is_ticketing_ops(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE profiles.user_id = is_ticketing_ops.user_id AND is_active = TRUE;

  RETURN v_role IN (
    'Director', 'super admin',
    'EXIM Ops', 'domestics Ops', 'Import DTD Ops', 'traffic & warehous'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get user's ticketing department
CREATE OR REPLACE FUNCTION get_user_ticketing_department(user_id UUID)
RETURNS ticketing_department AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM profiles
  WHERE profiles.user_id = get_user_ticketing_department.user_id AND is_active = TRUE;

  CASE v_role
    WHEN 'Marketing Manager' THEN RETURN 'MKT';
    WHEN 'Marcomm' THEN RETURN 'MKT';
    WHEN 'DGO' THEN RETURN 'MKT';
    WHEN 'MACX' THEN RETURN 'MKT';
    WHEN 'VSDO' THEN RETURN 'MKT';
    WHEN 'sales manager' THEN RETURN 'SAL';
    WHEN 'salesperson' THEN RETURN 'SAL';
    WHEN 'sales support' THEN RETURN 'SAL';
    WHEN 'domestics Ops' THEN RETURN 'DOM';
    WHEN 'EXIM Ops' THEN RETURN 'EXI';
    WHEN 'Import DTD Ops' THEN RETURN 'DTD';
    WHEN 'traffic & warehous' THEN RETURN 'TRF';
    ELSE RETURN NULL;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get role category for analytics
CREATE OR REPLACE FUNCTION get_role_category(p_role TEXT)
RETURNS TEXT AS $$
BEGIN
  CASE p_role
    WHEN 'EXIM Ops' THEN RETURN 'Ops';
    WHEN 'domestics Ops' THEN RETURN 'Ops';
    WHEN 'Import DTD Ops' THEN RETURN 'Ops';
    WHEN 'traffic & warehous' THEN RETURN 'Operations Support';
    WHEN 'sales manager' THEN RETURN 'Sales';
    WHEN 'salesperson' THEN RETURN 'Sales';
    WHEN 'sales support' THEN RETURN 'Sales';
    WHEN 'Marketing Manager' THEN RETURN 'Marketing';
    WHEN 'Marcomm' THEN RETURN 'Marketing';
    WHEN 'DGO' THEN RETURN 'Marketing';
    WHEN 'MACX' THEN RETURN 'Marketing';
    WHEN 'VSDO' THEN RETURN 'Marketing';
    WHEN 'finance' THEN RETURN 'Finance';
    WHEN 'Director' THEN RETURN 'Management';
    WHEN 'super admin' THEN RETURN 'Management';
    ELSE RETURN 'Other';
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Format duration helper
CREATE OR REPLACE FUNCTION format_duration(p_seconds INTEGER)
RETURNS TEXT AS $$
DECLARE
  v_days INTEGER;
  v_hours INTEGER;
  v_minutes INTEGER;
  v_result TEXT := '';
BEGIN
  IF p_seconds IS NULL THEN
    RETURN 'N/A';
  END IF;

  v_days := p_seconds / 86400;
  v_hours := (p_seconds % 86400) / 3600;
  v_minutes := (p_seconds % 3600) / 60;

  IF v_days > 0 THEN
    v_result := v_days || 'd ';
  END IF;

  IF v_hours > 0 OR v_days > 0 THEN
    v_result := v_result || v_hours || 'h ';
  END IF;

  v_result := v_result || v_minutes || 'm';

  RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate business hours between timestamps
CREATE OR REPLACE FUNCTION calculate_business_hours_seconds(
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS INTEGER AS $$
DECLARE
  v_current_time TIMESTAMPTZ;
  v_total_seconds INTEGER := 0;
  v_day_of_week INTEGER;
  v_business_hours RECORD;
  v_day_start TIMESTAMPTZ;
  v_day_end TIMESTAMPTZ;
  v_work_start TIMESTAMPTZ;
  v_work_end TIMESTAMPTZ;
  v_is_holiday BOOLEAN;
BEGIN
  IF p_start_time IS NULL OR p_end_time IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_start_time >= p_end_time THEN
    RETURN 0;
  END IF;

  v_current_time := p_start_time;

  WHILE v_current_time < p_end_time LOOP
    v_day_of_week := EXTRACT(DOW FROM v_current_time)::INTEGER;

    SELECT * INTO v_business_hours
    FROM sla_business_hours
    WHERE day_of_week = v_day_of_week;

    SELECT EXISTS(
      SELECT 1 FROM sla_holidays
      WHERE holiday_date = v_current_time::DATE
    ) INTO v_is_holiday;

    IF v_business_hours.is_working_day AND NOT v_is_holiday THEN
      v_day_start := DATE_TRUNC('day', v_current_time) + v_business_hours.start_time::INTERVAL;
      v_day_end := DATE_TRUNC('day', v_current_time) + v_business_hours.end_time::INTERVAL;

      v_work_start := GREATEST(v_current_time, v_day_start);
      v_work_end := LEAST(p_end_time, v_day_end);

      IF v_work_start < v_work_end THEN
        v_total_seconds := v_total_seconds + EXTRACT(EPOCH FROM (v_work_end - v_work_start))::INTEGER;
      END IF;
    END IF;

    v_current_time := DATE_TRUNC('day', v_current_time) + INTERVAL '1 day';
  END LOOP;

  RETURN v_total_seconds;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- SECTION 13: ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_handover_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadences ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_rate_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticketing_sla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_sla_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_response_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_response_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_rejection_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_cost_rejection_reasons ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (user_id = auth.uid() OR is_admin());

-- ACCOUNTS POLICIES
CREATE POLICY accounts_select ON accounts FOR SELECT USING (is_admin() OR is_sales() OR is_marketing());
CREATE POLICY accounts_insert ON accounts FOR INSERT WITH CHECK (is_admin() OR is_sales());
CREATE POLICY accounts_update ON accounts FOR UPDATE USING (is_admin() OR owner_user_id = auth.uid());

-- CONTACTS POLICIES
CREATE POLICY contacts_select ON contacts FOR SELECT USING (is_admin() OR is_sales() OR is_marketing());
CREATE POLICY contacts_insert ON contacts FOR INSERT WITH CHECK (is_admin() OR is_sales());
CREATE POLICY contacts_update ON contacts FOR UPDATE USING (is_admin() OR is_sales());

-- LEADS POLICIES
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    is_admin()
    OR (is_marketing() AND triage_status IN ('New', 'In Review', 'Nurture', 'Disqualified'))
    OR (is_sales() AND (sales_owner_user_id = auth.uid() OR handover_eligible = true))
  );
CREATE POLICY leads_insert ON leads FOR INSERT WITH CHECK (is_admin() OR is_marketing());
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    is_admin()
    OR (is_marketing() AND triage_status IN ('New', 'In Review', 'Nurture', 'Disqualified') AND sales_owner_user_id IS NULL)
    OR (is_sales() AND sales_owner_user_id = auth.uid())
  );

-- LEAD HANDOVER POOL POLICIES
CREATE POLICY pool_select ON lead_handover_pool FOR SELECT USING (is_admin() OR is_sales() OR handed_over_by = auth.uid());
CREATE POLICY pool_insert ON lead_handover_pool FOR INSERT WITH CHECK (is_admin() OR is_marketing());
CREATE POLICY pool_update ON lead_handover_pool FOR UPDATE USING (is_admin() OR is_sales());

-- OPPORTUNITIES POLICIES
CREATE POLICY opp_select ON opportunities FOR SELECT USING (is_admin() OR is_sales() OR is_marketing());
CREATE POLICY opp_insert ON opportunities FOR INSERT WITH CHECK (is_admin() OR is_sales());
CREATE POLICY opp_update ON opportunities FOR UPDATE USING (is_admin() OR owner_user_id = auth.uid());

-- OPPORTUNITY STAGE HISTORY POLICIES
CREATE POLICY stage_history_select ON opportunity_stage_history FOR SELECT USING (is_admin() OR is_sales() OR is_marketing());
CREATE POLICY stage_history_insert ON opportunity_stage_history FOR INSERT WITH CHECK (is_admin() OR is_sales());

-- ACTIVITIES POLICIES
CREATE POLICY activities_select ON activities FOR SELECT USING (is_admin() OR owner_user_id = auth.uid() OR is_marketing());
CREATE POLICY activities_insert ON activities FOR INSERT WITH CHECK (is_admin() OR is_sales() OR is_marketing());
CREATE POLICY activities_update ON activities FOR UPDATE USING (is_admin() OR owner_user_id = auth.uid());

-- CADENCES POLICIES
CREATE POLICY cadences_select ON cadences FOR SELECT USING (is_admin() OR is_sales() OR is_marketing());
CREATE POLICY cadences_insert ON cadences FOR INSERT WITH CHECK (is_admin());
CREATE POLICY cadences_update ON cadences FOR UPDATE USING (is_admin());

-- CADENCE STEPS POLICIES
CREATE POLICY steps_select ON cadence_steps FOR SELECT USING (is_admin() OR is_sales() OR is_marketing());
CREATE POLICY steps_insert ON cadence_steps FOR INSERT WITH CHECK (is_admin());

-- CADENCE ENROLLMENTS POLICIES
CREATE POLICY enrollments_select ON cadence_enrollments FOR SELECT USING (is_admin() OR enrolled_by = auth.uid());
CREATE POLICY enrollments_insert ON cadence_enrollments FOR INSERT WITH CHECK (is_admin() OR is_sales());
CREATE POLICY enrollments_update ON cadence_enrollments FOR UPDATE USING (is_admin() OR enrolled_by = auth.uid());

-- IMPORT BATCHES POLICIES
CREATE POLICY imports_select ON import_batches FOR SELECT USING (is_admin() OR imported_by = auth.uid());
CREATE POLICY imports_insert ON import_batches FOR INSERT
  WITH CHECK (is_admin() OR get_user_role() IN ('Marketing Manager', 'sales manager'));

-- AUDIT LOGS POLICIES
CREATE POLICY audit_select ON audit_logs FOR SELECT USING (is_admin());
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (true);

-- PIPELINE UPDATES POLICIES
CREATE POLICY pipeline_updates_select ON pipeline_updates FOR SELECT USING (is_admin() OR is_sales() OR is_marketing());
CREATE POLICY pipeline_updates_insert ON pipeline_updates FOR INSERT WITH CHECK (is_admin() OR is_sales());
CREATE POLICY pipeline_updates_update ON pipeline_updates FOR UPDATE USING (is_admin() OR updated_by = auth.uid());

-- SALES PLANS POLICIES
CREATE POLICY sales_plans_select ON sales_plans FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid()
      AND role IN ('super admin', 'Director', 'sales manager', 'sales support', 'Marketing Manager', 'MACX')
    )
  );
CREATE POLICY sales_plans_insert ON sales_plans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid()
      AND role IN ('super admin', 'salesperson')
    )
  );
CREATE POLICY sales_plans_update ON sales_plans FOR UPDATE
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid()
      AND role IN ('super admin')
    )
  );
CREATE POLICY sales_plans_delete ON sales_plans FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid()
      AND role IN ('super admin', 'sales manager', 'sales support')
    )
  );

-- TICKETS POLICIES
CREATE POLICY tickets_select ON tickets FOR SELECT TO authenticated
  USING (
    can_access_ticketing(auth.uid())
    AND (
      is_ticketing_admin(auth.uid())
      OR is_ticketing_ops(auth.uid())
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
    )
  );
CREATE POLICY tickets_insert ON tickets FOR INSERT TO authenticated
  WITH CHECK (can_access_ticketing(auth.uid()) AND created_by = auth.uid());
CREATE POLICY tickets_update ON tickets FOR UPDATE TO authenticated
  USING (
    can_access_ticketing(auth.uid())
    AND (
      is_ticketing_admin(auth.uid())
      OR is_ticketing_ops(auth.uid())
      OR created_by = auth.uid()
      OR assigned_to = auth.uid()
    )
  );
CREATE POLICY tickets_delete ON tickets FOR DELETE TO authenticated
  USING (is_ticketing_admin(auth.uid()));

-- TICKET EVENTS POLICIES
CREATE POLICY ticket_events_select ON ticket_events FOR SELECT TO authenticated
  USING (
    can_access_ticketing(auth.uid())
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_id
      AND (
        is_ticketing_admin(auth.uid())
        OR is_ticketing_ops(auth.uid())
        OR t.created_by = auth.uid()
        OR t.assigned_to = auth.uid()
      )
    )
  );
CREATE POLICY ticket_events_insert ON ticket_events FOR INSERT TO authenticated
  WITH CHECK (can_access_ticketing(auth.uid()) AND actor_user_id = auth.uid());

-- TICKET COMMENTS POLICIES
CREATE POLICY ticket_comments_select ON ticket_comments FOR SELECT TO authenticated
  USING (
    can_access_ticketing(auth.uid())
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_id
      AND (
        is_ticketing_admin(auth.uid())
        OR is_ticketing_ops(auth.uid())
        OR t.created_by = auth.uid()
        OR t.assigned_to = auth.uid()
      )
    )
    AND (
      is_internal = FALSE
      OR is_ticketing_ops(auth.uid())
      OR is_ticketing_admin(auth.uid())
    )
  );
CREATE POLICY ticket_comments_insert ON ticket_comments FOR INSERT TO authenticated
  WITH CHECK (
    can_access_ticketing(auth.uid())
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_id
      AND (
        is_ticketing_admin(auth.uid())
        OR is_ticketing_ops(auth.uid())
        OR t.created_by = auth.uid()
        OR t.assigned_to = auth.uid()
      )
    )
  );
CREATE POLICY ticket_comments_update ON ticket_comments FOR UPDATE TO authenticated
  USING (can_access_ticketing(auth.uid()) AND (user_id = auth.uid() OR is_ticketing_admin(auth.uid())));
CREATE POLICY ticket_comments_delete ON ticket_comments FOR DELETE TO authenticated
  USING (can_access_ticketing(auth.uid()) AND (user_id = auth.uid() OR is_ticketing_admin(auth.uid())));

-- TICKET RATE QUOTES POLICIES
CREATE POLICY ticket_rate_quotes_select ON ticket_rate_quotes FOR SELECT TO authenticated
  USING (
    can_access_ticketing(auth.uid())
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_id
      AND (
        is_ticketing_admin(auth.uid())
        OR is_ticketing_ops(auth.uid())
        OR t.created_by = auth.uid()
        OR t.assigned_to = auth.uid()
      )
    )
  );
CREATE POLICY ticket_rate_quotes_insert ON ticket_rate_quotes FOR INSERT TO authenticated
  WITH CHECK (
    can_access_ticketing(auth.uid())
    AND (is_ticketing_admin(auth.uid()) OR is_ticketing_ops(auth.uid()))
    AND created_by = auth.uid()
  );
CREATE POLICY ticket_rate_quotes_update ON ticket_rate_quotes FOR UPDATE TO authenticated
  USING (can_access_ticketing(auth.uid()) AND (created_by = auth.uid() OR is_ticketing_admin(auth.uid())));
CREATE POLICY ticket_rate_quotes_delete ON ticket_rate_quotes FOR DELETE TO authenticated
  USING (can_access_ticketing(auth.uid()) AND (created_by = auth.uid() OR is_ticketing_admin(auth.uid())));

-- TICKETING SLA CONFIG POLICIES
CREATE POLICY ticketing_sla_config_select ON ticketing_sla_config FOR SELECT TO authenticated
  USING (can_access_ticketing(auth.uid()));
CREATE POLICY ticketing_sla_config_insert ON ticketing_sla_config FOR INSERT TO authenticated
  WITH CHECK (is_ticketing_admin(auth.uid()));
CREATE POLICY ticketing_sla_config_update ON ticketing_sla_config FOR UPDATE TO authenticated
  USING (is_ticketing_admin(auth.uid()));

-- SLA BUSINESS HOURS POLICIES
CREATE POLICY sla_business_hours_select ON sla_business_hours FOR SELECT TO authenticated USING (true);
CREATE POLICY sla_business_hours_manage ON sla_business_hours FOR ALL TO authenticated
  USING (is_ticketing_admin(auth.uid()))
  WITH CHECK (is_ticketing_admin(auth.uid()));

-- SLA HOLIDAYS POLICIES
CREATE POLICY sla_holidays_select ON sla_holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY sla_holidays_manage ON sla_holidays FOR ALL TO authenticated
  USING (is_ticketing_admin(auth.uid()))
  WITH CHECK (is_ticketing_admin(auth.uid()));

-- CUSTOMER QUOTATIONS POLICIES
CREATE POLICY customer_quotations_select ON customer_quotations FOR SELECT TO authenticated
  USING (can_access_ticketing(auth.uid()));
CREATE POLICY customer_quotations_insert ON customer_quotations FOR INSERT TO authenticated
  WITH CHECK (can_access_ticketing(auth.uid()) AND created_by = auth.uid());
CREATE POLICY customer_quotations_update ON customer_quotations FOR UPDATE TO authenticated
  USING (can_access_ticketing(auth.uid()) AND (created_by = auth.uid() OR is_ticketing_admin(auth.uid())));

-- =====================================================
-- SECTION 14: VIEWS
-- =====================================================

-- Lead inbox view for marketing
CREATE OR REPLACE VIEW v_lead_inbox AS
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
  l.priority,
  l.industry,
  l.potential_revenue,
  l.claim_status,
  l.created_by,
  l.created_at,
  l.updated_at,
  p.name AS marketing_owner_name,
  p.email AS marketing_owner_email,
  cb.name AS created_by_name
FROM leads l
LEFT JOIN profiles p ON l.marketing_owner_user_id = p.user_id
LEFT JOIN profiles cb ON l.created_by = cb.user_id
WHERE l.triage_status IN ('New', 'In Review')
ORDER BY l.created_at DESC;

-- Sales inbox view (unclaimed leads in handover pool)
CREATE OR REPLACE VIEW v_sales_inbox AS
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
  hb.name AS handed_over_by_name,
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

-- Pipeline active view
CREATE OR REPLACE VIEW v_pipeline_active AS
SELECT
  o.opportunity_id,
  o.account_id,
  o.name AS opportunity_name,
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
  o.deal_value,
  o.created_at,
  o.updated_at,
  a.company_name AS account_name,
  a.pic_name AS account_pic,
  p.name AS owner_name,
  p.email AS owner_email,
  CASE WHEN o.next_step_due_date < CURRENT_DATE THEN true ELSE false END AS is_overdue
FROM opportunities o
INNER JOIN accounts a ON o.account_id = a.account_id
LEFT JOIN profiles p ON o.owner_user_id = p.user_id
WHERE o.stage NOT IN ('Closed Won', 'Closed Lost')
ORDER BY o.next_step_due_date ASC;

-- Pipeline with updates view
CREATE OR REPLACE VIEW v_pipeline_with_updates AS
SELECT
  o.opportunity_id,
  o.account_id,
  o.name AS opportunity_name,
  o.stage,
  o.estimated_value,
  o.deal_value,
  o.owner_user_id,
  o.next_step,
  o.next_step_due_date,
  o.created_at,
  o.updated_at,
  a.company_name AS account_name,
  p.name AS owner_name,
  pu.update_id AS latest_update_id,
  pu.approach_method AS latest_approach,
  pu.notes AS latest_notes,
  pu.updated_at AS latest_update_at,
  pu.evidence_url AS latest_evidence_url
FROM opportunities o
INNER JOIN accounts a ON o.account_id = a.account_id
LEFT JOIN profiles p ON o.owner_user_id = p.user_id
LEFT JOIN LATERAL (
  SELECT *
  FROM pipeline_updates
  WHERE opportunity_id = o.opportunity_id
  ORDER BY updated_at DESC
  LIMIT 1
) pu ON true
ORDER BY o.updated_at DESC;

-- Accounts enriched view
CREATE OR REPLACE VIEW v_accounts_enriched AS
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
  a.first_transaction_date,
  a.last_transaction_date,
  a.is_active,
  a.tags,
  a.notes,
  a.created_by,
  a.created_at,
  a.updated_at,
  p.name AS owner_name,
  p.email AS owner_email,
  COALESCE(opp_stats.open_opps, 0) AS open_opportunities,
  COALESCE(opp_stats.total_value, 0) AS pipeline_value,
  COALESCE(contact_count.cnt, 0) AS contact_count,
  COALESCE(activity_stats.planned_activities, 0) AS planned_activities,
  COALESCE(activity_stats.overdue_activities, 0) AS overdue_activities
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

-- Activities planner view
CREATE OR REPLACE VIEW v_activities_planner AS
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
  a.company_name AS account_name,
  o.name AS opportunity_name,
  l.company_name AS lead_company,
  p.name AS owner_name
FROM activities act
LEFT JOIN accounts a ON act.related_account_id = a.account_id
LEFT JOIN opportunities o ON act.related_opportunity_id = o.opportunity_id
LEFT JOIN leads l ON act.related_lead_id = l.lead_id
LEFT JOIN profiles p ON act.owner_user_id = p.user_id
WHERE act.status IN ('Planned', 'Done')
ORDER BY
  CASE act.status WHEN 'Planned' THEN 0 ELSE 1 END,
  act.due_date ASC;

-- Unified activities view (combines sales_plans and pipeline_updates)
CREATE OR REPLACE VIEW v_activities_unified AS
SELECT
  sp.plan_id AS activity_id,
  'sales_plan' AS source_type,
  sp.plan_type::text AS plan_type,
  COALESCE(sp.actual_activity_method, sp.planned_activity_method)::text AS activity_type,
  sp.company_name AS activity_detail,
  COALESCE(sp.realization_notes, sp.plan_notes) AS notes,
  sp.status,
  sp.planned_date::TIMESTAMPTZ AS scheduled_on,
  sp.realized_at AS completed_on,
  sp.evidence_url,
  sp.evidence_file_name,
  sp.location_lat,
  sp.location_lng,
  sp.location_address,
  sp.owner_user_id,
  COALESCE(sp.created_account_id, sp.source_account_id) AS account_id,
  sp.created_opportunity_id AS opportunity_id,
  sp.created_lead_id AS lead_id,
  sp.created_at,
  sp.potential_status::text AS potential_status,
  sp.pic_name,
  sp.pic_phone,
  sp.pic_email,
  p.name AS sales_name,
  COALESCE(a.company_name, sp.company_name) AS account_name
FROM sales_plans sp
LEFT JOIN profiles p ON sp.owner_user_id = p.user_id
LEFT JOIN accounts a ON COALESCE(sp.created_account_id, sp.source_account_id) = a.account_id

UNION ALL

SELECT
  pu.update_id AS activity_id,
  'pipeline_update' AS source_type,
  'pipeline' AS plan_type,
  pu.approach_method::text AS activity_type,
  CONCAT('Pipeline: ', pu.old_stage, ' -> ', pu.new_stage) AS activity_detail,
  pu.notes,
  'completed' AS status,
  pu.updated_at AS scheduled_on,
  pu.updated_at AS completed_on,
  pu.evidence_url,
  pu.evidence_file_name,
  pu.location_lat,
  pu.location_lng,
  pu.location_address,
  pu.updated_by AS owner_user_id,
  o.account_id,
  pu.opportunity_id,
  o.source_lead_id AS lead_id,
  pu.created_at,
  NULL AS potential_status,
  a.pic_name,
  a.pic_phone,
  a.pic_email,
  p.name AS sales_name,
  a.company_name AS account_name
FROM pipeline_updates pu
LEFT JOIN opportunities o ON pu.opportunity_id = o.opportunity_id
LEFT JOIN profiles p ON pu.updated_by = p.user_id
LEFT JOIN accounts a ON o.account_id = a.account_id;

-- Customer quotations enriched view
CREATE OR REPLACE VIEW v_customer_quotations_enriched AS
SELECT
  cq.*,
  t.ticket_code,
  t.subject AS ticket_subject,
  t.department AS ticket_department,
  t.status AS ticket_status,
  l.company_name AS lead_company,
  l.contact_name AS lead_contact,
  o.name AS opportunity_name,
  o.stage AS opportunity_stage,
  o.account_id AS opportunity_account_id,
  a.company_name AS account_name,
  p.name AS created_by_name
FROM customer_quotations cq
LEFT JOIN tickets t ON cq.ticket_id = t.id
LEFT JOIN leads l ON cq.lead_id = l.lead_id
LEFT JOIN opportunities o ON cq.opportunity_id = o.opportunity_id
LEFT JOIN accounts a ON o.account_id = a.account_id
LEFT JOIN profiles p ON cq.created_by = p.user_id;

-- Latest operational costs view
CREATE OR REPLACE VIEW v_latest_operational_costs AS
SELECT DISTINCT ON (ticket_id)
  id,
  ticket_id,
  quote_number,
  amount,
  currency,
  valid_until,
  status,
  rate_structure,
  created_by,
  created_at,
  updated_at
FROM ticket_rate_quotes
WHERE status = 'sent'
ORDER BY ticket_id, created_at DESC;

-- =====================================================
-- SECTION 15: GRANT PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_marketing() TO authenticated;
GRANT EXECUTE ON FUNCTION is_sales() TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_ticketing(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_ticketing_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_ticketing_ops(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_ticketing_department(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_role_category(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION format_duration(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_business_hours_seconds(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

GRANT SELECT ON v_lead_inbox TO authenticated;
GRANT SELECT ON v_sales_inbox TO authenticated;
GRANT SELECT ON v_pipeline_active TO authenticated;
GRANT SELECT ON v_pipeline_with_updates TO authenticated;
GRANT SELECT ON v_accounts_enriched TO authenticated;
GRANT SELECT ON v_activities_planner TO authenticated;
GRANT SELECT ON v_activities_unified TO authenticated;
GRANT SELECT ON v_customer_quotations_enriched TO authenticated;
GRANT SELECT ON v_latest_operational_costs TO authenticated;

-- =====================================================
-- SECTION 16: RPC FUNCTIONS
-- =====================================================

-- -----------------------------------------------------
-- IDEMPOTENCY HELPER FUNCTIONS
-- -----------------------------------------------------

CREATE OR REPLACE FUNCTION check_idempotency(p_key TEXT)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT result INTO v_result
  FROM idempotency_keys
  WHERE idempotency_key = p_key
    AND expires_at > NOW();
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION store_idempotency(p_key TEXT, p_operation TEXT, p_result JSONB)
RETURNS VOID AS $$
BEGIN
  INSERT INTO idempotency_keys (idempotency_key, operation, result, expires_at)
  VALUES (p_key, p_operation, p_result, NOW() + INTERVAL '24 hours')
  ON CONFLICT (idempotency_key) DO UPDATE SET
    result = EXCLUDED.result,
    expires_at = EXCLUDED.expires_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------
-- CRM RPC FUNCTIONS
-- -----------------------------------------------------

-- RPC_LEAD_TRIAGE - Handle triage status changes
CREATE OR REPLACE FUNCTION rpc_lead_triage(
  p_lead_id TEXT,
  p_new_status lead_triage_status,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_lead RECORD;
  v_existing JSONB;
  v_pool_id BIGINT;
  v_result JSONB;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_lead FROM leads WHERE lead_id = p_lead_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  IF v_lead.triage_status = 'Handed Over' THEN
    RAISE EXCEPTION 'Cannot change status of handed over lead';
  END IF;

  UPDATE leads SET
    triage_status = p_new_status,
    updated_at = NOW(),
    disqualified_at = CASE WHEN p_new_status = 'Disqualified' THEN NOW() ELSE NULL END,
    disqualification_reason = CASE WHEN p_new_status = 'Disqualified' THEN p_notes ELSE disqualification_reason END
  WHERE lead_id = p_lead_id;

  IF p_new_status = 'Qualified' THEN
    INSERT INTO lead_handover_pool (
      lead_id, handed_over_by, handover_notes, priority, expires_at
    ) VALUES (
      p_lead_id, auth.uid(), p_notes, 1, NOW() + INTERVAL '7 days'
    ) RETURNING pool_id INTO v_pool_id;

    UPDATE leads SET
      triage_status = 'Handed Over',
      handover_eligible = true,
      updated_at = NOW()
    WHERE lead_id = p_lead_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'new_status', p_new_status::TEXT,
    'pool_id', v_pool_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'triage-' || p_lead_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('leads', 'triage', 'lead', p_lead_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_LEAD_HANDOVER_TO_SALES_POOL - Manual handover
CREATE OR REPLACE FUNCTION rpc_lead_handover_to_sales_pool(
  p_lead_id TEXT,
  p_notes TEXT DEFAULT NULL,
  p_priority INTEGER DEFAULT 1,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_lead RECORD;
  v_existing JSONB;
  v_pool_id BIGINT;
  v_result JSONB;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_lead FROM leads WHERE lead_id = p_lead_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  IF v_lead.triage_status = 'Handed Over' THEN
    RAISE EXCEPTION 'Lead already handed over';
  END IF;

  INSERT INTO lead_handover_pool (
    lead_id, handed_over_by, handover_notes, priority, expires_at
  ) VALUES (
    p_lead_id, auth.uid(), p_notes, p_priority, NOW() + INTERVAL '7 days'
  ) RETURNING pool_id INTO v_pool_id;

  UPDATE leads SET
    triage_status = 'Handed Over',
    handover_eligible = true,
    updated_at = NOW()
  WHERE lead_id = p_lead_id;

  v_result := jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'pool_id', v_pool_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'handover-' || p_lead_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('leads', 'handover', 'lead', p_lead_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_SALES_CLAIM_LEAD - Atomic claim with race safety
CREATE OR REPLACE FUNCTION rpc_sales_claim_lead(
  p_pool_id BIGINT,
  p_create_account BOOLEAN DEFAULT true,
  p_create_opportunity BOOLEAN DEFAULT false,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_pool RECORD;
  v_lead RECORD;
  v_existing JSONB;
  v_account_id TEXT;
  v_opportunity_id TEXT;
  v_result JSONB;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_pool
  FROM lead_handover_pool
  WHERE pool_id = p_pool_id
    AND claimed_by IS NULL
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lead already claimed or not available'
    );
  END IF;

  SELECT * INTO v_lead FROM leads WHERE lead_id = v_pool.lead_id FOR UPDATE;

  UPDATE lead_handover_pool SET
    claimed_by = auth.uid(),
    claimed_at = NOW()
  WHERE pool_id = p_pool_id;

  UPDATE leads SET
    sales_owner_user_id = auth.uid(),
    claimed_at = NOW(),
    handover_eligible = false,
    updated_at = NOW()
  WHERE lead_id = v_pool.lead_id;

  IF p_create_account AND v_lead.customer_id IS NULL THEN
    v_account_id := 'ACC' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO accounts (
      account_id, company_name, pic_name, pic_email, pic_phone, industry, owner_user_id, created_by
    ) VALUES (
      v_account_id, v_lead.company_name, v_lead.pic_name, v_lead.pic_email, v_lead.pic_phone, v_lead.industry, auth.uid(), auth.uid()
    );

    UPDATE leads SET customer_id = v_account_id WHERE lead_id = v_pool.lead_id;
  ELSE
    v_account_id := v_lead.customer_id;
  END IF;

  IF p_create_opportunity AND v_account_id IS NOT NULL THEN
    v_opportunity_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO opportunities (
      opportunity_id, name, account_id, lead_id, stage, owner_user_id, created_by
    ) VALUES (
      v_opportunity_id, 'Opportunity from ' || v_lead.company_name, v_account_id, v_pool.lead_id, 'Prospecting', auth.uid(), auth.uid()
    );

    UPDATE leads SET opportunity_id = v_opportunity_id WHERE lead_id = v_pool.lead_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'pool_id', p_pool_id,
    'lead_id', v_pool.lead_id,
    'account_id', v_account_id,
    'opportunity_id', v_opportunity_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'claim-' || v_pool.lead_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('leads', 'claim', 'lead', v_pool.lead_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_LEAD_CONVERT - Convert lead to opportunity
CREATE OR REPLACE FUNCTION rpc_lead_convert(
  p_lead_id TEXT,
  p_opportunity_name TEXT,
  p_estimated_value NUMERIC DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_lead RECORD;
  v_existing JSONB;
  v_opportunity_id TEXT;
  v_account_id TEXT;
  v_result JSONB;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_lead FROM leads WHERE lead_id = p_lead_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  IF v_lead.opportunity_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lead already converted to opportunity: %', v_lead.opportunity_id;
  END IF;

  IF v_lead.customer_id IS NULL THEN
    v_account_id := 'ACC' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO accounts (
      account_id, company_name, pic_name, pic_email, pic_phone, industry, owner_user_id, created_by
    ) VALUES (
      v_account_id, v_lead.company_name, v_lead.pic_name, v_lead.pic_email, v_lead.pic_phone, v_lead.industry, auth.uid(), auth.uid()
    );

    UPDATE leads SET customer_id = v_account_id WHERE lead_id = p_lead_id;
  ELSE
    v_account_id := v_lead.customer_id;
  END IF;

  v_opportunity_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

  INSERT INTO opportunities (
    opportunity_id, name, account_id, lead_id, stage, estimated_value, owner_user_id, created_by
  ) VALUES (
    v_opportunity_id, p_opportunity_name, v_account_id, p_lead_id, 'Prospecting', p_estimated_value, auth.uid(), auth.uid()
  );

  UPDATE leads SET
    opportunity_id = v_opportunity_id,
    updated_at = NOW()
  WHERE lead_id = p_lead_id;

  v_result := jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'account_id', v_account_id,
    'opportunity_id', v_opportunity_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'convert-' || p_lead_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('leads', 'convert', 'lead', p_lead_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_OPPORTUNITY_CHANGE_STAGE - Stage transition
CREATE OR REPLACE FUNCTION rpc_opportunity_change_stage(
  p_opportunity_id TEXT,
  p_new_stage opportunity_stage,
  p_notes TEXT DEFAULT NULL,
  p_close_reason TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_opp RECORD;
  v_existing JSONB;
  v_result JSONB;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_opp FROM opportunities WHERE opportunity_id = p_opportunity_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opportunity not found: %', p_opportunity_id;
  END IF;

  IF v_opp.stage IN ('Closed Won', 'Closed Lost') THEN
    RAISE EXCEPTION 'Cannot change stage of closed opportunity';
  END IF;

  UPDATE opportunities SET
    stage = p_new_stage,
    close_reason = CASE WHEN p_new_stage IN ('Closed Won', 'Closed Lost') THEN p_close_reason ELSE close_reason END,
    closed_at = CASE WHEN p_new_stage IN ('Closed Won', 'Closed Lost') THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE opportunity_id = p_opportunity_id;

  v_result := jsonb_build_object(
    'success', true,
    'opportunity_id', p_opportunity_id,
    'old_stage', v_opp.stage::TEXT,
    'new_stage', p_new_stage::TEXT
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'stage_change-' || p_opportunity_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('opportunities', 'stage_change', 'opportunity', p_opportunity_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_TARGET_CONVERT - Convert target to account/opportunity
CREATE OR REPLACE FUNCTION rpc_target_convert(
  p_target_id TEXT,
  p_create_opportunity BOOLEAN DEFAULT true,
  p_opportunity_name TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_target RECORD;
  v_existing JSONB;
  v_account_id TEXT;
  v_opportunity_id TEXT;
  v_result JSONB;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_target FROM prospecting_targets WHERE target_id = p_target_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target not found: %', p_target_id;
  END IF;

  IF v_target.status = 'converted' THEN
    RAISE EXCEPTION 'Target already converted';
  END IF;

  IF v_target.converted_account_id IS NOT NULL THEN
    RAISE EXCEPTION 'Target already has account: %', v_target.converted_account_id;
  END IF;

  v_account_id := 'ACC' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

  INSERT INTO accounts (
    account_id, company_name, pic_name, pic_email, pic_phone, industry, owner_user_id, created_by
  ) VALUES (
    v_account_id, v_target.company_name, v_target.pic_name, v_target.pic_email, v_target.pic_phone, v_target.industry, auth.uid(), auth.uid()
  );

  IF p_create_opportunity THEN
    v_opportunity_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO opportunities (
      opportunity_id, name, account_id, stage, owner_user_id, created_by
    ) VALUES (
      v_opportunity_id, COALESCE(p_opportunity_name, 'Opportunity from ' || v_target.company_name), v_account_id, 'Prospecting', auth.uid(), auth.uid()
    );
  END IF;

  UPDATE prospecting_targets SET
    status = 'converted',
    converted_account_id = v_account_id,
    converted_at = NOW(),
    updated_at = NOW()
  WHERE target_id = p_target_id;

  v_result := jsonb_build_object(
    'success', true,
    'target_id', p_target_id,
    'account_id', v_account_id,
    'opportunity_id', v_opportunity_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'convert-' || p_target_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('targets', 'convert', 'target', p_target_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_ACTIVITY_COMPLETE_AND_NEXT - Complete + next
CREATE OR REPLACE FUNCTION rpc_activity_complete_and_next(
  p_activity_id TEXT,
  p_outcome TEXT DEFAULT NULL,
  p_create_follow_up BOOLEAN DEFAULT false,
  p_follow_up_days INTEGER DEFAULT 7,
  p_follow_up_type activity_type_v2 DEFAULT 'Task',
  p_follow_up_subject TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_activity RECORD;
  v_existing JSONB;
  v_follow_up_id TEXT;
  v_result JSONB;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_activity FROM activities WHERE activity_id = p_activity_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found: %', p_activity_id;
  END IF;

  IF v_activity.status = 'Done' THEN
    RAISE EXCEPTION 'Activity already completed';
  END IF;

  UPDATE activities SET
    status = 'Done',
    outcome = p_outcome,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE activity_id = p_activity_id;

  IF p_create_follow_up THEN
    v_follow_up_id := 'ACT' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO activities (
      activity_id, activity_type, subject, description, status, due_date,
      related_account_id, related_contact_id, related_opportunity_id, related_lead_id,
      owner_user_id, created_by
    ) VALUES (
      v_follow_up_id, p_follow_up_type, COALESCE(p_follow_up_subject, 'Follow-up: ' || v_activity.subject),
      'Follow-up from activity ' || p_activity_id, 'Planned', CURRENT_DATE + p_follow_up_days,
      v_activity.related_account_id, v_activity.related_contact_id, v_activity.related_opportunity_id, v_activity.related_lead_id,
      auth.uid(), auth.uid()
    );
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'activity_id', p_activity_id,
    'follow_up_id', v_follow_up_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'complete-' || p_activity_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('activities', 'complete', 'activity', p_activity_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_CADENCE_ADVANCE - Advance cadence to next step
CREATE OR REPLACE FUNCTION rpc_cadence_advance(
  p_enrollment_id BIGINT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_enrollment RECORD;
  v_next_step RECORD;
  v_existing JSONB;
  v_activity_id TEXT;
  v_result JSONB;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_enrollment FROM cadence_enrollments WHERE enrollment_id = p_enrollment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found: %', p_enrollment_id;
  END IF;

  IF v_enrollment.status != 'Active' THEN
    RAISE EXCEPTION 'Enrollment not active';
  END IF;

  SELECT * INTO v_next_step
  FROM cadence_steps
  WHERE cadence_id = v_enrollment.cadence_id
    AND step_number = v_enrollment.current_step + 1;

  IF NOT FOUND THEN
    UPDATE cadence_enrollments SET
      status = 'Completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE enrollment_id = p_enrollment_id;

    v_result := jsonb_build_object(
      'success', true,
      'enrollment_id', p_enrollment_id,
      'status', 'Completed'
    );
  ELSE
    UPDATE cadence_enrollments SET
      current_step = v_next_step.step_number,
      updated_at = NOW()
    WHERE enrollment_id = p_enrollment_id;

    v_activity_id := 'ACT' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO activities (
      activity_id, activity_type, subject, description, status, due_date,
      related_account_id, related_opportunity_id, cadence_enrollment_id, cadence_step_number,
      owner_user_id, created_by
    ) VALUES (
      v_activity_id, v_next_step.activity_type, v_next_step.subject_template, v_next_step.description_template,
      'Planned', CURRENT_DATE + v_next_step.delay_days,
      v_enrollment.account_id, v_enrollment.opportunity_id, p_enrollment_id, v_next_step.step_number,
      v_enrollment.enrolled_by, v_enrollment.enrolled_by
    );

    v_result := jsonb_build_object(
      'success', true,
      'enrollment_id', p_enrollment_id,
      'new_step', v_next_step.step_number,
      'activity_id', v_activity_id
    );
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'cadence-advance-' || p_enrollment_id, v_result);
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------
-- TICKETING RPC FUNCTIONS
-- -----------------------------------------------------

-- GENERATE TICKET CODE
CREATE OR REPLACE FUNCTION generate_ticket_code(
  p_ticket_type ticket_type,
  p_department ticketing_department
)
RETURNS VARCHAR(20) AS $$
DECLARE
  v_date_key VARCHAR(6);
  v_sequence INTEGER;
  v_ticket_code VARCHAR(20);
BEGIN
  v_date_key := TO_CHAR(CURRENT_DATE, 'DDMMYY');

  INSERT INTO ticket_sequences (ticket_type, department, date_key, last_sequence)
  VALUES (p_ticket_type, p_department, v_date_key, 1)
  ON CONFLICT (ticket_type, department, date_key)
  DO UPDATE SET
    last_sequence = ticket_sequences.last_sequence + 1,
    updated_at = NOW()
  RETURNING last_sequence INTO v_sequence;

  v_ticket_code := p_ticket_type::TEXT || p_department::TEXT || v_date_key || LPAD(v_sequence::TEXT, 3, '0');

  RETURN v_ticket_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GENERATE TICKET QUOTE NUMBER
CREATE OR REPLACE FUNCTION generate_ticket_quote_number(p_ticket_id UUID)
RETURNS VARCHAR(30) AS $$
DECLARE
  v_ticket_code VARCHAR(20);
  v_quote_count INTEGER;
  v_quote_number VARCHAR(30);
BEGIN
  SELECT ticket_code INTO v_ticket_code
  FROM tickets
  WHERE id = p_ticket_id;

  IF v_ticket_code IS NULL THEN
    RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
  END IF;

  SELECT COUNT(*) + 1 INTO v_quote_count
  FROM ticket_rate_quotes
  WHERE ticket_id = p_ticket_id;

  v_quote_number := 'QT-' || v_ticket_code || '-' || LPAD(v_quote_count::TEXT, 3, '0');

  RETURN v_quote_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_TICKET_CREATE - Creates ticket with auto-generated code and SLA tracking
CREATE OR REPLACE FUNCTION rpc_ticket_create(
  p_ticket_type ticket_type,
  p_subject VARCHAR(255),
  p_description TEXT,
  p_department ticketing_department,
  p_priority ticket_priority DEFAULT 'medium',
  p_account_id TEXT DEFAULT NULL,
  p_contact_id TEXT DEFAULT NULL,
  p_rfq_data JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_ticket_code VARCHAR(20);
  v_ticket tickets;
  v_sla_config ticketing_sla_config;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT can_access_ticketing(v_user_id) THEN
    RAISE EXCEPTION 'Access denied: User cannot access ticketing';
  END IF;

  v_ticket_code := generate_ticket_code(p_ticket_type, p_department);

  INSERT INTO tickets (
    ticket_code, ticket_type, subject, description, department, created_by, priority, account_id, contact_id, rfq_data, status
  ) VALUES (
    v_ticket_code, p_ticket_type, p_subject, p_description, p_department, v_user_id, p_priority, p_account_id, p_contact_id, p_rfq_data, 'open'
  ) RETURNING * INTO v_ticket;

  SELECT * INTO v_sla_config
  FROM ticketing_sla_config
  WHERE department = p_department
  AND ticket_type = p_ticket_type;

  IF v_sla_config IS NOT NULL THEN
    INSERT INTO ticket_sla_tracking (ticket_id, first_response_sla_hours, resolution_sla_hours)
    VALUES (v_ticket.id, v_sla_config.first_response_hours, v_sla_config.resolution_hours);
  ELSE
    INSERT INTO ticket_sla_tracking (ticket_id, first_response_sla_hours, resolution_sla_hours)
    VALUES (v_ticket.id, 4, 48);
  END IF;

  INSERT INTO ticket_events (ticket_id, event_type, actor_user_id, new_value, notes)
  VALUES (
    v_ticket.id, 'created', v_user_id,
    jsonb_build_object('ticket_code', v_ticket.ticket_code, 'ticket_type', v_ticket.ticket_type, 'subject', v_ticket.subject, 'department', v_ticket.department, 'priority', v_ticket.priority),
    'Ticket created'
  );

  RETURN jsonb_build_object('success', TRUE, 'ticket_id', v_ticket.id, 'ticket_code', v_ticket.ticket_code);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_TICKET_ASSIGN - Assigns ticket to user with history tracking
CREATE OR REPLACE FUNCTION rpc_ticket_assign(
  p_ticket_id UUID,
  p_assigned_to UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_ticket tickets;
  v_old_assignee UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (is_ticketing_admin(v_user_id) OR is_ticketing_ops(v_user_id)) THEN
    RAISE EXCEPTION 'Access denied: Only Ops or Admin can assign tickets';
  END IF;

  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id FOR UPDATE;

  IF v_ticket IS NULL THEN
    RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
  END IF;

  v_old_assignee := v_ticket.assigned_to;

  UPDATE tickets
  SET
    assigned_to = p_assigned_to,
    status = CASE WHEN status = 'open' THEN 'in_progress'::ticket_status ELSE status END,
    updated_at = NOW()
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  INSERT INTO ticket_assignments (ticket_id, assigned_to, assigned_by, notes)
  VALUES (p_ticket_id, p_assigned_to, v_user_id, p_notes);

  INSERT INTO ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes)
  VALUES (
    p_ticket_id,
    CASE WHEN v_old_assignee IS NULL THEN 'assigned'::ticket_event_type ELSE 'reassigned'::ticket_event_type END,
    v_user_id,
    CASE WHEN v_old_assignee IS NOT NULL THEN jsonb_build_object('assigned_to', v_old_assignee) ELSE NULL END,
    jsonb_build_object('assigned_to', p_assigned_to),
    p_notes
  );

  IF v_old_assignee IS NULL THEN
    UPDATE ticket_sla_tracking
    SET first_response_at = NOW(), first_response_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= first_response_sla_hours, updated_at = NOW()
    WHERE ticket_id = p_ticket_id AND first_response_at IS NULL;

    UPDATE tickets SET first_response_at = NOW() WHERE id = p_ticket_id AND first_response_at IS NULL;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'ticket_id', v_ticket.id, 'assigned_to', p_assigned_to);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_TICKET_TRANSITION - Changes ticket status with validation and audit
CREATE OR REPLACE FUNCTION rpc_ticket_transition(
  p_ticket_id UUID,
  p_new_status ticket_status,
  p_notes TEXT DEFAULT NULL,
  p_close_outcome ticket_close_outcome DEFAULT NULL,
  p_close_reason TEXT DEFAULT NULL,
  p_competitor_name VARCHAR(255) DEFAULT NULL,
  p_competitor_cost DECIMAL(15,2) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_ticket tickets;
  v_old_status ticket_status;
  v_allowed_transitions TEXT[];
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id FOR UPDATE;

  IF v_ticket IS NULL THEN
    RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
  END IF;

  v_old_status := v_ticket.status;

  CASE v_old_status
    WHEN 'open' THEN v_allowed_transitions := ARRAY['in_progress', 'pending', 'closed'];
    WHEN 'need_response' THEN v_allowed_transitions := ARRAY['in_progress', 'waiting_customer', 'resolved', 'closed'];
    WHEN 'in_progress' THEN v_allowed_transitions := ARRAY['need_response', 'waiting_customer', 'need_adjustment', 'pending', 'resolved', 'closed'];
    WHEN 'waiting_customer' THEN v_allowed_transitions := ARRAY['in_progress', 'need_adjustment', 'resolved', 'closed'];
    WHEN 'need_adjustment' THEN v_allowed_transitions := ARRAY['in_progress', 'resolved', 'closed'];
    WHEN 'pending' THEN v_allowed_transitions := ARRAY['open', 'in_progress', 'resolved', 'closed'];
    WHEN 'resolved' THEN v_allowed_transitions := ARRAY['closed', 'in_progress'];
    WHEN 'closed' THEN v_allowed_transitions := ARRAY['open'];
    ELSE v_allowed_transitions := ARRAY[]::TEXT[];
  END CASE;

  IF NOT (p_new_status::TEXT = ANY(v_allowed_transitions)) THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', v_old_status, p_new_status;
  END IF;

  UPDATE tickets
  SET
    status = p_new_status,
    updated_at = NOW(),
    resolved_at = CASE WHEN p_new_status = 'resolved' AND resolved_at IS NULL THEN NOW() ELSE resolved_at END,
    closed_at = CASE WHEN p_new_status = 'closed' THEN NOW() ELSE closed_at END,
    close_outcome = COALESCE(p_close_outcome, close_outcome),
    close_reason = COALESCE(p_close_reason, close_reason),
    competitor_name = COALESCE(p_competitor_name, competitor_name),
    competitor_cost = COALESCE(p_competitor_cost, competitor_cost)
  WHERE id = p_ticket_id
  RETURNING * INTO v_ticket;

  INSERT INTO ticket_events (ticket_id, event_type, actor_user_id, old_value, new_value, notes)
  VALUES (
    p_ticket_id,
    CASE
      WHEN p_new_status = 'resolved' THEN 'resolved'::ticket_event_type
      WHEN p_new_status = 'closed' THEN 'closed'::ticket_event_type
      WHEN v_old_status = 'closed' AND p_new_status = 'open' THEN 'reopened'::ticket_event_type
      ELSE 'status_changed'::ticket_event_type
    END,
    v_user_id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status, 'close_outcome', p_close_outcome, 'close_reason', p_close_reason),
    p_notes
  );

  IF p_new_status IN ('resolved', 'closed') THEN
    UPDATE ticket_sla_tracking
    SET resolution_at = NOW(), resolution_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= resolution_sla_hours, updated_at = NOW()
    WHERE ticket_id = p_ticket_id AND resolution_at IS NULL;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'ticket_id', v_ticket.id, 'old_status', v_old_status, 'new_status', p_new_status);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_TICKET_ADD_COMMENT - Adds comment to ticket with event tracking
CREATE OR REPLACE FUNCTION rpc_ticket_add_comment(
  p_ticket_id UUID,
  p_content TEXT,
  p_is_internal BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_ticket tickets;
  v_comment ticket_comments;
  v_response_time INTEGER;
  v_last_comment_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_is_internal AND NOT (is_ticketing_admin(v_user_id) OR is_ticketing_ops(v_user_id)) THEN
    RAISE EXCEPTION 'Only Ops or Admin can create internal comments';
  END IF;

  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;

  IF v_ticket IS NULL THEN
    RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
  END IF;

  IF NOT p_is_internal THEN
    SELECT created_at INTO v_last_comment_at
    FROM ticket_comments
    WHERE ticket_id = p_ticket_id AND is_internal = FALSE
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_comment_at IS NOT NULL THEN
      v_response_time := EXTRACT(EPOCH FROM (NOW() - v_last_comment_at))::INTEGER;
    ELSE
      v_response_time := EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at))::INTEGER;
    END IF;
  END IF;

  INSERT INTO ticket_comments (ticket_id, user_id, content, is_internal, response_time_seconds, response_direction)
  VALUES (
    p_ticket_id, v_user_id, p_content, p_is_internal, v_response_time,
    CASE WHEN v_user_id = v_ticket.created_by THEN 'inbound' ELSE 'outbound' END
  ) RETURNING * INTO v_comment;

  INSERT INTO ticket_events (ticket_id, event_type, actor_user_id, new_value, notes)
  VALUES (
    p_ticket_id, 'comment_added', v_user_id,
    jsonb_build_object('comment_id', v_comment.id, 'is_internal', p_is_internal),
    CASE WHEN p_is_internal THEN 'Internal note added' ELSE 'Comment added' END
  );

  IF NOT p_is_internal AND v_user_id != v_ticket.created_by THEN
    UPDATE ticket_sla_tracking
    SET first_response_at = NOW(), first_response_met = EXTRACT(EPOCH FROM (NOW() - v_ticket.created_at)) / 3600 <= first_response_sla_hours, updated_at = NOW()
    WHERE ticket_id = p_ticket_id AND first_response_at IS NULL;

    UPDATE tickets SET first_response_at = NOW() WHERE id = p_ticket_id AND first_response_at IS NULL;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'comment_id', v_comment.id, 'ticket_id', p_ticket_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_TICKET_CREATE_QUOTE - Creates rate quote for RFQ ticket
CREATE OR REPLACE FUNCTION rpc_ticket_create_quote(
  p_ticket_id UUID,
  p_amount DECIMAL(15,2),
  p_currency VARCHAR(3),
  p_valid_until DATE,
  p_terms TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_ticket tickets;
  v_quote_number VARCHAR(30);
  v_quote ticket_rate_quotes;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (is_ticketing_admin(v_user_id) OR is_ticketing_ops(v_user_id)) THEN
    RAISE EXCEPTION 'Access denied: Only Ops or Admin can create quotes';
  END IF;

  SELECT * INTO v_ticket FROM tickets WHERE id = p_ticket_id;

  IF v_ticket IS NULL THEN
    RAISE EXCEPTION 'Ticket not found: %', p_ticket_id;
  END IF;

  IF v_ticket.ticket_type != 'RFQ' THEN
    RAISE EXCEPTION 'Quotes can only be created for RFQ tickets';
  END IF;

  v_quote_number := generate_ticket_quote_number(p_ticket_id);

  INSERT INTO ticket_rate_quotes (ticket_id, quote_number, amount, currency, valid_until, terms, status, created_by)
  VALUES (p_ticket_id, v_quote_number, p_amount, p_currency, p_valid_until, p_terms, 'draft', v_user_id)
  RETURNING * INTO v_quote;

  INSERT INTO ticket_events (ticket_id, event_type, actor_user_id, new_value, notes)
  VALUES (
    p_ticket_id, 'quote_created', v_user_id,
    jsonb_build_object('quote_id', v_quote.id, 'quote_number', v_quote.quote_number, 'amount', v_quote.amount, 'currency', v_quote.currency),
    'Rate quote created'
  );

  RETURN jsonb_build_object('success', TRUE, 'quote_id', v_quote.id, 'quote_number', v_quote.quote_number);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC_TICKETING_DASHBOARD_SUMMARY - Returns dashboard summary metrics
CREATE OR REPLACE FUNCTION rpc_ticketing_dashboard_summary(
  p_department ticketing_department DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_result JSONB;
  v_total INTEGER;
  v_open INTEGER;
  v_in_progress INTEGER;
  v_pending INTEGER;
  v_resolved INTEGER;
  v_closed INTEGER;
  v_by_department JSONB;
  v_by_status JSONB;
  v_by_priority JSONB;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT can_access_ticketing(v_user_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF is_ticketing_admin(v_user_id) THEN
    SELECT COUNT(*) INTO v_total FROM tickets WHERE (p_department IS NULL OR department = p_department);
    SELECT COUNT(*) INTO v_open FROM tickets WHERE status = 'open' AND (p_department IS NULL OR department = p_department);
    SELECT COUNT(*) INTO v_in_progress FROM tickets WHERE status = 'in_progress' AND (p_department IS NULL OR department = p_department);
    SELECT COUNT(*) INTO v_pending FROM tickets WHERE status = 'pending' AND (p_department IS NULL OR department = p_department);
    SELECT COUNT(*) INTO v_resolved FROM tickets WHERE status = 'resolved' AND (p_department IS NULL OR department = p_department);
    SELECT COUNT(*) INTO v_closed FROM tickets WHERE status = 'closed' AND (p_department IS NULL OR department = p_department);

    SELECT COALESCE(jsonb_agg(jsonb_build_object('department', department::TEXT, 'count', cnt)), '[]'::jsonb)
    INTO v_by_department
    FROM (SELECT department, COUNT(*) as cnt FROM tickets WHERE p_department IS NULL OR department = p_department GROUP BY department ORDER BY cnt DESC) t;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('priority', priority::TEXT, 'count', cnt)), '[]'::jsonb)
    INTO v_by_priority
    FROM (SELECT priority, COUNT(*) as cnt FROM tickets WHERE p_department IS NULL OR department = p_department GROUP BY priority ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END) t;
  ELSE
    SELECT COUNT(*) INTO v_total FROM tickets WHERE (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);
    SELECT COUNT(*) INTO v_open FROM tickets WHERE status = 'open' AND (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);
    SELECT COUNT(*) INTO v_in_progress FROM tickets WHERE status = 'in_progress' AND (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);
    SELECT COUNT(*) INTO v_pending FROM tickets WHERE status = 'pending' AND (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);
    SELECT COUNT(*) INTO v_resolved FROM tickets WHERE status = 'resolved' AND (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);
    SELECT COUNT(*) INTO v_closed FROM tickets WHERE status = 'closed' AND (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department);

    v_by_department := '[]'::jsonb;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('priority', priority::TEXT, 'count', cnt)), '[]'::jsonb)
    INTO v_by_priority
    FROM (SELECT priority, COUNT(*) as cnt FROM tickets WHERE (created_by = v_user_id OR assigned_to = v_user_id) AND (p_department IS NULL OR department = p_department) GROUP BY priority) t;
  END IF;

  v_by_status := jsonb_build_array(
    jsonb_build_object('status', 'open', 'count', v_open),
    jsonb_build_object('status', 'in_progress', 'count', v_in_progress),
    jsonb_build_object('status', 'pending', 'count', v_pending),
    jsonb_build_object('status', 'resolved', 'count', v_resolved),
    jsonb_build_object('status', 'closed', 'count', v_closed)
  );

  v_result := jsonb_build_object(
    'total_tickets', v_total,
    'open_tickets', v_open,
    'in_progress_tickets', v_in_progress,
    'pending_tickets', v_pending,
    'resolved_tickets', v_resolved,
    'closed_tickets', v_closed,
    'tickets_by_department', v_by_department,
    'tickets_by_status', v_by_status,
    'tickets_by_priority', v_by_priority
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permissions for RPC functions
GRANT EXECUTE ON FUNCTION check_idempotency(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION store_idempotency(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_lead_triage(TEXT, lead_triage_status, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_lead_handover_to_sales_pool(TEXT, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_sales_claim_lead(BIGINT, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_lead_convert(TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_opportunity_change_stage(TEXT, opportunity_stage, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_target_convert(TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_activity_complete_and_next(TEXT, TEXT, BOOLEAN, INTEGER, activity_type_v2, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_cadence_advance(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_ticket_code(ticket_type, ticketing_department) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_ticket_quote_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_ticket_create(ticket_type, VARCHAR, TEXT, ticketing_department, ticket_priority, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_ticket_assign(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_ticket_transition(UUID, ticket_status, TEXT, ticket_close_outcome, TEXT, VARCHAR, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_ticket_add_comment(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_ticket_create_quote(UUID, DECIMAL, VARCHAR, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_ticketing_dashboard_summary(ticketing_department) TO authenticated;

-- =====================================================
-- END OF SCHEMA
-- =====================================================
