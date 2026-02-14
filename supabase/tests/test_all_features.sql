-- =====================================================
-- Comprehensive Test Script (Supabase SQL Editor)
-- Single query - copy-paste & run in one go
-- =====================================================

SELECT test_id AS "Test", status AS "Status", detail AS "Detail"
FROM (

-- =====================================================
-- SECTION 1: PROFILES TABLE STRUCTURE
-- =====================================================

-- 1.1: Profiles has all 10 required columns
SELECT '1.1' AS test_id,
  CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 10 THEN 'PASS' ELSE 'FAIL' END AS status,
  'Profiles columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/10. ' ||
  COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present') AS detail
FROM (VALUES ('user_id'),('email'),('name'),('role'),('department'),
  ('avatar_url'),('is_active'),('phone'),('created_at'),('updated_at')) AS e(col)
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name='profiles' AND c.column_name = e.col

UNION ALL

-- 1.2: Profiles PRIMARY KEY
SELECT '1.2',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='profiles' AND constraint_type='PRIMARY KEY')
  THEN 'PASS' ELSE 'FAIL' END,
  'Profiles PRIMARY KEY constraint'

UNION ALL

-- 1.3: Profiles.role is user_role ENUM
SELECT '1.3',
  CASE WHEN udt_name = 'user_role' THEN 'PASS' ELSE 'FAIL' END,
  'Profiles.role type: ' || COALESCE(udt_name, 'NOT FOUND') || ' (expected: user_role)'
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name='role'

UNION ALL

-- 1.4: is_active defaults to TRUE
SELECT '1.4',
  CASE WHEN column_default = 'true' THEN 'PASS' ELSE 'FAIL' END,
  'Profiles.is_active default: ' || COALESCE(column_default, 'NULL')
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name='is_active'

UNION ALL

-- 1.5: role defaults to salesperson
SELECT '1.5',
  CASE WHEN column_default LIKE '%salesperson%' THEN 'PASS' ELSE 'FAIL' END,
  'Profiles.role default: ' || COALESCE(column_default, 'NULL')
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles' AND column_name='role'

UNION ALL

-- =====================================================
-- SECTION 2: USER_ROLE ENUM VALUES
-- =====================================================

SELECT '2.1',
  CASE WHEN COUNT(*) = 15 THEN 'PASS' ELSE 'FAIL' END,
  'user_role enum: ' || COUNT(*) || '/15 values. ' ||
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'user_role'

UNION ALL

-- =====================================================
-- SECTION 3: RLS POLICIES ON PROFILES
-- =====================================================

-- 3.1: RLS enabled
SELECT '3.1',
  CASE WHEN relrowsecurity THEN 'PASS' ELSE 'FAIL' END,
  'Profiles RLS enabled: ' || relrowsecurity::TEXT
FROM pg_class WHERE relname = 'profiles'

UNION ALL

-- 3.2: User SELECT policy
SELECT '3.2',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename='profiles' AND cmd='SELECT' AND policyname NOT LIKE '%service%')
  THEN 'PASS' ELSE 'FAIL' END,
  'Profiles user SELECT policy'

UNION ALL

-- 3.3: UPDATE policy
SELECT '3.3',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND cmd='UPDATE')
  THEN 'PASS' ELSE 'FAIL' END,
  'Profiles UPDATE policy'

UNION ALL

-- 3.4: Service SELECT policy
SELECT '3.4',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename='profiles' AND cmd='SELECT' AND policyname LIKE '%service%')
  THEN 'PASS' ELSE 'FAIL' END,
  'Profiles service SELECT policy (for service_role)'

UNION ALL

-- 3.5: List all profiles policies
SELECT '3.5',
  'INFO',
  'Profiles policies: ' || COALESCE(string_agg('[' || cmd || '] ' || policyname, ' | ' ORDER BY cmd, policyname), 'NONE')
FROM pg_policies WHERE tablename = 'profiles'

UNION ALL

-- =====================================================
-- SECTION 4: CONTACTS TABLE
-- =====================================================

-- 4.1: Contacts columns
SELECT '4.1',
  CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 14 THEN 'PASS' ELSE 'FAIL' END,
  'Contacts columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/14. ' ||
  COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
FROM (VALUES ('contact_id'),('account_id'),('first_name'),('last_name'),
  ('email'),('phone'),('mobile'),('job_title'),('department'),
  ('is_primary'),('notes'),('created_by'),('created_at'),('updated_at')) AS e(col)
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name='contacts' AND c.column_name = e.col

UNION ALL

-- 4.2: Contacts INSERT service policy
SELECT '4.2',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE tablename='contacts' AND cmd='INSERT' AND policyname LIKE '%service%')
  THEN 'PASS' ELSE 'FAIL' END,
  'Contacts INSERT service policy (critical for trigger)'

UNION ALL

-- 4.3: Contacts SELECT/UPDATE/DELETE service policies
SELECT '4.3',
  CASE WHEN COUNT(DISTINCT cmd) = 3 THEN 'PASS' ELSE 'FAIL' END,
  'Contacts service policies: ' || COALESCE(string_agg(DISTINCT cmd, ', '), 'NONE') || ' (need SELECT,UPDATE,DELETE)'
FROM pg_policies WHERE tablename='contacts' AND cmd IN ('SELECT','UPDATE','DELETE') AND policyname LIKE '%service%'

UNION ALL

-- 4.4: FK to accounts
SELECT '4.4',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name='contacts' AND tc.constraint_type='FOREIGN KEY' AND kcu.column_name='account_id')
  THEN 'PASS' ELSE 'FAIL' END,
  'Contacts.account_id FK to accounts'

UNION ALL

-- 4.5: Contacts trigger
SELECT '4.5',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
    WHERE trigger_name='trg_sync_account_pic_to_contact')
  THEN 'PASS' ELSE 'FAIL' END,
  'Trigger trg_sync_account_pic_to_contact'

UNION ALL

-- 4.6: List all contacts policies
SELECT '4.6',
  'INFO',
  'Contacts policies: ' || COALESCE(string_agg('[' || cmd || '] ' || policyname, ' | ' ORDER BY cmd, policyname), 'NONE')
FROM pg_policies WHERE tablename = 'contacts'

UNION ALL

-- =====================================================
-- SECTION 5: ACCOUNTS TABLE
-- =====================================================

-- 5.1: Accounts editable columns
SELECT '5.1',
  CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 19 THEN 'PASS' ELSE 'FAIL' END,
  'Accounts columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/19. ' ||
  COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
FROM (VALUES ('account_id'),('company_name'),('domain'),('npwp'),('industry'),
  ('address'),('city'),('province'),('country'),('postal_code'),
  ('phone'),('pic_name'),('pic_email'),('pic_phone'),
  ('owner_user_id'),('account_status'),('activity_status'),
  ('created_at'),('updated_at')) AS e(col)
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name='accounts' AND c.column_name = e.col

UNION ALL

-- 5.2: Accounts service policies
SELECT '5.2',
  CASE WHEN COUNT(DISTINCT cmd) >= 3 THEN 'PASS' ELSE 'FAIL' END,
  'Accounts service policies: ' || COALESCE(string_agg(DISTINCT cmd, ', '), 'NONE') || ' (need SELECT,INSERT,UPDATE)'
FROM pg_policies WHERE tablename='accounts' AND cmd IN ('SELECT','INSERT','UPDATE') AND policyname LIKE '%service%'

UNION ALL

-- =====================================================
-- SECTION 6: RLS HELPER FUNCTIONS
-- =====================================================

SELECT '6.1',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_admin' AND pronamespace='public'::regnamespace)
  THEN 'PASS' ELSE 'FAIL' END,
  'Function is_admin(): ' || CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_admin' AND pronamespace='public'::regnamespace) THEN 'exists' ELSE 'MISSING' END

UNION ALL

SELECT '6.2',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_user_role' AND pronamespace='public'::regnamespace)
  THEN 'PASS' ELSE 'FAIL' END,
  'Function get_user_role(): ' || CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_user_role' AND pronamespace='public'::regnamespace) THEN 'exists' ELSE 'MISSING' END

UNION ALL

SELECT '6.3',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_sales' AND pronamespace='public'::regnamespace)
  THEN 'PASS' ELSE 'FAIL' END,
  'Function is_sales(): ' || CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_sales' AND pronamespace='public'::regnamespace) THEN 'exists' ELSE 'MISSING' END

UNION ALL

-- =====================================================
-- SECTION 7: DATA INTEGRITY
-- =====================================================

-- 7.1: No NULL roles
SELECT '7.1',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Profiles with NULL role: ' || COUNT(*)
FROM profiles WHERE role IS NULL

UNION ALL

-- 7.2: No empty emails
SELECT '7.2',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Profiles with empty/NULL email: ' || COUNT(*)
FROM profiles WHERE email IS NULL OR email = ''

UNION ALL

-- 7.3: No empty names
SELECT '7.3',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Profiles with empty/NULL name: ' || COUNT(*)
FROM profiles WHERE name IS NULL OR name = ''

UNION ALL

-- 7.4: No duplicate emails
SELECT '7.4',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Duplicate email groups: ' || COUNT(*)
FROM (SELECT email FROM profiles GROUP BY email HAVING COUNT(*) > 1) d

UNION ALL

-- 7.5: Orphaned profiles (skip auth.users join - use FK guarantee)
SELECT '7.5', 'INFO', 'Skipped: FK ON DELETE CASCADE guarantees no orphaned profiles'

UNION ALL

-- 7.6: auth.users without profiles (requires auth schema access)
SELECT '7.6', 'INFO', 'Skipped: requires direct auth.users access - run separately if needed'

UNION ALL

-- 7.7: Orphaned contacts
SELECT '7.7',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Orphaned contacts (no account): ' || COUNT(*)
FROM contacts c LEFT JOIN accounts a ON c.account_id = a.account_id WHERE a.account_id IS NULL

UNION ALL

-- 7.8: PIC without primary contact
SELECT '7.8',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END,
  'Accounts with PIC but no primary contact: ' || COUNT(*)
FROM accounts a WHERE a.pic_name IS NOT NULL AND a.pic_name != ''
  AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.account_id = a.account_id AND c.is_primary = true)

UNION ALL

-- 7.9: Multiple primary contacts
SELECT '7.9',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
  'Accounts with multiple primary contacts: ' || COUNT(*)
FROM (SELECT account_id FROM contacts WHERE is_primary = true GROUP BY account_id HAVING COUNT(*) > 1) d

UNION ALL

-- =====================================================
-- SECTION 8: INDEXES
-- =====================================================

-- 8.1: Profiles indexes
SELECT '8.1',
  CASE WHEN COUNT(*) FILTER (WHERE i.indexname IS NOT NULL) = 3 THEN 'PASS' ELSE 'WARN' END,
  'Profiles indexes: ' || COUNT(*) FILTER (WHERE i.indexname IS NOT NULL) || '/3. ' ||
  COALESCE('Missing: ' || string_agg(CASE WHEN i.indexname IS NULL THEN e.idx END, ', '), 'All present')
FROM (VALUES ('idx_profiles_role'),('idx_profiles_department'),('idx_profiles_phone')) AS e(idx)
LEFT JOIN pg_indexes i ON i.tablename='profiles' AND i.indexname = e.idx

UNION ALL

-- 8.2: Contacts account_id index
SELECT '8.2',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='contacts' AND indexdef LIKE '%account_id%')
  THEN 'PASS' ELSE 'WARN' END,
  'Contacts index on account_id'

UNION ALL

-- =====================================================
-- SECTION 9: TRIGGERS
-- =====================================================

SELECT '9.1',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
    WHERE event_object_table='profiles' AND trigger_name LIKE '%updated_at%')
  THEN 'PASS' ELSE 'WARN' END,
  'Profiles updated_at trigger'

UNION ALL

-- =====================================================
-- SECTION 10: SUMMARIES
-- =====================================================

-- 10.1: Total user count
SELECT '10.1', 'INFO',
  'Total profiles: ' || COUNT(*) || ' (active: ' || COUNT(*) FILTER (WHERE is_active) || ', inactive: ' || COUNT(*) FILTER (WHERE NOT is_active) || ')'
FROM profiles

UNION ALL

-- 10.2: Role distribution
SELECT '10.2', 'INFO',
  'Roles: ' || COALESCE(string_agg(role::TEXT || '=' || cnt::TEXT, ', ' ORDER BY cnt DESC), 'none')
FROM (SELECT role, COUNT(*) AS cnt FROM profiles GROUP BY role) sub

UNION ALL

-- 10.3: Accounts & contacts summary
SELECT '10.3', 'INFO',
  'Accounts: ' || (SELECT COUNT(*) FROM accounts)
  || ' | Contacts: ' || (SELECT COUNT(*) FROM contacts)
  || ' | Primary: ' || (SELECT COUNT(*) FROM contacts WHERE is_primary = true)
  || ' | Accounts with contacts: ' || (SELECT COUNT(DISTINCT account_id) FROM contacts)

) AS all_tests

ORDER BY
  SPLIT_PART(test_id, '.', 1)::INT,
  SPLIT_PART(test_id, '.', 2)::INT;
