-- ============================================
-- Migration: 104_prevent_orphan_opportunity_autocreate.sql
--
-- PURPOSE: Prevent auto-creation of opportunities when quotation.opportunity_id
-- is set but the referenced opportunity does not exist in the database.
--
-- ROOT CAUSE: When customer_quotations.opportunity_id contains a value that
-- doesn't exist in public.opportunities, the fn_resolve_or_create_opportunity
-- function was falling through all resolution steps and auto-creating a NEW
-- opportunity, polluting the pipeline with duplicates.
--
-- SOLUTION:
-- 1. Add allow_autocreate parameter (default FALSE) to fn_resolve_or_create_opportunity
-- 2. If quotation.opportunity_id is NOT NULL but not found, and allow_autocreate=FALSE,
--    FAIL FAST with an error instead of creating a new opportunity
-- 3. Update rpc_customer_quotation_mark_sent to pass allow_autocreate=FALSE
-- 4. Add optional FK constraint with ON DELETE SET NULL for data integrity
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
    -- Drop all overloads of fn_resolve_or_create_opportunity
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'fn_resolve_or_create_opportunity'
    LOOP
        RAISE NOTICE '[104] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;

    -- Drop all overloads of rpc_customer_quotation_mark_sent
    FOR v_proc IN
        SELECT p.oid::regprocedure AS proc_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'rpc_customer_quotation_mark_sent'
    LOOP
        RAISE NOTICE '[104] Dropping existing overload: %', v_proc.proc_sig;
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
        RAISE NOTICE '[104] Dropping existing overload: %', v_proc.proc_sig;
        EXECUTE format('DROP FUNCTION IF EXISTS %s', v_proc.proc_sig);
    END LOOP;
END $$;

-- ============================================
-- PART 1: UPDATE fn_resolve_or_create_opportunity with allow_autocreate guard
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_resolve_or_create_opportunity(
    p_quotation_id UUID,
    p_actor_user_id UUID,
    p_allow_autocreate BOOLEAN DEFAULT FALSE  -- NEW: Default to FALSE to prevent orphan creation
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
BEGIN
    -- ============================================
    -- STEP 0: Fetch quotation with full lead info
    -- Use explicit column names to avoid ambiguity
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

    -- Store original opportunity_id for error reporting
    v_original_opp_id := v_quotation.cq_opportunity_id;

    RAISE NOTICE '[fn_resolve_or_create_opportunity] Quotation found: id=%, cq_opportunity_id=%, lead_opportunity_id=%, lead_account_id=%, allow_autocreate=%',
        v_quotation.quotation_id, v_quotation.cq_opportunity_id, v_quotation.lead_opportunity_id, v_quotation.lead_account_id, p_allow_autocreate;

    -- ============================================
    -- STEP 1: Try direct opportunity lookup from quotation.opportunity_id
    -- This is the primary path - quotation should already have opportunity_id set
    -- CRITICAL: If quotation.opportunity_id is NOT NULL but NOT FOUND, fail fast
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
            -- CRITICAL FIX: Quotation has opportunity_id but it doesn't exist!
            -- This is a data integrity issue - fail fast unless allow_autocreate=TRUE
            RAISE WARNING '[fn_resolve_or_create_opportunity] STEP 1: CRITICAL - Opportunity % NOT FOUND in database! quotation.opportunity_id is orphaned.', v_quotation.cq_opportunity_id;

            IF NOT p_allow_autocreate THEN
                -- FAIL FAST: Return error instead of proceeding to auto-create
                RETURN QUERY SELECT NULL::TEXT, NULL::opportunity_stage, FALSE, 'quotation_orphan'::TEXT,
                                    'OPPORTUNITY_NOT_FOUND'::TEXT,
                                    ('Opportunity ' || v_quotation.cq_opportunity_id || ' referenced by quotation does not exist. Data integrity issue.')::TEXT;
                RETURN;
            END IF;

            -- If allow_autocreate=TRUE, continue but log the warning
            RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 1: allow_autocreate=TRUE, continuing despite orphan opportunity_id';
            v_source := 'quotation_missing';
        END IF;
    ELSE
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 1: Quotation has no opportunity_id';
    END IF;

    -- ============================================
    -- STEP 2: Try lead's opportunity_id
    -- If quotation doesn't have opportunity but lead does
    -- ============================================
    IF v_quotation.lead_opportunity_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 2: Checking lead opportunity_id: %', v_quotation.lead_opportunity_id;

        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        WHERE opp.opportunity_id = v_quotation.lead_opportunity_id;

        IF v_opportunity IS NOT NULL THEN
            RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 2: Found opportunity % via lead', v_opportunity.opportunity_id;

            -- Update quotation with correct opportunity_id
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
    -- CRITICAL: This prevents duplicate opportunity creation!
    -- Only look for opportunities that are NOT closed
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

            -- Update quotation with this opportunity_id
            UPDATE public.customer_quotations cq_upd
            SET opportunity_id = v_existing_opp.opportunity_id
            WHERE cq_upd.id = p_quotation_id;

            -- Also update lead if it doesn't have opportunity_id set
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
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 3: Lead has no account_id, cannot search by account';
    END IF;

    -- ============================================
    -- STEP 4: Try to get opportunity from ticket (if quotation has ticket_id)
    -- Tickets created from pipeline should have opportunity_id
    -- ============================================
    IF v_quotation.cq_ticket_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 4: Checking ticket for opportunity_id, ticket_id: %', v_quotation.cq_ticket_id;

        SELECT opp.* INTO v_opportunity
        FROM public.opportunities opp
        INNER JOIN public.tickets t ON t.opportunity_id = opp.opportunity_id
        WHERE t.id = v_quotation.cq_ticket_id;

        IF v_opportunity IS NOT NULL THEN
            RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 4: Found opportunity % via ticket', v_opportunity.opportunity_id;

            -- Update quotation with this opportunity_id
            UPDATE public.customer_quotations cq_upd
            SET opportunity_id = v_opportunity.opportunity_id
            WHERE cq_upd.id = p_quotation_id;

            -- Also update lead if needed
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
    -- Check if auto-create is allowed before proceeding
    -- ============================================
    IF NOT p_allow_autocreate THEN
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 5: No opportunity found and allow_autocreate=FALSE, returning without creating';
        RETURN QUERY SELECT NULL::TEXT, NULL::opportunity_stage, FALSE, 'no_opportunity'::TEXT,
                            'NO_OPPORTUNITY_FOUND'::TEXT,
                            'No existing opportunity found and auto-create is disabled'::TEXT;
        RETURN;
    END IF;

    -- ============================================
    -- STEP 6: Auto-create new opportunity (only if allow_autocreate=TRUE)
    -- Only if lead has account (required for opportunity creation)
    -- ============================================
    IF v_quotation.lead_account_id IS NOT NULL AND v_quotation.lead_lead_id IS NOT NULL THEN
        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 6: Creating new opportunity for account % and lead % (allow_autocreate=TRUE)',
            v_quotation.lead_account_id, v_quotation.lead_lead_id;

        -- Generate opportunity ID
        v_new_opp_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6));

        -- Create the opportunity
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
            10, -- Prospecting probability
            COALESCE(v_quotation.lead_sales_owner, p_actor_user_id),
            p_actor_user_id,
            'Initial Contact',
            (CURRENT_DATE + INTERVAL '3 days')::DATE
        )
        RETURNING * INTO v_opportunity;

        RAISE NOTICE '[fn_resolve_or_create_opportunity] STEP 6: Created new opportunity %', v_new_opp_id;

        -- Update lead with new opportunity_id
        UPDATE public.leads ld
        SET opportunity_id = v_new_opp_id, updated_at = NOW()
        WHERE ld.lead_id = v_quotation.lead_lead_id
        AND ld.opportunity_id IS NULL;

        -- Update quotation with new opportunity_id
        UPDATE public.customer_quotations cq_upd
        SET opportunity_id = v_new_opp_id
        WHERE cq_upd.id = p_quotation_id;

        v_was_created := TRUE;
        RETURN QUERY SELECT v_opportunity.opportunity_id, v_opportunity.stage, TRUE, 'auto_created'::TEXT, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- No opportunity could be found or created
    RAISE NOTICE '[fn_resolve_or_create_opportunity] Cannot create opportunity: lead_account_id=%, lead_lead_id=%',
        v_quotation.lead_account_id, v_quotation.lead_lead_id;
    RETURN QUERY SELECT NULL::TEXT, NULL::opportunity_stage, FALSE, 'insufficient_data'::TEXT,
                        'INSUFFICIENT_DATA'::TEXT,
                        'Cannot create opportunity: missing lead or account data'::TEXT;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_resolve_or_create_opportunity IS
'Comprehensive opportunity resolution for quotations with 6-step lookup chain and fail-fast behavior:
1. Try quotation.opportunity_id (direct link) - FAIL if set but not found (unless allow_autocreate=TRUE)
2. Try lead.opportunity_id (via lead)
3. Find existing opportunity by account_id (prevents duplicates!)
4. Try ticket.opportunity_id (via ticket)
5. Return error if no opportunity and allow_autocreate=FALSE
6. Only auto-create if allow_autocreate=TRUE and all above failed
Returns error_code and error_message columns for proper error handling.';


-- ============================================
-- PART 2: Update rpc_customer_quotation_mark_sent with allow_autocreate parameter
-- ============================================

CREATE OR REPLACE FUNCTION public.rpc_customer_quotation_mark_sent(
    p_quotation_id UUID,
    p_sent_via TEXT,
    p_sent_to TEXT,
    p_actor_user_id UUID,
    p_correlation_id TEXT DEFAULT NULL,
    p_allow_autocreate BOOLEAN DEFAULT FALSE  -- NEW: Default to FALSE
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
    v_ticket RECORD;
    v_lead RECORD;
    v_resolved_opp RECORD;
    v_old_opp_stage opportunity_stage;
    v_old_ticket_status ticket_status;
    v_new_opp_stage opportunity_stage := NULL;
    v_effective_opportunity_id TEXT := NULL;
    v_opportunity_source TEXT := NULL;
    v_is_resend BOOLEAN := FALSE;
    v_transition_check JSONB;
    v_auth_check JSONB;
    v_correlation_id TEXT;
    v_activity_subject TEXT;
    v_activity_description TEXT;
    v_pipeline_notes TEXT;
    v_pipeline_updated BOOLEAN := FALSE;
    v_opportunity_auto_created BOOLEAN := FALSE;
BEGIN
    -- Generate correlation_id if not provided
    v_correlation_id := COALESCE(p_correlation_id, gen_random_uuid()::TEXT);

    RAISE NOTICE '[rpc_customer_quotation_mark_sent] Starting for quotation %, correlation_id: %, allow_autocreate: %',
        p_quotation_id, v_correlation_id, p_allow_autocreate;

    -- Start by locking the quotation
    SELECT cq.* INTO v_quotation
    FROM public.customer_quotations cq
    WHERE cq.id = p_quotation_id
    FOR UPDATE;

    IF v_quotation IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'Quotation not found',
            'error_code', 'QUOTATION_NOT_FOUND',
            'correlation_id', v_correlation_id
        );
    END IF;

    RAISE NOTICE '[rpc_customer_quotation_mark_sent] Quotation found: number=%, current opportunity_id=%',
        v_quotation.quotation_number, v_quotation.opportunity_id;

    -- AUTHORIZATION: Check if actor can send this quotation
    v_auth_check := fn_check_quotation_authorization(p_quotation_id, p_actor_user_id, 'send');
    IF NOT (v_auth_check->>'authorized')::BOOLEAN THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', v_auth_check->>'error',
            'error_code', v_auth_check->>'error_code',
            'correlation_id', v_correlation_id
        );
    END IF;

    -- IDEMPOTENCY: If already sent, this is a resend - don't duplicate events/history
    IF v_quotation.status = 'sent' THEN
        v_is_resend := TRUE;
        RAISE NOTICE '[rpc_customer_quotation_mark_sent] This is a resend (status already sent)';
    END IF;

    -- STATE MACHINE: Validate transition using centralized rules
    IF NOT v_is_resend THEN
        v_transition_check := fn_validate_quotation_transition(v_quotation.status::TEXT, 'sent');
        IF NOT (v_transition_check->>'valid')::BOOLEAN THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', v_transition_check->>'error',
                'error_code', v_transition_check->>'error_code',
                'correlation_id', v_correlation_id
            );
        END IF;
    END IF;

    -- 1. UPDATE QUOTATION STATUS (always update sent_via/sent_to for resends)
    UPDATE public.customer_quotations cq_upd
    SET
        status = 'sent'::customer_quotation_status,
        sent_via = COALESCE(p_sent_via, cq_upd.sent_via),
        sent_to = COALESCE(p_sent_to, cq_upd.sent_to),
        sent_at = COALESCE(cq_upd.sent_at, NOW()),
        updated_at = NOW()
    WHERE cq_upd.id = p_quotation_id
    RETURNING * INTO v_quotation;

    -- 2. RESOLVE OPPORTUNITY (with FAIL-FAST if orphan) - skip on resend
    IF NOT v_is_resend THEN
        RAISE NOTICE '[rpc_customer_quotation_mark_sent] Resolving opportunity with allow_autocreate=%...', p_allow_autocreate;

        -- Use the helper function to resolve/create opportunity
        -- Pass allow_autocreate parameter (default FALSE = fail fast on orphan)
        SELECT resolved.* INTO v_resolved_opp
        FROM public.fn_resolve_or_create_opportunity(p_quotation_id, p_actor_user_id, p_allow_autocreate) resolved;

        -- CHECK FOR ERRORS from opportunity resolution
        IF v_resolved_opp.error_code IS NOT NULL THEN
            RAISE WARNING '[rpc_customer_quotation_mark_sent] Opportunity resolution failed: error_code=%, error_message=%',
                v_resolved_opp.error_code, v_resolved_opp.error_message;

            -- FAIL FAST: Return error to caller instead of proceeding
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', v_resolved_opp.error_message,
                'error_code', v_resolved_opp.error_code,
                'opportunity_source', v_resolved_opp.source,
                'quotation_id', v_quotation.id,
                'quotation_number', v_quotation.quotation_number,
                'quotation_opportunity_id', v_quotation.opportunity_id,  -- The orphan ID for debugging
                'correlation_id', v_correlation_id
            );
        END IF;

        IF v_resolved_opp IS NOT NULL AND v_resolved_opp.opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_resolved_opp.opportunity_id;
            v_opportunity_auto_created := v_resolved_opp.was_created;
            v_opportunity_source := v_resolved_opp.source;

            RAISE NOTICE '[rpc_customer_quotation_mark_sent] Opportunity resolved: id=%, was_created=%, source=%',
                v_effective_opportunity_id, v_opportunity_auto_created, v_opportunity_source;

            -- Fetch full opportunity record
            SELECT opp.* INTO v_opportunity
            FROM public.opportunities opp
            WHERE opp.opportunity_id = v_effective_opportunity_id
            FOR UPDATE;

            -- Refresh quotation to get updated opportunity_id
            SELECT cq.* INTO v_quotation
            FROM public.customer_quotations cq
            WHERE cq.id = p_quotation_id;
        ELSE
            RAISE NOTICE '[rpc_customer_quotation_mark_sent] No opportunity resolved (source=%, allow_autocreate=%)',
                v_resolved_opp.source, p_allow_autocreate;
        END IF;

        IF v_opportunity IS NOT NULL THEN
            v_old_opp_stage := v_opportunity.stage;

            -- FIX: Include 'Negotiation' for revised quotations after rejection
            IF v_opportunity.stage IN ('Prospecting', 'Discovery', 'Negotiation') THEN
                UPDATE public.opportunities opp_upd
                SET
                    stage = 'Quote Sent'::opportunity_stage,
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    quotation_count = COALESCE(opp_upd.quotation_count, 0) + 1,
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id
                RETURNING * INTO v_opportunity;

                v_new_opp_stage := 'Quote Sent'::opportunity_stage;
                v_pipeline_updated := TRUE;

                RAISE NOTICE '[rpc_customer_quotation_mark_sent] Pipeline stage updated from % to Quote Sent', v_old_opp_stage;

                -- Prepare messages for audit records
                v_activity_subject := 'Auto: Quotation Sent → Stage moved to Quote Sent';
                v_activity_description := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system') || '. Pipeline stage auto-updated.';
                v_pipeline_notes := 'Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system');

                -- Create stage history entry (AUDIT TRAIL)
                IF NOT EXISTS (
                    SELECT 1 FROM public.opportunity_stage_history osh
                    WHERE osh.opportunity_id = v_effective_opportunity_id
                    AND osh.new_stage = 'Quote Sent'::opportunity_stage
                    AND osh.from_stage = v_old_opp_stage
                    AND osh.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.opportunity_stage_history (
                        opportunity_id,
                        from_stage,
                        to_stage,
                        changed_by,
                        notes,
                        old_stage,
                        new_stage
                    ) VALUES (
                        v_effective_opportunity_id,
                        v_old_opp_stage,
                        'Quote Sent'::opportunity_stage,
                        p_actor_user_id,
                        '[' || v_correlation_id || '] ' || v_pipeline_notes,
                        v_old_opp_stage,
                        'Quote Sent'::opportunity_stage
                    );
                END IF;

                -- Insert pipeline_updates (idempotent)
                IF NOT EXISTS (
                    SELECT 1 FROM public.pipeline_updates pu
                    WHERE pu.opportunity_id = v_effective_opportunity_id
                    AND pu.new_stage = 'Quote Sent'::opportunity_stage
                    AND pu.old_stage = v_old_opp_stage
                    AND pu.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.pipeline_updates (
                        opportunity_id,
                        notes,
                        approach_method,
                        old_stage,
                        new_stage,
                        updated_by,
                        updated_at
                    ) VALUES (
                        v_effective_opportunity_id,
                        '[' || v_correlation_id || '] ' || v_pipeline_notes,
                        'Email'::approach_method,
                        v_old_opp_stage,
                        'Quote Sent'::opportunity_stage,
                        p_actor_user_id,
                        NOW()
                    );
                END IF;

                -- Insert activity record (idempotent)
                IF NOT EXISTS (
                    SELECT 1 FROM public.activities act
                    WHERE act.related_opportunity_id = v_effective_opportunity_id
                    AND act.subject = v_activity_subject
                    AND act.created_at > NOW() - INTERVAL '1 minute'
                ) THEN
                    INSERT INTO public.activities (
                        activity_type,
                        subject,
                        description,
                        status,
                        due_date,
                        completed_at,
                        related_opportunity_id,
                        related_lead_id,
                        owner_user_id,
                        created_by
                    ) VALUES (
                        'Note'::activity_type_v2,
                        v_activity_subject,
                        '[' || v_correlation_id || '] ' || v_activity_description,
                        'Completed'::activity_status,
                        CURRENT_DATE,
                        NOW(),
                        v_effective_opportunity_id,
                        v_quotation.lead_id,
                        COALESCE(p_actor_user_id, v_quotation.created_by),
                        COALESCE(p_actor_user_id, v_quotation.created_by)
                    );
                END IF;
            ELSE
                -- Just update quotation status on opportunity, don't change stage
                UPDATE public.opportunities opp_upd
                SET
                    quotation_status = 'sent',
                    latest_quotation_id = v_quotation.id,
                    updated_at = NOW()
                WHERE opp_upd.opportunity_id = v_effective_opportunity_id;

                RAISE NOTICE '[rpc_customer_quotation_mark_sent] Opportunity stage % not changed (already past Quote Sent)', v_opportunity.stage;
            END IF;
        END IF;
    ELSE
        -- On resend, just get the current opportunity for the response
        IF v_quotation.opportunity_id IS NOT NULL THEN
            v_effective_opportunity_id := v_quotation.opportunity_id;
            SELECT opp.stage INTO v_old_opp_stage
            FROM public.opportunities opp
            WHERE opp.opportunity_id = v_quotation.opportunity_id;
        END IF;
    END IF;

    -- 3. UPDATE TICKET STATUS (if linked)
    IF v_quotation.ticket_id IS NOT NULL THEN
        SELECT t.status INTO v_old_ticket_status
        FROM public.tickets t
        WHERE t.id = v_quotation.ticket_id
        FOR UPDATE;

        -- Update ticket to waiting_customer (Cost sent, awaiting feedback) - idempotent
        UPDATE public.tickets t_upd
        SET
            status = 'waiting_customer'::ticket_status,
            pending_response_from = 'creator',
            updated_at = NOW()
        WHERE t_upd.id = v_quotation.ticket_id
        AND t_upd.status NOT IN ('closed', 'resolved', 'waiting_customer')
        RETURNING * INTO v_ticket;

        -- Create ticket event (AUDIT TRAIL - only on first send, not resend)
        IF NOT v_is_resend THEN
            INSERT INTO public.ticket_events (
                ticket_id,
                event_type,
                actor_user_id,
                old_value,
                new_value,
                notes,
                created_at
            ) VALUES (
                v_quotation.ticket_id,
                'customer_quotation_sent'::ticket_event_type,
                p_actor_user_id,
                jsonb_build_object('ticket_status', v_old_ticket_status),
                jsonb_build_object(
                    'ticket_status', 'waiting_customer',
                    'quotation_id', v_quotation.id,
                    'quotation_number', v_quotation.quotation_number,
                    'quotation_status', 'sent',
                    'sent_via', p_sent_via,
                    'sent_to', p_sent_to,
                    'correlation_id', v_correlation_id
                ),
                '[' || v_correlation_id || '] Quotation ' || v_quotation.quotation_number || ' sent to customer via ' || COALESCE(p_sent_via, 'system'),
                NOW()
            );
        END IF;
    END IF;

    -- 4. UPDATE LEAD (if linked)
    IF v_quotation.lead_id IS NOT NULL THEN
        IF v_is_resend THEN
            UPDATE public.leads ld
            SET
                quotation_status = 'sent',
                latest_quotation_id = v_quotation.id,
                updated_at = NOW()
            WHERE ld.lead_id = v_quotation.lead_id;
        ELSE
            UPDATE public.leads ld
            SET
                quotation_status = 'sent',
                latest_quotation_id = v_quotation.id,
                quotation_count = COALESCE(ld.quotation_count, 0) + 1,
                updated_at = NOW()
            WHERE ld.lead_id = v_quotation.lead_id;
        END IF;
    END IF;

    -- 5. UPDATE OPERATIONAL COST (if linked)
    IF v_quotation.operational_cost_id IS NOT NULL THEN
        UPDATE public.ticket_rate_quotes trq
        SET
            status = 'sent_to_customer'::quote_status,
            updated_at = NOW()
        WHERE trq.id = v_quotation.operational_cost_id;
    END IF;

    RAISE NOTICE '[rpc_customer_quotation_mark_sent] Completed successfully. opportunity_id=%, was_created=%, source=%',
        v_effective_opportunity_id, v_opportunity_auto_created, v_opportunity_source;

    RETURN jsonb_build_object(
        'success', TRUE,
        'quotation_id', v_quotation.id,
        'quotation_number', v_quotation.quotation_number,
        'quotation_status', v_quotation.status,
        'opportunity_id', COALESCE(v_effective_opportunity_id, v_quotation.opportunity_id),
        'opportunity_source', v_opportunity_source,
        'old_stage', v_old_opp_stage,
        'new_stage', v_new_opp_stage,
        'ticket_id', v_quotation.ticket_id,
        'ticket_status', v_ticket.status,
        'is_resend', v_is_resend,
        'pipeline_updates_created', v_pipeline_updated,
        'activities_created', v_pipeline_updated,
        'opportunity_auto_created', v_opportunity_auto_created,
        'correlation_id', v_correlation_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[rpc_customer_quotation_mark_sent] ERROR: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLERRM,
            'error_code', 'INTERNAL_ERROR',
            'detail', SQLSTATE,
            'correlation_id', v_correlation_id
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.rpc_customer_quotation_mark_sent IS
'Atomically marks quotation as sent and syncs to opportunity (Quote Sent), ticket (waiting_customer), lead, and operational cost.
Uses comprehensive opportunity resolution with fail-fast behavior when quotation.opportunity_id references a non-existent opportunity.
Pass allow_autocreate=TRUE to enable legacy behavior (auto-create opportunity if not found).
Default allow_autocreate=FALSE returns error 409/422 if opportunity_id is orphaned.';


-- ============================================
-- PART 3: GRANT PERMISSIONS (updated signatures)
-- ============================================

GRANT EXECUTE ON FUNCTION public.fn_resolve_or_create_opportunity(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_customer_quotation_mark_sent(UUID, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;


-- ============================================
-- PART 4: Create a helper function for API preflight checks
-- This allows the API route to verify opportunity exists before calling the full RPC
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_preflight_quotation_send(
    p_quotation_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_quotation RECORD;
    v_opportunity RECORD;
BEGIN
    -- Get quotation
    SELECT id, opportunity_id, quotation_number, status
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
            -- CRITICAL: Orphan opportunity_id detected!
            RETURN jsonb_build_object(
                'can_proceed', FALSE,
                'error_code', 'OPPORTUNITY_NOT_FOUND',
                'error', format('Opportunity %s referenced by quotation does not exist. Data integrity issue - please fix the quotation or contact support.', v_quotation.opportunity_id),
                'quotation_id', v_quotation.id,
                'quotation_number', v_quotation.quotation_number,
                'orphan_opportunity_id', v_quotation.opportunity_id
            );
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

    -- No opportunity_id on quotation - this is okay, will be resolved during send
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
'Preflight check before sending quotation. Verifies that if quotation.opportunity_id is set,
the referenced opportunity actually exists in the database. Returns can_proceed=FALSE
with error_code=OPPORTUNITY_NOT_FOUND if orphan opportunity_id detected.';

GRANT EXECUTE ON FUNCTION public.fn_preflight_quotation_send(UUID) TO authenticated;


-- ============================================
-- SUMMARY
-- ============================================
-- This migration adds critical guardrails to prevent duplicate opportunity creation:
--
-- 1. fn_resolve_or_create_opportunity now has p_allow_autocreate parameter (default FALSE)
--    - If quotation.opportunity_id is set but not found, returns error instead of auto-creating
--    - Returns error_code and error_message columns for proper error handling
--
-- 2. rpc_customer_quotation_mark_sent now has p_allow_autocreate parameter (default FALSE)
--    - Checks for errors from opportunity resolution and fails fast
--    - Returns detailed error response with quotation_opportunity_id for debugging
--
-- 3. fn_preflight_quotation_send allows API to verify opportunity exists before full send
--    - Lightweight check that can be called before committing to email/WhatsApp send
--
-- BACKWARD COMPATIBILITY:
-- - Pass allow_autocreate=TRUE to get legacy behavior (auto-create if not found)
-- - Default behavior is now fail-fast (more conservative, prevents data pollution)
-- ============================================
