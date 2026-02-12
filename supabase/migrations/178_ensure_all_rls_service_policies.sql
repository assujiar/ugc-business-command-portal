-- =====================================================
-- Migration 178: Ensure ALL RLS Service Policies Exist
-- =====================================================
-- Consolidates ALL service policies from migrations 174+175 into
-- one idempotent migration. Safe to run even if 174/175 were already applied.
--
-- ROOT CAUSE: SECURITY DEFINER functions still evaluate RLS in Supabase.
-- auth.uid() IS NULL for service_role/adminClient calls.
-- Without these policies, RPCs can't SELECT from opportunities/tickets/etc.
-- Symptom: old_stage=null, new_stage=null, ticket_status=null in RPC response.
-- =====================================================

-- =====================================================
-- OPPORTUNITIES: SELECT + UPDATE + INSERT
-- =====================================================
DROP POLICY IF EXISTS opp_select_service ON public.opportunities;
CREATE POLICY opp_select_service ON public.opportunities
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS opp_update_service ON public.opportunities;
CREATE POLICY opp_update_service ON public.opportunities
    FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS opp_insert_service ON public.opportunities;
CREATE POLICY opp_insert_service ON public.opportunities
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- TICKETS: SELECT + UPDATE + INSERT
-- =====================================================
DROP POLICY IF EXISTS tickets_select_service ON public.tickets;
CREATE POLICY tickets_select_service ON public.tickets
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS tickets_update_service ON public.tickets;
CREATE POLICY tickets_update_service ON public.tickets
    FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS tickets_insert_service ON public.tickets;
CREATE POLICY tickets_insert_service ON public.tickets
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- TICKET_EVENTS: SELECT + INSERT + UPDATE
-- =====================================================
DROP POLICY IF EXISTS ticket_events_select_service ON public.ticket_events;
CREATE POLICY ticket_events_select_service ON public.ticket_events
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_events_insert_service ON public.ticket_events;
CREATE POLICY ticket_events_insert_service ON public.ticket_events
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_events_update_service ON public.ticket_events;
CREATE POLICY ticket_events_update_service ON public.ticket_events
    FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- TICKET_COMMENTS: SELECT + INSERT + UPDATE
-- =====================================================
DROP POLICY IF EXISTS ticket_comments_select_service ON public.ticket_comments;
CREATE POLICY ticket_comments_select_service ON public.ticket_comments
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_comments_insert_service ON public.ticket_comments;
CREATE POLICY ticket_comments_insert_service ON public.ticket_comments
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_comments_update_service ON public.ticket_comments;
CREATE POLICY ticket_comments_update_service ON public.ticket_comments
    FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PIPELINE_UPDATES: SELECT + INSERT + UPDATE
-- =====================================================
DROP POLICY IF EXISTS pipeline_updates_select_service ON public.pipeline_updates;
CREATE POLICY pipeline_updates_select_service ON public.pipeline_updates
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS pipeline_updates_insert_service ON public.pipeline_updates;
CREATE POLICY pipeline_updates_insert_service ON public.pipeline_updates
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS pipeline_updates_update_service ON public.pipeline_updates;
CREATE POLICY pipeline_updates_update_service ON public.pipeline_updates
    FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- ACTIVITIES: SELECT + INSERT + UPDATE
-- =====================================================
DROP POLICY IF EXISTS activities_select_service ON public.activities;
CREATE POLICY activities_select_service ON public.activities
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS activities_insert_service ON public.activities;
CREATE POLICY activities_insert_service ON public.activities
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS activities_update_service ON public.activities;
CREATE POLICY activities_update_service ON public.activities
    FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- OPPORTUNITY_STAGE_HISTORY: SELECT + INSERT
-- =====================================================
DROP POLICY IF EXISTS opp_stage_history_select_service ON public.opportunity_stage_history;
CREATE POLICY opp_stage_history_select_service ON public.opportunity_stage_history
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS opp_stage_history_insert_service ON public.opportunity_stage_history;
CREATE POLICY opp_stage_history_insert_service ON public.opportunity_stage_history
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- CUSTOMER_QUOTATIONS: SELECT + UPDATE + INSERT
-- =====================================================
DROP POLICY IF EXISTS customer_quotations_select_service ON public.customer_quotations;
CREATE POLICY customer_quotations_select_service ON public.customer_quotations
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS customer_quotations_update_service ON public.customer_quotations;
CREATE POLICY customer_quotations_update_service ON public.customer_quotations
    FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS customer_quotations_insert_service ON public.customer_quotations;
CREATE POLICY customer_quotations_insert_service ON public.customer_quotations
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- LEADS: SELECT + UPDATE + INSERT
-- =====================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'leads' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        DROP POLICY IF EXISTS leads_select_service ON public.leads;
        CREATE POLICY leads_select_service ON public.leads FOR SELECT USING (auth.uid() IS NULL);
        DROP POLICY IF EXISTS leads_update_service ON public.leads;
        CREATE POLICY leads_update_service ON public.leads FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);
        DROP POLICY IF EXISTS leads_insert_service ON public.leads;
        CREATE POLICY leads_insert_service ON public.leads FOR INSERT WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- TICKET_RATE_QUOTES (operational costs): SELECT + UPDATE + INSERT
-- =====================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'ticket_rate_quotes' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        DROP POLICY IF EXISTS trq_select_service ON public.ticket_rate_quotes;
        CREATE POLICY trq_select_service ON public.ticket_rate_quotes FOR SELECT USING (auth.uid() IS NULL);
        DROP POLICY IF EXISTS trq_update_service ON public.ticket_rate_quotes;
        CREATE POLICY trq_update_service ON public.ticket_rate_quotes FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);
        DROP POLICY IF EXISTS trq_insert_service ON public.ticket_rate_quotes;
        CREATE POLICY trq_insert_service ON public.ticket_rate_quotes FOR INSERT WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- QUOTATION_REJECTION_REASONS: SELECT + INSERT
-- =====================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'quotation_rejection_reasons' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        DROP POLICY IF EXISTS qrr_select_service ON public.quotation_rejection_reasons;
        CREATE POLICY qrr_select_service ON public.quotation_rejection_reasons FOR SELECT USING (auth.uid() IS NULL);
        DROP POLICY IF EXISTS qrr_insert_service ON public.quotation_rejection_reasons;
        CREATE POLICY qrr_insert_service ON public.quotation_rejection_reasons FOR INSERT WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- TICKET_RESPONSES: SELECT + INSERT + UPDATE
-- =====================================================
DROP POLICY IF EXISTS ticket_responses_select_service ON public.ticket_responses;
CREATE POLICY ticket_responses_select_service ON public.ticket_responses
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_responses_insert_service ON public.ticket_responses;
CREATE POLICY ticket_responses_insert_service ON public.ticket_responses
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_responses_update_service ON public.ticket_responses;
CREATE POLICY ticket_responses_update_service ON public.ticket_responses
    FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- TICKET_RESPONSE_EXCHANGES: SELECT + INSERT
-- =====================================================
DROP POLICY IF EXISTS ticket_response_exchanges_select_service ON public.ticket_response_exchanges;
CREATE POLICY ticket_response_exchanges_select_service ON public.ticket_response_exchanges
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_response_exchanges_insert_service ON public.ticket_response_exchanges;
CREATE POLICY ticket_response_exchanges_insert_service ON public.ticket_response_exchanges
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- TICKET_RESPONSE_METRICS: SELECT + INSERT + UPDATE
-- =====================================================
DROP POLICY IF EXISTS ticket_response_metrics_select_service ON public.ticket_response_metrics;
CREATE POLICY ticket_response_metrics_select_service ON public.ticket_response_metrics
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_response_metrics_insert_service ON public.ticket_response_metrics;
CREATE POLICY ticket_response_metrics_insert_service ON public.ticket_response_metrics
    FOR INSERT WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS ticket_response_metrics_update_service ON public.ticket_response_metrics;
CREATE POLICY ticket_response_metrics_update_service ON public.ticket_response_metrics
    FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- PROFILES: SELECT
-- =====================================================
DROP POLICY IF EXISTS profiles_select_service ON public.profiles;
CREATE POLICY profiles_select_service ON public.profiles
    FOR SELECT USING (auth.uid() IS NULL);

-- =====================================================
-- ACCOUNTS: SELECT + UPDATE
-- =====================================================
DROP POLICY IF EXISTS accounts_select_service ON public.accounts;
CREATE POLICY accounts_select_service ON public.accounts
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS accounts_update_service ON public.accounts;
CREATE POLICY accounts_update_service ON public.accounts
    FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- CONTACTS: SELECT + UPDATE
-- =====================================================
DROP POLICY IF EXISTS contacts_select_service ON public.contacts;
CREATE POLICY contacts_select_service ON public.contacts
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS contacts_update_service ON public.contacts;
CREATE POLICY contacts_update_service ON public.contacts
    FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);

-- =====================================================
-- TICKET_RATE_QUOTE_ITEMS: SELECT + INSERT + UPDATE
-- =====================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'ticket_rate_quote_items' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        DROP POLICY IF EXISTS trq_items_select_service ON public.ticket_rate_quote_items;
        CREATE POLICY trq_items_select_service ON public.ticket_rate_quote_items FOR SELECT USING (auth.uid() IS NULL);
        DROP POLICY IF EXISTS trq_items_insert_service ON public.ticket_rate_quote_items;
        CREATE POLICY trq_items_insert_service ON public.ticket_rate_quote_items FOR INSERT WITH CHECK (auth.uid() IS NULL);
        DROP POLICY IF EXISTS trq_items_update_service ON public.ticket_rate_quote_items;
        CREATE POLICY trq_items_update_service ON public.ticket_rate_quote_items FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- CUSTOMER_QUOTATION_ITEMS: SELECT + INSERT + UPDATE
-- =====================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'customer_quotation_items' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        DROP POLICY IF EXISTS cqi_select_service ON public.customer_quotation_items;
        CREATE POLICY cqi_select_service ON public.customer_quotation_items FOR SELECT USING (auth.uid() IS NULL);
        DROP POLICY IF EXISTS cqi_insert_service ON public.customer_quotation_items;
        CREATE POLICY cqi_insert_service ON public.customer_quotation_items FOR INSERT WITH CHECK (auth.uid() IS NULL);
        DROP POLICY IF EXISTS cqi_update_service ON public.customer_quotation_items;
        CREATE POLICY cqi_update_service ON public.customer_quotation_items FOR UPDATE USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- SLA TABLES: SELECT
-- =====================================================
DROP POLICY IF EXISTS sla_business_hours_select_service ON public.sla_business_hours;
CREATE POLICY sla_business_hours_select_service ON public.sla_business_hours
    FOR SELECT USING (auth.uid() IS NULL);

DROP POLICY IF EXISTS sla_holidays_select_service ON public.sla_holidays;
CREATE POLICY sla_holidays_select_service ON public.sla_holidays
    FOR SELECT USING (auth.uid() IS NULL);

-- =====================================================
-- TICKET_ASSIGNMENTS: SELECT + INSERT
-- =====================================================
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE c.relname = 'ticket_assignments' AND n.nspname = 'public' AND c.relrowsecurity = true) THEN
        DROP POLICY IF EXISTS ticket_assignments_select_service ON public.ticket_assignments;
        CREATE POLICY ticket_assignments_select_service ON public.ticket_assignments FOR SELECT USING (auth.uid() IS NULL);
        DROP POLICY IF EXISTS ticket_assignments_insert_service ON public.ticket_assignments;
        CREATE POLICY ticket_assignments_insert_service ON public.ticket_assignments FOR INSERT WITH CHECK (auth.uid() IS NULL);
    END IF;
END $$;

-- =====================================================
-- VERIFICATION: Count all service policies
-- =====================================================
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE policyname LIKE '%_service%'
    AND schemaname = 'public';

    RAISE WARNING '[178] Total service policies in public schema: %', v_count;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
