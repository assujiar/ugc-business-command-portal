-- =====================================================
-- Comprehensive Test Script (Supabase SQL Editor compatible)
-- All results returned as SELECT rows, not RAISE NOTICE
-- Run this ENTIRE script in Supabase SQL Editor
-- =====================================================

-- Create temp table to collect all results
CREATE TEMP TABLE IF NOT EXISTS test_results (
  test_id TEXT,
  status TEXT,  -- PASS, FAIL, WARN, SKIP
  detail TEXT
);
TRUNCATE test_results;

-- =====================================================
-- SECTION 1: PROFILES TABLE STRUCTURE
-- =====================================================

-- 1.1: Profiles has all 10 required columns
INSERT INTO test_results
SELECT '1.1',
  CASE WHEN COUNT(*) = 10 THEN 'PASS' ELSE 'FAIL' END,
  'Profiles columns: ' || COUNT(*) || '/10 found. ' ||
  COALESCE('Missing: ' || string_agg(
    CASE WHEN c.column_name IS NULL THEN expected.col ELSE NULL END, ', '
  ), 'All present')
FROM (VALUES
  ('user_id'),('email'),('name'),('role'),('department'),
  ('avatar_url'),('is_active'),('phone'),('created_at'),('updated_at')
) AS expected(col)
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name='profiles' AND c.column_name = expected.col;

-- 1.2: Profiles has PRIMARY KEY
INSERT INTO test_results
SELECT '1.2',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='profiles' AND constraint_type='PRIMARY KEY'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Profiles PRIMARY KEY constraint';

-- 1.3: Profiles.role is user_role ENUM
INSERT INTO test_results
SELECT '1.3',
  CASE WHEN udt_name = 'user_role' THEN 'PASS' ELSE 'FAIL' END,
  'Profiles.role type: ' || COALESCE(udt_name, 'NOT FOUND') || ' (expected: user_role)'
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name='role';

-- 1.4: is_active defaults to TRUE
INSERT INTO test_results
SELECT '1.4',
  CASE WHEN column_default = 'true' THEN 'PASS' ELSE 'FAIL' END,
  'Profiles.is_active default: ' || COALESCE(column_default, 'NULL') || ' (expected: true)'
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name='is_active';

-- 1.5: role defaults to salesperson
INSERT INTO test_results
SELECT '1.5',
  CASE WHEN column_default LIKE '%salesperson%' THEN 'PASS' ELSE 'FAIL' END,
  'Profiles.role default: ' || COALESCE(column_default, 'NULL')
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name='role';

-- =====================================================
-- SECTION 2: USER_ROLE ENUM VALUES
-- =====================================================

-- 2.1: All 15 user_role enum values exist
INSERT INTO test_results
SELECT '2.1',
  CASE WHEN COUNT(*) = 15 THEN 'PASS' ELSE 'FAIL' END,
  'user_role enum values: ' || COUNT(*) || '/15. Values: ' || string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'user_role';

-- =====================================================
-- SECTION 3: RLS POLICIES ON PROFILES
-- =====================================================

-- 3.1: RLS enabled on profiles
INSERT INTO test_results
SELECT '3.1',
  CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END,
  'Profiles RLS enabled: ' || relrowsecurity::TEXT
FROM pg_class WHERE relname = 'profiles';

-- 3.2: Profiles has user SELECT policy
INSERT INTO test_results
SELECT '3.2',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='profiles' AND cmd='SELECT' AND policyname NOT LIKE '%service%'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Profiles user SELECT policy';

-- 3.3: Profiles has UPDATE policy
INSERT INTO test_results
SELECT '3.3',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='profiles' AND cmd='UPDATE'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Profiles UPDATE policy';

-- 3.4: Profiles has service SELECT policy
INSERT INTO test_results
SELECT '3.4',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='profiles' AND cmd='SELECT' AND policyname LIKE '%service%'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Profiles service SELECT policy (for service_role/triggers)';

-- 3.5: List all profiles policies
INSERT INTO test_results
SELECT '3.5-' || ROW_NUMBER() OVER (ORDER BY cmd, policyname),
  'INFO',
  'profiles policy: [' || cmd || '] ' || policyname || ' (permissive=' || permissive || ')'
FROM pg_policies WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

-- =====================================================
-- SECTION 4: CONTACTS TABLE STRUCTURE & POLICIES
-- =====================================================

-- 4.1: Contacts has all 14 required columns
INSERT INTO test_results
SELECT '4.1',
  CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 14 THEN 'PASS' ELSE 'FAIL' END,
  'Contacts columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/14. ' ||
  COALESCE('Missing: ' || string_agg(
    CASE WHEN c.column_name IS NULL THEN expected.col ELSE NULL END, ', '
  ), 'All present')
FROM (VALUES
  ('contact_id'),('account_id'),('first_name'),('last_name'),
  ('email'),('phone'),('mobile'),('job_title'),('department'),
  ('is_primary'),('notes'),('created_by'),('created_at'),('updated_at')
) AS expected(col)
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name='contacts' AND c.column_name = expected.col;

-- 4.2: Contacts has INSERT service policy
INSERT INTO test_results
SELECT '4.2',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='contacts' AND cmd='INSERT' AND policyname LIKE '%service%'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Contacts INSERT service policy (critical for trigger)';

-- 4.3: Contacts has SELECT, UPDATE, DELETE service policies
INSERT INTO test_results
SELECT '4.3',
  CASE WHEN COUNT(DISTINCT cmd) = 3 THEN 'PASS' ELSE 'FAIL' END,
  'Contacts service policies: ' || COALESCE(string_agg(DISTINCT cmd, ', '), 'NONE') || ' (need SELECT,UPDATE,DELETE)'
FROM pg_policies
WHERE tablename='contacts' AND cmd IN ('SELECT','UPDATE','DELETE')
  AND (policyname LIKE '%service%');

-- 4.4: Contacts.account_id has FK to accounts
INSERT INTO test_results
SELECT '4.4',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name='contacts' AND tc.constraint_type='FOREIGN KEY' AND kcu.column_name='account_id'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Contacts.account_id FK to accounts';

-- 4.5: Contacts trigger exists
INSERT INTO test_results
SELECT '4.5',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.triggers WHERE trigger_name='trg_sync_account_pic_to_contact'
  ) THEN 'PASS' ELSE 'FAIL' END,
  'Trigger trg_sync_account_pic_to_contact';

-- 4.6: List all contacts policies
INSERT INTO test_results
SELECT '4.6-' || ROW_NUMBER() OVER (ORDER BY cmd, policyname),
  'INFO',
  'contacts policy: [' || cmd || '] ' || policyname || ' (permissive=' || permissive || ')'
FROM pg_policies WHERE tablename = 'contacts'
ORDER BY cmd, policyname;

-- =====================================================
-- SECTION 5: ACCOUNTS TABLE - EDIT FIELDS
-- =====================================================

-- 5.1: Accounts has all editable columns
INSERT INTO test_results
SELECT '5.1',
  CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 19 THEN 'PASS' ELSE 'FAIL' END,
  'Accounts columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/19. ' ||
  COALESCE('Missing: ' || string_agg(
    CASE WHEN c.column_name IS NULL THEN expected.col ELSE NULL END, ', '
  ), 'All present')
FROM (VALUES
  ('account_id'),('company_name'),('domain'),('npwp'),('industry'),
  ('address'),('city'),('province'),('country'),('postal_code'),
  ('phone'),('pic_name'),('pic_email'),('pic_phone'),
  ('owner_user_id'),('account_status'),('activity_status'),
  ('created_at'),('updated_at')
) AS expected(col)
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name='accounts' AND c.column_name = expected.col;

-- 5.2: Accounts has service policies
INSERT INTO test_results
SELECT '5.2',
  CASE WHEN COUNT(DISTINCT cmd) >= 3 THEN 'PASS' ELSE 'FAIL' END,
  'Accounts service policies: ' || COALESCE(string_agg(DISTINCT cmd, ', '), 'NONE') || ' (need SELECT,INSERT,UPDATE)'
FROM pg_policies
WHERE tablename='accounts' AND cmd IN ('SELECT','INSERT','UPDATE')
  AND policyname LIKE '%service%';

-- =====================================================
-- SECTION 6: RLS HELPER FUNCTIONS
-- =====================================================

-- 6.1-6.3: Check helper functions exist
INSERT INTO test_results
SELECT '6.' || ROW_NUMBER() OVER (ORDER BY expected.fn),
  CASE WHEN p.proname IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
  'Function ' || expected.fn || '(): ' || CASE WHEN p.proname IS NOT NULL THEN 'exists' ELSE 'MISSING' END
FROM (VALUES ('is_admin'),('get_user_role'),('is_sales')) AS expected(fn)
LEFT JOIN pg_proc p ON p.proname = expected.fn AND p.pronamespace = 'public'::regnamespace;

-- =====================================================
-- SECTION 7: DATA INTEGRITY CHECKS
-- =====================================================

-- 7.1: No profiles with NULL role
INSERT INTO test_results
SELECT '7.1',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Profiles with NULL role: ' || COUNT(*)
FROM profiles WHERE role IS NULL;

-- 7.2: No profiles with empty email
INSERT INTO test_results
SELECT '7.2',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Profiles with empty/NULL email: ' || COUNT(*)
FROM profiles WHERE email IS NULL OR email = '';

-- 7.3: No profiles with empty name
INSERT INTO test_results
SELECT '7.3',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Profiles with empty/NULL name: ' || COUNT(*)
FROM profiles WHERE name IS NULL OR name = '';

-- 7.4: No duplicate emails
INSERT INTO test_results
SELECT '7.4',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Duplicate email groups in profiles: ' || COUNT(*)
FROM (
  SELECT email FROM profiles GROUP BY email HAVING COUNT(*) > 1
) dupes;

-- 7.5: No orphaned profiles
DO $$
BEGIN
  INSERT INTO test_results
  SELECT '7.5',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'Orphaned profiles (no auth.users): ' || COUNT(*)
  FROM profiles p
  LEFT JOIN auth.users u ON p.user_id = u.id
  WHERE u.id IS NULL;
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO test_results VALUES ('7.5', 'SKIP', 'Cannot access auth.users (insufficient privilege)');
END $$;

-- 7.6: No auth.users without profiles
DO $$
BEGIN
  INSERT INTO test_results
  SELECT '7.6',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END,
    'auth.users without profiles: ' || COUNT(*)
  FROM auth.users u
  LEFT JOIN profiles p ON u.id = p.user_id
  WHERE p.user_id IS NULL;
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO test_results VALUES ('7.6', 'SKIP', 'Cannot access auth.users (insufficient privilege)');
END $$;

-- 7.7: All contacts have valid account_id
INSERT INTO test_results
SELECT '7.7',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Orphaned contacts (invalid account_id): ' || COUNT(*)
FROM contacts c
LEFT JOIN accounts a ON c.account_id = a.account_id
WHERE a.account_id IS NULL;

-- 7.8: Accounts with PIC but no primary contact
INSERT INTO test_results
SELECT '7.8',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END,
  'Accounts with PIC data but no primary contact: ' || COUNT(*)
FROM accounts a
WHERE a.pic_name IS NOT NULL AND a.pic_name != ''
  AND NOT EXISTS (
    SELECT 1 FROM contacts c WHERE c.account_id = a.account_id AND c.is_primary = true
  );

-- 7.9: No multiple primary contacts per account
INSERT INTO test_results
SELECT '7.9',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Accounts with multiple primary contacts: ' || COUNT(*)
FROM (
  SELECT account_id FROM contacts WHERE is_primary = true
  GROUP BY account_id HAVING COUNT(*) > 1
) dupes;

-- =====================================================
-- SECTION 8: INDEXES
-- =====================================================

-- 8.1: Profiles indexes
INSERT INTO test_results
SELECT '8.1',
  CASE WHEN COUNT(*) FILTER (WHERE i.indexname IS NOT NULL) = 3 THEN 'PASS' ELSE 'WARN' END,
  'Profiles indexes: ' || COUNT(*) FILTER (WHERE i.indexname IS NOT NULL) || '/3. ' ||
  COALESCE('Missing: ' || string_agg(
    CASE WHEN i.indexname IS NULL THEN expected.idx ELSE NULL END, ', '
  ), 'All present')
FROM (VALUES
  ('idx_profiles_role'),('idx_profiles_department'),('idx_profiles_phone')
) AS expected(idx)
LEFT JOIN pg_indexes i ON i.tablename='profiles' AND i.indexname = expected.idx;

-- 8.2: Contacts index on account_id
INSERT INTO test_results
SELECT '8.2',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename='contacts' AND indexdef LIKE '%account_id%'
  ) THEN 'PASS' ELSE 'WARN' END,
  'Contacts index on account_id';

-- =====================================================
-- SECTION 9: TRIGGERS
-- =====================================================

-- 9.1: Profiles updated_at trigger
INSERT INTO test_results
SELECT '9.1',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table='profiles' AND trigger_name LIKE '%updated_at%'
  ) THEN 'PASS' ELSE 'WARN' END,
  'Profiles updated_at trigger';

-- =====================================================
-- SECTION 10: SUMMARIES
-- =====================================================

-- 10.1: User distribution by role
INSERT INTO test_results
SELECT '10.1-' || ROW_NUMBER() OVER (ORDER BY cnt DESC),
  'INFO',
  role::TEXT || ': total=' || cnt || ' active=' || active || ' inactive=' || inactive
FROM (
  SELECT role, COUNT(*) AS cnt,
         COUNT(*) FILTER (WHERE is_active) AS active,
         COUNT(*) FILTER (WHERE NOT is_active) AS inactive
  FROM profiles
  GROUP BY role
) sub
ORDER BY cnt DESC;

-- 10.2: Accounts vs contacts summary
INSERT INTO test_results
SELECT '10.2', 'INFO',
  'Accounts: ' || (SELECT COUNT(*) FROM accounts) ||
  ' | With contacts: ' || (SELECT COUNT(DISTINCT account_id) FROM contacts) ||
  ' | Total contacts: ' || (SELECT COUNT(*) FROM contacts) ||
  ' | Primary contacts: ' || (SELECT COUNT(*) FROM contacts WHERE is_primary = true);

-- =====================================================
-- FINAL OUTPUT: Show all results sorted
-- =====================================================

SELECT
  test_id AS "Test",
  CASE status
    WHEN 'PASS' THEN 'PASS'
    WHEN 'FAIL' THEN 'FAIL'
    WHEN 'WARN' THEN 'WARN'
    WHEN 'SKIP' THEN 'SKIP'
    WHEN 'INFO' THEN 'INFO'
  END AS "Status",
  detail AS "Detail"
FROM test_results
ORDER BY
  -- Sort sections numerically
  SPLIT_PART(test_id, '.', 1)::INT,
  SPLIT_PART(SPLIT_PART(test_id, '.', 2), '-', 1)::INT,
  COALESCE(NULLIF(SPLIT_PART(SPLIT_PART(test_id, '.', 2), '-', 2), '')::INT, 0);

-- Summary counts
SELECT
  COUNT(*) FILTER (WHERE status = 'PASS') AS "Pass",
  COUNT(*) FILTER (WHERE status = 'FAIL') AS "Fail",
  COUNT(*) FILTER (WHERE status = 'WARN') AS "Warn",
  COUNT(*) FILTER (WHERE status = 'SKIP') AS "Skip",
  COUNT(*) FILTER (WHERE status = 'INFO') AS "Info",
  COUNT(*) AS "Total"
FROM test_results;

-- Cleanup
DROP TABLE IF EXISTS test_results;
