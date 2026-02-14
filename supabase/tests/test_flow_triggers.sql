-- =====================================================
-- Flow Test: Triggers, Constraints, Cascades, Functions
-- Supabase SQL Editor compatible (3 statements)
--
-- HOW TO RUN: Paste ALL 3 statements and run together.
-- Statement 1 creates the test function,
-- Statement 2 runs it and shows results,
-- Statement 3 cleans up the function.
-- =====================================================

-- STATEMENT 1: Create test function
CREATE OR REPLACE FUNCTION _run_flow_tests()
RETURNS TABLE(test_id TEXT, status TEXT, detail TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_account_id TEXT := '_TEST_FLOW_ACC_001';
  v_account_id2 TEXT := '_TEST_FLOW_ACC_002';
  v_lead_id TEXT;
  v_contact_count INT;
  v_contact_id TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_dedupe_key TEXT;
  v_profile_user_id UUID;
  v_profile_name TEXT;
  v_profile_updated_before TIMESTAMPTZ;
  v_profile_updated_after TIMESTAMPTZ;
  v_lead_id2 TEXT;
BEGIN
  -- ============================================
  -- CLEANUP: Remove any leftover test data
  -- ============================================
  DELETE FROM contacts WHERE account_id IN (v_account_id, v_account_id2);
  DELETE FROM accounts WHERE account_id IN (v_account_id, v_account_id2);
  DELETE FROM leads WHERE company_name LIKE '\_TEST\_%' ESCAPE '\';

  -- ============================================
  -- F1: Account PIC → Contact Trigger (INSERT)
  -- trg_sync_account_pic_to_contact fires on
  -- AFTER INSERT of pic_name, pic_email, pic_phone
  -- ============================================

  -- F1.1: Insert account with PIC → trigger should create primary contact
  BEGIN
    INSERT INTO accounts (account_id, company_name, pic_name, pic_email, pic_phone)
    VALUES (v_account_id, '_TEST_Company', 'Budi Santoso', 'budi@test.com', '+62812000');

    SELECT COUNT(*) INTO v_contact_count
    FROM contacts WHERE account_id = v_account_id AND is_primary = true;

    IF v_contact_count = 1 THEN
      RETURN QUERY SELECT 'F1.1'::TEXT, 'PASS'::TEXT,
        'Trigger: Account INSERT with PIC → auto-created 1 primary contact'::TEXT;
    ELSIF v_contact_count = 0 THEN
      RETURN QUERY SELECT 'F1.1'::TEXT, 'FAIL'::TEXT,
        'Trigger did NOT create contact (check contacts_insert_service policy)'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F1.1'::TEXT, 'FAIL'::TEXT,
        ('Expected 1 primary contact, got ' || v_contact_count)::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'F1.1'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- F1.2: Verify contact fields match PIC data
  -- Trigger splits pic_name: first word → first_name, rest → last_name
  BEGIN
    SELECT c.first_name, c.last_name, c.email, c.phone
    INTO v_first_name, v_last_name, v_email, v_phone
    FROM contacts c WHERE c.account_id = v_account_id AND c.is_primary = true;

    IF v_first_name = 'Budi' AND v_last_name = 'Santoso'
       AND v_email = 'budi@test.com' AND v_phone = '+62812000' THEN
      RETURN QUERY SELECT 'F1.2'::TEXT, 'PASS'::TEXT,
        'Contact data matches: first_name=Budi, last_name=Santoso, email + phone correct'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F1.2'::TEXT, 'FAIL'::TEXT,
        ('Mismatch: first=' || COALESCE(v_first_name,'NULL')
        || ' last=' || COALESCE(v_last_name,'NULL')
        || ' email=' || COALESCE(v_email,'NULL')
        || ' phone=' || COALESCE(v_phone,'NULL'))::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'F1.2'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- ============================================
  -- F2: Account PIC → Contact Trigger (UPDATE)
  -- Trigger also fires on UPDATE OF pic_name, pic_email, pic_phone
  -- Should UPDATE existing primary contact, not create new one
  -- ============================================

  -- F2.1: Update PIC data → existing contact should be updated
  BEGIN
    UPDATE accounts
    SET pic_name = 'Siti Rahayu', pic_email = 'siti@test.com'
    WHERE account_id = v_account_id;

    SELECT c.first_name, c.last_name, c.email
    INTO v_first_name, v_last_name, v_email
    FROM contacts c WHERE c.account_id = v_account_id AND c.is_primary = true;

    IF v_first_name = 'Siti' AND v_last_name = 'Rahayu' AND v_email = 'siti@test.com' THEN
      RETURN QUERY SELECT 'F2.1'::TEXT, 'PASS'::TEXT,
        'Trigger: Account PIC UPDATE → contact updated (Siti Rahayu, siti@test.com)'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F2.1'::TEXT, 'FAIL'::TEXT,
        ('Contact not updated: first=' || COALESCE(v_first_name,'NULL')
        || ' last=' || COALESCE(v_last_name,'NULL')
        || ' email=' || COALESCE(v_email,'NULL'))::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'F2.1'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- F2.2: Verify no duplicate contacts created (should still be 1 primary)
  BEGIN
    SELECT COUNT(*) INTO v_contact_count
    FROM contacts WHERE account_id = v_account_id AND is_primary = true;

    IF v_contact_count = 1 THEN
      RETURN QUERY SELECT 'F2.2'::TEXT, 'PASS'::TEXT,
        'Still 1 primary contact after PIC UPDATE (no duplicate)'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F2.2'::TEXT, 'FAIL'::TEXT,
        ('Expected 1 primary contact after UPDATE, got ' || v_contact_count)::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'F2.2'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- ============================================
  -- F3: Lead ID + Dedupe Key Auto-generation
  -- trg_lead_id fires BEFORE INSERT on leads
  -- Generates lead_id = LEAD + YYYYMMDD + 6 hex
  -- Generates dedupe_key = lower(company) + '-' + (email or phone)
  -- ============================================

  -- F3.1: Insert lead → lead_id auto-generated
  BEGIN
    INSERT INTO leads (company_name, contact_email, triage_status)
    VALUES ('_TEST_Lead_Company', 'testlead@flow.com', 'New')
    RETURNING lead_id, dedupe_key INTO v_lead_id, v_dedupe_key;

    IF v_lead_id IS NOT NULL AND v_lead_id LIKE 'LEAD________%' THEN
      RETURN QUERY SELECT 'F3.1'::TEXT, 'PASS'::TEXT,
        ('Lead ID auto-generated: ' || v_lead_id)::TEXT;
    ELSIF v_lead_id IS NOT NULL THEN
      RETURN QUERY SELECT 'F3.1'::TEXT, 'WARN'::TEXT,
        ('Lead ID generated but unexpected format: ' || v_lead_id)::TEXT;
    ELSE
      RETURN QUERY SELECT 'F3.1'::TEXT, 'FAIL'::TEXT,
        'Lead ID is NULL - trigger trg_lead_id not working'::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'F3.1'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- F3.2: Dedupe key correctly generated
  BEGIN
    IF v_dedupe_key IS NOT NULL AND v_dedupe_key = '_test_lead_company-testlead@flow.com' THEN
      RETURN QUERY SELECT 'F3.2'::TEXT, 'PASS'::TEXT,
        ('Dedupe key correct: ' || v_dedupe_key)::TEXT;
    ELSIF v_dedupe_key IS NOT NULL THEN
      RETURN QUERY SELECT 'F3.2'::TEXT, 'WARN'::TEXT,
        ('Dedupe key generated but unexpected value: ' || v_dedupe_key)::TEXT;
    ELSE
      RETURN QUERY SELECT 'F3.2'::TEXT, 'FAIL'::TEXT,
        'Dedupe key is NULL'::TEXT;
    END IF;
  END;

  -- F3.3: Duplicate lead → rejected by UNIQUE dedupe_key
  BEGIN
    INSERT INTO leads (company_name, contact_email, triage_status)
    VALUES ('_TEST_Lead_Company', 'testlead@flow.com', 'New');

    -- If we reach here, duplicate was allowed (bad)
    RETURN QUERY SELECT 'F3.3'::TEXT, 'FAIL'::TEXT,
      'Duplicate lead was inserted (dedupe_key UNIQUE not enforced)'::TEXT;

    -- Cleanup duplicate
    DELETE FROM leads WHERE company_name = '_TEST_Lead_Company' AND lead_id != v_lead_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT 'F3.3'::TEXT, 'PASS'::TEXT,
        'Duplicate lead correctly rejected by UNIQUE dedupe_key constraint'::TEXT;
    WHEN OTHERS THEN
      RETURN QUERY SELECT 'F3.3'::TEXT, 'FAIL'::TEXT, ('Unexpected: ' || SQLERRM)::TEXT;
  END;

  -- Cleanup lead
  DELETE FROM leads WHERE lead_id = v_lead_id;

  -- ============================================
  -- F4: Profile updated_at Trigger
  -- profiles_updated_at fires BEFORE UPDATE
  -- Sets updated_at = NOW()
  -- ============================================

  BEGIN
    SELECT user_id, name, updated_at
    INTO v_profile_user_id, v_profile_name, v_profile_updated_before
    FROM profiles LIMIT 1;

    IF v_profile_user_id IS NULL THEN
      RETURN QUERY SELECT 'F4.1'::TEXT, 'SKIP'::TEXT, 'No profiles to test'::TEXT;
    ELSE
      -- Small delay to ensure different timestamp
      PERFORM pg_sleep(0.05);

      -- Append _test to name
      UPDATE profiles SET name = name || '_test' WHERE user_id = v_profile_user_id;

      SELECT updated_at INTO v_profile_updated_after
      FROM profiles WHERE user_id = v_profile_user_id;

      -- Revert name immediately
      UPDATE profiles SET name = v_profile_name WHERE user_id = v_profile_user_id;

      IF v_profile_updated_after > v_profile_updated_before THEN
        RETURN QUERY SELECT 'F4.1'::TEXT, 'PASS'::TEXT,
          ('Profile updated_at auto-refreshed: '
          || v_profile_updated_before::TEXT || ' → ' || v_profile_updated_after::TEXT)::TEXT;
      ELSE
        RETURN QUERY SELECT 'F4.1'::TEXT, 'FAIL'::TEXT,
          'updated_at did NOT change after profile UPDATE'::TEXT;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Try to revert on error
    BEGIN
      UPDATE profiles SET name = v_profile_name WHERE user_id = v_profile_user_id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN QUERY SELECT 'F4.1'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- ============================================
  -- F5: FK CASCADE (Account → Contacts)
  -- contacts.account_id REFERENCES accounts ON DELETE CASCADE
  -- ============================================

  BEGIN
    -- Insert test account with PIC (trigger creates contact)
    INSERT INTO accounts (account_id, company_name, pic_name, pic_email)
    VALUES (v_account_id2, '_TEST_Cascade_Co', 'Cascade Test', 'cascade@test.com');

    -- Verify contact was created
    SELECT COUNT(*) INTO v_contact_count FROM contacts WHERE account_id = v_account_id2;

    IF v_contact_count = 0 THEN
      RETURN QUERY SELECT 'F5.1'::TEXT, 'SKIP'::TEXT,
        'Cannot test cascade - trigger did not create contact'::TEXT;
    ELSE
      -- Delete account → contacts should cascade
      DELETE FROM accounts WHERE account_id = v_account_id2;

      SELECT COUNT(*) INTO v_contact_count FROM contacts WHERE account_id = v_account_id2;

      IF v_contact_count = 0 THEN
        RETURN QUERY SELECT 'F5.1'::TEXT, 'PASS'::TEXT,
          'FK CASCADE: Account DELETE → contacts auto-deleted'::TEXT;
      ELSE
        RETURN QUERY SELECT 'F5.1'::TEXT, 'FAIL'::TEXT,
          ('Contacts NOT cascade deleted: ' || v_contact_count || ' remaining')::TEXT;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'F5.1'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- ============================================
  -- F6: RLS Helper Functions - SECURITY DEFINER
  -- These must be SECURITY DEFINER to bypass RLS
  -- ============================================

  -- F6.1: get_user_role() is SECURITY DEFINER + STABLE
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'get_user_role' AND n.nspname = 'public'
        AND p.prosecdef = true AND p.provolatile = 's'
    ) THEN
      RETURN QUERY SELECT 'F6.1'::TEXT, 'PASS'::TEXT,
        'get_user_role() is SECURITY DEFINER + STABLE'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F6.1'::TEXT, 'FAIL'::TEXT,
        'get_user_role() missing SECURITY DEFINER or STABLE attribute'::TEXT;
    END IF;
  END;

  -- F6.2: is_admin() is SECURITY DEFINER + STABLE
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'is_admin' AND n.nspname = 'public'
        AND p.prosecdef = true AND p.provolatile = 's'
    ) THEN
      RETURN QUERY SELECT 'F6.2'::TEXT, 'PASS'::TEXT,
        'is_admin() is SECURITY DEFINER + STABLE'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F6.2'::TEXT, 'FAIL'::TEXT,
        'is_admin() missing SECURITY DEFINER or STABLE attribute'::TEXT;
    END IF;
  END;

  -- F6.3: is_sales() is SECURITY DEFINER + STABLE
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.proname = 'is_sales' AND n.nspname = 'public'
        AND p.prosecdef = true AND p.provolatile = 's'
    ) THEN
      RETURN QUERY SELECT 'F6.3'::TEXT, 'PASS'::TEXT,
        'is_sales() is SECURITY DEFINER + STABLE'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F6.3'::TEXT, 'FAIL'::TEXT,
        'is_sales() missing SECURITY DEFINER or STABLE attribute'::TEXT;
    END IF;
  END;

  -- ============================================
  -- F7: Key RPC Functions Exist with Correct Signatures
  -- ============================================

  -- F7.1: Customer quotation RPCs exist
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_customer_quotation_mark_rejected' AND pronamespace = 'public'::regnamespace)
       AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_customer_quotation_mark_sent' AND pronamespace = 'public'::regnamespace)
       AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_customer_quotation_mark_accepted' AND pronamespace = 'public'::regnamespace)
    THEN
      RETURN QUERY SELECT 'F7.1'::TEXT, 'PASS'::TEXT,
        'Quotation RPCs: mark_rejected, mark_sent, mark_accepted all exist'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F7.1'::TEXT, 'FAIL'::TEXT,
        'One or more quotation RPCs missing'::TEXT;
    END IF;
  END;

  -- F7.2: Ticket mark RPCs exist
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_ticket_mark_won' AND pronamespace = 'public'::regnamespace)
       AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_ticket_mark_lost' AND pronamespace = 'public'::regnamespace)
    THEN
      RETURN QUERY SELECT 'F7.2'::TEXT, 'PASS'::TEXT,
        'Ticket RPCs: mark_won, mark_lost exist'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F7.2'::TEXT, 'FAIL'::TEXT,
        'One or more ticket RPCs missing'::TEXT;
    END IF;
  END;

  -- F7.3: fn_resolve_or_create_opportunity exists
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_resolve_or_create_opportunity' AND pronamespace = 'public'::regnamespace) THEN
      RETURN QUERY SELECT 'F7.3'::TEXT, 'PASS'::TEXT,
        'fn_resolve_or_create_opportunity() exists'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F7.3'::TEXT, 'FAIL'::TEXT,
        'fn_resolve_or_create_opportunity() MISSING'::TEXT;
    END IF;
  END;

  -- F7.4: sync_opportunity_to_account exists
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'sync_opportunity_to_account' AND pronamespace = 'public'::regnamespace) THEN
      RETURN QUERY SELECT 'F7.4'::TEXT, 'PASS'::TEXT,
        'sync_opportunity_to_account() exists'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F7.4'::TEXT, 'FAIL'::TEXT,
        'sync_opportunity_to_account() MISSING'::TEXT;
    END IF;
  END;

  -- F7.5: fn_stage_config exists
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_stage_config' AND pronamespace = 'public'::regnamespace) THEN
      RETURN QUERY SELECT 'F7.5'::TEXT, 'PASS'::TEXT,
        'fn_stage_config() exists'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F7.5'::TEXT, 'FAIL'::TEXT,
        'fn_stage_config() MISSING'::TEXT;
    END IF;
  END;

  -- ============================================
  -- F8: Key Triggers Active
  -- ============================================

  -- F8.1: Mirror trigger on ticket_events
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'trg_mirror_ticket_event_to_responses' AND c.relname = 'ticket_events'
        AND t.tgenabled = 'O'
    ) THEN
      RETURN QUERY SELECT 'F8.1'::TEXT, 'PASS'::TEXT,
        'Mirror trigger (trg_mirror_ticket_event_to_responses) is ACTIVE'::TEXT;
    ELSIF EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'trg_mirror_ticket_event_to_responses' AND c.relname = 'ticket_events'
    ) THEN
      RETURN QUERY SELECT 'F8.1'::TEXT, 'WARN'::TEXT,
        'Mirror trigger exists but may be DISABLED'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F8.1'::TEXT, 'FAIL'::TEXT,
        'Mirror trigger NOT FOUND on ticket_events'::TEXT;
    END IF;
  END;

  -- F8.2: trg_quotation_status_sync should NOT exist (dropped in migration 180)
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'trg_quotation_status_sync' AND c.relname = 'customer_quotations'
    ) THEN
      RETURN QUERY SELECT 'F8.2'::TEXT, 'PASS'::TEXT,
        'trg_quotation_status_sync correctly DROPPED (migration 180 - RPCs are sole controller)'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F8.2'::TEXT, 'FAIL'::TEXT,
        'trg_quotation_status_sync still EXISTS! Should have been dropped in migration 180'::TEXT;
    END IF;
  END;

  -- F8.3: Stage history auto-fill trigger (migration 149)
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'trg_autofill_stage_history' AND c.relname = 'opportunity_stage_history'
    ) THEN
      RETURN QUERY SELECT 'F8.3'::TEXT, 'PASS'::TEXT,
        'trg_autofill_stage_history on opportunity_stage_history exists'::TEXT;
    ELSE
      RETURN QUERY SELECT 'F8.3'::TEXT, 'FAIL'::TEXT,
        'trg_autofill_stage_history MISSING (migration 149)'::TEXT;
    END IF;
  END;

  -- ============================================
  -- F9: Account Status Column Name Check
  -- CLAUDE.md: column is account_status (NOT status)
  -- Migration 159 regressed to 'status', migration 172 fixed back
  -- ============================================

  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'accounts' AND column_name = 'account_status'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'status'
      ) THEN
        RETURN QUERY SELECT 'F9.1'::TEXT, 'PASS'::TEXT,
          'accounts.account_status exists, no ambiguous "status" column'::TEXT;
      ELSE
        RETURN QUERY SELECT 'F9.1'::TEXT, 'WARN'::TEXT,
          'Both account_status AND status columns exist (possible regression)'::TEXT;
      END IF;
    ELSE
      RETURN QUERY SELECT 'F9.1'::TEXT, 'FAIL'::TEXT,
        'accounts.account_status column MISSING'::TEXT;
    END IF;
  END;

  -- ============================================
  -- FINAL CLEANUP
  -- ============================================
  DELETE FROM contacts WHERE account_id IN (v_account_id, v_account_id2);
  DELETE FROM accounts WHERE account_id IN (v_account_id, v_account_id2);
  DELETE FROM leads WHERE company_name LIKE '\_TEST\_%' ESCAPE '\';

  RETURN;
END;
$$;

-- STATEMENT 2: Run tests and show results
SELECT * FROM _run_flow_tests();

-- STATEMENT 3: Cleanup function
DROP FUNCTION IF EXISTS _run_flow_tests();
