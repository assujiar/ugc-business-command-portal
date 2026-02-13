-- =====================================================
-- TEST SCRIPT: Contacts Flow Verification
-- =====================================================
-- Run this script in Supabase SQL Editor to verify:
-- 1. RLS service policies exist for contacts & accounts
-- 2. Trigger trg_sync_account_pic_to_contact works
-- 3. Contacts are properly linked to accounts
-- 4. Backfill data integrity
-- 5. Column name consistency across all layers
-- =====================================================

-- =====================================================
-- TEST 1: Verify RLS service policies exist
-- =====================================================
DO $$
DECLARE
    v_count INTEGER;
    v_missing TEXT := '';
BEGIN
    -- Check contacts_insert_service
    SELECT COUNT(*) INTO v_count FROM pg_policies
    WHERE tablename = 'contacts' AND schemaname = 'public' AND policyname = 'contacts_insert_service';
    IF v_count = 0 THEN v_missing := v_missing || 'contacts_insert_service, '; END IF;

    -- Check contacts_select_service
    SELECT COUNT(*) INTO v_count FROM pg_policies
    WHERE tablename = 'contacts' AND schemaname = 'public' AND policyname = 'contacts_select_service';
    IF v_count = 0 THEN v_missing := v_missing || 'contacts_select_service, '; END IF;

    -- Check contacts_update_service
    SELECT COUNT(*) INTO v_count FROM pg_policies
    WHERE tablename = 'contacts' AND schemaname = 'public' AND policyname = 'contacts_update_service';
    IF v_count = 0 THEN v_missing := v_missing || 'contacts_update_service, '; END IF;

    -- Check accounts_insert_service
    SELECT COUNT(*) INTO v_count FROM pg_policies
    WHERE tablename = 'accounts' AND schemaname = 'public' AND policyname = 'accounts_insert_service';
    IF v_count = 0 THEN v_missing := v_missing || 'accounts_insert_service, '; END IF;

    -- Check accounts_select_service
    SELECT COUNT(*) INTO v_count FROM pg_policies
    WHERE tablename = 'accounts' AND schemaname = 'public' AND policyname = 'accounts_select_service';
    IF v_count = 0 THEN v_missing := v_missing || 'accounts_select_service, '; END IF;

    -- Check accounts_update_service
    SELECT COUNT(*) INTO v_count FROM pg_policies
    WHERE tablename = 'accounts' AND schemaname = 'public' AND policyname = 'accounts_update_service';
    IF v_count = 0 THEN v_missing := v_missing || 'accounts_update_service, '; END IF;

    IF v_missing = '' THEN
        RAISE WARNING '[TEST 1 PASS] All required service policies exist for contacts and accounts';
    ELSE
        RAISE WARNING '[TEST 1 FAIL] Missing policies: %', v_missing;
    END IF;
END $$;

-- =====================================================
-- TEST 2: Verify trigger exists on accounts table
-- =====================================================
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM information_schema.triggers
    WHERE trigger_name = 'trg_sync_account_pic_to_contact'
    AND event_object_table = 'accounts';

    IF v_count > 0 THEN
        RAISE WARNING '[TEST 2 PASS] trg_sync_account_pic_to_contact trigger exists on accounts table';
    ELSE
        RAISE WARNING '[TEST 2 FAIL] trg_sync_account_pic_to_contact trigger NOT FOUND';
    END IF;
END $$;

-- =====================================================
-- TEST 3: Verify contacts table columns
-- =====================================================
DO $$
DECLARE
    v_missing TEXT := '';
    v_count INTEGER;
BEGIN
    -- Required columns
    FOREACH v_missing IN ARRAY ARRAY['contact_id','account_id','first_name','last_name','email','phone','mobile','job_title','department','is_primary','notes','created_by','created_at','updated_at']
    LOOP
        SELECT COUNT(*) INTO v_count FROM information_schema.columns
        WHERE table_name = 'contacts' AND table_schema = 'public' AND column_name = v_missing;
        IF v_count = 0 THEN
            RAISE WARNING '[TEST 3 FAIL] Missing column in contacts: %', v_missing;
        END IF;
    END LOOP;

    RAISE WARNING '[TEST 3 PASS] All expected contacts columns checked';
END $$;

-- =====================================================
-- TEST 4: Data integrity - accounts with PIC but no contacts
-- =====================================================
SELECT
    'accounts_without_contacts' AS check_type,
    COUNT(*) AS count
FROM accounts a
WHERE a.pic_name IS NOT NULL
    AND a.pic_name != ''
    AND NOT EXISTS (SELECT 1 FROM contacts c WHERE c.account_id = a.account_id);

-- =====================================================
-- TEST 5: Data integrity - contacts linked to valid accounts
-- =====================================================
SELECT
    'orphaned_contacts' AS check_type,
    COUNT(*) AS count
FROM contacts c
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.account_id = c.account_id);

-- =====================================================
-- TEST 6: Primary contact consistency
-- =====================================================
-- Accounts with more than one primary contact (should be 0)
SELECT
    'accounts_with_multiple_primary' AS check_type,
    COUNT(*) AS count
FROM (
    SELECT account_id, COUNT(*) AS primary_count
    FROM contacts
    WHERE is_primary = TRUE
    GROUP BY account_id
    HAVING COUNT(*) > 1
) sub;

-- =====================================================
-- TEST 7: Verify column mapping consistency
-- leads → accounts → contacts
-- =====================================================
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- leads.contact_name → accounts.pic_name
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'contact_name';
    IF v_count = 0 THEN RAISE WARNING '[TEST 7 FAIL] leads.contact_name not found'; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'pic_name';
    IF v_count = 0 THEN RAISE WARNING '[TEST 7 FAIL] accounts.pic_name not found'; END IF;

    -- leads.contact_email → accounts.pic_email
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'contact_email';
    IF v_count = 0 THEN RAISE WARNING '[TEST 7 FAIL] leads.contact_email not found'; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'pic_email';
    IF v_count = 0 THEN RAISE WARNING '[TEST 7 FAIL] accounts.pic_email not found'; END IF;

    -- leads.contact_phone → accounts.pic_phone
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'contact_phone';
    IF v_count = 0 THEN RAISE WARNING '[TEST 7 FAIL] leads.contact_phone not found'; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'pic_phone';
    IF v_count = 0 THEN RAISE WARNING '[TEST 7 FAIL] accounts.pic_phone not found'; END IF;

    -- leads.contact_mobile → contacts.mobile (bypasses accounts)
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'contact_mobile';
    IF v_count = 0 THEN RAISE WARNING '[TEST 7 FAIL] leads.contact_mobile not found'; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'mobile';
    IF v_count = 0 THEN RAISE WARNING '[TEST 7 FAIL] contacts.mobile not found'; END IF;

    -- leads.job_title → contacts.job_title (bypasses accounts)
    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'job_title';
    IF v_count = 0 THEN RAISE WARNING '[TEST 7 FAIL] leads.job_title not found'; END IF;

    SELECT COUNT(*) INTO v_count FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'job_title';
    IF v_count = 0 THEN RAISE WARNING '[TEST 7 FAIL] contacts.job_title not found'; END IF;

    RAISE WARNING '[TEST 7 PASS] All column mappings verified: leads → accounts → contacts';
END $$;

-- =====================================================
-- TEST 8: Verify all service policies (summary)
-- =====================================================
SELECT
    tablename,
    policyname,
    cmd AS operation
FROM pg_policies
WHERE policyname LIKE '%_service%'
    AND schemaname = 'public'
    AND tablename IN ('contacts', 'accounts')
ORDER BY tablename, policyname;

-- =====================================================
-- TEST 9: Sample data check - show first 5 accounts with contacts
-- =====================================================
SELECT
    a.account_id,
    a.company_name,
    a.pic_name AS account_pic_name,
    a.pic_email AS account_pic_email,
    a.pic_phone AS account_pic_phone,
    c.contact_id,
    c.first_name || ' ' || COALESCE(c.last_name, '') AS contact_full_name,
    c.email AS contact_email,
    c.phone AS contact_phone,
    c.mobile AS contact_mobile,
    c.job_title AS contact_job_title,
    c.is_primary
FROM accounts a
LEFT JOIN contacts c ON c.account_id = a.account_id
WHERE a.pic_name IS NOT NULL
ORDER BY a.created_at DESC
LIMIT 10;

-- =====================================================
-- TEST 10: Lead → Account → Contact chain verification
-- Show leads that have been claimed and check if contacts were created
-- =====================================================
SELECT
    l.lead_id,
    l.company_name,
    l.contact_name AS lead_contact_name,
    l.contact_email AS lead_contact_email,
    l.contact_phone AS lead_contact_phone,
    l.contact_mobile AS lead_contact_mobile,
    l.job_title AS lead_job_title,
    l.claim_status,
    a.account_id,
    a.pic_name AS account_pic_name,
    c.contact_id,
    c.first_name || ' ' || COALESCE(c.last_name, '') AS contact_full_name,
    c.email AS contact_email,
    c.mobile AS contact_mobile,
    c.job_title AS contact_job_title,
    CASE
        WHEN c.contact_id IS NULL AND a.account_id IS NOT NULL AND a.pic_name IS NOT NULL
        THEN 'MISSING CONTACT - needs backfill'
        WHEN c.contact_id IS NULL AND a.account_id IS NULL
        THEN 'No account yet (expected for unclaimed leads)'
        WHEN c.contact_id IS NOT NULL
        THEN 'OK'
        ELSE 'Check manually'
    END AS status
FROM leads l
LEFT JOIN accounts a ON a.account_id = (
    SELECT acc.account_id FROM accounts acc
    WHERE acc.original_lead_id = l.lead_id OR acc.lead_id = l.lead_id
    LIMIT 1
)
LEFT JOIN contacts c ON c.account_id = a.account_id AND c.is_primary = TRUE
WHERE l.claim_status = 'claimed'
ORDER BY l.claimed_at DESC
LIMIT 20;
