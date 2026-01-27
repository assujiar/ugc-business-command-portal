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
-- END OF SCHEMA
-- =====================================================
