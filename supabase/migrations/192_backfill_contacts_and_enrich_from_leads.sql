-- =====================================================
-- Migration 192: Backfill Missing Contacts & Enrich from Leads
-- =====================================================
-- PROBLEM 1: Some accounts have PIC data but no contacts row,
-- because the trigger trg_sync_account_pic_to_contact was blocked
-- by missing contacts_insert_service RLS policy (fixed in migration 191).
--
-- PROBLEM 2: leads table has contact_mobile and job_title fields
-- that never flow to the contacts table (accounts table has no
-- mobile/job_title columns, so the trigger can't sync them).
--
-- FIX:
-- 1. Backfill: Insert missing primary contacts from accounts with PIC data
-- 2. Enrich: Update existing contacts with mobile/job_title from linked leads
-- =====================================================

-- =====================================================
-- STEP 1: Backfill missing contacts for accounts with PIC data
-- =====================================================
INSERT INTO contacts (
    account_id,
    first_name,
    last_name,
    email,
    phone,
    is_primary,
    created_by,
    created_at,
    updated_at
)
SELECT
    a.account_id,
    SPLIT_PART(a.pic_name, ' ', 1) AS first_name,
    CASE
        WHEN POSITION(' ' IN a.pic_name) > 0
        THEN SUBSTRING(a.pic_name FROM POSITION(' ' IN a.pic_name) + 1)
        ELSE NULL
    END AS last_name,
    a.pic_email AS email,
    a.pic_phone AS phone,
    TRUE AS is_primary,
    a.created_by,
    NOW(),
    NOW()
FROM accounts a
WHERE a.pic_name IS NOT NULL
    AND a.pic_name != ''
    AND NOT EXISTS (
        SELECT 1 FROM contacts c WHERE c.account_id = a.account_id
    );

-- Log how many contacts were backfilled
DO $$
DECLARE
    v_backfilled INTEGER;
BEGIN
    GET DIAGNOSTICS v_backfilled = ROW_COUNT;
    RAISE WARNING '[192] Backfilled % primary contacts from accounts with PIC data', v_backfilled;
END $$;

-- =====================================================
-- STEP 2: Enrich existing primary contacts with mobile/job_title from leads
-- =====================================================
-- Flow: leads.contact_mobile → contacts.mobile (via accounts.lead_id or accounts.original_lead_id)
-- Flow: leads.job_title → contacts.job_title
UPDATE contacts c
SET
    mobile = COALESCE(c.mobile, l.contact_mobile),
    job_title = COALESCE(c.job_title, l.job_title),
    updated_at = NOW()
FROM accounts a
JOIN leads l ON l.lead_id = COALESCE(a.original_lead_id, a.lead_id)
WHERE c.account_id = a.account_id
    AND c.is_primary = TRUE
    AND (
        (c.mobile IS NULL AND l.contact_mobile IS NOT NULL AND l.contact_mobile != '')
        OR
        (c.job_title IS NULL AND l.job_title IS NOT NULL AND l.job_title != '')
    );

-- Log how many contacts were enriched
DO $$
DECLARE
    v_enriched INTEGER;
BEGIN
    GET DIAGNOSTICS v_enriched = ROW_COUNT;
    RAISE WARNING '[192] Enriched % primary contacts with mobile/job_title from leads', v_enriched;
END $$;

-- =====================================================
-- VERIFICATION: Summary stats
-- =====================================================
DO $$
DECLARE
    v_total_accounts INTEGER;
    v_accounts_with_pic INTEGER;
    v_accounts_with_contacts INTEGER;
    v_contacts_with_mobile INTEGER;
    v_contacts_with_job_title INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total_accounts FROM accounts;
    SELECT COUNT(*) INTO v_accounts_with_pic FROM accounts WHERE pic_name IS NOT NULL AND pic_name != '';
    SELECT COUNT(DISTINCT c.account_id) INTO v_accounts_with_contacts FROM contacts c;
    SELECT COUNT(*) INTO v_contacts_with_mobile FROM contacts WHERE mobile IS NOT NULL AND mobile != '';
    SELECT COUNT(*) INTO v_contacts_with_job_title FROM contacts WHERE job_title IS NOT NULL AND job_title != '';

    RAISE WARNING '[192] Total accounts: %, with PIC: %, with contacts: %, contacts with mobile: %, contacts with job_title: %',
        v_total_accounts, v_accounts_with_pic, v_accounts_with_contacts, v_contacts_with_mobile, v_contacts_with_job_title;
END $$;
