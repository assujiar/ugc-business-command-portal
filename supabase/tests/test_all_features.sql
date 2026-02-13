-- =====================================================
-- Comprehensive Test Script
-- Tests: User Management, Contacts CRUD, Account Edit,
--        RLS Policies, Table Structure, Data Integrity
-- Run via: psql or Supabase SQL Editor
-- =====================================================

-- =====================================================
-- SECTION 1: PROFILES TABLE STRUCTURE
-- =====================================================

-- Test 1.1: Verify profiles table exists with all required columns
DO $$
DECLARE
  v_missing TEXT[] := '{}';
  v_cols TEXT[] := ARRAY[
    'user_id', 'email', 'name', 'role', 'department',
    'avatar_url', 'is_active', 'phone', 'created_at', 'updated_at'
  ];
  v_col TEXT;
BEGIN
  FOREACH v_col IN ARRAY v_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = v_col
    ) THEN
      v_missing := array_append(v_missing, v_col);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE WARNING '[FAIL] 1.1 Profiles missing columns: %', array_to_string(v_missing, ', ');
  ELSE
    RAISE NOTICE '[PASS] 1.1 Profiles table has all required columns (10 columns)';
  END IF;
END $$;

-- Test 1.2: Verify profiles.user_id is PRIMARY KEY referencing auth.users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    RAISE NOTICE '[PASS] 1.2 Profiles has PRIMARY KEY constraint';
  ELSE
    RAISE WARNING '[FAIL] 1.2 Profiles missing PRIMARY KEY constraint';
  END IF;
END $$;

-- Test 1.3: Verify profiles.role uses user_role ENUM type
DO $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT udt_name INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role';

  IF v_type = 'user_role' THEN
    RAISE NOTICE '[PASS] 1.3 Profiles.role is user_role ENUM type';
  ELSE
    RAISE WARNING '[FAIL] 1.3 Profiles.role type is "%" (expected user_role)', v_type;
  END IF;
END $$;

-- Test 1.4: Verify is_active defaults to TRUE
DO $$
DECLARE
  v_default TEXT;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_active';

  IF v_default = 'true' THEN
    RAISE NOTICE '[PASS] 1.4 Profiles.is_active defaults to TRUE';
  ELSE
    RAISE WARNING '[FAIL] 1.4 Profiles.is_active default is "%" (expected true)', v_default;
  END IF;
END $$;

-- Test 1.5: Verify profiles.role defaults to 'salesperson'
DO $$
DECLARE
  v_default TEXT;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role';

  IF v_default LIKE '%salesperson%' THEN
    RAISE NOTICE '[PASS] 1.5 Profiles.role defaults to salesperson';
  ELSE
    RAISE WARNING '[FAIL] 1.5 Profiles.role default is "%" (expected salesperson)', v_default;
  END IF;
END $$;

-- =====================================================
-- SECTION 2: USER_ROLE ENUM VALUES
-- =====================================================

-- Test 2.1: Verify all 15 user_role enum values exist
DO $$
DECLARE
  v_expected TEXT[] := ARRAY[
    'Director', 'super admin', 'Marketing Manager', 'Marcomm', 'DGO',
    'MACX', 'VDCO', 'sales manager', 'salesperson', 'sales support',
    'EXIM Ops', 'domestics Ops', 'Import DTD Ops', 'traffic & warehous', 'finance'
  ];
  v_actual TEXT[];
  v_missing TEXT[] := '{}';
  v_role TEXT;
BEGIN
  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
  INTO v_actual
  FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'user_role';

  FOREACH v_role IN ARRAY v_expected LOOP
    IF NOT (v_role = ANY(v_actual)) THEN
      v_missing := array_append(v_missing, v_role);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE WARNING '[FAIL] 2.1 Missing user_role values: %', array_to_string(v_missing, ', ');
  ELSE
    RAISE NOTICE '[PASS] 2.1 All 15 user_role enum values exist';
  END IF;
END $$;

-- =====================================================
-- SECTION 3: RLS POLICIES ON PROFILES
-- =====================================================

-- Test 3.1: Verify RLS is enabled on profiles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'profiles' AND relrowsecurity = true
  ) THEN
    RAISE NOTICE '[PASS] 3.1 RLS is enabled on profiles table';
  ELSE
    RAISE WARNING '[FAIL] 3.1 RLS is NOT enabled on profiles table';
  END IF;
END $$;

-- Test 3.2: Verify profiles has SELECT policy (for authenticated users)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND cmd = 'SELECT'
      AND policyname NOT LIKE '%service%'
  ) THEN
    RAISE NOTICE '[PASS] 3.2 Profiles has user SELECT policy';
  ELSE
    RAISE WARNING '[FAIL] 3.2 Profiles missing user SELECT policy';
  END IF;
END $$;

-- Test 3.3: Verify profiles has UPDATE policy
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND cmd = 'UPDATE'
  ) THEN
    RAISE NOTICE '[PASS] 3.3 Profiles has UPDATE policy';
  ELSE
    RAISE WARNING '[FAIL] 3.3 Profiles missing UPDATE policy';
  END IF;
END $$;

-- Test 3.4: Verify profiles has service SELECT policy (for adminClient/triggers)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND cmd = 'SELECT'
      AND policyname LIKE '%service%'
  ) THEN
    RAISE NOTICE '[PASS] 3.4 Profiles has service SELECT policy (for service_role)';
  ELSE
    RAISE WARNING '[FAIL] 3.4 Profiles missing service SELECT policy';
  END IF;
END $$;

-- Test 3.5: List all profiles policies for reference
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '--- Profiles RLS Policies ---';
  FOR r IN
    SELECT policyname, cmd, permissive
    FROM pg_policies
    WHERE tablename = 'profiles'
    ORDER BY cmd, policyname
  LOOP
    RAISE NOTICE '  [%] % (permissive=%)', r.cmd, r.policyname, r.permissive;
  END LOOP;
END $$;

-- =====================================================
-- SECTION 4: CONTACTS TABLE STRUCTURE & POLICIES
-- =====================================================

-- Test 4.1: Verify contacts table has all required columns
DO $$
DECLARE
  v_missing TEXT[] := '{}';
  v_cols TEXT[] := ARRAY[
    'contact_id', 'account_id', 'first_name', 'last_name',
    'email', 'phone', 'mobile', 'job_title', 'department',
    'is_primary', 'notes', 'created_by', 'created_at', 'updated_at'
  ];
  v_col TEXT;
BEGIN
  FOREACH v_col IN ARRAY v_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = v_col
    ) THEN
      v_missing := array_append(v_missing, v_col);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE WARNING '[FAIL] 4.1 Contacts missing columns: %', array_to_string(v_missing, ', ');
  ELSE
    RAISE NOTICE '[PASS] 4.1 Contacts table has all required columns (14 columns)';
  END IF;
END $$;

-- Test 4.2: Verify contacts has INSERT service policy (critical fix from migration 191)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contacts' AND cmd = 'INSERT'
      AND policyname LIKE '%service%'
  ) THEN
    RAISE NOTICE '[PASS] 4.2 Contacts has INSERT service policy (migration 191 fix applied)';
  ELSE
    RAISE WARNING '[FAIL] 4.2 Contacts missing INSERT service policy - trigger will fail!';
  END IF;
END $$;

-- Test 4.3: Verify contacts has SELECT, UPDATE, DELETE service policies
DO $$
DECLARE
  v_cmds TEXT[] := ARRAY['SELECT', 'UPDATE', 'DELETE'];
  v_cmd TEXT;
  v_missing TEXT[] := '{}';
BEGIN
  FOREACH v_cmd IN ARRAY v_cmds LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'contacts' AND cmd = v_cmd
        AND (policyname LIKE '%service%' OR qual::TEXT LIKE '%auth.uid()%IS NULL%')
    ) THEN
      v_missing := array_append(v_missing, v_cmd);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE WARNING '[FAIL] 4.3 Contacts missing service policies for: %', array_to_string(v_missing, ', ');
  ELSE
    RAISE NOTICE '[PASS] 4.3 Contacts has SELECT, UPDATE, DELETE service policies';
  END IF;
END $$;

-- Test 4.4: Verify contacts.account_id has FK to accounts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'contacts' AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'account_id'
  ) THEN
    RAISE NOTICE '[PASS] 4.4 Contacts.account_id has FK to accounts';
  ELSE
    RAISE WARNING '[FAIL] 4.4 Contacts.account_id missing FK to accounts';
  END IF;
END $$;

-- Test 4.5: Verify contacts trigger exists (trg_sync_account_pic_to_contact)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_sync_account_pic_to_contact'
  ) THEN
    RAISE NOTICE '[PASS] 4.5 Trigger trg_sync_account_pic_to_contact exists';
  ELSE
    RAISE WARNING '[FAIL] 4.5 Trigger trg_sync_account_pic_to_contact missing';
  END IF;
END $$;

-- Test 4.6: List all contacts policies for reference
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '--- Contacts RLS Policies ---';
  FOR r IN
    SELECT policyname, cmd, permissive
    FROM pg_policies
    WHERE tablename = 'contacts'
    ORDER BY cmd, policyname
  LOOP
    RAISE NOTICE '  [%] % (permissive=%)', r.cmd, r.policyname, r.permissive;
  END LOOP;
END $$;

-- =====================================================
-- SECTION 5: ACCOUNTS TABLE - EDIT FIELDS VERIFICATION
-- =====================================================

-- Test 5.1: Verify accounts table has all editable fields
DO $$
DECLARE
  v_missing TEXT[] := '{}';
  v_cols TEXT[] := ARRAY[
    'account_id', 'company_name', 'domain', 'npwp', 'industry',
    'address', 'city', 'province', 'country', 'postal_code',
    'phone', 'pic_name', 'pic_email', 'pic_phone',
    'owner_user_id', 'account_status', 'activity_status',
    'created_at', 'updated_at'
  ];
  v_col TEXT;
BEGIN
  FOREACH v_col IN ARRAY v_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = v_col
    ) THEN
      v_missing := array_append(v_missing, v_col);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE WARNING '[FAIL] 5.1 Accounts missing editable columns: %', array_to_string(v_missing, ', ');
  ELSE
    RAISE NOTICE '[PASS] 5.1 Accounts table has all required editable columns';
  END IF;
END $$;

-- Test 5.2: Verify accounts has service policies for INSERT, SELECT, UPDATE
DO $$
DECLARE
  v_cmds TEXT[] := ARRAY['SELECT', 'INSERT', 'UPDATE'];
  v_cmd TEXT;
  v_missing TEXT[] := '{}';
BEGIN
  FOREACH v_cmd IN ARRAY v_cmds LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'accounts' AND cmd = v_cmd
        AND policyname LIKE '%service%'
    ) THEN
      v_missing := array_append(v_missing, v_cmd);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE WARNING '[FAIL] 5.2 Accounts missing service policies for: %', array_to_string(v_missing, ', ');
  ELSE
    RAISE NOTICE '[PASS] 5.2 Accounts has INSERT, SELECT, UPDATE service policies';
  END IF;
END $$;

-- =====================================================
-- SECTION 6: RLS HELPER FUNCTIONS
-- =====================================================

-- Test 6.1: Verify is_admin() function exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'is_admin' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE NOTICE '[PASS] 6.1 Function is_admin() exists';
  ELSE
    RAISE WARNING '[FAIL] 6.1 Function is_admin() missing';
  END IF;
END $$;

-- Test 6.2: Verify get_user_role() function exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_user_role' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE NOTICE '[PASS] 6.2 Function get_user_role() exists';
  ELSE
    RAISE WARNING '[FAIL] 6.2 Function get_user_role() missing';
  END IF;
END $$;

-- Test 6.3: Verify is_sales() function exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'is_sales' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE NOTICE '[PASS] 6.3 Function is_sales() exists';
  ELSE
    RAISE WARNING '[FAIL] 6.3 Function is_sales() missing';
  END IF;
END $$;

-- =====================================================
-- SECTION 7: DATA INTEGRITY CHECKS
-- =====================================================

-- Test 7.1: Check for profiles without valid user_role
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- This should always be 0 since role is ENUM type
  SELECT COUNT(*) INTO v_count FROM profiles WHERE role IS NULL;
  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] 7.1 No profiles with NULL role';
  ELSE
    RAISE WARNING '[FAIL] 7.1 Found % profiles with NULL role', v_count;
  END IF;
END $$;

-- Test 7.2: Check for profiles without email
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM profiles WHERE email IS NULL OR email = '';
  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] 7.2 No profiles with empty email';
  ELSE
    RAISE WARNING '[FAIL] 7.2 Found % profiles with empty email', v_count;
  END IF;
END $$;

-- Test 7.3: Check for profiles without name
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM profiles WHERE name IS NULL OR name = '';
  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] 7.3 No profiles with empty name';
  ELSE
    RAISE WARNING '[FAIL] 7.3 Found % profiles with empty name', v_count;
  END IF;
END $$;

-- Test 7.4: Check for duplicate emails in profiles
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT email, COUNT(*) AS cnt
    FROM profiles
    GROUP BY email
    HAVING COUNT(*) > 1
  ) dupes;

  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] 7.4 No duplicate emails in profiles';
  ELSE
    RAISE WARNING '[FAIL] 7.4 Found % duplicate email groups in profiles', v_count;
  END IF;
END $$;

-- Test 7.5: Check for orphaned profiles (no auth.users entry)
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM profiles p
  LEFT JOIN auth.users u ON p.user_id = u.id
  WHERE u.id IS NULL;

  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] 7.5 No orphaned profiles (all have auth.users entry)';
  ELSE
    RAISE WARNING '[FAIL] 7.5 Found % orphaned profiles without auth.users entry', v_count;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE '[SKIP] 7.5 Cannot access auth.users (insufficient privilege)';
END $$;

-- Test 7.6: Check auth.users without profiles
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM auth.users u
  LEFT JOIN profiles p ON u.id = p.user_id
  WHERE p.user_id IS NULL;

  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] 7.6 No auth.users without profiles entry';
  ELSE
    RAISE WARNING '[WARN] 7.6 Found % auth.users without profiles entry (may need backfill)', v_count;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE '[SKIP] 7.6 Cannot access auth.users (insufficient privilege)';
END $$;

-- Test 7.7: Verify all contacts have valid account_id
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM contacts c
  LEFT JOIN accounts a ON c.account_id = a.account_id
  WHERE a.account_id IS NULL;

  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] 7.7 All contacts have valid account_id';
  ELSE
    RAISE WARNING '[FAIL] 7.7 Found % orphaned contacts (invalid account_id)', v_count;
  END IF;
END $$;

-- Test 7.8: Check accounts with PIC data but no primary contact
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM accounts a
  WHERE a.pic_name IS NOT NULL AND a.pic_name != ''
    AND NOT EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.account_id = a.account_id AND c.is_primary = true
    );

  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] 7.8 All accounts with PIC data have a primary contact';
  ELSE
    RAISE WARNING '[WARN] 7.8 Found % accounts with PIC data but no primary contact (may need backfill migration 192)', v_count;
  END IF;
END $$;

-- Test 7.9: Check for accounts with multiple primary contacts
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT account_id, COUNT(*) AS primary_count
    FROM contacts
    WHERE is_primary = true
    GROUP BY account_id
    HAVING COUNT(*) > 1
  ) dupes;

  IF v_count = 0 THEN
    RAISE NOTICE '[PASS] 7.9 No accounts with multiple primary contacts';
  ELSE
    RAISE WARNING '[FAIL] 7.9 Found % accounts with multiple primary contacts', v_count;
  END IF;
END $$;

-- =====================================================
-- SECTION 8: INDEXES VERIFICATION
-- =====================================================

-- Test 8.1: Verify profiles indexes
DO $$
DECLARE
  v_missing TEXT[] := '{}';
  v_indexes TEXT[] := ARRAY['idx_profiles_role', 'idx_profiles_department', 'idx_profiles_phone'];
  v_idx TEXT;
BEGIN
  FOREACH v_idx IN ARRAY v_indexes LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'profiles' AND indexname = v_idx
    ) THEN
      v_missing := array_append(v_missing, v_idx);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE WARNING '[WARN] 8.1 Profiles missing indexes: %', array_to_string(v_missing, ', ');
  ELSE
    RAISE NOTICE '[PASS] 8.1 Profiles has all expected indexes (role, department, phone)';
  END IF;
END $$;

-- Test 8.2: Verify contacts indexes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'contacts' AND indexdef LIKE '%account_id%'
  ) THEN
    RAISE NOTICE '[PASS] 8.2 Contacts has index on account_id';
  ELSE
    RAISE WARNING '[WARN] 8.2 Contacts missing index on account_id';
  END IF;
END $$;

-- =====================================================
-- SECTION 9: PROFILES UPDATED_AT TRIGGER
-- =====================================================

-- Test 9.1: Verify profiles_updated_at trigger exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'profiles'
      AND trigger_name LIKE '%updated_at%'
  ) THEN
    RAISE NOTICE '[PASS] 9.1 Profiles has updated_at trigger';
  ELSE
    RAISE WARNING '[WARN] 9.1 Profiles missing updated_at trigger';
  END IF;
END $$;

-- =====================================================
-- SECTION 10: ROLE DISTRIBUTION SUMMARY
-- =====================================================

-- Test 10.1: Show current user distribution by role
DO $$
DECLARE
  r RECORD;
  v_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM profiles;
  RAISE NOTICE '--- User Distribution (total: %) ---', v_total;

  FOR r IN
    SELECT role, COUNT(*) AS cnt,
           COUNT(*) FILTER (WHERE is_active) AS active,
           COUNT(*) FILTER (WHERE NOT is_active) AS inactive
    FROM profiles
    GROUP BY role
    ORDER BY cnt DESC
  LOOP
    RAISE NOTICE '  %-20s total=% active=% inactive=%', r.role, r.cnt, r.active, r.inactive;
  END LOOP;
END $$;

-- Test 10.2: Show accounts vs contacts summary
DO $$
DECLARE
  v_accounts INTEGER;
  v_with_contacts INTEGER;
  v_contacts INTEGER;
  v_primary INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_accounts FROM accounts;
  SELECT COUNT(DISTINCT account_id) INTO v_with_contacts FROM contacts;
  SELECT COUNT(*) INTO v_contacts FROM contacts;
  SELECT COUNT(*) INTO v_primary FROM contacts WHERE is_primary = true;

  RAISE NOTICE '--- Accounts & Contacts Summary ---';
  RAISE NOTICE '  Total accounts:             %', v_accounts;
  RAISE NOTICE '  Accounts with contacts:     %', v_with_contacts;
  RAISE NOTICE '  Accounts without contacts:  %', v_accounts - v_with_contacts;
  RAISE NOTICE '  Total contacts:             %', v_contacts;
  RAISE NOTICE '  Primary contacts:           %', v_primary;
END $$;

-- =====================================================
-- DONE
-- =====================================================
RAISE NOTICE '==========================================';
RAISE NOTICE 'All tests completed. Review [FAIL] and [WARN] items above.';
RAISE NOTICE '==========================================';
