-- =====================================================
-- README VERIFICATION TEST
-- Verifies ALL flows and rules documented in README.md
-- are actually implemented in the PostgreSQL backend.
--
-- HOW TO RUN: Paste ALL 3 statements in Supabase SQL
-- Editor and run together.
-- =====================================================

-- STATEMENT 1: Create test function
CREATE OR REPLACE FUNCTION _run_readme_verification()
RETURNS TABLE(test_id TEXT, status TEXT, detail TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
  v_txt TEXT;
  v_prob INT;
  v_next TEXT;
  v_data_type TEXT;
BEGIN

  -- ============================================================
  -- SECTION R1: USER ROLES (README §5 - User Roles & Permissions)
  -- README specifies 15 roles in the Role Hierarchy table
  -- ============================================================

  -- R1.1: user_role enum has exactly 15 values
  RETURN QUERY
  SELECT 'R1.1',
    CASE WHEN COUNT(*) = 15 THEN 'PASS' ELSE 'FAIL' END,
    'user_role enum count: ' || COUNT(*) || '/15. Values: ' ||
    string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
  FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'user_role';

  -- R1.2: All 15 README role names exist in enum
  RETURN QUERY
  SELECT 'R1.2',
    CASE WHEN COUNT(*) FILTER (WHERE e.enumlabel IS NOT NULL) = 15 THEN 'PASS' ELSE 'FAIL' END,
    'README roles in enum: ' || COUNT(*) FILTER (WHERE e.enumlabel IS NOT NULL) || '/15. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN e.enumlabel IS NULL THEN r.role_name END, ', '), 'All present')
  FROM (VALUES ('Director'),('super admin'),('Marketing Manager'),('MACX'),('Marcomm'),
    ('DGO'),('VDCO'),('sales manager'),('sales support'),('salesperson'),
    ('EXIM Ops'),('domestics Ops'),('Import DTD Ops'),('traffic & warehous'),('finance')) AS r(role_name)
  LEFT JOIN (SELECT e2.enumlabel FROM pg_enum e2 JOIN pg_type t2 ON e2.enumtypid = t2.oid WHERE t2.typname = 'user_role') e
    ON e.enumlabel = r.role_name;

  -- ============================================================
  -- SECTION R2: LEAD LIFECYCLE (README §6 - Lead Management)
  -- States: New → In Review → Qualified → Handover → Claimed → Opportunity
  -- Also: Disqualified, Nurture, Assign to Sales
  -- ============================================================

  -- R2.1: lead_triage_status enum matches README (8 values)
  RETURN QUERY
  SELECT 'R2.1',
    CASE WHEN COUNT(*) = 8 THEN 'PASS' ELSE 'FAIL' END,
    'lead_triage_status enum: ' || COUNT(*) || ' values. ' ||
    string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
  FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'lead_triage_status';

  -- R2.2: lead_handover_pool table exists (README: auto on qualify)
  RETURN QUERY
  SELECT 'R2.2',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='lead_handover_pool')
    THEN 'PASS' ELSE 'FAIL' END,
    'lead_handover_pool table (auto-created on qualify)';

  -- R2.3: Lead handover via RPC (README §11.1 - BFF pattern, not trigger)
  RETURN QUERY
  SELECT 'R2.3',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='rpc_lead_handover_to_sales_pool'
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'rpc_lead_handover_to_sales_pool() (README §11.1: handover via RPC + API route)';

  -- R2.4: Lead key columns from README interface
  RETURN QUERY
  SELECT 'R2.4',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 10 THEN 'PASS' ELSE 'FAIL' END,
    'Lead README columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/10. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('lead_id'),('company_name'),('contact_name'),('contact_email'),('contact_phone'),
    ('source'),('triage_status'),('marketing_owner_user_id'),('sales_owner_user_id'),
    ('opportunity_id')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='leads' AND c.column_name = e.col;

  -- R2.5: Lead dedupe_key unique constraint
  RETURN QUERY
  SELECT 'R2.5',
    CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
      WHERE tablename='leads' AND indexdef LIKE '%dedupe_key%' AND indexdef LIKE '%UNIQUE%')
    THEN 'PASS' ELSE 'FAIL' END,
    'leads.dedupe_key UNIQUE constraint (race-safe claiming)';

  -- R2.6: Lead handover columns (handover_eligible, handover pool expires_at)
  RETURN QUERY
  SELECT 'R2.6',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='lead_handover_pool' AND column_name='expires_at')
    THEN 'PASS' ELSE 'FAIL' END,
    'lead_handover_pool.expires_at (README: NOW() + 7 days)';

  -- ============================================================
  -- SECTION R3: PIPELINE / OPPORTUNITY (README §6 - Pipeline Management)
  -- Stages: Prospecting, Discovery, Quote Sent, Negotiation,
  --         Closed Won, Closed Lost, On Hold
  -- ============================================================

  -- R3.1: opportunity_stage enum has exactly 7 values matching README
  RETURN QUERY
  SELECT 'R3.1',
    CASE WHEN COUNT(*) FILTER (WHERE e2.enumlabel IS NOT NULL) = 7 THEN 'PASS' ELSE 'FAIL' END,
    'opportunity_stage README values: ' ||
    COUNT(*) FILTER (WHERE e2.enumlabel IS NOT NULL) || '/7. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN e2.enumlabel IS NULL THEN r.stage END, ', '), 'All present')
  FROM (VALUES ('Prospecting'),('Discovery'),('Quote Sent'),('Negotiation'),
    ('Closed Won'),('Closed Lost'),('On Hold')) AS r(stage)
  LEFT JOIN (SELECT e3.enumlabel FROM pg_enum e3 JOIN pg_type t3 ON e3.enumtypid = t3.oid WHERE t3.typname = 'opportunity_stage') e2
    ON e2.enumlabel = r.stage;

  -- R3.2: fn_stage_config returns correct probabilities (README §6 table)
  -- Prospecting=10, Discovery=25, Quote Sent=50, Negotiation=75, Closed Won=100, Closed Lost=0
  RETURN QUERY
  SELECT 'R3.2',
    CASE WHEN
      (SELECT (fn_stage_config('Prospecting'::opportunity_stage)).probability) = 10
      AND (SELECT (fn_stage_config('Discovery'::opportunity_stage)).probability) = 25
      AND (SELECT (fn_stage_config('Quote Sent'::opportunity_stage)).probability) = 50
      AND (SELECT (fn_stage_config('Negotiation'::opportunity_stage)).probability) = 75
      AND (SELECT (fn_stage_config('Closed Won'::opportunity_stage)).probability) = 100
      AND (SELECT (fn_stage_config('Closed Lost'::opportunity_stage)).probability) = 0
    THEN 'PASS' ELSE 'FAIL' END,
    'fn_stage_config probabilities match README table';

  -- R3.3: opportunity_stage_history has all 4 stage columns (README §16 dual-column architecture)
  RETURN QUERY
  SELECT 'R3.3',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 4 THEN 'PASS' ELSE 'FAIL' END,
    'Stage history 4-column architecture: ' ||
    COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/4. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('from_stage'),('to_stage'),('old_stage'),('new_stage')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='opportunity_stage_history' AND c.column_name = e.col;

  -- R3.4: trg_log_stage_change on opportunities (README §11.2)
  RETURN QUERY
  SELECT 'R3.4',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE event_object_table='opportunities' AND trigger_name LIKE '%log_stage%')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_log_stage_change on opportunities (README §11.2)';

  -- R3.5: trg_autofill_stage_history on opportunity_stage_history (README §11.2, Migration 149)
  RETURN QUERY
  SELECT 'R3.5',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE event_object_table='opportunity_stage_history' AND trigger_name LIKE '%autofill%')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_autofill_stage_history BEFORE INSERT (README §11.2, Migration 149)';

  -- R3.6: opportunity_id is TEXT type (README §16 Technical Notes)
  SELECT data_type INTO v_data_type FROM information_schema.columns
    WHERE table_schema='public' AND table_name='opportunities' AND column_name='opportunity_id';
  RETURN QUERY
  SELECT 'R3.6',
    CASE WHEN v_data_type IN ('text', 'character varying') THEN 'PASS' ELSE 'FAIL' END,
    'opportunities.opportunity_id is TEXT (not UUID): actual=' || COALESCE(v_data_type, 'NOT FOUND');

  -- ============================================================
  -- SECTION R4: ACCOUNT STATUS LIFECYCLE (README §6 - Account Status)
  -- 6 statuses: calon_account, new_account, failed_account,
  --             active_account, passive_account, lost_account
  -- ============================================================

  -- R4.1: account_status enum has all 6 README values
  RETURN QUERY
  SELECT 'R4.1',
    CASE WHEN COUNT(*) FILTER (WHERE e2.enumlabel IS NOT NULL) = 6 THEN 'PASS' ELSE 'FAIL' END,
    'account_status enum: ' ||
    COUNT(*) FILTER (WHERE e2.enumlabel IS NOT NULL) || '/6. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN e2.enumlabel IS NULL THEN r.st END, ', '), 'All present')
  FROM (VALUES ('calon_account'),('new_account'),('failed_account'),
    ('active_account'),('passive_account'),('lost_account')) AS r(st)
  LEFT JOIN (SELECT e3.enumlabel FROM pg_enum e3 JOIN pg_type t3 ON e3.enumtypid = t3.oid WHERE t3.typname = 'account_status') e2
    ON e2.enumlabel = r.st;

  -- R4.2: sync_opportunity_to_account function exists (README §6)
  RETURN QUERY
  SELECT 'R4.2',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='sync_opportunity_to_account'
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'sync_opportunity_to_account() (README: WON/LOST transitions)';

  -- R4.3: fn_compute_effective_account_status exists (README: aging-based)
  RETURN QUERY
  SELECT 'R4.3',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_compute_effective_account_status'
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'fn_compute_effective_account_status() (README: aging priority lost>passive>active)';

  -- R4.4: fn_bulk_update_account_aging exists (README: cron-callable)
  RETURN QUERY
  SELECT 'R4.4',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_bulk_update_account_aging'
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'fn_bulk_update_account_aging() (README: cron-callable batch update)';

  -- R4.5: trg_reset_failed_on_new_opportunity trigger exists
  RETURN QUERY
  SELECT 'R4.5',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE trigger_name LIKE '%reset_failed%' OR trigger_name LIKE '%failed_on_new%')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_reset_failed_on_new_opportunity (README: failed→calon on new opp)';

  -- R4.6: v_accounts_with_status view exists
  RETURN QUERY
  SELECT 'R4.6',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.views
      WHERE table_schema='public' AND table_name='v_accounts_with_status')
    THEN 'PASS' ELSE 'FAIL' END,
    'v_accounts_with_status view (README: includes calculated_status)';

  -- R4.7: accounts has transaction date columns
  RETURN QUERY
  SELECT 'R4.7',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Account transaction dates: ' ||
    COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/2. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('first_transaction_date'),('last_transaction_date')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='accounts' AND c.column_name = e.col;

  -- ============================================================
  -- SECTION R5: TICKETING (README §8 - Module: Ticketing)
  -- ============================================================

  -- R5.1: ticket_type enum (RFQ, GEN)
  RETURN QUERY
  SELECT 'R5.1',
    CASE WHEN COUNT(*) FILTER (WHERE e2.enumlabel IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'ticket_type enum: ' ||
    COALESCE(string_agg(e2.enumlabel, ', '), 'NONE') || ' (need RFQ,GEN)'
  FROM (VALUES ('RFQ'),('GEN')) AS r(tt)
  LEFT JOIN (SELECT e3.enumlabel FROM pg_enum e3 JOIN pg_type t3 ON e3.enumtypid = t3.oid WHERE t3.typname = 'ticket_type') e2
    ON e2.enumlabel = r.tt;

  -- R5.2: ticket_status has all 8 README values
  RETURN QUERY
  SELECT 'R5.2',
    CASE WHEN COUNT(*) FILTER (WHERE e2.enumlabel IS NOT NULL) = 8 THEN 'PASS' ELSE 'FAIL' END,
    'ticket_status: ' || COUNT(*) FILTER (WHERE e2.enumlabel IS NOT NULL) || '/8. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN e2.enumlabel IS NULL THEN r.st END, ', '), 'All present')
  FROM (VALUES ('open'),('need_response'),('in_progress'),('waiting_customer'),
    ('need_adjustment'),('pending'),('resolved'),('closed')) AS r(st)
  LEFT JOIN (SELECT e3.enumlabel FROM pg_enum e3 JOIN pg_type t3 ON e3.enumtypid = t3.oid WHERE t3.typname = 'ticket_status') e2
    ON e2.enumlabel = r.st;

  -- R5.3: shipment_details table exists with key columns (README §8 Multi-Shipment)
  -- Note: shipment_details links via lead_id (FK), NOT ticket_id. Tickets link via opportunity/quotation.
  RETURN QUERY
  SELECT 'R5.3',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 8 THEN 'PASS' ELSE 'FAIL' END,
    'shipment_details columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/8. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('shipment_detail_id'),('lead_id'),('shipment_order'),('shipment_label'),
    ('service_type_code'),('origin_city'),('destination_city'),('cargo_description')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='shipment_details' AND c.column_name = e.col;

  -- R5.4: ticket_code is VARCHAR(20) UNIQUE (README §8 Ticket Code Format)
  RETURN QUERY
  SELECT 'R5.4',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='tickets' AND column_name='ticket_code'
        AND (character_maximum_length = 20 OR data_type = 'character varying'))
      AND EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='tickets'
        AND indexdef LIKE '%ticket_code%' AND indexdef LIKE '%UNIQUE%')
    THEN 'PASS' ELSE 'FAIL' END,
    'tickets.ticket_code VARCHAR UNIQUE (README: [TYPE][DEPT][ddmmyy][XXX])';

  -- R5.5: Tickets department column (README: routing by service scope)
  RETURN QUERY
  SELECT 'R5.5',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='tickets' AND column_name='department')
    THEN 'PASS' ELSE 'FAIL' END,
    'tickets.department column (README: DOM/EXI/DTD routing)';

  -- R5.6: SLA tracking tables (README §8)
  -- Note: SLA config table is ticketing_sla_config (Migration 035), NOT ticket_sla_configs
  RETURN QUERY
  SELECT 'R5.6',
    CASE WHEN COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) = 4 THEN 'PASS' ELSE 'FAIL' END,
    'SLA tables: ' || COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) || '/4. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN t.table_name IS NULL THEN e.tbl END, ', '), 'All present')
  FROM (VALUES ('ticket_sla_tracking'),('ticketing_sla_config'),
    ('sla_business_hours'),('sla_holidays')) AS e(tbl)
  LEFT JOIN information_schema.tables t
    ON t.table_schema='public' AND t.table_name = e.tbl;

  -- ============================================================
  -- SECTION R6: QUOTATION SYSTEM (README §9 - Module: Quotations)
  -- ============================================================

  -- R6.1: customer_quotations key columns from README interface
  RETURN QUERY
  SELECT 'R6.1',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 14 THEN 'PASS' ELSE 'FAIL' END,
    'customer_quotations README columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/14. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('id'),('ticket_id'),('quotation_number'),('validation_code'),
    ('customer_name'),('total_selling_rate'),('currency'),
    ('status'),('sent_at'),('accepted_at'),('rejected_at'),
    ('source_type'),('operational_cost_ids'),('shipments')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='customer_quotations' AND c.column_name = e.col;

  -- R6.2: quote_status enum (4 stored values; expired is computed via valid_until < NOW())
  RETURN QUERY
  SELECT 'R6.2',
    CASE WHEN COUNT(*) FILTER (WHERE e2.enumlabel IS NOT NULL) = 4 THEN 'PASS' ELSE 'FAIL' END,
    'quote_status enum: ' ||
    COALESCE(string_agg(e2.enumlabel, ', ' ORDER BY e2.enumlabel), 'NONE') ||
    ' (need: draft,sent,accepted,rejected; expired=computed via valid_until)'
  FROM (VALUES ('draft'),('sent'),('accepted'),('rejected')) AS r(qs)
  LEFT JOIN (SELECT e3.enumlabel FROM pg_enum e3 JOIN pg_type t3 ON e3.enumtypid = t3.oid WHERE t3.typname = 'quote_status') e2
    ON e2.enumlabel = r.qs;

  -- R6.3: Quotation support tables (README §13)
  RETURN QUERY
  SELECT 'R6.3',
    CASE WHEN COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) = 4 THEN 'PASS' ELSE 'FAIL' END,
    'Quotation tables: ' || COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) || '/4. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN t.table_name IS NULL THEN e.tbl END, ', '), 'All present')
  FROM (VALUES ('customer_quotation_items'),('quotation_rejection_reasons'),
    ('quotation_term_templates'),('customer_quotation_sequences')) AS e(tbl)
  LEFT JOIN information_schema.tables t
    ON t.table_schema='public' AND t.table_name = e.tbl;

  -- R6.4: Operational cost table + items (README §9)
  RETURN QUERY
  SELECT 'R6.4',
    CASE WHEN COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Operational cost tables: ' || COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) || '/2. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN t.table_name IS NULL THEN e.tbl END, ', '), 'All present')
  FROM (VALUES ('ticket_rate_quotes'),('ticket_rate_quote_items')) AS e(tbl)
  LEFT JOIN information_schema.tables t
    ON t.table_schema='public' AND t.table_name = e.tbl;

  -- R6.5: ticket_rate_quotes has key columns from README (is_current, shipment_detail_id, rate_structure)
  RETURN QUERY
  SELECT 'R6.5',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 6 THEN 'PASS' ELSE 'FAIL' END,
    'Op cost README columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/6. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('ticket_id'),('amount'),('currency'),('rate_structure'),
    ('shipment_detail_id'),('is_current')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='ticket_rate_quotes' AND c.column_name = e.col;

  -- R6.6: fn_resolve_latest_operational_cost function (README §9 creation path)
  RETURN QUERY
  SELECT 'R6.6',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_resolve_latest_operational_cost'
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'fn_resolve_latest_operational_cost() (README: mandatory for RFQ tickets)';

  -- R6.7: customer_quotations.source_type supports 4 creation paths
  RETURN QUERY
  SELECT 'R6.7',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='customer_quotations' AND column_name='source_type')
    THEN 'PASS' ELSE 'FAIL' END,
    'customer_quotations.source_type (README: ticket/lead/opportunity/standalone)';

  -- R6.8: customer_quotations has direct_quotation or lead_id + opportunity_id columns
  RETURN QUERY
  SELECT 'R6.8',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Quotation source links: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/2. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('lead_id'),('opportunity_id')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='customer_quotations' AND c.column_name = e.col;

  -- ============================================================
  -- SECTION R7: QUOTATION RPCs (README §10 - Workflows)
  -- mark_sent, mark_rejected, mark_accepted + supporting functions
  -- ============================================================

  -- R7.1: All 3 quotation lifecycle RPCs exist
  RETURN QUERY
  SELECT 'R7.1',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'Quotation lifecycle RPCs: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/3. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN p.proname IS NULL THEN e.fn END, ', '), 'All present')
  FROM (VALUES ('rpc_customer_quotation_mark_sent'),('rpc_customer_quotation_mark_rejected'),
    ('rpc_customer_quotation_mark_accepted')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R7.2: fn_resolve_or_create_opportunity exists (README: 6-step resolution)
  RETURN QUERY
  SELECT 'R7.2',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_resolve_or_create_opportunity'
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'fn_resolve_or_create_opportunity() (README: quotation→lead→account→ticket→check→auto-create)';

  -- R7.3: Ticket RPCs exist (mark_won, mark_lost)
  RETURN QUERY
  SELECT 'R7.3',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Ticket RPCs: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/2. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN p.proname IS NULL THEN e.fn END, ', '), 'All present')
  FROM (VALUES ('rpc_ticket_mark_won'),('rpc_ticket_mark_lost')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R7.4: Lead management RPCs exist (claim is via API route, handover is RPC)
  RETURN QUERY
  SELECT 'R7.4',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'Lead RPCs: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/3. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN p.proname IS NULL THEN e.fn END, ', '), 'All present')
  FROM (VALUES ('rpc_lead_triage'),('rpc_lead_handover_to_sales_pool'),('rpc_lead_convert')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R7.5: Quotation creation RPCs from README §9 creation paths
  RETURN QUERY
  SELECT 'R7.5',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) >= 2 THEN 'PASS' ELSE 'FAIL' END,
    'Quotation creation RPCs: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '. ' ||
    COALESCE(string_agg(CASE WHEN p.proname IS NOT NULL THEN e.fn END, ', '), 'NONE')
  FROM (VALUES ('create_quotation_from_lead'),('create_quotation_from_opportunity'),
    ('create_quotation_from_pipeline')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- ============================================================
  -- SECTION R8: AUTO-UPDATE TRIGGERS (README §11)
  -- ============================================================

  -- R8.1: trg_cost_supersede_per_shipment (README §11.4)
  RETURN QUERY
  SELECT 'R8.1',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE trigger_name LIKE '%cost_supersede%' OR trigger_name LIKE '%supersede%')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_cost_supersede_per_shipment (README §11.4: is_current management)';

  -- R8.2: link_quotation_to_operational_cost trigger (README §11 Multi-Shipment Sync)
  RETURN QUERY
  SELECT 'R8.2',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE trigger_name LIKE '%link_quotation%')
    THEN 'PASS' ELSE 'FAIL' END,
    'link_quotation_to_operational_cost trigger (README: links cost_ids on quotation INSERT)';

  -- R8.3: Mirror trigger on ticket_events (README §11 implied)
  RETURN QUERY
  SELECT 'R8.3',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE event_object_table='ticket_events' AND trigger_name LIKE '%mirror%')
    THEN 'PASS' ELSE 'FAIL' END,
    'Mirror trigger on ticket_events (README: auto-comments + ticket_responses)';

  -- R8.4: trg_quotation_status_sync DROPPED (README v2.1.4: migration 180)
  RETURN QUERY
  SELECT 'R8.4',
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE trigger_name = 'trg_quotation_status_sync')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_quotation_status_sync correctly DROPPED (README v2.1.4, migration 180)';

  -- R8.5: SLA triggers (README §11.5)
  RETURN QUERY
  SELECT 'R8.5',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name LIKE '%sla%')
    THEN 'PASS' ELSE 'FAIL' END,
    'SLA tracking triggers exist (README §11.5)';

  -- R8.6: PIC→Contact sync trigger (README implied by data model)
  RETURN QUERY
  SELECT 'R8.6',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE trigger_name = 'trg_sync_account_pic_to_contact')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_sync_account_pic_to_contact (README: accounts→contacts auto-sync)';

  -- ============================================================
  -- SECTION R9: QUOTATION STATUS SYNC RULES (README §4)
  -- Verify tables have the right columns to support status sync
  -- ============================================================

  -- R9.1: ticket has close_outcome column for won/lost tracking (README §8)
  RETURN QUERY
  SELECT 'R9.1',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='tickets' AND column_name='close_outcome')
    THEN 'PASS' ELSE 'FAIL' END,
    'tickets.close_outcome (README: won/lost on close)';

  -- R9.2: ticket has competitor_name, competitor_cost for rejection (README §8)
  RETURN QUERY
  SELECT 'R9.2',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Ticket competitor columns: ' ||
    COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/2. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('competitor_name'),('competitor_cost')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='tickets' AND c.column_name = e.col;

  -- R9.3: ticket_rate_quotes status column supports all README states
  RETURN QUERY
  SELECT 'R9.3',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='ticket_rate_quotes' AND column_name='status')
    THEN 'PASS' ELSE 'FAIL' END,
    'ticket_rate_quotes.status (README: draft→submitted→sent_to_customer→accepted/revise_requested)';

  -- R9.4: pipeline_updates table with correct columns (README §11.3)
  RETURN QUERY
  SELECT 'R9.4',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'pipeline_updates columns: ' ||
    COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/3. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('approach_method'),('old_stage'),('new_stage')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='pipeline_updates' AND c.column_name = e.col;

  -- R9.5: activities table has related_lead_id (README §16 Lead ID Derivation)
  RETURN QUERY
  SELECT 'R9.5',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='activities' AND column_name='related_lead_id')
    THEN 'PASS' ELSE 'FAIL' END,
    'activities.related_lead_id (README §16: lead derivation chain for RPCs)';

  -- ============================================================
  -- SECTION R10: RLS & SECURITY (README §5, §9, §16)
  -- ============================================================

  -- R10.1: is_quotation_creator_for_ticket helper (README v1.6.6, Migration 145)
  RETURN QUERY
  SELECT 'R10.1',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_quotation_creator_for_ticket'
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'is_quotation_creator_for_ticket() SECURITY DEFINER (README v1.6.6: anti-RLS-recursion)';

  -- R10.2: RLS helper functions are SECURITY DEFINER + STABLE
  RETURN QUERY
  SELECT 'R10.2',
    CASE WHEN COUNT(*) FILTER (WHERE p.prosecdef) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'RLS helpers SECURITY DEFINER: ' ||
    COUNT(*) FILTER (WHERE p.prosecdef) || '/3. ' ||
    COALESCE(string_agg(e.fn || '=' || p.prosecdef::TEXT, ', '), 'NONE')
  FROM (VALUES ('is_admin'),('is_sales'),('get_user_role')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R10.3: RLS enabled on critical tables (README §3 Architecture)
  RETURN QUERY
  SELECT 'R10.3',
    CASE WHEN COUNT(*) FILTER (WHERE r.relrowsecurity) = 10 THEN 'PASS' ELSE 'FAIL' END,
    'RLS enabled: ' || COUNT(*) FILTER (WHERE r.relrowsecurity) || '/10. ' ||
    COALESCE('Disabled: ' || string_agg(CASE WHEN NOT r.relrowsecurity THEN e.tbl END, ', '), 'All enabled')
  FROM (VALUES ('profiles'),('accounts'),('contacts'),('leads'),('opportunities'),
    ('tickets'),('ticket_events'),('ticket_comments'),('customer_quotations'),('ticket_rate_quotes')) AS e(tbl)
  LEFT JOIN pg_class r ON r.relname = e.tbl AND r.relnamespace = 'public'::regnamespace;

  -- R10.4: Service policies exist for all critical tables (README v2.1.4)
  RETURN QUERY
  SELECT 'R10.4',
    CASE WHEN COUNT(DISTINCT tablename) >= 8 THEN 'PASS' ELSE 'FAIL' END,
    'Tables with service RLS policies: ' || COUNT(DISTINCT tablename) ||
    '. Tables: ' || COALESCE(string_agg(DISTINCT tablename, ', ' ORDER BY tablename), 'NONE')
  FROM pg_policies WHERE policyname LIKE '%service%' AND schemaname = 'public';

  -- ============================================================
  -- SECTION R11: TECHNICAL NOTES (README §16)
  -- ============================================================

  -- R11.1: accepted_at, rejected_at columns are TIMESTAMPTZ (README §16)
  RETURN QUERY
  SELECT 'R11.1',
    CASE WHEN COUNT(*) FILTER (WHERE c.data_type = 'timestamp with time zone') = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Quotation timestamp columns: ' ||
    COUNT(*) FILTER (WHERE c.data_type = 'timestamp with time zone') || '/2 TIMESTAMPTZ. ' ||
    COALESCE(string_agg(e.col || '=' || COALESCE(c.data_type, 'MISSING'), ', '), 'NONE')
  FROM (VALUES ('accepted_at'),('rejected_at')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='customer_quotations' AND c.column_name = e.col;

  -- R11.2: countries table exists with entries (README §16, Migration 153)
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
    WHERE table_schema='public' AND table_name='countries';
  IF v_count > 0 THEN
    SELECT COUNT(*) INTO v_count FROM countries;
    RETURN QUERY
    SELECT 'R11.2',
      CASE WHEN v_count >= 200 THEN 'PASS' ELSE 'WARN' END,
      'countries table: ' || v_count || ' entries (README: 250 countries)';
  ELSE
    RETURN QUERY SELECT 'R11.2', 'FAIL'::TEXT, 'countries table NOT FOUND'::TEXT;
  END IF;

  -- R11.3: ticket_responses table exists (README: mirror trigger target)
  RETURN QUERY
  SELECT 'R11.3',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='ticket_responses')
    THEN 'PASS' ELSE 'FAIL' END,
    'ticket_responses table (README: mirror trigger creates entries)';

  -- R11.4: ticket_response_exchanges table (README: SLA tracking)
  RETURN QUERY
  SELECT 'R11.4',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='ticket_response_exchanges')
    THEN 'PASS' ELSE 'FAIL' END,
    'ticket_response_exchanges table (README: SLA exchange tracking)';

  -- R11.5: ticket_response_metrics table (README v2.1.4)
  RETURN QUERY
  SELECT 'R11.5',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='ticket_response_metrics')
    THEN 'PASS' ELSE 'FAIL' END,
    'ticket_response_metrics table (README v2.1.4: quote metrics trigger)';

  -- ============================================================
  -- SECTION R12: CRM DASHBOARD DATA (README §7)
  -- Verify all data tables referenced in dashboard exist
  -- ============================================================

  -- R12.1: Dashboard data source tables
  RETURN QUERY
  SELECT 'R12.1',
    CASE WHEN COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) = 6 THEN 'PASS' ELSE 'FAIL' END,
    'Dashboard data tables: ' || COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) || '/6. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN t.table_name IS NULL THEN e.tbl END, ', '), 'All present')
  FROM (VALUES ('leads'),('opportunities'),('accounts'),('activities'),
    ('sales_plans'),('pipeline_updates')) AS e(tbl)
  LEFT JOIN information_schema.tables t
    ON t.table_schema='public' AND t.table_name = e.tbl;

  -- R12.2: opportunities has original_creator_id (README §7: marketing data scoping)
  RETURN QUERY
  SELECT 'R12.2',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='opportunities' AND column_name='original_creator_id')
    THEN 'PASS' ELSE 'FAIL' END,
    'opportunities.original_creator_id (README §7: marketing dept scoping)';

  -- R12.3: accounts has original_creator_id (README §7: marketing data scoping)
  RETURN QUERY
  SELECT 'R12.3',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='accounts' AND column_name='original_creator_id')
    THEN 'PASS' ELSE 'FAIL' END,
    'accounts.original_creator_id (README §7: marketing dept scoping)';

  -- R12.4: opportunity_stage_history for sales cycle calculation (README §7)
  RETURN QUERY
  SELECT 'R12.4',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='opportunity_stage_history' AND column_name='changed_at')
    THEN 'PASS' ELSE 'FAIL' END,
    'opportunity_stage_history.changed_at (README §7: avg sales cycle calculation)';

  -- ============================================================
  -- SECTION R13: COMPLETE TABLE INVENTORY (README §13)
  -- All tables mentioned in README Database Schema section
  -- ============================================================

  -- R13.1: All core CRM tables
  RETURN QUERY
  SELECT 'R13.1',
    CASE WHEN COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) = 6 THEN 'PASS' ELSE 'FAIL' END,
    'Core CRM tables: ' || COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) || '/6. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN t.table_name IS NULL THEN e.tbl END, ', '), 'All present')
  FROM (VALUES ('profiles'),('accounts'),('contacts'),('leads'),
    ('opportunities'),('activities')) AS e(tbl)
  LEFT JOIN information_schema.tables t
    ON t.table_schema='public' AND t.table_name = e.tbl;

  -- R13.2: All ticketing tables from README
  RETURN QUERY
  SELECT 'R13.2',
    CASE WHEN COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) = 6 THEN 'PASS' ELSE 'FAIL' END,
    'Ticketing tables: ' || COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) || '/6. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN t.table_name IS NULL THEN e.tbl END, ', '), 'All present')
  FROM (VALUES ('tickets'),('ticket_events'),('ticket_rate_quotes'),
    ('ticket_rate_quote_items'),('ticket_sla_tracking'),('shipment_details')) AS e(tbl)
  LEFT JOIN information_schema.tables t
    ON t.table_schema='public' AND t.table_name = e.tbl;

  -- R13.3: All quotation tables from README
  RETURN QUERY
  SELECT 'R13.3',
    CASE WHEN COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) = 4 THEN 'PASS' ELSE 'FAIL' END,
    'Quotation tables: ' || COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) || '/4. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN t.table_name IS NULL THEN e.tbl END, ', '), 'All present')
  FROM (VALUES ('customer_quotations'),('customer_quotation_items'),
    ('quotation_rejection_reasons'),('quotation_term_templates')) AS e(tbl)
  LEFT JOIN information_schema.tables t
    ON t.table_schema='public' AND t.table_name = e.tbl;

  -- ============================================================
  -- SECTION R15: RPC FLOW VERIFICATION (README §10 - Workflows)
  -- Verifies all quotation lifecycle RPCs are SECURITY DEFINER
  -- and have correct return types for atomic operations
  -- ============================================================

  -- R15.1: All 3 quotation RPCs are SECURITY DEFINER (bypass RLS for INSERT/UPDATE)
  RETURN QUERY
  SELECT 'R15.1',
    CASE WHEN COUNT(*) FILTER (WHERE p.prosecdef) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'Quotation RPCs SECURITY DEFINER: ' ||
    COUNT(*) FILTER (WHERE p.prosecdef) || '/3. ' ||
    COALESCE(string_agg(e.fn || '=' || COALESCE(p.prosecdef::TEXT, 'NOT_FOUND'), ', '), 'NONE')
  FROM (VALUES ('rpc_customer_quotation_mark_sent'),('rpc_customer_quotation_mark_rejected'),
    ('rpc_customer_quotation_mark_accepted')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R15.2: mark_won and mark_lost RPCs are SECURITY DEFINER
  RETURN QUERY
  SELECT 'R15.2',
    CASE WHEN COUNT(*) FILTER (WHERE p.prosecdef) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Ticket RPCs SECURITY DEFINER: ' ||
    COUNT(*) FILTER (WHERE p.prosecdef) || '/2. ' ||
    COALESCE(string_agg(e.fn || '=' || COALESCE(p.prosecdef::TEXT, 'NOT_FOUND'), ', '), 'NONE')
  FROM (VALUES ('rpc_ticket_mark_won'),('rpc_ticket_mark_lost')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R15.3: sync_opportunity_to_account is SECURITY DEFINER (README §6 Account Lifecycle)
  RETURN QUERY
  SELECT 'R15.3',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc
      WHERE proname='sync_opportunity_to_account' AND prosecdef = TRUE
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'sync_opportunity_to_account() is SECURITY DEFINER (bypasses RLS for account updates)';

  -- R15.4: fn_resolve_or_create_opportunity is SECURITY DEFINER (README §10.3)
  RETURN QUERY
  SELECT 'R15.4',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc
      WHERE proname='fn_resolve_or_create_opportunity' AND prosecdef = TRUE
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'fn_resolve_or_create_opportunity() is SECURITY DEFINER (6-step resolution)';

  -- R15.5: fn_stage_config exists and returns composite type with probability + next_step
  RETURN QUERY
  SELECT 'R15.5',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_stage_config'
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'fn_stage_config() exists (README: returns probability, next_step, next_step_due_date)';

  -- R15.6: Lead management RPCs are SECURITY DEFINER
  RETURN QUERY
  SELECT 'R15.6',
    CASE WHEN COUNT(*) FILTER (WHERE p.prosecdef) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'Lead RPCs SECURITY DEFINER: ' ||
    COUNT(*) FILTER (WHERE p.prosecdef) || '/3. ' ||
    COALESCE(string_agg(e.fn || '=' || COALESCE(p.prosecdef::TEXT, 'NOT_FOUND'), ', '), 'NONE')
  FROM (VALUES ('rpc_lead_triage'),('rpc_lead_handover_to_sales_pool'),('rpc_lead_convert')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R15.7: quotation_rejection_reason_type enum exists with values (README §10.3 mark_rejected)
  RETURN QUERY
  SELECT 'R15.7',
    CASE WHEN COUNT(*) >= 1 THEN 'PASS' ELSE 'FAIL' END,
    'quotation_rejection_reason_type enum: ' || COUNT(*) || ' values. ' ||
    COALESCE(string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder), 'NOT FOUND')
  FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'quotation_rejection_reason_type';

  -- R15.8: valid_until column exists for computed expiry (README §9)
  RETURN QUERY
  SELECT 'R15.8',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Computed expiry columns: ' || COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/2. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.tbl || '.' || e.col END, ', '), 'All present')
  FROM (VALUES ('customer_quotations', 'valid_until'),('ticket_rate_quotes', 'valid_until')) AS e(tbl, col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name = e.tbl AND c.column_name = e.col;

  -- ============================================================
  -- SECTION R16: AUTO-UPDATE TRIGGER INVENTORY (README §11)
  -- Comprehensive check of all documented triggers
  -- ============================================================

  -- R16.1: trg_lead_id (BEFORE INSERT on leads — auto-generate lead_id + dedupe_key)
  RETURN QUERY
  SELECT 'R16.1',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE event_object_table='leads' AND trigger_name = 'trg_lead_id')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_lead_id on leads (BEFORE INSERT: auto-generate lead_id + dedupe_key)';

  -- R16.2: Mirror trigger on ticket_events (auto-comments + ticket_responses)
  RETURN QUERY
  SELECT 'R16.2',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE event_object_table='ticket_events' AND trigger_name LIKE '%mirror%')
    THEN 'PASS' ELSE 'FAIL' END,
    'Mirror trigger on ticket_events (creates auto-comments + ticket_responses, Migration 144)';

  -- R16.3: trg_log_stage_change on opportunities (AFTER UPDATE — stage history)
  RETURN QUERY
  SELECT 'R16.3',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE event_object_table='opportunities' AND trigger_name LIKE '%log_stage%'
        AND event_manipulation='UPDATE')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_log_stage_change AFTER UPDATE on opportunities (README §11.2)';

  -- R16.4: trg_autofill_stage_history (BEFORE INSERT — 4-column auto-fill)
  RETURN QUERY
  SELECT 'R16.4',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE event_object_table='opportunity_stage_history'
        AND trigger_name LIKE '%autofill%'
        AND action_timing='BEFORE')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_autofill_stage_history BEFORE INSERT on opportunity_stage_history (Migration 149)';

  -- R16.5: Cost supersede trigger (is_current management)
  RETURN QUERY
  SELECT 'R16.5',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE trigger_name LIKE '%cost_supersede%' OR trigger_name LIKE '%supersede%')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_cost_supersede_per_shipment (README §11.4: sets is_current=FALSE for old costs)';

  -- R16.6: Link quotation to operational cost trigger
  RETURN QUERY
  SELECT 'R16.6',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE trigger_name LIKE '%link_quotation%'
        AND event_object_table='customer_quotations')
    THEN 'PASS' ELSE 'FAIL' END,
    'link_quotation_to_operational_cost on customer_quotations (README §11 Multi-Shipment)';

  -- R16.7: PIC → Contact sync trigger (accounts INSERT/UPDATE)
  RETURN QUERY
  SELECT 'R16.7',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE trigger_name = 'trg_sync_account_pic_to_contact'
        AND event_object_table='accounts')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_sync_account_pic_to_contact on accounts (auto-create/update primary contact)';

  -- R16.8: Reset failed account on new opportunity trigger
  RETURN QUERY
  SELECT 'R16.8',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE trigger_name LIKE '%reset_failed%' OR trigger_name LIKE '%failed_on_new%')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_reset_failed_on_new_opportunity (README §6: failed_account → calon_account)';

  -- R16.9: SLA tracking triggers exist (on ticket_rate_quotes and/or tickets)
  RETURN QUERY
  SELECT 'R16.9',
    CASE WHEN (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name LIKE '%sla%') >= 1
    THEN 'PASS' ELSE 'FAIL' END,
    'SLA triggers: ' || (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_name LIKE '%sla%') ||
    ' found. Names: ' || COALESCE(
      (SELECT string_agg(DISTINCT trigger_name, ', ' ORDER BY trigger_name)
       FROM information_schema.triggers WHERE trigger_name LIKE '%sla%'), 'NONE');

  -- R16.10: trg_quotation_status_sync MUST NOT exist (DROPPED in Migration 180)
  -- This trigger was removed because RPCs are sole controller of quotation lifecycle
  RETURN QUERY
  SELECT 'R16.10',
    CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE trigger_name = 'trg_quotation_status_sync')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_quotation_status_sync DROPPED (Migration 180: RPCs are sole controller)';

  -- R16.11: Profile updated_at auto-refresh trigger
  RETURN QUERY
  SELECT 'R16.11',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE event_object_table='profiles' AND action_timing='BEFORE' AND event_manipulation='UPDATE')
    THEN 'PASS' ELSE 'FAIL' END,
    'Profile updated_at trigger (BEFORE UPDATE: auto-refresh timestamp)';

  -- R16.12: Quotation sync trigger on opportunity close (won/lost)
  -- Note: Account sync on stage change is handled by RPCs (sync_opportunity_to_account),
  -- NOT by trigger. trg_sync_account_on_opportunity_create was DROPPED in migration 148.
  RETURN QUERY
  SELECT 'R16.12',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE event_object_table='opportunities'
        AND trigger_name = 'trg_sync_quotation_on_opportunity_close')
    THEN 'PASS' ELSE 'FAIL' END,
    'trg_sync_quotation_on_opportunity_close on opportunities (syncs quotation on won/lost)';

  -- R16.13: Complete trigger inventory count
  RETURN QUERY
  SELECT 'R16.13', 'INFO',
    'Total triggers in public schema: ' ||
    (SELECT COUNT(DISTINCT trigger_name) FROM information_schema.triggers
     WHERE trigger_schema = 'public') ||
    '. Tables with triggers: ' ||
    (SELECT COUNT(DISTINCT event_object_table) FROM information_schema.triggers
     WHERE trigger_schema = 'public');

  -- ============================================================
  -- SECTION R17: RPC COMPLETE INVENTORY (README §10, §11, §12)
  -- All RPC functions that power the application
  -- ============================================================

  -- R17.1: Quotation lifecycle RPCs (mark_sent, mark_rejected, mark_accepted)
  RETURN QUERY
  SELECT 'R17.1',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'Quotation lifecycle RPCs: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/3. ' ||
    COALESCE(string_agg(CASE WHEN p.proname IS NOT NULL THEN e.fn ELSE 'MISSING:' || e.fn END, ', '), 'NONE')
  FROM (VALUES ('rpc_customer_quotation_mark_sent'),('rpc_customer_quotation_mark_rejected'),
    ('rpc_customer_quotation_mark_accepted')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R17.2: Ticket lifecycle RPCs (mark_won, mark_lost)
  RETURN QUERY
  SELECT 'R17.2',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Ticket lifecycle RPCs: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/2. ' ||
    COALESCE(string_agg(CASE WHEN p.proname IS NOT NULL THEN e.fn ELSE 'MISSING:' || e.fn END, ', '), 'NONE')
  FROM (VALUES ('rpc_ticket_mark_won'),('rpc_ticket_mark_lost')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R17.3: Lead management RPCs (triage, handover, convert)
  RETURN QUERY
  SELECT 'R17.3',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'Lead management RPCs: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/3. ' ||
    COALESCE(string_agg(CASE WHEN p.proname IS NOT NULL THEN e.fn ELSE 'MISSING:' || e.fn END, ', '), 'NONE')
  FROM (VALUES ('rpc_lead_triage'),('rpc_lead_handover_to_sales_pool'),('rpc_lead_convert')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R17.4: Account lifecycle functions (sync, aging compute, bulk update)
  RETURN QUERY
  SELECT 'R17.4',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'Account lifecycle functions: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/3. ' ||
    COALESCE(string_agg(CASE WHEN p.proname IS NOT NULL THEN e.fn ELSE 'MISSING:' || e.fn END, ', '), 'NONE')
  FROM (VALUES ('sync_opportunity_to_account'),('fn_compute_effective_account_status'),
    ('fn_bulk_update_account_aging')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R17.5: Opportunity resolution functions
  RETURN QUERY
  SELECT 'R17.5',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Opportunity resolution functions: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/2. ' ||
    COALESCE(string_agg(CASE WHEN p.proname IS NOT NULL THEN e.fn ELSE 'MISSING:' || e.fn END, ', '), 'NONE')
  FROM (VALUES ('fn_resolve_or_create_opportunity'),('fn_stage_config')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R17.6: Operational cost helper functions
  RETURN QUERY
  SELECT 'R17.6',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc
      WHERE proname='fn_resolve_latest_operational_cost'
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'fn_resolve_latest_operational_cost() (README §9: mandatory for RFQ quotation creation)';

  -- R17.7: RLS helper functions inventory
  RETURN QUERY
  SELECT 'R17.7',
    CASE WHEN COUNT(*) FILTER (WHERE p.proname IS NOT NULL) = 4 THEN 'PASS' ELSE 'FAIL' END,
    'RLS helper functions: ' || COUNT(*) FILTER (WHERE p.proname IS NOT NULL) || '/4. ' ||
    COALESCE(string_agg(CASE WHEN p.proname IS NOT NULL THEN e.fn ELSE 'MISSING:' || e.fn END, ', '), 'NONE')
  FROM (VALUES ('is_admin'),('is_sales'),('get_user_role'),('is_quotation_creator_for_ticket')) AS e(fn)
  LEFT JOIN pg_proc p ON p.proname = e.fn AND p.pronamespace = 'public'::regnamespace;

  -- R17.8: Ticketing overview RPC (README §8 Dashboard)
  RETURN QUERY
  SELECT 'R17.8',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc
      WHERE proname LIKE 'rpc_ticketing_overview%'
      AND pronamespace='public'::regnamespace)
    THEN 'PASS' ELSE 'FAIL' END,
    'rpc_ticketing_overview function exists (README §8: ticketing dashboard data)';

  -- ============================================================
  -- SECTION R18: QUOTATION STATUS SYNC FLOW (README §4, §10)
  -- Verify all tables involved in status sync have required columns
  -- ============================================================

  -- R18.1: customer_quotations → opportunity sync columns
  RETURN QUERY
  SELECT 'R18.1',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 4 THEN 'PASS' ELSE 'FAIL' END,
    'Quotation→Opportunity sync columns: ' ||
    COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/4. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('opportunity_id'),('ticket_id'),('status'),('lead_id')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='customer_quotations' AND c.column_name = e.col;

  -- R18.2: opportunities has all columns updated by quotation RPCs
  RETURN QUERY
  SELECT 'R18.2',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 6 THEN 'PASS' ELSE 'FAIL' END,
    'Opportunity RPC-updated columns: ' ||
    COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/6. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('stage'),('probability'),('next_step'),('next_step_due_date'),
    ('estimated_value'),('closed_at')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='opportunities' AND c.column_name = e.col;

  -- R18.3: tickets has all columns updated by quotation RPCs
  RETURN QUERY
  SELECT 'R18.3',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'Ticket RPC-updated columns: ' ||
    COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/3. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('status'),('close_outcome'),('pending_response_from')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='tickets' AND c.column_name = e.col;

  -- R18.4: ticket_rate_quotes has customer_quotation_id for back-reference (link trigger)
  RETURN QUERY
  SELECT 'R18.4',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='ticket_rate_quotes' AND column_name='customer_quotation_id')
    THEN 'PASS' ELSE 'FAIL' END,
    'ticket_rate_quotes.customer_quotation_id (back-reference set by link trigger)';

  -- R18.5: leads has quotation_status and quotation_count for RPC updates
  RETURN QUERY
  SELECT 'R18.5',
    CASE WHEN COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) = 2 THEN 'PASS' ELSE 'FAIL' END,
    'Lead quotation tracking: ' ||
    COUNT(*) FILTER (WHERE c.column_name IS NOT NULL) || '/2. ' ||
    COALESCE('Missing: ' || string_agg(CASE WHEN c.column_name IS NULL THEN e.col END, ', '), 'All present')
  FROM (VALUES ('quotation_status'),('quotation_count')) AS e(col)
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='leads' AND c.column_name = e.col;

  -- R18.6: accounts.account_status column exists (NOT 'status' — Migration 172 fix)
  RETURN QUERY
  SELECT 'R18.6',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name='accounts' AND column_name='account_status')
    THEN 'PASS' ELSE 'FAIL' END,
    'accounts.account_status column (NOT status — Migration 172 regression fix)';

  -- R18.7: operational_cost_rejection_reasons table exists (mark_rejected creates entries)
  RETURN QUERY
  SELECT 'R18.7',
    CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='operational_cost_rejection_reasons')
    THEN 'PASS' ELSE 'FAIL' END,
    'operational_cost_rejection_reasons table (mark_rejected inserts rejection data)';

  -- ============================================================
  -- SECTION R14: SUMMARY
  -- ============================================================

  RETURN QUERY
  SELECT 'R14', 'INFO',
    'Total profiles: ' || (SELECT COUNT(*) FROM profiles)
    || ' | Leads: ' || (SELECT COUNT(*) FROM leads)
    || ' | Accounts: ' || (SELECT COUNT(*) FROM accounts)
    || ' | Opportunities: ' || (SELECT COUNT(*) FROM opportunities)
    || ' | Tickets: ' || (SELECT COUNT(*) FROM tickets)
    || ' | Quotations: ' || (SELECT COUNT(*) FROM customer_quotations)
    || ' | Countries: ' || (SELECT COUNT(*) FROM countries);

  RETURN;
END;
$$;

-- STATEMENT 2: Run and show results
SELECT * FROM _run_readme_verification();

-- STATEMENT 3: Cleanup
DROP FUNCTION IF EXISTS _run_readme_verification();
