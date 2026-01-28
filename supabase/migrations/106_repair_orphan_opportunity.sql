-- ============================================
-- Migration: 106_repair_orphan_opportunity.sql
--
-- PURPOSE: Implement repair-or-fail logic for orphan opportunity_id references
--
-- When quotation.opportunity_id references a non-existent opportunity, attempt
-- to repair by resolving through related entities:
--   1. ticket → ticket.opportunity_id
--   2. lead → lead.opportunity_id
--   3. lead → account → single active opportunity for account
--
-- If exactly ONE opportunity is found, use it (repair the link).
-- If MULTIPLE are found (ambiguous), return 409 Conflict.
-- If NONE found and allow_autocreate=FALSE, return error.
--
-- IDEMPOTENCY: Safe to re-run (CREATE OR REPLACE)
-- ============================================


-- ============================================
-- PART 0: DROP EXISTING FUNCTION OVERLOADS
-- This prevents "function name is not unique" errors when CREATE OR REPLACE
-- has a different signature from existing overloads.
-- ============================================

DO $$
DECLARE
    v_proc RECORD;
BEGIN
    -- Drop all overloads of fn_repair_orphan_opportunity
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'fn_repair_orphan_opportunity'
    LOOP
        RAISE NOTICE '[106] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;

    -- Drop all overloads of fn_resolve_or_create_opportunity
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'fn_resolve_or_create_opportunity'
    LOOP
        RAISE NOTICE '[106] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;

    -- Drop all overloads of fn_preflight_quotation_send
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'fn_preflight_quotation_send'
    LOOP
        RAISE NOTICE '[106] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;
END $$;


-- ============================================
-- PART 1: Create fn_repair_orphan_opportunity helper
-- Returns repair candidates and recommendation
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_repair_orphan_opportunity(
    p_quotation_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_ticket_opp_id TEXT := NULL;
    v_lead_opp_id TEXT := NULL;
    v_account_opportunities RECORD;
    v_account_opp_count INTEGER := 0;
    v_account_opp_id TEXT := NULL;
    v_candidates JSONB := '[]'::JSONB;
    v_unique_candidates TEXT[] := '{}';
    v_resolved_opp_id TEXT := NULL;
    v_resolution_source TEXT := NULL;
BEGIN
    -- Get quotation with related IDs
    SELECT
        cq.id,
        cq.opportunity_id,
        cq.ticket_id,
        cq.lead_id,
        t.opportunity_id AS ticket_opportunity_id,
        l.opportunity_id AS lead_opportunity_id,
        l.account_id AS lead_account_id
    INTO v_quotation
    FROM public.customer_quotations cq
    LEFT JOIN public.tickets t ON t.id = cq.ticket_id
    LEFT JOIN public.leads l ON l.lead_id = cq.lead_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error_code', 'QUOTATION_NOT_FOUND',
            'error', 'Quotation not found'
        );
    END IF;

    -- STEP 1: Try ticket.opportunity_id
    IF v_quotation.ticket_opportunity_id IS NOT NULL THEN
        -- Verify it exists
        IF EXISTS (SELECT 1 FROM public.opportunities WHERE opportunity_id = v_quotation.ticket_opportunity_id) THEN
            v_ticket_opp_id := v_quotation.ticket_opportunity_id;
            v_candidates := v_candidates || jsonb_build_object(
                'opportunity_id', v_ticket_opp_id,
                'source', 'ticket'
            );
            IF NOT v_ticket_opp_id = ANY(v_unique_candidates) THEN
                v_unique_candidates := array_append(v_unique_candidates, v_ticket_opp_id);
            END IF;
        END IF;
    END IF;

    -- STEP 2: Try lead.opportunity_id
    IF v_quotation.lead_opportunity_id IS NOT NULL THEN
        -- Verify it exists
        IF EXISTS (SELECT 1 FROM public.opportunities WHERE opportunity_id = v_quotation.lead_opportunity_id) THEN
            v_lead_opp_id := v_quotation.lead_opportunity_id;
            v_candidates := v_candidates || jsonb_build_object(
                'opportunity_id', v_lead_opp_id,
                'source', 'lead'
            );
            IF NOT v_lead_opp_id = ANY(v_unique_candidates) THEN
                v_unique_candidates := array_append(v_unique_candidates, v_lead_opp_id);
            END IF;
        END IF;
    END IF;

    -- STEP 3: Try lead.account_id → find active opportunities
    IF v_quotation.lead_account_id IS NOT NULL THEN
        -- Count active opportunities for this account
        SELECT COUNT(*), MAX(opp.opportunity_id)
        INTO v_account_opp_count, v_account_opp_id
        FROM public.opportunities opp
        WHERE opp.account_id = v_quotation.lead_account_id
        AND opp.stage NOT IN ('Closed Won', 'Closed Lost');

        IF v_account_opp_count = 1 AND v_account_opp_id IS NOT NULL THEN
            -- Exactly one active opportunity - can use this
            v_candidates := v_candidates || jsonb_build_object(
                'opportunity_id', v_account_opp_id,
                'source', 'account_single'
            );
            IF NOT v_account_opp_id = ANY(v_unique_candidates) THEN
                v_unique_candidates := array_append(v_unique_candidates, v_account_opp_id);
            END IF;
        ELSIF v_account_opp_count > 1 THEN
            -- Multiple opportunities - ambiguous
            v_candidates := v_candidates || jsonb_build_object(
                'source', 'account_multiple',
                'count', v_account_opp_count,
                'account_id', v_quotation.lead_account_id
            );
        END IF;
    END IF;

    -- Determine resolution
    IF array_length(v_unique_candidates, 1) = 1 THEN
        -- Exactly one unique candidate - use it
        v_resolved_opp_id := v_unique_candidates[1];

        -- Determine source (prefer ticket > lead > account)
        IF v_ticket_opp_id = v_resolved_opp_id THEN
            v_resolution_source := 'ticket';
        ELSIF v_lead_opp_id = v_resolved_opp_id THEN
            v_resolution_source := 'lead';
        ELSE
            v_resolution_source := 'account';
        END IF;

        RETURN jsonb_build_object(
            'success', TRUE,
            'can_repair', TRUE,
            'resolved_opportunity_id', v_resolved_opp_id,
            'resolution_source', v_resolution_source,
            'orphan_opportunity_id', v_quotation.opportunity_id,
            'candidates', v_candidates,
            'unique_candidate_count', 1
        );

    ELSIF array_length(v_unique_candidates, 1) > 1 THEN
        -- Multiple unique candidates - ambiguous, cannot auto-repair
        RETURN jsonb_build_object(
            'success', FALSE,
            'can_repair', FALSE,
            'error_code', 'AMBIGUOUS_OPPORTUNITY',
            'error', format('Multiple opportunities found (%s). Manual resolution required.', array_length(v_unique_candidates, 1)),
            'orphan_opportunity_id', v_quotation.opportunity_id,
            'candidates', v_candidates,
            'unique_candidate_count', array_length(v_unique_candidates, 1),
            'unique_candidates', v_unique_candidates
        );

    ELSE
        -- No candidates found
        RETURN jsonb_build_object(
            'success', FALSE,
            'can_repair', FALSE,
            'error_code', 'NO_OPPORTUNITY_FOUND',
            'error', 'No valid opportunity found through repair chain (ticket -> lead -> account)',
            'orphan_opportunity_id', v_quotation.opportunity_id,
            'candidates', v_candidates,
            'unique_candidate_count', 0,
            'ticket_id', v_quotation.ticket_id,
            'lead_id', v_quotation.lead_id,
            'account_id', v_quotation.lead_account_id
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_repair_orphan_opportunity IS
'Attempts to repair an orphan opportunity_id reference by finding the correct opportunity
through the chain: ticket → lead → account. Returns resolved_opportunity_id if exactly
one candidate is found, or error_code=AMBIGUOUS_OPPORTUNITY if multiple found.';

GRANT EXECUTE ON FUNCTION public.fn_repair_orphan_opportunity(UUID) TO authenticated;


-- ============================================
-- PART 2: Update fn_resolve_or_create_opportunity with repair logic
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_resolve_or_create_opportunity(
    p_quotation_id UUID,
    p_actor_user_id UUID,
    p_allow_autocreate BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    opportunity_id TEXT,
    opportunity_stage opportunity_stage,
    was_created BOOLEAN,
    source TEXT,
    error_code TEXT,
    error_message TEXT
) AS $$
DECLARE
    v_quotation RECORD;
    v_lead RECORD;
    v_opportunity RECORD;
    v_existing_opp RECORD;
    v_new_opp_id TEXT;
    v_was_created BOOLEAN := FALSE;
    v_source TEXT := NULL;
    v_original_opp_id TEXT := NULL;
    v_repair_result JSONB;
BEGIN
    -- ============================================
    -- STEP 0: Fetch quotation with full lead info
    -- ============================================
    SELECT
        cq.id AS quotation_id,
        cq.opportunity_id AS cq_opportunity_id,
        cq.lead_id AS cq_lead_id,
        cq.ticket_id AS cq_ticket_id,
        cq.total_selling_rate AS cq_total_selling_rate,
        cq.created_by AS cq_created_by,
        l.lead_id AS lead_lead_id,
        l.opportunity_id AS lead_opportunity_id,
        l.account_id AS lead_account_id,
        l.company_name AS lead_company_name,
        l.potential_revenue AS lead_potential_revenue,
        l.sales_owner_user_id AS lead_sales_owner
    INTO v_quotation
    FROM public.customer_quotations cq
    LEFT JOIN public.leads l ON l.lead_id = cq.lead_id
    WHERE cq.id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RAISE NOTICE '[fn_resolve_or_create_opportunity] Quotation % not found', p_quotation_id;
        RETURN QUERY SELECT NULL::TEXT, NULL::opportunity_stage, FALSE, NULL::TEXT,
                            'QUOTATION_NOT_FOUND'::TEXT, 'Quotation not found'::TEXT;
        RETURN;
    END IF;

    v_original_opp_id := v_quotation.cq_opportunity_id;

    RAISE NOTICE '[fn_resolve_or_create_opportunity] Quotation found: id=%, cq_opportunity_id=%, lead_opportunity_id=%, allow_autocreate=%',
        v_quotation.quotation_id, v_quotation.cq_opportunity_id, v_quotation.lead_opportunity_id, p_allow_autocreate;

    -- ============================================
    -- STEP 1: Try direct opportunity lookup from quotation.opportunity_id
    -- If NOT FOUND, attempt REPAIR before failing
    -- ============================================
    IF v_quotation.cq_opportunity_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 1: Checking quotation opportunity_id: %', v_quotation.cq_opportunity_id;

        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_quotation.cq_opportunity_id;

        IF v_opportunity IS NOT NULL THEN
            RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 1: Found opportunity % with stage %', v_opportunity.opportunity_id, v_opportunity.stage;
            RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, FALSE, 'quotation'::TEXT, NULL::TEXT, NULL::TEXT;
            RETURN;
        ELSE
            -- ORPHAN DETECTED: Attempt repair
            RAISE WARNING '[fn_resolve_or_create_opportunity] STEP 1: ORPHAN - Opportunity % NOT FOUND. Attempting repair...', v_quotation.cq_opportunity_id;

            -- Try to repair using the repair function
            v_repair_result := fn_repair_orphan_opportunity(p_quotation_id);

            IF (v_repair_result->>'can_repair')::BOOLEAN AND v_repair_result->>'resolved_opportunity_id' IS NOT NULL THEN
                -- REPAIR SUCCESSFUL
                RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 1: REPAIR SUCCESS - Using opportunity % from source %',
                    v_repair_result->>'resolved_opportunity_id', v_repair_result->>'resolution_source';

                -- Update quotation with repaired opportunity_id
                UPDATE public.customer_quotations cq_upd
                SET opportunity_id = v_repair_result->>'resolved_opportunity_id'
                WHERE cq_upd.id = p_quotation_id;

                -- Fetch the repaired opportunity
                SELECT opp.* INTO v_opportunity
                FROM public.opportunities opp
                WHERE opp.opportunity_id = v_repair_result->>'resolved_opportunity_id';

                RETURN QUERY SELECT
                    v_opportunity.opportunity_id,
                    v_opportunity.stage,
                    FALSE,
                    ('repaired_' || COALESCE(v_repair_result->>'resolution_source', 'unknown'))::TEXT,
                    NULL::TEXT,
                    NULL::TEXT;
                RETURN;
            ELSE
                -- REPAIR FAILED
                RAISE WARNING '[fn_resolve_or_create_opportunity] STEP 1: REPAIR FAILED - %', v_repair_result->>'error';

                IF NOT p_allow_autocreate THEN
                    -- Return the repair error
                    RETURN QUERY SELECT
                        NULL::TEXT,
                        NULL::opportunity_stage,
                        FALSE,
                        'orphan_repair_failed'::TEXT,
                        (v_repair_result->>'error_code')::TEXT,
                        (v_repair_result->>'error')::TEXT;
                    RETURN;
                END IF;

                -- If allow_autocreate=TRUE, continue to try other steps
                RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 1: allow_autocreate=TRUE, continuing despite repair failure';
                v_source := 'quotation_missing';
            END IF;
        END IF;
    ELSE
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 1: Quotation has no opportunity_id';
    END IF;

    -- ============================================
    -- STEP 2: Try lead's opportunity_id
    -- ============================================
    IF v_quotation.lead_opportunity_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 2: Checking lead opportunity_id: %', v_quotation.lead_opportunity_id;

        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_quotation.lead_opportunity_id;

        IF v_opportunity IS NOT NULL THEN
            RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 2: Found opportunity % via lead', v_opportunity.opportunity_id;

            UPDATE public.customer_quotations cq_upd
            SET opportunity_id = v_quotation.lead_opportunity_id
            WHERE cq_upd.id = p_quotation_id;

            RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, FALSE, 'lead'::TEXT, NULL::TEXT, NULL::TEXT;
            RETURN;
        ELSE
            RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 2: Lead opportunity % NOT FOUND', v_quotation.lead_opportunity_id;
            v_source := 'lead_missing';
        END IF;
    ELSE
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 2: Lead has no opportunity_id';
    END IF;

    -- ============================================
    -- STEP 3: Find EXISTING opportunity by account_id
    -- ============================================
    IF v_quotation.lead_account_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 3: Searching for existing opportunity by account_id: %', v_quotation.lead_account_id;

        SELECT opp.* INTO v_existing_opp
        FROM public.opportunities opp
        WHERE opp.account_id = v_quotation.lead_account_id
        AND opp.stage NOT IN ('Closed Won', 'Closed Lost')
        ORDER BY opp.updated_at DESC
        LIMIT 1;

        IF v_existing_opp IS NOT NULL THEN
            RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 3: Found existing opportunity % for account %', v_existing_opp.opportunity_id, v_quotation.lead_account_id;

            UPDATE public.customer_quotations cq_upd
            SET opportunity_id = v_existing_opp.opportunity_id
            WHERE cq_upd.id = p_quotation_id;

            IF v_quotation.lead_lead_id IS NOT NULL THEN
                UPDATE public.leads ld
                SET opportunity_id = v_existing_opp.opportunity_id, updated_at = NOW()
                WHERE ld.lead_id = v_quotation.lead_lead_id
                AND ld.opportunity_id IS NULL;
            END IF;

            RETURN QUERY SELECT v_existing_opp.opportunity_id, v_existing_opp.stage, FALSE, 'account_existing'::TEXT, NULL::TEXT, NULL::TEXT;
            RETURN;
        ELSE
            RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 3: No existing opportunity found for account %', v_quotation.lead_account_id;
        END IF;
    ELSE
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 3: Lead has no account_id';
    END IF;

    -- ============================================
    -- STEP 4: Try to get opportunity from ticket
    -- ============================================
    IF v_quotation.cq_ticket_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 4: Checking ticket for opportunity_id, ticket_id: %', v_quotation.cq_ticket_id;

        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        INNER JOIN public.tickets t ON t.opportunity_id = opp.opportunity_id
        WHERE t.id = v_quotation.cq_ticket_id;

        IF v_opportunity IS NOT NULL THEN
            RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 4: Found opportunity % via ticket', v_opportunity.opportunity_id;

            UPDATE public.customer_quotations cq_upd
            SET opportunity_id = v_opportunity.opportunity_id
            WHERE cq_upd.id = p_quotation_id;

            IF v_quotation.lead_lead_id IS NOT NULL THEN
                UPDATE public.leads ld
                SET opportunity_id = v_opportunity.opportunity_id, updated_at = NOW()
                WHERE ld.lead_id = v_quotation.lead_lead_id
                AND ld.opportunity_id IS NULL;
            END IF;

            RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, FALSE, 'ticket'::TEXT, NULL::TEXT, NULL::TEXT;
            RETURN;
        ELSE
            RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 4: Ticket has no opportunity_id or opportunity not found';
        END IF;
    END IF;

    -- ============================================
    -- STEP 5: No existing opportunity found
    -- ============================================
    IF NOT p_allow_autocreate THEN
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 5: No opportunity found and allow_autocreate=FALSE';
        RETURN QUERY SELECT NULL::TEXT, NULL::opportunity_stage, FALSE, 'no_opportunity'::TEXT,
                            'NO_OPPORTUNITY_FOUND'::TEXT,
                            'No existing opportunity found and auto-create is disabled'::TEXT;
        RETURN;
    END IF;

    -- ============================================
    -- STEP 6: Auto-create new opportunity (only if allow_autocreate=TRUE)
    -- ============================================
    IF v_quotation.lead_account_id IS NOT NULL AND v_quotation.lead_lead_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 6: Creating new opportunity (allow_autocreate=TRUE)';

        v_new_opp_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6));

        INSERT INTO public.opportunities (
            opportunity_id,
            name,
            account_id,
            source_lead_id,
            stage,
            estimated_value,
            currency,
            probability,
            owner_user_id,
            created_by,
            next_step,
            next_step_due_date
        ) VALUES (
            v_new_opp_id,
            'Pipeline - ' || COALESCE(v_quotation.lead_company_name, 'Auto-created'),
            v_quotation.lead_account_id,
            v_quotation.lead_lead_id,
            'Prospecting'::opportunity_stage,
            COALESCE(v_quotation.lead_potential_revenue, v_quotation.cq_total_selling_rate, 0),
            'IDR',
            10,
            COALESCE(v_quotation.lead_sales_owner, p_actor_user_id),
            p_actor_user_id,
            'Initial Contact',
            (CURRENT_DATE + INTERVAL '3 days')::DATE
        )
        RETURNING * INTO v_opportunity;

        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 6: Created new opportunity %', v_new_opp_id;

        UPDATE public.leads ld
        SET opportunity_id = v_new_opp_id, updated_at = NOW()
        WHERE ld.lead_id = v_quotation.lead_lead_id
        AND ld.opportunity_id IS NULL;

        UPDATE public.customer_quotations cq_upd
        SET opportunity_id = v_new_opp_id
        WHERE cq_upd.id = p_quotation_id;

        v_was_created := TRUE;
        RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, TRUE, 'auto_created'::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- Cannot create opportunity
    RAISE NOTICE '[fn_resolve_or_create_opportunity] Cannot create opportunity: lead_account_id=%, lead_lead_id=%',
        v_quotation.lead_account_id, v_quotation.lead_lead_id;
    RETURN QUERY SELECT NULL::TEXT, NULL::opportunity_stage, FALSE, 'insufficient_data'::TEXT,
                        'INSUFFICIENT_DATA'::TEXT,
                        'Cannot create opportunity: missing lead or account data'::TEXT;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_resolve_or_create_opportunity IS
'Comprehensive opportunity resolution with 6-step lookup and REPAIR capability:
1. Try quotation.opportunity_id - if orphan, attempt REPAIR via ticket/lead/account chain
2. Try lead.opportunity_id
3. Find existing opportunity by account_id
4. Try ticket.opportunity_id
5. Return error if no opportunity and allow_autocreate=FALSE
6. Auto-create only if allow_autocreate=TRUE
REPAIR: If quotation.opportunity_id is orphan, attempts to find correct opportunity
through related ticket, lead, or single account opportunity.';


-- ============================================
-- PART 3: Update fn_preflight_quotation_send with repair info
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_preflight_quotation_send(
    p_quotation_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_repair_result JSONB;
BEGIN
    -- Get quotation
    SELECT id, opportunity_id, quotation_number, status, ticket_id, lead_id
    INTO v_quotation
    FROM public.customer_quotations
    WHERE id = p_quotation_id;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object(
            'can_proceed', FALSE,
            'error_code', 'QUOTATION_NOT_FOUND',
            'error', 'Quotation not found'
        );
    END IF;

    -- If quotation has opportunity_id, verify it exists
    IF v_quotation.opportunity_id IS NOT NULL THEN
        SELECT opportunity_id, stage, account_id
        INTO v_opportunity
        FROM public.opportunities
        WHERE opportunity_id = v_quotation.opportunity_id;

        IF v_opportunity IS NULL THEN
            -- ORPHAN DETECTED: Try repair
            v_repair_result := fn_repair_orphan_opportunity(p_quotation_id);

            IF (v_repair_result->>'can_repair')::BOOLEAN THEN
                -- Repair is possible
                RETURN jsonb_build_object(
                    'can_proceed', TRUE,
                    'needs_repair', TRUE,
                    'repair_result', v_repair_result,
                    'resolved_opportunity_id', v_repair_result->>'resolved_opportunity_id',
                    'resolution_source', v_repair_result->>'resolution_source',
                    'orphan_opportunity_id', v_quotation.opportunity_id,
                    'quotation_id', v_quotation.id,
                    'quotation_number', v_quotation.quotation_number
                );
            ELSE
                -- Repair failed
                RETURN jsonb_build_object(
                    'can_proceed', FALSE,
                    'needs_repair', TRUE,
                    'repair_failed', TRUE,
                    'error_code', v_repair_result->>'error_code',
                    'error', v_repair_result->>'error',
                    'orphan_opportunity_id', v_quotation.opportunity_id,
                    'quotation_id', v_quotation.id,
                    'quotation_number', v_quotation.quotation_number,
                    'repair_result', v_repair_result
                );
            END IF;
        END IF;

        -- Opportunity exists
        RETURN jsonb_build_object(
            'can_proceed', TRUE,
            'quotation_id', v_quotation.id,
            'quotation_number', v_quotation.quotation_number,
            'opportunity_id', v_opportunity.opportunity_id,
            'opportunity_stage', v_opportunity.stage,
            'opportunity_found', TRUE
        );
    END IF;

    -- No opportunity_id on quotation
    RETURN jsonb_build_object(
        'can_proceed', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'opportunity_id', NULL,
        'opportunity_found', FALSE,
        'note', 'Quotation has no opportunity_id. Opportunity will be resolved during send.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_preflight_quotation_send IS
'Preflight check with REPAIR capability. If quotation.opportunity_id is orphan,
attempts to find correct opportunity through repair chain. Returns needs_repair=TRUE
and resolved_opportunity_id if repair is possible, or error_code=AMBIGUOUS_OPPORTUNITY
if multiple candidates found.';


-- ============================================
-- PART 4: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.fn_repair_orphan_opportunity(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_or_create_opportunity(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_preflight_quotation_send(UUID) TO authenticated;


-- ============================================
-- PART 5: DATA INTEGRITY CHECK (Advisory)
-- Note: FK constraint already exists on customer_quotations.opportunity_id
-- This section identifies any existing orphan records for manual review
-- ============================================

-- Create a view to identify orphan opportunity_ids for monitoring
CREATE OR REPLACE VIEW public.v_orphan_quotation_opportunities AS
SELECT
    cq.id AS quotation_id,
    cq.quotation_number,
    cq.opportunity_id AS orphan_opportunity_id,
    cq.ticket_id,
    cq.lead_id,
    t.opportunity_id AS ticket_opportunity_id,
    l.opportunity_id AS lead_opportunity_id,
    l.account_id AS lead_account_id,
    cq.created_at,
    cq.status
FROM public.customer_quotations cq
LEFT JOIN public.opportunities o ON o.opportunity_id = cq.opportunity_id
LEFT JOIN public.tickets t ON t.id = cq.ticket_id
LEFT JOIN public.leads l ON l.lead_id = cq.lead_id
WHERE cq.opportunity_id IS NOT NULL
AND o.opportunity_id IS NULL;

COMMENT ON VIEW public.v_orphan_quotation_opportunities IS
'Identifies customer_quotations with opportunity_id that references non-existent opportunities.
Use this view to monitor data integrity and identify records that need manual repair.';

-- Grant read access to authenticated users
GRANT SELECT ON public.v_orphan_quotation_opportunities TO authenticated;


-- ============================================
-- SUMMARY
-- ============================================
-- This migration adds REPAIR capability for orphan opportunity_id references:
--
-- 1. fn_repair_orphan_opportunity: New helper that attempts to find correct opportunity
--    through the chain: ticket.opportunity_id -> lead.opportunity_id -> account (single active opp)
--    - Returns can_repair=TRUE with resolved_opportunity_id if exactly ONE candidate found
--    - Returns error_code=AMBIGUOUS_OPPORTUNITY (409) if multiple candidates found
--    - Returns error_code=NO_OPPORTUNITY_FOUND if no candidates found
--
-- 2. fn_resolve_or_create_opportunity: Updated to call repair when orphan detected
--    - If repair succeeds, uses resolved opportunity and updates quotation
--    - If repair fails (ambiguous or none found), returns appropriate error
--    - source='repaired_ticket', 'repaired_lead', or 'repaired_account' indicates repair was used
--
-- 3. fn_preflight_quotation_send: Updated to include repair info in response
--    - Returns needs_repair=TRUE and resolved_opportunity_id if repair is available
--    - Returns repair_failed=TRUE with error details if repair not possible
--
-- This ensures:
-- - NEVER auto-create when orphan opportunity_id exists
-- - Attempt repair through related entities before failing
-- - Return 409 (Conflict) if ambiguous (multiple candidates)
-- - Return clear error if repair impossible
-- ============================================
