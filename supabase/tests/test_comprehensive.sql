-- =====================================================
-- COMPREHENSIVE BACKEND TEST: CRM + Ticketing Modules
-- Covers: Structure, Triggers, Constraints, Cascades,
--         RPCs, Enums, RLS, Functions, SLA
--
-- HOW TO RUN: Paste ALL 3 statements in Supabase SQL
-- Editor and run together.
-- =====================================================

-- STATEMENT 1: Create test function
CREATE OR REPLACE FUNCTION _run_comprehensive_tests()
RETURNS TABLE(test_id TEXT, status TEXT, detail TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_acc_id TEXT := '_XTEST_ACC_001';
  v_acc_id2 TEXT := '_XTEST_ACC_002';
  v_lead_id TEXT;
  v_dedupe_key TEXT;
  v_count INT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_uid UUID;
  v_name TEXT;
  v_ts_before TIMESTAMPTZ;
  v_ts_after TIMESTAMPTZ;
  v_txt TEXT;
BEGIN
  -- Pre-cleanup
  DELETE FROM contacts WHERE account_id IN (v_acc_id, v_acc_id2);
  DELETE FROM accounts WHERE account_id IN (v_acc_id, v_acc_id2);
  DELETE FROM leads WHERE company_name LIKE '\_XTEST\_%' ESCAPE '\';

  -- ============================================================
  -- SECTION A: CRM MODULE — TABLE STRUCTURE
  -- ============================================================

  -- A1: Core CRM tables exist
  RETURN QUERY
  SELECT 'A1' AS test_id,
    CASE WHEN COUNT(*) FILTER (WHERE c.table_name IS NOT NULL) = 9 THEN 'PASS' ELSE 'FAIL' END,
    'CRM tables: ' || COUNT(*) FILTER (WHERE c.table_name IS NOT NULL) || '/9. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.table_name IS NULL THEN e.t END, ', '), 'All present')
  FROM (VALUES ('profiles'),('leads'),('accounts'),('contacts'),('opportunities'),
    ('customer_quotations'),('activities'),('sales_plans'),('import_batches')) AS e(t)
  LEFT JOIN (SELECT DISTINCT table_name FROM information_schema.tables WHERE table_schema='public') c ON c.table_name = e.t;

  -- A2: CRM support tables exist
  RETURN QUERY
  SELECT 'A2',
    CASE WHEN COUNT(*) FILTER (WHERE c.table_name IS NOT NULL) = 4 THEN 'PASS' ELSE 'FAIL' END,
    'CRM support tables: ' || COUNT(*) FILTER (WHERE c.table_name IS NOT NULL) || '/4. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.table_name IS NULL THEN e.t END, ', '), 'All present')
  FROM (VALUES ('opportunity_stage_history'),('customer_quotation_items'),
    ('audit_logs'),('pipeline_updates')) AS e(t)
  LEFT JOIN (SELECT DISTINCT table_name FROM information_schema.tables WHERE table_schema='public') c ON c.table_name = e.t;

  -- A3: Leads table key columns
  RETURN QUERY
  SELECT 'A3',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 10 THEN 'PASS' ELSE 'FAIL' END,
    'Leads key columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/10. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('lead_id'),('company_name'),('contact_name'),('contact_email'),
    ('contact_phone'),('triage_status'),('marketing_owner_user_id'),('sales_owner_user_id'),
    ('dedupe_key'),('created_by')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='leads' AND c.column_name = e.col;

  -- A4: Opportunity stages enum
  RETURN QUERY
  SELECT 'A4',
    CASE WHEN COUNT(*) >= 6 THEN 'PASS' ELSE 'FAIL' END,
    'opportunity_stage enum values: ' || COUNT(*) || '. ' ||
    COALESCE(string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder), 'NONE')
  FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'opportunity_stage';

  -- A5: Lead triage status enum
  RETURN QUERY
  SELECT 'A5',
    CASE WHEN COUNT(*) >= 3 THEN 'PASS' ELSE 'FAIL' END,
    'lead_triage_status enum: ' || COUNT(*) || ' values. ' ||
    COALESCE(string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder), 'NONE')
  FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'lead_triage_status';

  -- ============================================================
  -- SECTION B: TICKETING MODULE — TABLE STRUCTURE
  -- ============================================================

  -- B1: Core ticketing tables exist
  RETURN QUERY
  SELECT 'B1',
    CASE WHEN COUNT(*) FILTER (WHERE c.table_name IS NOT NULL) = 8 THEN 'PASS' ELSE 'FAIL' END,
    'Ticketing tables: ' || COUNT(*) FILTER (WHERE c.table_name IS NOT NULL) || '/8. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.table_name IS NULL THEN e.t END, ', '), 'All present')
  FROM (VALUES ('tickets'),('ticket_events'),('ticket_comments'),('ticket_assignments'),
    ('ticket_attachments'),('ticket_sla_tracking'),('ticket_rate_quotes'),('ticket_sequences')) AS e(t)
  LEFT JOIN (SELECT DISTINCT table_name FROM information_schema.tables WHERE table_schema='public') c ON c.table_name = e.t;

  -- B2: SLA & response tracking tables
  RETURN QUERY
  SELECT 'B2',
    CASE WHEN COUNT(*) FILTER (WHERE c.table_name IS NOT NULL) = 4 THEN 'PASS' ELSE 'FAIL' END,
    'SLA tables: ' || COUNT(*) FILTER (WHERE c.table_name IS NOT NULL) || '/4. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.table_name IS NULL THEN e.t END, ', '), 'All present')
  FROM (VALUES ('sla_business_hours'),('sla_holidays'),
    ('ticket_response_exchanges'),('ticket_response_metrics')) AS e(t)
  LEFT JOIN (SELECT DISTINCT table_name FROM information_schema.tables WHERE table_schema='public') c ON c.table_name = e.t;

  -- B3: Ticketing enums exist
  RETURN QUERY
  SELECT 'B3',
    CASE WHEN COUNT(DISTINCT t.typname) = 6 THEN 'PASS' ELSE 'FAIL' END,
    'Ticketing enums: ' || COUNT(DISTINCT t.typname) || '/6. ' ||
    COALESCE(string_agg(DISTINCT t.typname, ', '), 'NONE')
  FROM pg_type t
  WHERE t.typname IN ('ticket_type','ticket_status','ticket_priority',
    'ticket_event_type','ticket_close_outcome','quote_status')
    AND t.typnamespace = 'public'::regnamespace;

  -- B4: ticket_status enum values
  RETURN QUERY
  SELECT 'B4',
    CASE WHEN COUNT(*) >= 7 THEN 'PASS' ELSE 'FAIL' END,
    'ticket_status values: ' || COUNT(*) || '. ' ||
    COALESCE(string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder), 'NONE')
  FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'ticket_status';

  -- B5: Tickets key columns
  RETURN QUERY
  SELECT 'B5',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 10 THEN 'PASS' ELSE 'FAIL' END,
    'Tickets key columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/10. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('id'),('ticket_code'),('account_id'),('status'),('priority'),
    ('type'),('department'),('assigned_to'),('created_by'),('created_at')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='tickets' AND c.column_name = e.col;

  -- ============================================================
  -- SECTION C: RLS POLICIES (CRM + Ticketing)
  -- ============================================================

  -- C1: RLS enabled on key tables
  RETURN QUERY
  SELECT 'C1',
    CASE WHEN COUNT(*) FILTER (WHERE pg.relrowsecurity) = 8 THEN 'PASS' ELSE 'FAIL' END,
    'RLS enabled: ' || COUNT(*) FILTER (WHERE pg.relrowsecurity) || '/8. ' ||
    COALESCE('Disabled on: ' || string_agg(CASE WHEN NOT pg.relrowsecurity THEN e.t END, ', '), 'All enabled')
  FROM (VALUES ('profiles'),('leads'),('accounts'),('contacts'),
    ('tickets'),('ticket_events'),('ticket_comments'),('opportunities')) AS e(t)
  LEFT JOIN pg_class pg ON pg.relname = e.t;

  -- C2: Contacts has all 4 DML service policies
  RETURN QUERY
  SELECT 'C2',
    CASE WHEN COUNT(DISTINCT cmd) = 4 THEN 'PASS' ELSE 'FAIL' END,
    'Contacts service policies: ' || COALESCE(string_agg(DISTINCT cmd, ', ' ORDER BY cmd), 'NONE') || ' (need all 4 DML)'
  FROM pg_policies WHERE tablename='contacts' AND policyname LIKE '%service%';

  -- C3: Tickets RLS policies exist
  RETURN QUERY
  SELECT 'C3',
    CASE WHEN COUNT(*) >= 2 THEN 'PASS' ELSE 'FAIL' END,
    'Tickets RLS policies: ' || COUNT(*) || '. ' ||
    COALESCE(string_agg(policyname, ', ' ORDER BY policyname), 'NONE')
  FROM pg_policies WHERE tablename = 'tickets';

  -- C4: ticket_events RLS policies
  RETURN QUERY
  SELECT 'C4',
    CASE WHEN COUNT(*) >= 1 THEN 'PASS' ELSE 'FAIL' END,
    'ticket_events policies: ' || COUNT(*) || '. ' ||
    COALESCE(string_agg(policyname, ', ' ORDER BY policyname), 'NONE')
  FROM pg_policies WHERE tablename = 'ticket_events';

  -- C5: ticket_comments RLS (internal comment visibility)
  RETURN QUERY
  SELECT 'C5',
    CASE WHEN COUNT(*) >= 1 THEN 'PASS' ELSE 'FAIL' END,
    'ticket_comments policies: ' || COUNT(*) || '. ' ||
    COALESCE(string_agg(policyname, ', ' ORDER BY policyname), 'NONE')
  FROM pg_policies WHERE tablename = 'ticket_comments';

  -- ============================================================
  -- SECTION D: TRIGGER FLOW TESTS — CRM
  -- ============================================================

  -- D1: Account PIC INSERT → auto-create primary contact
  BEGIN
    INSERT INTO accounts (account_id, company_name, pic_name, pic_email, pic_phone)
    VALUES (v_acc_id, '_XTEST_Co', 'Budi Santoso', 'budi@test.com', '+62812000');

    SELECT COUNT(*) INTO v_count FROM contacts WHERE account_id = v_acc_id AND is_primary = true;

    IF v_count = 1 THEN
      RETURN QUERY SELECT 'D1'::TEXT, 'PASS'::TEXT,
        'Trigger: Account INSERT → auto-created 1 primary contact'::TEXT;
    ELSE
      RETURN QUERY SELECT 'D1'::TEXT, 'FAIL'::TEXT,
        ('Expected 1 contact, got ' || v_count || '. Check contacts_insert_service policy')::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'D1'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- D2: Contact data matches PIC (name split: first/last)
  BEGIN
    SELECT c.first_name, c.last_name, c.email, c.phone
    INTO v_first_name, v_last_name, v_email, v_phone
    FROM contacts c WHERE c.account_id = v_acc_id AND c.is_primary = true;

    IF v_first_name = 'Budi' AND v_last_name = 'Santoso'
       AND v_email = 'budi@test.com' AND v_phone = '+62812000' THEN
      RETURN QUERY SELECT 'D2'::TEXT, 'PASS'::TEXT,
        'PIC→Contact mapping: Budi|Santoso|budi@test.com|+62812000'::TEXT;
    ELSE
      RETURN QUERY SELECT 'D2'::TEXT, 'FAIL'::TEXT,
        ('Data mismatch: ' || COALESCE(v_first_name,'?') || '|' || COALESCE(v_last_name,'?')
        || '|' || COALESCE(v_email,'?') || '|' || COALESCE(v_phone,'?'))::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'D2'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- D3: PIC UPDATE → contact auto-updated (no duplicate)
  BEGIN
    UPDATE accounts SET pic_name = 'Siti Rahayu', pic_email = 'siti@test.com'
    WHERE account_id = v_acc_id;

    SELECT c.first_name, c.last_name, c.email INTO v_first_name, v_last_name, v_email
    FROM contacts c WHERE c.account_id = v_acc_id AND c.is_primary = true;

    SELECT COUNT(*) INTO v_count FROM contacts WHERE account_id = v_acc_id AND is_primary = true;

    IF v_first_name = 'Siti' AND v_last_name = 'Rahayu' AND v_email = 'siti@test.com' AND v_count = 1 THEN
      RETURN QUERY SELECT 'D3'::TEXT, 'PASS'::TEXT,
        'PIC UPDATE → contact updated, still 1 primary (no duplicate)'::TEXT;
    ELSE
      RETURN QUERY SELECT 'D3'::TEXT, 'FAIL'::TEXT,
        ('After update: ' || COALESCE(v_first_name,'?') || '|' || COALESCE(v_email,'?') || ' count=' || v_count)::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'D3'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- D4: Lead ID + dedupe key auto-generation
  BEGIN
    INSERT INTO leads (company_name, contact_email, triage_status)
    VALUES ('_XTEST_Lead_Co', 'xlead@test.com', 'New')
    RETURNING lead_id, dedupe_key INTO v_lead_id, v_dedupe_key;

    IF v_lead_id LIKE 'LEAD%' AND v_dedupe_key = '_xtest_lead_co-xlead@test.com' THEN
      RETURN QUERY SELECT 'D4'::TEXT, 'PASS'::TEXT,
        ('Lead auto-gen: id=' || v_lead_id || ' dedupe=' || v_dedupe_key)::TEXT;
    ELSIF v_lead_id IS NOT NULL THEN
      RETURN QUERY SELECT 'D4'::TEXT, 'WARN'::TEXT,
        ('Generated but unexpected: id=' || COALESCE(v_lead_id,'NULL') || ' dedupe=' || COALESCE(v_dedupe_key,'NULL'))::TEXT;
    ELSE
      RETURN QUERY SELECT 'D4'::TEXT, 'FAIL'::TEXT, 'Lead ID or dedupe key is NULL'::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'D4'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- D5: Lead dedupe UNIQUE constraint
  BEGIN
    INSERT INTO leads (company_name, contact_email, triage_status)
    VALUES ('_XTEST_Lead_Co', 'xlead@test.com', 'New');

    RETURN QUERY SELECT 'D5'::TEXT, 'FAIL'::TEXT, 'Duplicate lead allowed (constraint broken)'::TEXT;
    DELETE FROM leads WHERE company_name = '_XTEST_Lead_Co' AND lead_id != v_lead_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN QUERY SELECT 'D5'::TEXT, 'PASS'::TEXT, 'Duplicate lead rejected by UNIQUE dedupe_key'::TEXT;
    WHEN OTHERS THEN
      RETURN QUERY SELECT 'D5'::TEXT, 'FAIL'::TEXT, ('Unexpected: ' || SQLERRM)::TEXT;
  END;

  -- Cleanup lead
  DELETE FROM leads WHERE lead_id = v_lead_id;

  -- D6: Profile updated_at trigger
  BEGIN
    SELECT user_id, name, updated_at INTO v_uid, v_name, v_ts_before FROM profiles LIMIT 1;
    IF v_uid IS NOT NULL THEN
      PERFORM pg_sleep(0.05);
      UPDATE profiles SET name = name || '_x' WHERE user_id = v_uid;
      SELECT updated_at INTO v_ts_after FROM profiles WHERE user_id = v_uid;
      UPDATE profiles SET name = v_name WHERE user_id = v_uid;

      IF v_ts_after > v_ts_before THEN
        RETURN QUERY SELECT 'D6'::TEXT, 'PASS'::TEXT,
          'Profile updated_at auto-refreshed by trigger'::TEXT;
      ELSE
        RETURN QUERY SELECT 'D6'::TEXT, 'FAIL'::TEXT, 'updated_at did NOT change'::TEXT;
      END IF;
    ELSE
      RETURN QUERY SELECT 'D6'::TEXT, 'SKIP'::TEXT, 'No profiles to test'::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    BEGIN UPDATE profiles SET name = v_name WHERE user_id = v_uid; EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN QUERY SELECT 'D6'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- D7: FK CASCADE — Account DELETE → contacts auto-deleted
  BEGIN
    INSERT INTO accounts (account_id, company_name, pic_name)
    VALUES (v_acc_id2, '_XTEST_Cascade', 'Cascade Person');

    SELECT COUNT(*) INTO v_count FROM contacts WHERE account_id = v_acc_id2;
    DELETE FROM accounts WHERE account_id = v_acc_id2;
    IF v_count > 0 THEN
      SELECT COUNT(*) INTO v_count FROM contacts WHERE account_id = v_acc_id2;
      IF v_count = 0 THEN
        RETURN QUERY SELECT 'D7'::TEXT, 'PASS'::TEXT,
          'FK CASCADE: Account DELETE → contacts auto-deleted'::TEXT;
      ELSE
        RETURN QUERY SELECT 'D7'::TEXT, 'FAIL'::TEXT,
          (v_count || ' contacts remain after account delete')::TEXT;
      END IF;
    ELSE
      RETURN QUERY SELECT 'D7'::TEXT, 'WARN'::TEXT,
        'Trigger did not create contact for cascade test'::TEXT;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'D7'::TEXT, 'FAIL'::TEXT, ('Error: ' || SQLERRM)::TEXT;
  END;

  -- D8: accounts.account_status column (NOT status — CLAUDE.md pitfall)
  BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='account_status')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='status') THEN
      RETURN QUERY SELECT 'D8'::TEXT, 'PASS'::TEXT,
        'accounts uses account_status (no ambiguous "status" column)'::TEXT;
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='account_status') THEN
      RETURN QUERY SELECT 'D8'::TEXT, 'WARN'::TEXT,
        'Both account_status AND status exist (possible regression)'::TEXT;
    ELSE
      RETURN QUERY SELECT 'D8'::TEXT, 'FAIL'::TEXT, 'accounts.account_status MISSING'::TEXT;
    END IF;
  END;

  -- ============================================================
  -- SECTION E: TRIGGER CHECKS — TICKETING
  -- ============================================================

  -- E1: Mirror trigger ACTIVE on ticket_events
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'trg_mirror_ticket_event_to_responses' AND c.relname = 'ticket_events' AND t.tgenabled = 'O'
    ) THEN
      RETURN QUERY SELECT 'E1'::TEXT, 'PASS'::TEXT,
        'Mirror trigger on ticket_events: ACTIVE'::TEXT;
    ELSIF EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'trg_mirror_ticket_event_to_responses' AND c.relname = 'ticket_events'
    ) THEN
      RETURN QUERY SELECT 'E1'::TEXT, 'WARN'::TEXT, 'Mirror trigger exists but may be DISABLED'::TEXT;
    ELSE
      RETURN QUERY SELECT 'E1'::TEXT, 'FAIL'::TEXT, 'Mirror trigger NOT FOUND'::TEXT;
    END IF;
  END;

  -- E2: trg_quotation_status_sync DROPPED (migration 180 — RPCs are sole controller)
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'trg_quotation_status_sync' AND c.relname = 'customer_quotations'
    ) THEN
      RETURN QUERY SELECT 'E2'::TEXT, 'PASS'::TEXT,
        'trg_quotation_status_sync correctly DROPPED (migration 180)'::TEXT;
    ELSE
      RETURN QUERY SELECT 'E2'::TEXT, 'FAIL'::TEXT,
        'trg_quotation_status_sync still exists! Should be dropped'::TEXT;
    END IF;
  END;

  -- E3: Stage history auto-fill trigger (migration 149)
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'trg_autofill_stage_history' AND c.relname = 'opportunity_stage_history'
    ) THEN
      RETURN QUERY SELECT 'E3'::TEXT, 'PASS'::TEXT,
        'trg_autofill_stage_history on opportunity_stage_history: exists'::TEXT;
    ELSE
      RETURN QUERY SELECT 'E3'::TEXT, 'FAIL'::TEXT,
        'trg_autofill_stage_history MISSING (migration 149)'::TEXT;
    END IF;
  END;

  -- E4: PIC-to-contact trigger on accounts
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'trg_sync_account_pic_to_contact' AND c.relname = 'accounts' AND t.tgenabled = 'O'
    ) THEN
      RETURN QUERY SELECT 'E4'::TEXT, 'PASS'::TEXT,
        'trg_sync_account_pic_to_contact on accounts: ACTIVE'::TEXT;
    ELSE
      RETURN QUERY SELECT 'E4'::TEXT, 'FAIL'::TEXT,
        'trg_sync_account_pic_to_contact missing or disabled'::TEXT;
    END IF;
  END;

  -- E5: Lead ID trigger on leads
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = 'trg_lead_id' AND c.relname = 'leads'
    ) THEN
      RETURN QUERY SELECT 'E5'::TEXT, 'PASS'::TEXT,
        'trg_lead_id on leads: exists'::TEXT;
    ELSE
      RETURN QUERY SELECT 'E5'::TEXT, 'FAIL'::TEXT, 'trg_lead_id MISSING on leads'::TEXT;
    END IF;
  END;

  -- ============================================================
  -- SECTION F: RPC & FUNCTION CHECKS
  -- ============================================================

  -- F1: CRM RPCs
  RETURN QUERY
  SELECT 'F1',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 5 THEN 'PASS' ELSE 'FAIL' END,
    'CRM RPCs: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/5. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN p.proname IS NULL THEN e.fn END, ', '), 'All present')
  FROM (VALUES ('rpc_customer_quotation_mark_rejected'),('rpc_customer_quotation_mark_sent'),
    ('rpc_customer_quotation_mark_accepted'),('fn_resolve_or_create_opportunity'),
    ('sync_opportunity_to_account')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- F2: Ticketing RPCs
  RETURN QUERY
  SELECT 'F2',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Ticketing RPCs: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/2. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN p.proname IS NULL THEN e.fn END, ', '), 'All present')
  FROM (VALUES ('rpc_ticket_mark_won'),('rpc_ticket_mark_lost')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- F3: SLA helper functions
  RETURN QUERY
  SELECT 'F3',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'SLA functions: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/3. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN p.proname IS NULL THEN e.fn END, ', '), 'All present')
  FROM (VALUES ('calculate_business_hours_seconds'),('record_ticket_interaction'),
    ('update_ticket_response_metrics')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- F4: RLS helpers are SECURITY DEFINER + STABLE
  RETURN QUERY
  SELECT 'F4',
    CASE WHEN COUNT(*) FILTER (WHERE p.prosecdef AND p.provolatile = 's') = 3 THEN 'PASS' ELSE 'FAIL' END,
    'RLS helpers (SECURITY DEFINER+STABLE): ' ||
    COUNT(*) FILTER (WHERE p.prosecdef AND p.provolatile = 's') || '/3. ' ||
    COALESCE('Issues: ' || string_agg(
      CASE WHEN NOT p.prosecdef OR p.provolatile != 's'
        THEN e.fn || '(secdef=' || p.prosecdef::TEXT || ',volatile=' || p.provolatile::TEXT || ')'
      END, ', '), 'All correct')
  FROM (VALUES ('is_admin'),('is_sales'),('get_user_role')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- F5: fn_stage_config exists
  RETURN QUERY
  SELECT 'F5',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_stage_config' AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'fn_stage_config() (opportunity stage probability/config)';

  -- F6: Lead management RPCs
  RETURN QUERY
  SELECT 'F6',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'Lead RPCs: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/3. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN p.proname IS NULL THEN e.fn END, ', '), 'All present')
  FROM (VALUES ('rpc_lead_triage'),('rpc_lead_handover_to_sales_pool'),('rpc_sales_claim_lead')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- ============================================================
  -- SECTION G: DATA INTEGRITY
  -- ============================================================

  -- G1: No orphaned contacts
  RETURN QUERY
  SELECT 'G1',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'Orphaned contacts (no account): ' || COUNT(*)
  FROM contacts c LEFT JOIN accounts a ON c.account_id = a.account_id WHERE a.account_id IS NULL;

  -- G2: No duplicate primary contacts per account
  RETURN QUERY
  SELECT 'G2',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'Accounts with multiple primary contacts: ' || COUNT(*)
  FROM (SELECT account_id FROM contacts WHERE is_primary = true GROUP BY account_id HAVING COUNT(*) > 1) d;

  -- G3: No profiles with NULL role or empty email
  RETURN QUERY
  SELECT 'G3',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    'Profiles with NULL role or empty email: ' || COUNT(*)
  FROM profiles WHERE role IS NULL OR email IS NULL OR email = '';

  -- G4: All opportunities have valid stage
  RETURN QUERY
  SELECT 'G4',
    CASE WHEN COUNT(*) FILTER (WHERE o.stage IS NULL) = 0 THEN 'PASS' ELSE 'WARN' END,
    'Opportunities: ' || COUNT(*) || ' total, ' || COUNT(*) FILTER (WHERE o.stage IS NULL) || ' with NULL stage'
  FROM opportunities o;

  -- G5: Summary stats
  RETURN QUERY
  SELECT 'G5', 'INFO',
    'Data: profiles=' || (SELECT COUNT(*) FROM profiles)
    || ' leads=' || (SELECT COUNT(*) FROM leads)
    || ' accounts=' || (SELECT COUNT(*) FROM accounts)
    || ' contacts=' || (SELECT COUNT(*) FROM contacts)
    || ' opportunities=' || (SELECT COUNT(*) FROM opportunities)
    || ' tickets=' || (SELECT COUNT(*) FROM tickets)
    || ' quotations=' || (SELECT COUNT(*) FROM customer_quotations);

  -- ============================================================
  -- CLEANUP
  -- ============================================================
  DELETE FROM contacts WHERE account_id IN (v_acc_id, v_acc_id2);
  DELETE FROM accounts WHERE account_id IN (v_acc_id, v_acc_id2);
  DELETE FROM leads WHERE company_name LIKE '\_XTEST\_%' ESCAPE '\';

  RETURN;
END;
$$;

-- STATEMENT 2: Run and show results
SELECT * FROM _run_comprehensive_tests();

-- STATEMENT 3: Cleanup
DROP FUNCTION IF EXISTS _run_comprehensive_tests();
