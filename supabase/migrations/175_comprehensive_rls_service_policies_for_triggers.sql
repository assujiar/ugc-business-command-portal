-- =====================================================
-- Migration 175: Comprehensive RLS Service Policies for Triggers
-- =====================================================
-- Migration 174 added service policies for tables accessed by RPCs.
-- This migration completes the coverage for ALL tables accessed by
-- SECURITY DEFINER triggers that fire in service_role context
-- (auth.uid() IS NULL).
--
-- Pattern: USING (auth.uid() IS NULL) / WITH CHECK (auth.uid() IS NULL)
-- This activates ONLY when there is no authenticated user (service_role),
-- allowing SECURITY DEFINER triggers and RPCs to read/write freely.
--
-- CRITICAL TABLES MISSING SERVICE POLICIES:
--   ticket_responses, ticket_response_exchanges, ticket_response_metrics,
--   profiles, accounts, contacts
--
-- PARTIAL TABLES MISSING OPERATIONS:
--   opportunity_stage_history (SELECT), opportunities (INSERT)
-- =====================================================

-- =====================================================
-- PART 1: ticket_responses
-- RLS enabled: migration 075
-- Accessed by: mirror_ticket_event_to_response_tables() [SECURITY DEFINER]
--              auto_record_response_on_comment() [SECURITY DEFINER]
-- =====================================================
DROP POLICY IF EXISTS ticket_responses_select_service ON public.ticket_responses;
CREATE POLICY ticket_responses_select_service ON public.ticket_responses
    FOR SELECT
    USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_responses_insert_service ON public.ticket_responses;
CREATE POLICY ticket_responses_insert_service ON public.ticket_responses
    FOR INSERT
    WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_responses_update_service ON public.ticket_responses;
CREATE POLICY ticket_responses_update_service ON public.ticket_responses
    FOR UPDATE
    USING (auth.uid() IS NULL)
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PART 2: ticket_response_exchanges
-- RLS enabled: migration 040
-- Accessed by: mirror_ticket_event_to_response_tables() [SECURITY DEFINER]
--              trigger_track_ticket_status_change_sla() [SECURITY DEFINER]
--              trigger_track_ticket_assignment_sla() [SECURITY DEFINER]
--              record_response_exchange() [SECURITY DEFINER]
-- =====================================================
DROP POLICY IF EXISTS ticket_response_exchanges_select_service ON public.ticket_response_exchanges;
CREATE POLICY ticket_response_exchanges_select_service ON public.ticket_response_exchanges
    FOR SELECT
    USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_response_exchanges_insert_service ON public.ticket_response_exchanges;
CREATE POLICY ticket_response_exchanges_insert_service ON public.ticket_response_exchanges
    FOR INSERT
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PART 3: ticket_response_metrics
-- RLS enabled: migration 040
-- Accessed by: fn_update_quote_metrics_on_quote() [SECURITY DEFINER]
-- =====================================================
DROP POLICY IF EXISTS ticket_response_metrics_select_service ON public.ticket_response_metrics;
CREATE POLICY ticket_response_metrics_select_service ON public.ticket_response_metrics
    FOR SELECT
    USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_response_metrics_insert_service ON public.ticket_response_metrics;
CREATE POLICY ticket_response_metrics_insert_service ON public.ticket_response_metrics
    FOR INSERT
    WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_response_metrics_update_service ON public.ticket_response_metrics;
CREATE POLICY ticket_response_metrics_update_service ON public.ticket_response_metrics
    FOR UPDATE
    USING (auth.uid() IS NULL)
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PART 4: profiles
-- RLS enabled: migration 010
-- Accessed by: mirror_ticket_event_to_response_tables() [SECURITY DEFINER]
--              auto_record_response_on_comment() [SECURITY DEFINER]
--              set_ticket_departments() / fn_set_ticket_origin_department()
-- =====================================================
DROP POLICY IF EXISTS profiles_select_service ON public.profiles;
CREATE POLICY profiles_select_service ON public.profiles
    FOR SELECT
    USING (auth.uid() IS NULL);

-- =====================================================
-- PART 5: accounts
-- RLS enabled: migration 010
-- Accessed by: fn_sync_account_on_opportunity_create() [SECURITY DEFINER]
--              fn_reset_failed_account_on_new_opportunity() [SECURITY DEFINER]
--              sync_opportunity_to_account() [SECURITY DEFINER]
-- =====================================================
DROP POLICY IF EXISTS accounts_select_service ON public.accounts;
CREATE POLICY accounts_select_service ON public.accounts
    FOR SELECT
    USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS accounts_update_service ON public.accounts;
CREATE POLICY accounts_update_service ON public.accounts
    FOR UPDATE
    USING (auth.uid() IS NULL)
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PART 6: contacts
-- RLS enabled: migration 010
-- Accessed by: fn_sync_account_pic_to_contact() (account PIC sync)
-- =====================================================
DROP POLICY IF EXISTS contacts_select_service ON public.contacts;
CREATE POLICY contacts_select_service ON public.contacts
    FOR SELECT
    USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS contacts_update_service ON public.contacts;
CREATE POLICY contacts_update_service ON public.contacts
    FOR UPDATE
    USING (auth.uid() IS NULL)
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PART 7: opportunity_stage_history - ADD SELECT
-- Migration 174 added INSERT only. SELECT needed for
-- fn_opportunity_create_initial_records() NOT EXISTS checks
-- and RPC dedup checks.
-- =====================================================
DROP POLICY IF EXISTS opp_stage_history_select_service ON public.opportunity_stage_history;
CREATE POLICY opp_stage_history_select_service ON public.opportunity_stage_history
    FOR SELECT
    USING (auth.uid() IS NULL);

-- =====================================================
-- PART 8: opportunities - ADD INSERT
-- Migration 174 added SELECT + UPDATE only. INSERT needed for
-- fn_resolve_or_create_opportunity() which creates new opportunities
-- when none exist for a quotation.
-- =====================================================
DROP POLICY IF EXISTS opp_insert_service ON public.opportunities;
CREATE POLICY opp_insert_service ON public.opportunities
    FOR INSERT
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PART 9: SLA configuration tables
-- RLS enabled: migration 040
-- Accessed by: SLA calculation functions used in triggers
-- =====================================================
DROP POLICY IF EXISTS sla_business_hours_select_service ON public.sla_business_hours;
CREATE POLICY sla_business_hours_select_service ON public.sla_business_hours
    FOR SELECT
    USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS sla_holidays_select_service ON public.sla_holidays;
CREATE POLICY sla_holidays_select_service ON public.sla_holidays
    FOR SELECT
    USING (auth.uid() IS NULL);

-- =====================================================
-- PART 10: ticket_rate_quote_items (operational cost line items)
-- RLS enabled: migration 054
-- May be accessed during cost operations from RPCs
-- =====================================================
DROP POLICY IF EXISTS trq_items_select_service ON public.ticket_rate_quote_items;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'ticket_rate_quote_items' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        CREATE POLICY trq_items_select_service ON public.ticket_rate_quote_items
            FOR SELECT USING (auth.uid() IS NULL);
        CREATE POLICY trq_items_insert_service ON public.ticket_rate_quote_items
            FOR INSERT WITH CHECK (auth.uid() IS NULL);
        CREATE POLICY trq_items_update_service ON public.ticket_rate_quote_items
            FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- PART 11: customer_quotation_items
-- RLS enabled: migration 050
-- May be accessed during quotation operations
-- =====================================================
DROP POLICY IF EXISTS cqi_select_service ON public.customer_quotation_items;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'customer_quotation_items' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        CREATE POLICY cqi_select_service ON public.customer_quotation_items
            FOR SELECT USING (auth.uid() IS NULL);
        CREATE POLICY cqi_insert_service ON public.customer_quotation_items
            FOR INSERT WITH CHECK (auth.uid() IS NULL);
        CREATE POLICY cqi_update_service ON public.customer_quotation_items
            FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- PART 12: customer_quotation_sequences
-- RLS enabled: migration 050
-- Accessed during quotation number generation
-- =====================================================
DROP POLICY IF EXISTS cqs_select_service ON public.customer_quotation_sequences;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'customer_quotation_sequences' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        CREATE POLICY cqs_select_service ON public.customer_quotation_sequences
            FOR SELECT USING (auth.uid() IS NULL);
        CREATE POLICY cqs_insert_service ON public.customer_quotation_sequences
            FOR INSERT WITH CHECK (auth.uid() IS NULL);
        CREATE POLICY cqs_update_service ON public.customer_quotation_sequences
            FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- PART 13: operational_cost_rejection_reasons
-- RLS enabled: migration 076
-- =====================================================
DROP POLICY IF EXISTS ocrr_select_service ON public.operational_cost_rejection_reasons;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'operational_cost_rejection_reasons' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        CREATE POLICY ocrr_select_service ON public.operational_cost_rejection_reasons
            FOR SELECT USING (auth.uid() IS NULL);
        CREATE POLICY ocrr_insert_service ON public.operational_cost_rejection_reasons
            FOR INSERT WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- PART 14: leads - ADD INSERT (for trigger propagation)
-- Migration 174 added SELECT + UPDATE only.
-- fn_propagate_ids_on_quotation_insert() may need INSERT
-- =====================================================
DROP POLICY IF EXISTS leads_insert_service ON public.leads;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'leads' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        CREATE POLICY leads_insert_service ON public.leads
            FOR INSERT WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- PART 15: ticket_comments UPDATE (for SLA trigger updates)
-- Migration 174 added SELECT + INSERT. UPDATE needed for
-- trigger_track_ticket_status_change_sla() which may update comments
-- =====================================================
DROP POLICY IF EXISTS ticket_comments_update_service ON public.ticket_comments;
CREATE POLICY ticket_comments_update_service ON public.ticket_comments
    FOR UPDATE
    USING (auth.uid() IS NULL)
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PART 16: ticket_events UPDATE service policy
-- Migration 174 added SELECT + INSERT. UPDATE needed for
-- triggers that may update event records
-- =====================================================
DROP POLICY IF EXISTS ticket_events_update_service ON public.ticket_events;
CREATE POLICY ticket_events_update_service ON public.ticket_events
    FOR UPDATE
    USING (auth.uid() IS NULL)
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PART 17: customer_quotations INSERT service policy
-- Migration 174 added SELECT + UPDATE. INSERT needed for
-- fn_link_quotation_to_cost triggers and quotation creation
-- from service context
-- =====================================================
DROP POLICY IF EXISTS customer_quotations_insert_service ON public.customer_quotations;
CREATE POLICY customer_quotations_insert_service ON public.customer_quotations
    FOR INSERT
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PART 18: ticket_rate_quotes INSERT service policy
-- Migration 174 added SELECT + UPDATE. INSERT needed for
-- cost creation from service context
-- =====================================================
DROP POLICY IF EXISTS trq_insert_service ON public.ticket_rate_quotes;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'ticket_rate_quotes' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        CREATE POLICY trq_insert_service ON public.ticket_rate_quotes
            FOR INSERT WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- PART 19: Additional ticketing tables with RLS
-- =====================================================

-- ticket_assignments (RLS enabled in migration 036)
DROP POLICY IF EXISTS ticket_assignments_select_service ON public.ticket_assignments;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'ticket_assignments' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        CREATE POLICY ticket_assignments_select_service ON public.ticket_assignments
            FOR SELECT USING (auth.uid() IS NULL);
        CREATE POLICY ticket_assignments_insert_service ON public.ticket_assignments
            FOR INSERT WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- ticket_attachments (RLS enabled in migration 036)
DROP POLICY IF EXISTS ticket_attachments_select_service ON public.ticket_attachments;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'ticket_attachments' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        CREATE POLICY ticket_attachments_select_service ON public.ticket_attachments
            FOR SELECT USING (auth.uid() IS NULL);
        CREATE POLICY ticket_attachments_insert_service ON public.ticket_attachments
            FOR INSERT WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- tickets INSERT service policy (for ticket creation from service context)
DROP POLICY IF EXISTS tickets_insert_service ON public.tickets;
CREATE POLICY tickets_insert_service ON public.tickets
    FOR INSERT
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PART 20: quotation_term_templates
-- RLS enabled: migration 050
-- =====================================================
DROP POLICY IF EXISTS qtt_select_service ON public.quotation_term_templates;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'quotation_term_templates' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        CREATE POLICY qtt_select_service ON public.quotation_term_templates
            FOR SELECT USING (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- PART 21: pipeline_updates UPDATE service policy
-- Migration 174 added SELECT + INSERT. UPDATE needed for
-- trigger updates to pipeline records
-- =====================================================
DROP POLICY IF EXISTS pipeline_updates_update_service ON public.pipeline_updates;
CREATE POLICY pipeline_updates_update_service ON public.pipeline_updates
    FOR UPDATE
    USING (auth.uid() IS NULL)
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PART 22: activities UPDATE service policy
-- Migration 174 added SELECT + INSERT. UPDATE needed for
-- activity record updates from triggers
-- =====================================================
DROP POLICY IF EXISTS activities_update_service ON public.activities;
CREATE POLICY activities_update_service ON public.activities
    FOR UPDATE
    USING (auth.uid() IS NULL)
    WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- VERIFICATION: Log all service policies created
-- =====================================================
DO $$
DECLARE
    v_count INTEGER;
    v_rec RECORD;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE policyname LIKE '%_service%'
    AND schemaname = 'public';

    RAISE WARNING '[175] Total service policies in public schema: %', v_count;

    FOR v_rec IN
        SELECT tablename, policyname, cmd
        FROM pg_policies
        WHERE policyname LIKE '%_service%'
        AND schemaname = 'public'
        ORDER BY tablename, cmd
    LOOP
        RAISE WARNING '[175] Service policy: %.% (%)', v_rec.tablename, v_rec.policyname, v_rec.cmd;
    END LOOP;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
