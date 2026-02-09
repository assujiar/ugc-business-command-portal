-- =====================================================
-- Migration 148: Account Status Lifecycle Logic
-- =====================================================
-- Implements comprehensive account status transitions:
--
-- OPPORTUNITY-BASED (event-driven, stored immediately):
--   calon_account → new_account    (when opportunity WON)
--   calon_account → failed_account (when ALL opportunities LOST, no deals)
--   failed_account → calon_account (when new opportunity created)
--   failed_account → new_account   (when opportunity WON)
--
-- AGING-BASED (time-driven, computed on read + periodic cron):
--   new_account → active_account   (3 months since first_transaction_date)
--   new/active  → passive_account  (1 month since last_transaction_date)
--   new/active  → lost_account     (3 months since last_transaction_date)
--
-- Guard: opportunity-based transitions only apply when account has
-- NO opportunity with stage = 'Closed Won' (no deal yet).
-- Once account has a deal, aging rules take over.
-- =====================================================


-- ============================================
-- PART 1: Pure function for aging computation
-- ============================================
-- Computes the effective account status based on stored status
-- and transaction dates. Used by the view and API.
-- Priority: lost (3mo idle) > passive (1mo idle) > active (3mo mature)

CREATE OR REPLACE FUNCTION public.fn_compute_effective_account_status(
    p_stored_status account_status,
    p_first_transaction_date TIMESTAMPTZ,
    p_last_transaction_date TIMESTAMPTZ
)
RETURNS account_status AS $$
BEGIN
    -- Only apply aging to accounts that have had a deal (non-calon, non-failed)
    IF p_stored_status IN ('calon_account', 'failed_account') THEN
        RETURN p_stored_status;
    END IF;

    -- Priority 1: Lost account (3+ months idle since last transaction)
    IF p_stored_status IN ('new_account', 'active_account')
       AND p_last_transaction_date IS NOT NULL
       AND p_last_transaction_date + INTERVAL '3 months' < NOW() THEN
        RETURN 'lost_account'::account_status;
    END IF;

    -- Priority 2: Passive account (1+ month idle since last transaction)
    IF p_stored_status IN ('new_account', 'active_account')
       AND p_last_transaction_date IS NOT NULL
       AND p_last_transaction_date + INTERVAL '1 month' < NOW() THEN
        RETURN 'passive_account'::account_status;
    END IF;

    -- Priority 3: Active account (3+ months since first transaction = mature)
    IF p_stored_status = 'new_account'
       AND p_first_transaction_date IS NOT NULL
       AND p_first_transaction_date + INTERVAL '3 months' < NOW() THEN
        RETURN 'active_account'::account_status;
    END IF;

    -- No aging transition applies
    RETURN p_stored_status;
END;
$$ LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp;


-- ============================================
-- PART 2: Update sync_opportunity_to_account
-- ============================================
-- Changes:
-- - LOST: Add guard — only mark failed if NO Closed Won opportunities exist
-- - WON: Keep current logic (calon/failed → new_account)

CREATE OR REPLACE FUNCTION public.sync_opportunity_to_account(
    p_opportunity_id TEXT,
    p_outcome TEXT -- 'won' or 'lost'
)
RETURNS JSONB AS $$
DECLARE
    v_opportunity RECORD;
    v_new_account_status account_status;
    v_update_time TIMESTAMPTZ := NOW();
    v_has_won_opportunity BOOLEAN;
    v_has_open_opportunity BOOLEAN;
BEGIN
    -- Get opportunity with account
    SELECT o.*, a.account_id, a.account_status as current_account_status
    INTO v_opportunity
    FROM public.opportunities o
    LEFT JOIN public.accounts a ON a.account_id = o.account_id
    WHERE o.opportunity_id = p_opportunity_id;

    IF v_opportunity IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'Opportunity not found');
    END IF;

    -- If no account linked, nothing to sync
    IF v_opportunity.account_id IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'synced', FALSE, 'message', 'No account linked');
    END IF;

    -- Determine new account status based on outcome
    IF p_outcome = 'won' THEN
        IF v_opportunity.current_account_status IN ('calon_account', 'failed_account') THEN
            -- First deal: calon/failed → new_account
            v_new_account_status := 'new_account'::account_status;

            UPDATE public.accounts
            SET
                account_status = v_new_account_status,
                first_transaction_date = COALESCE(first_transaction_date, v_update_time),
                last_transaction_date = v_update_time,
                updated_at = v_update_time
            WHERE account_id = v_opportunity.account_id;

        ELSIF v_opportunity.current_account_status IN ('passive_account', 'lost_account') THEN
            -- Reactivation: passive/lost → new_account (new deal restarts aging cycle)
            v_new_account_status := 'new_account'::account_status;

            UPDATE public.accounts
            SET
                account_status = v_new_account_status,
                last_transaction_date = v_update_time,
                updated_at = v_update_time
            WHERE account_id = v_opportunity.account_id;
        ELSE
            -- Active account (new/active): just update last_transaction_date
            UPDATE public.accounts
            SET
                last_transaction_date = v_update_time,
                updated_at = v_update_time
            WHERE account_id = v_opportunity.account_id;

            RETURN jsonb_build_object(
                'success', TRUE,
                'synced', TRUE,
                'account_id', v_opportunity.account_id,
                'message', 'Updated last_transaction_date only',
                'current_status', v_opportunity.current_account_status::TEXT
            );
        END IF;

    ELSIF p_outcome = 'lost' THEN
        -- Guard 1: Only mark as failed if account has NO deals (Closed Won opportunities)
        SELECT EXISTS (
            SELECT 1 FROM public.opportunities
            WHERE account_id = v_opportunity.account_id
            AND stage = 'Closed Won'::opportunity_stage
            AND opportunity_id != p_opportunity_id
        ) INTO v_has_won_opportunity;

        IF v_has_won_opportunity THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'synced', FALSE,
                'message', 'Account has existing won opportunities, status unchanged'
            );
        END IF;

        -- Guard 2: Don't mark failed if account still has open opportunities
        SELECT EXISTS (
            SELECT 1 FROM public.opportunities
            WHERE account_id = v_opportunity.account_id
            AND stage NOT IN ('Closed Won'::opportunity_stage, 'Closed Lost'::opportunity_stage)
            AND opportunity_id != p_opportunity_id
        ) INTO v_has_open_opportunity;

        IF v_has_open_opportunity THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'synced', FALSE,
                'message', 'Account has open opportunities, status unchanged'
            );
        END IF;

        -- Only mark as failed if account is still calon_account
        IF v_opportunity.current_account_status = 'calon_account' THEN
            v_new_account_status := 'failed_account'::account_status;

            UPDATE public.accounts
            SET
                account_status = v_new_account_status,
                updated_at = v_update_time
            WHERE account_id = v_opportunity.account_id;
        ELSE
            -- For non-calon accounts, don't change status on lost
            RETURN jsonb_build_object(
                'success', TRUE,
                'synced', FALSE,
                'message', 'Account not calon_account, status unchanged on lost'
            );
        END IF;
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid outcome: ' || p_outcome);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'synced', TRUE,
        'account_id', v_opportunity.account_id,
        'old_status', v_opportunity.current_account_status::TEXT,
        'new_status', v_new_account_status::TEXT
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- PART 3: Trigger to reset failed → calon
-- when new opportunity is created
-- ============================================

CREATE OR REPLACE FUNCTION public.fn_reset_failed_account_on_new_opportunity()
RETURNS TRIGGER AS $$
BEGIN
    -- When a new opportunity is created for an account
    IF NEW.account_id IS NOT NULL THEN
        -- Reset failed_account → calon_account
        UPDATE public.accounts
        SET
            account_status = 'calon_account'::account_status,
            updated_at = NOW()
        WHERE account_id = NEW.account_id
        AND account_status = 'failed_account'::account_status;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Drop duplicate trigger from migration 110 (same logic, now superseded)
DROP TRIGGER IF EXISTS trg_sync_account_on_opportunity_create ON public.opportunities;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_reset_failed_on_new_opportunity ON public.opportunities;
CREATE TRIGGER trg_reset_failed_on_new_opportunity
    AFTER INSERT ON public.opportunities
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_reset_failed_account_on_new_opportunity();


-- ============================================
-- PART 4: Recreate v_accounts_with_status view
-- ============================================
-- Fixes:
-- - CASE evaluation order: lost > passive > active (was: active > lost > passive)
-- - Uses fn_compute_effective_account_status function

DROP VIEW IF EXISTS v_accounts_with_status CASCADE;
CREATE VIEW v_accounts_with_status AS
SELECT
    a.account_id,
    a.company_name,
    a.pic_name,
    a.pic_email,
    a.pic_phone,
    a.industry,
    a.address,
    a.city,
    a.province,
    a.country,
    a.account_status,
    a.first_transaction_date,
    a.last_transaction_date,
    a.lead_id,
    a.owner_user_id,
    a.created_at,
    a.updated_at,
    p.name AS owner_name,
    p.email AS owner_email,
    (SELECT COUNT(*) FROM opportunities o WHERE o.account_id = a.account_id) AS opportunity_count,
    (SELECT SUM(estimated_value) FROM opportunities o WHERE o.account_id = a.account_id AND o.stage != 'Closed Lost'::opportunity_stage) AS total_pipeline_value,
    (SELECT COUNT(*) FROM opportunities o WHERE o.account_id = a.account_id AND o.stage = 'Closed Won'::opportunity_stage) AS won_opportunities,
    -- Computed effective status using the function (correct evaluation order)
    public.fn_compute_effective_account_status(
        a.account_status,
        a.first_transaction_date,
        a.last_transaction_date
    )::TEXT AS calculated_status
FROM accounts a
LEFT JOIN profiles p ON a.owner_user_id = p.user_id;


-- ============================================
-- PART 5: Bulk update function for cron
-- ============================================
-- Updates stored account_status based on aging rules.
-- Safe to call periodically — only updates accounts that need it.

CREATE OR REPLACE FUNCTION public.fn_bulk_update_account_aging()
RETURNS JSONB AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    -- Single bulk UPDATE: compute effective status and update where it differs
    WITH aging AS (
        SELECT
            account_id,
            account_status,
            public.fn_compute_effective_account_status(
                account_status,
                first_transaction_date,
                last_transaction_date
            ) AS effective_status
        FROM public.accounts
        WHERE account_status IN ('new_account', 'active_account')
    )
    UPDATE public.accounts a
    SET
        account_status = aging.effective_status,
        updated_at = NOW()
    FROM aging
    WHERE a.account_id = aging.account_id
    AND aging.effective_status != aging.account_status;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', TRUE,
        'updated_count', v_updated_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;


-- ============================================
-- PART 6: Grant permissions
-- ============================================

GRANT EXECUTE ON FUNCTION public.fn_compute_effective_account_status(account_status, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_compute_effective_account_status(account_status, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_opportunity_to_account(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_opportunity_to_account(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_bulk_update_account_aging() TO service_role;
GRANT SELECT ON v_accounts_with_status TO authenticated;
GRANT SELECT ON v_accounts_with_status TO service_role;


-- ============================================
-- SUMMARY
-- ============================================
-- 1. fn_compute_effective_account_status: Pure aging computation function
--    Priority: lost (3mo idle) > passive (1mo idle) > active (3mo mature)
-- 2. sync_opportunity_to_account: Updated with "has deal" guard for LOST
-- 3. trg_reset_failed_on_new_opportunity: Resets failed→calon on new opportunity
-- 4. v_accounts_with_status: Recreated with fixed CASE order + function
-- 5. fn_bulk_update_account_aging: Cron-callable function for batch updates
-- ============================================
