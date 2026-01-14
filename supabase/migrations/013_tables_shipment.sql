-- =====================================================
-- Migration 012: Shipment Details Tables and Enums
-- For tracking shipment requirements in leads
-- =====================================================

-- =====================================================
-- ENUMS FOR SHIPMENT DETAILS
-- =====================================================

-- Department Owner for Service Types
CREATE TYPE department_owner AS ENUM (
  'Domestics Operations',
  'Exim Operations',
  'Import DTD Operations'
);

-- Service Type Enum
CREATE TYPE service_type AS ENUM (
  -- Domestics Operations
  'LTL',
  'FTL',
  'AF',
  'LCL',
  'FCL',
  'WAREHOUSING',
  'FULFILLMENT',
  -- Exim Operations
  'LCL Export',
  'FCL Export',
  'Airfreight Export',
  'LCL Import',
  'FCL Import',
  'Airfreight Import',
  'Customs Clearance',
  -- Import DTD Operations
  'LCL DTD',
  'FCL DTD',
  'Airfreight DTD'
);

-- Fleet Type Enum (for Domestics Operations)
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

-- Incoterms Enum (for Export/Import services)
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

-- Cargo Category Enum
CREATE TYPE cargo_category AS ENUM (
  'General Cargo',
  'Dangerous Goods'
);

-- Unit of Measure Enum
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

-- Additional Service Enum
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

-- =====================================================
-- SERVICE TYPES REFERENCE TABLE
-- Maps service types to department owners
-- =====================================================
CREATE TABLE service_types (
  id SERIAL PRIMARY KEY,
  service_code TEXT UNIQUE NOT NULL,
  service_name TEXT NOT NULL,
  department department_owner NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default service types with department mapping
INSERT INTO service_types (service_code, service_name, department, description) VALUES
  -- Domestics Operations
  ('LTL', 'LTL', 'Domestics Operations', 'Less Than Truckload'),
  ('FTL', 'FTL', 'Domestics Operations', 'Full Truckload'),
  ('AF', 'AF', 'Domestics Operations', 'Air Freight Domestic'),
  ('LCL', 'LCL', 'Domestics Operations', 'Less Container Load Domestic'),
  ('FCL', 'FCL', 'Domestics Operations', 'Full Container Load Domestic'),
  ('WAREHOUSING', 'WAREHOUSING', 'Domestics Operations', 'Warehousing Services'),
  ('FULFILLMENT', 'FULFILLMENT', 'Domestics Operations', 'Fulfillment Services'),
  -- Exim Operations
  ('LCL_EXPORT', 'LCL Export', 'Exim Operations', 'LCL Export Services'),
  ('FCL_EXPORT', 'FCL Export', 'Exim Operations', 'FCL Export Services'),
  ('AIRFREIGHT_EXPORT', 'Airfreight Export', 'Exim Operations', 'Airfreight Export Services'),
  ('LCL_IMPORT', 'LCL Import', 'Exim Operations', 'LCL Import Services'),
  ('FCL_IMPORT', 'FCL Import', 'Exim Operations', 'FCL Import Services'),
  ('AIRFREIGHT_IMPORT', 'Airfreight Import', 'Exim Operations', 'Airfreight Import Services'),
  ('CUSTOMS_CLEARANCE', 'Customs Clearance', 'Exim Operations', 'Customs Clearance Services'),
  -- Import DTD Operations
  ('LCL_DTD', 'LCL DTD', 'Import DTD Operations', 'LCL Door to Door'),
  ('FCL_DTD', 'FCL DTD', 'Import DTD Operations', 'FCL Door to Door'),
  ('AIRFREIGHT_DTD', 'Airfreight DTD', 'Import DTD Operations', 'Airfreight Door to Door');

CREATE INDEX idx_service_types_department ON service_types(department);
CREATE INDEX idx_service_types_active ON service_types(is_active) WHERE is_active = true;

-- =====================================================
-- SHIPMENT DETAILS TABLE
-- Linked to leads for shipment requirements
-- =====================================================
CREATE TABLE shipment_details (
  shipment_detail_id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(lead_id) ON DELETE CASCADE,

  -- Service Information
  service_type_id INTEGER REFERENCES service_types(id),
  service_type_code TEXT,
  department department_owner,

  -- Fleet (for Domestics Operations)
  fleet_type fleet_type,
  fleet_quantity INTEGER DEFAULT 1,

  -- Incoterms (for Export/Import)
  incoterm incoterm,

  -- Cargo Information
  cargo_category cargo_category DEFAULT 'General Cargo',
  cargo_description TEXT,

  -- Origin Details
  origin_address TEXT,
  origin_city TEXT,
  origin_country TEXT DEFAULT 'Indonesia',

  -- Destination Details
  destination_address TEXT,
  destination_city TEXT,
  destination_country TEXT DEFAULT 'Indonesia',

  -- Quantity & Dimensions
  quantity INTEGER DEFAULT 1,
  unit_of_measure unit_of_measure DEFAULT 'Boxes',
  weight_per_unit_kg DECIMAL(10, 2),
  weight_total_kg DECIMAL(10, 2),
  length_cm DECIMAL(10, 2),
  width_cm DECIMAL(10, 2),
  height_cm DECIMAL(10, 2),
  volume_total_cbm DECIMAL(10, 4),

  -- Scope & Services
  scope_of_work TEXT,
  additional_services additional_service[],

  -- Notes
  notes TEXT,

  -- Audit
  created_by UUID REFERENCES profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_shipment_lead ON shipment_details(lead_id);
CREATE INDEX idx_shipment_service ON shipment_details(service_type_id);
CREATE INDEX idx_shipment_department ON shipment_details(department);

-- Function to generate shipment detail ID
CREATE OR REPLACE FUNCTION generate_shipment_detail_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.shipment_detail_id IS NULL THEN
    NEW.shipment_detail_id := 'SHIP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;

  -- Auto-calculate weight_total_kg
  IF NEW.quantity IS NOT NULL AND NEW.weight_per_unit_kg IS NOT NULL THEN
    NEW.weight_total_kg := NEW.quantity * NEW.weight_per_unit_kg;
  END IF;

  -- Auto-calculate volume_total_cbm (length x width x height x quantity in CBM)
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

-- Trigger for updates
CREATE OR REPLACE FUNCTION update_shipment_calculations()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-calculate weight_total_kg
  IF NEW.quantity IS NOT NULL AND NEW.weight_per_unit_kg IS NOT NULL THEN
    NEW.weight_total_kg := NEW.quantity * NEW.weight_per_unit_kg;
  END IF;

  -- Auto-calculate volume_total_cbm
  IF NEW.length_cm IS NOT NULL AND NEW.width_cm IS NOT NULL AND NEW.height_cm IS NOT NULL AND NEW.quantity IS NOT NULL THEN
    NEW.volume_total_cbm := (NEW.length_cm * NEW.width_cm * NEW.height_cm * NEW.quantity) / 1000000;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_shipment_update
  BEFORE UPDATE ON shipment_details
  FOR EACH ROW
  EXECUTE FUNCTION update_shipment_calculations();

-- =====================================================
-- SHIPMENT ATTACHMENTS TABLE
-- For storing file attachments related to shipments
-- =====================================================
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

-- Function to generate attachment ID
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

COMMENT ON TABLE service_types IS 'Reference table for service types with department mapping';
COMMENT ON TABLE shipment_details IS 'Shipment details linked to leads';
COMMENT ON TABLE shipment_attachments IS 'File attachments for shipment details';
