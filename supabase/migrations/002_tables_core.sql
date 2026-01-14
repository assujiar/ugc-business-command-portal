-- =====================================================
-- Migration 002: Core Tables (Profiles, Accounts, Contacts)
-- SOURCE: PDF Section 6, Pages 21-23
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PROFILES TABLE (User Profiles)
-- =====================================================
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'salesperson',
  department TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_department ON profiles(department);

-- =====================================================
-- ACCOUNTS TABLE (Customer Accounts)
-- SOURCE: PDF Pages 22-23
-- =====================================================
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
  first_deal_date TIMESTAMPTZ,
  last_transaction_date TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  tags TEXT[],
  notes TEXT,
  dedupe_key TEXT UNIQUE,
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

-- Function to generate account ID
CREATE OR REPLACE FUNCTION generate_account_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.account_id IS NULL THEN
    NEW.account_id := 'ACCT' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
  END IF;

  -- Generate dedupe_key if not provided
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

-- =====================================================
-- CONTACTS TABLE
-- SOURCE: PDF Page 23
-- =====================================================
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

-- Function to generate contact ID
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

COMMENT ON TABLE profiles IS 'User profiles linked to auth.users - SOURCE: PDF Section 6';
COMMENT ON TABLE accounts IS 'Customer/company accounts - SSOT for customer data';
COMMENT ON TABLE contacts IS 'Contacts linked to accounts';
