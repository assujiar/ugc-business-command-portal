-- ============================================
-- Migration: 073_comprehensive_audit_fixes.sql
--
-- COMPREHENSIVE AUDIT FIXES
--
-- This migration addresses all issues identified in the codebase audit:
-- 1. Unify Claim vs Convert Lead logic (use account_id consistently)
-- 2. Enforce Lost Reason mandatory for Closed Lost
-- 3. Fix Sales Manager data access (can see all sales team data)
-- 4. Revise Marketing Manager access (can see all marketing leads)
-- 5. Fix Ticket visibility by origin/target department
-- 6. Consolidate customer_id → account_id
-- 7. Add is_sales_manager() helper function
-- 8. Update 'Handed Over' references to 'Assign to Sales'
-- ============================================

-- ============================================
-- PART 1: ADD HELPER FUNCTIONS FOR ROLE CHECKS
-- ============================================

-- Check if user is Sales Manager
CREATE OR REPLACE FUNCTION is_sales_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() = 'sales manager';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_sales_manager() IS 'Check if current user is Sales Manager - has access to all sales team data';

-- Check if user is Marketing Manager or MACX (combined for clarity)
CREATE OR REPLACE FUNCTION is_marketing_manager_or_macx()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() IN ('Marketing Manager', 'MACX');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_marketing_manager_or_macx() IS 'Check if current user is Marketing Manager or MACX - has access to all marketing department leads';

-- Check if user is a salesperson (regular sales, not manager)
CREATE OR REPLACE FUNCTION is_salesperson()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_user_role() = 'salesperson';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_salesperson() IS 'Check if current user is a salesperson (regular sales rep)';

-- ============================================
-- PART 2: UPDATE LEADS RLS POLICIES
-- Sales Manager can see ALL leads that have sales_owner_user_id set
-- ============================================

-- Drop existing leads policies
DROP POLICY IF EXISTS leads_select ON leads;

-- Recreate SELECT policy with Sales Manager access to all sales leads
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    -- Admin can see ALL leads
    is_admin()

    -- Marketing Manager and MACX can see all leads from marketing department
    OR (is_marketing_manager_or_macx() AND is_lead_from_marketing_department(created_by))

    -- Marketing staff can see leads they created OR where they are marketing owner
    OR (is_marketing() AND (created_by = auth.uid() OR marketing_owner_user_id = auth.uid()))

    -- Sales Manager can see ALL leads that have sales_owner (any salesperson's leads)
    -- Plus unclaimed leads in the pool
    OR (is_sales_manager() AND (sales_owner_user_id IS NOT NULL OR handover_eligible = true))

    -- Regular Sales can see owned leads OR handover_eligible leads (for claiming)
    OR (is_sales() AND NOT is_sales_manager() AND (sales_owner_user_id = auth.uid() OR handover_eligible = true))
  );

COMMENT ON POLICY leads_select ON leads IS
'Lead visibility:
- Admin: all leads
- Marketing Manager/MACX: all marketing department leads
- Marketing staff: own leads
- Sales Manager: all leads with sales_owner + unclaimed pool
- Salesperson: own leads + unclaimed pool';

-- ============================================
-- PART 3: UPDATE OPPORTUNITIES RLS POLICIES
-- Sales Manager can see ALL opportunities
-- Marketing Manager can see opportunities from marketing-originated leads
-- ============================================

-- Drop existing opportunities policies
DROP POLICY IF EXISTS opp_select ON opportunities;

-- Recreate SELECT policy with improved access
CREATE POLICY opp_select ON opportunities FOR SELECT
  USING (
    -- Admin can see ALL opportunities
    is_admin()

    -- Sales Manager can see ALL opportunities
    OR is_sales_manager()

    -- Regular Sales can see their own opportunities
    OR (is_sales() AND NOT is_sales_manager() AND owner_user_id = auth.uid())

    -- Marketing Manager and MACX can see opportunities from marketing-originated leads
    -- Uses original_creator_id to track marketing origin
    OR (is_marketing_manager_or_macx() AND (
      original_creator_id = auth.uid()
      OR is_lead_from_marketing_department(original_creator_id)
    ))

    -- Marketing staff can see opportunities they created or where they are original_creator
    OR (is_marketing() AND NOT is_marketing_manager_or_macx() AND original_creator_id = auth.uid())
  );

COMMENT ON POLICY opp_select ON opportunities IS
'Opportunity visibility:
- Admin: all opportunities
- Sales Manager: all opportunities
- Salesperson: own opportunities
- Marketing Manager/MACX: opportunities from marketing-originated leads
- Marketing staff: opportunities where they are original_creator';

-- ============================================
-- PART 4: ADD origin_department TO TICKETS TABLE
-- For tracking which department created the ticket
-- ============================================

-- Add origin_department column if it doesn't exist
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS origin_department ticketing_department;

-- Backfill origin_department for existing tickets using creator's role
UPDATE public.tickets t
SET origin_department = public.get_user_ticketing_department(t.created_by)
WHERE t.origin_department IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_tickets_origin_department ON public.tickets(origin_department);

COMMENT ON COLUMN public.tickets.origin_department IS 'Department of the user who created the ticket (originating department)';

-- ============================================
-- PART 5: UPDATE TICKETS RLS POLICIES
-- Ops can only see tickets for their department (target dept)
-- Sales/Marketing users can see tickets from their department (origin dept)
-- ============================================

-- Drop existing tickets SELECT policy
DROP POLICY IF EXISTS "tickets_select_policy" ON public.tickets;

-- Recreate SELECT policy with origin/target department logic
CREATE POLICY "tickets_select_policy" ON public.tickets
    FOR SELECT
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (
            -- Admin sees all
            public.is_ticketing_admin(auth.uid())

            -- Ops sees tickets assigned to their department (target dept)
            OR (
                public.is_ticketing_ops(auth.uid())
                AND department = public.get_user_ticketing_department(auth.uid())
            )

            -- Creator always sees their own tickets
            OR created_by = auth.uid()

            -- Assignee sees assigned tickets
            OR assigned_to = auth.uid()

            -- Users from the originating department can see the ticket
            OR (
                origin_department IS NOT NULL
                AND origin_department = public.get_user_ticketing_department(auth.uid())
            )
        )
    );

COMMENT ON POLICY "tickets_select_policy" ON public.tickets IS
'Ticket visibility:
- Admin: all tickets
- Ops: tickets assigned to their department
- Creator: always sees own tickets
- Assignee: sees assigned tickets
- Origin department users: can see tickets created by their department';

-- Also update UPDATE policy to use department-based access
DROP POLICY IF EXISTS "tickets_update_policy" ON public.tickets;

CREATE POLICY "tickets_update_policy" ON public.tickets
    FOR UPDATE
    TO authenticated
    USING (
        public.can_access_ticketing(auth.uid())
        AND (
            public.is_ticketing_admin(auth.uid())
            -- Ops can update tickets in their department only
            OR (public.is_ticketing_ops(auth.uid()) AND department = public.get_user_ticketing_department(auth.uid()))
            OR created_by = auth.uid()
            OR assigned_to = auth.uid()
        )
    )
    WITH CHECK (
        public.can_access_ticketing(auth.uid())
        AND (
            public.is_ticketing_admin(auth.uid())
            OR (public.is_ticketing_ops(auth.uid()) AND department = public.get_user_ticketing_department(auth.uid()))
            OR created_by = auth.uid()
            OR assigned_to = auth.uid()
        )
    );

-- ============================================
-- PART 6: ENFORCE LOST REASON FOR CLOSED LOST
-- Update rpc_opportunity_change_stage to require lost_reason
-- ============================================

-- Drop the existing function first
DROP FUNCTION IF EXISTS rpc_opportunity_change_stage(TEXT, opportunity_stage, TEXT, TEXT, TEXT);

-- Recreate with lost_reason requirement
CREATE OR REPLACE FUNCTION rpc_opportunity_change_stage(
  p_opportunity_id TEXT,
  p_new_stage opportunity_stage,
  p_notes TEXT DEFAULT NULL,
  p_close_reason TEXT DEFAULT NULL,
  p_lost_reason TEXT DEFAULT NULL,
  p_competitor TEXT DEFAULT NULL,
  p_competitor_price NUMERIC DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_opp RECORD;
  v_existing JSONB;
  v_result JSONB;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Lock opportunity
  SELECT * INTO v_opp FROM opportunities WHERE opportunity_id = p_opportunity_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opportunity not found: %', p_opportunity_id;
  END IF;

  IF v_opp.stage IN ('Closed Won', 'Closed Lost') THEN
    RAISE EXCEPTION 'Cannot change stage of closed opportunity';
  END IF;

  -- ENFORCE: Lost reason is REQUIRED when moving to Closed Lost
  IF p_new_stage = 'Closed Lost' AND (p_lost_reason IS NULL OR p_lost_reason = '') THEN
    RAISE EXCEPTION 'lost_reason is required when closing an opportunity as lost';
  END IF;

  -- Update opportunity
  UPDATE opportunities SET
    stage = p_new_stage,
    close_reason = CASE WHEN p_new_stage IN ('Closed Won', 'Closed Lost') THEN COALESCE(p_close_reason, p_notes) ELSE close_reason END,
    lost_reason = CASE WHEN p_new_stage = 'Closed Lost' THEN p_lost_reason ELSE lost_reason END,
    competitor = CASE WHEN p_new_stage = 'Closed Lost' THEN p_competitor ELSE competitor END,
    competitor_price = CASE WHEN p_new_stage = 'Closed Lost' THEN p_competitor_price ELSE competitor_price END,
    closed_at = CASE WHEN p_new_stage IN ('Closed Won', 'Closed Lost') THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE opportunity_id = p_opportunity_id;

  -- Create stage history entry
  INSERT INTO opportunity_stage_history (
    opportunity_id,
    old_stage,
    new_stage,
    changed_by,
    notes
  ) VALUES (
    p_opportunity_id,
    v_opp.stage,
    p_new_stage,
    auth.uid(),
    COALESCE(p_notes,
      CASE
        WHEN p_new_stage = 'Closed Lost' THEN 'Lost reason: ' || p_lost_reason
        WHEN p_new_stage = 'Closed Won' THEN 'Deal won'
        ELSE NULL
      END
    )
  );

  v_result := jsonb_build_object(
    'success', true,
    'opportunity_id', p_opportunity_id,
    'old_stage', v_opp.stage::TEXT,
    'new_stage', p_new_stage::TEXT,
    'lost_reason', p_lost_reason
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'stage_change-' || p_opportunity_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('opportunities', 'stage_change', 'opportunity', p_opportunity_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION rpc_opportunity_change_stage IS
'Opportunity stage transition - REQUIRES lost_reason when changing to Closed Lost';

-- ============================================
-- PART 7: UNIFY CLAIM VS CONVERT - USE account_id ONLY
-- Update rpc_lead_convert to use account_id instead of customer_id
-- ============================================

-- Drop the existing function first
DROP FUNCTION IF EXISTS rpc_lead_convert(TEXT, TEXT, NUMERIC, TEXT);

-- Recreate with account_id usage and original_creator_id propagation
CREATE OR REPLACE FUNCTION rpc_lead_convert(
  p_lead_id TEXT,
  p_opportunity_name TEXT,
  p_estimated_value NUMERIC DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_lead RECORD;
  v_existing JSONB;
  v_opportunity_id TEXT;
  v_account_id TEXT;
  v_result JSONB;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Lock lead
  SELECT * INTO v_lead FROM leads WHERE lead_id = p_lead_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  IF v_lead.opportunity_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lead already converted to opportunity: %', v_lead.opportunity_id;
  END IF;

  -- Use account_id (preferred) or fall back to customer_id
  v_account_id := COALESCE(v_lead.account_id, v_lead.customer_id);

  -- Ensure account exists
  IF v_account_id IS NULL THEN
    v_account_id := 'ACC' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO accounts (
      account_id,
      company_name,
      pic_name,
      pic_email,
      pic_phone,
      industry,
      owner_user_id,
      created_by,
      original_creator_id,  -- Track marketing origin
      lead_id,
      account_status
    ) VALUES (
      v_account_id,
      v_lead.company_name,
      COALESCE(v_lead.contact_name, v_lead.pic_name),
      COALESCE(v_lead.contact_email, v_lead.pic_email),
      COALESCE(v_lead.contact_phone, v_lead.pic_phone),
      v_lead.industry,
      auth.uid(),
      auth.uid(),
      v_lead.created_by,  -- Preserve original creator for marketing visibility
      p_lead_id,
      'calon_account'
    );

    -- Update lead with account_id (both fields for backwards compatibility)
    UPDATE leads SET
      account_id = v_account_id,
      customer_id = v_account_id
    WHERE lead_id = p_lead_id;
  END IF;

  -- Create opportunity
  v_opportunity_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

  INSERT INTO opportunities (
    opportunity_id,
    name,
    account_id,
    lead_id,
    source_lead_id,
    stage,
    estimated_value,
    owner_user_id,
    created_by,
    original_creator_id  -- Track marketing origin for visibility
  ) VALUES (
    v_opportunity_id,
    p_opportunity_name,
    v_account_id,
    p_lead_id,
    p_lead_id,
    'Prospecting',
    p_estimated_value,
    auth.uid(),
    auth.uid(),
    v_lead.created_by  -- Preserve original creator for marketing visibility
  );

  -- Update lead
  UPDATE leads SET
    opportunity_id = v_opportunity_id,
    updated_at = NOW()
  WHERE lead_id = p_lead_id;

  v_result := jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'account_id', v_account_id,
    'opportunity_id', v_opportunity_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'convert-' || p_lead_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('leads', 'convert', 'lead', p_lead_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION rpc_lead_convert IS
'Convert lead to opportunity - uses account_id, sets original_creator_id for marketing visibility';

-- ============================================
-- PART 8: UPDATE rpc_sales_claim_lead TO SET original_creator_id
-- ============================================

-- Drop the existing function
DROP FUNCTION IF EXISTS rpc_sales_claim_lead(BIGINT, BOOLEAN, BOOLEAN, TEXT);

-- Recreate with original_creator_id propagation
CREATE OR REPLACE FUNCTION rpc_sales_claim_lead(
  p_pool_id BIGINT,
  p_create_account BOOLEAN DEFAULT true,
  p_create_opportunity BOOLEAN DEFAULT true,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_pool RECORD;
  v_lead RECORD;
  v_existing JSONB;
  v_account_id TEXT;
  v_opportunity_id TEXT;
  v_result JSONB;
  v_user_name TEXT;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Get user name for claimed_by_name
  SELECT name INTO v_user_name FROM profiles WHERE user_id = auth.uid();

  -- Race-safe lock: SKIP LOCKED prevents waiting on contested rows
  SELECT * INTO v_pool
  FROM lead_handover_pool
  WHERE pool_id = p_pool_id
    AND claimed_by IS NULL
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lead already claimed or not available'
    );
  END IF;

  -- Get the lead
  SELECT * INTO v_lead FROM leads WHERE lead_id = v_pool.lead_id FOR UPDATE;

  -- Claim the pool entry
  UPDATE lead_handover_pool SET
    claimed_by = auth.uid(),
    claimed_at = NOW()
  WHERE pool_id = p_pool_id;

  -- Update lead - status stays as 'Assign to Sales', only claim_status changes
  UPDATE leads SET
    sales_owner_user_id = auth.uid(),
    claim_status = 'claimed',
    claimed_by_name = v_user_name,
    claimed_at = NOW(),
    handover_eligible = false,
    updated_at = NOW()
  WHERE lead_id = v_pool.lead_id;

  -- Use account_id (preferred) or fall back to customer_id
  v_account_id := COALESCE(v_lead.account_id, v_lead.customer_id);

  -- Create account if requested and account doesn't exist
  IF p_create_account AND v_account_id IS NULL THEN
    v_account_id := 'ACC' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO accounts (
      account_id,
      company_name,
      pic_name,
      pic_email,
      pic_phone,
      industry,
      owner_user_id,
      created_by,
      original_creator_id,  -- Track marketing origin
      lead_id,
      account_status
    ) VALUES (
      v_account_id,
      v_lead.company_name,
      COALESCE(v_lead.contact_name, v_lead.pic_name),
      COALESCE(v_lead.contact_email, v_lead.pic_email),
      COALESCE(v_lead.contact_phone, v_lead.pic_phone),
      v_lead.industry,
      auth.uid(),
      auth.uid(),
      v_lead.created_by,  -- Preserve original creator for marketing visibility
      v_pool.lead_id,
      'calon_account'
    );

    -- Link lead to account (set both for backwards compatibility)
    UPDATE leads SET
      account_id = v_account_id,
      customer_id = v_account_id
    WHERE lead_id = v_pool.lead_id;
  END IF;

  -- Create opportunity (pipeline) if requested and account exists
  IF p_create_opportunity AND v_account_id IS NOT NULL THEN
    v_opportunity_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO opportunities (
      opportunity_id,
      name,
      account_id,
      lead_id,
      source_lead_id,
      stage,
      estimated_value,
      currency,
      probability,
      owner_user_id,
      created_by,
      original_creator_id  -- Track marketing origin for visibility
    ) VALUES (
      v_opportunity_id,
      'Pipeline - ' || v_lead.company_name,
      v_account_id,
      v_pool.lead_id,
      v_pool.lead_id,
      'Prospecting',
      COALESCE(v_lead.potential_revenue, 0),
      'IDR',
      10,
      auth.uid(),
      auth.uid(),
      v_lead.created_by  -- Preserve original creator for marketing visibility
    );

    -- Link lead to opportunity
    UPDATE leads SET opportunity_id = v_opportunity_id WHERE lead_id = v_pool.lead_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'pool_id', p_pool_id,
    'lead_id', v_pool.lead_id,
    'account_id', v_account_id,
    'opportunity_id', v_opportunity_id,
    'claimed_by', auth.uid(),
    'claimed_by_name', v_user_name
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'claim-' || v_pool.lead_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('leads', 'claim', 'lead', v_pool.lead_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION rpc_sales_claim_lead IS
'Claim lead from pool - creates account with calon_account status, pipeline with Prospecting stage, sets original_creator_id for marketing visibility';

-- ============================================
-- PART 9: DATA MIGRATION - SYNC customer_id to account_id
-- Ensure all leads have account_id set if customer_id exists
-- ============================================

-- Migrate any leads where customer_id is set but account_id is not
UPDATE leads
SET account_id = customer_id
WHERE customer_id IS NOT NULL
  AND (account_id IS NULL OR account_id = '');

-- ============================================
-- PART 10: SET origin_department ON TICKET INSERT
-- Create trigger to automatically set origin_department
-- ============================================

CREATE OR REPLACE FUNCTION public.set_ticket_origin_department()
RETURNS TRIGGER AS $$
BEGIN
  -- Set origin_department based on creator's role if not already set
  IF NEW.origin_department IS NULL THEN
    NEW.origin_department := public.get_user_ticketing_department(NEW.created_by);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_ticket_origin_department ON public.tickets;
CREATE TRIGGER trg_set_ticket_origin_department
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ticket_origin_department();

COMMENT ON FUNCTION public.set_ticket_origin_department IS
'Automatically sets origin_department on ticket creation based on creator role';

-- ============================================
-- PART 11: UPDATE ACCOUNTS RLS FOR MARKETING VISIBILITY
-- Marketing Manager/MACX can see accounts from marketing-originated leads
-- ============================================

-- Drop existing accounts SELECT policy
DROP POLICY IF EXISTS accounts_select ON accounts;

-- Recreate with marketing visibility through original_creator_id
CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (
    is_admin()
    OR is_sales()  -- All sales can see accounts
    -- Marketing Manager/MACX can see accounts from marketing-originated leads
    OR (is_marketing_manager_or_macx() AND (
      original_creator_id = auth.uid()
      OR is_lead_from_marketing_department(original_creator_id)
    ))
    -- Marketing staff can see accounts they originated
    OR (is_marketing() AND original_creator_id = auth.uid())
  );

COMMENT ON POLICY accounts_select ON accounts IS
'Account visibility:
- Admin/Sales: all accounts
- Marketing Manager/MACX: accounts from marketing-originated leads
- Marketing staff: accounts they originated';

-- ============================================
-- PART 12: ADD original_creator_id TO accounts/opportunities IF NOT EXISTS
-- ============================================

-- Add original_creator_id to accounts if not exists
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS original_creator_id UUID REFERENCES profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_accounts_original_creator ON accounts(original_creator_id);

COMMENT ON COLUMN public.accounts.original_creator_id IS 'Original creator (marketing user) for visibility tracking';

-- Add original_creator_id to opportunities if not exists
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS original_creator_id UUID REFERENCES profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_opportunities_original_creator ON opportunities(original_creator_id);

COMMENT ON COLUMN public.opportunities.original_creator_id IS 'Original creator (marketing user) for visibility tracking';

-- ============================================
-- PART 13: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION is_sales_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION is_marketing_manager_or_macx() TO authenticated;
GRANT EXECUTE ON FUNCTION is_salesperson() TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_opportunity_change_stage(TEXT, opportunity_stage, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_lead_convert(TEXT, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_sales_claim_lead(BIGINT, BOOLEAN, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ticket_origin_department() TO authenticated;

-- ============================================
-- SUMMARY OF CHANGES
-- ============================================

/*
MIGRATION 073 SUMMARY:

1. HELPER FUNCTIONS ADDED:
   - is_sales_manager() - Check if user is Sales Manager
   - is_marketing_manager_or_macx() - Check if user is Marketing Manager or MACX
   - is_salesperson() - Check if user is a regular salesperson

2. LEADS RLS POLICY UPDATED:
   - Sales Manager can now see ALL leads with sales_owner_user_id set
   - Plus all handover_eligible leads
   - Regular salesperson still sees only their own + unclaimed pool

3. OPPORTUNITIES RLS POLICY UPDATED:
   - Sales Manager can see ALL opportunities
   - Marketing Manager/MACX can see opportunities from marketing-originated leads
   - Uses original_creator_id for tracking

4. TICKETS VISIBILITY FIXED:
   - Added origin_department column to track creator's department
   - Ops users can only see tickets assigned to their department
   - Users from originating department can see their tickets
   - Trigger auto-sets origin_department on insert

5. LOST REASON ENFORCEMENT:
   - rpc_opportunity_change_stage now REQUIRES lost_reason for Closed Lost
   - Added competitor and competitor_price fields support

6. CLAIM/CONVERT UNIFIED:
   - Both now use account_id consistently
   - Both now set original_creator_id for marketing visibility
   - Backwards compatible: still sets customer_id for legacy code

7. DATA MIGRATION:
   - Synced customer_id to account_id for existing leads
   - Backfilled origin_department for existing tickets

8. ACCOUNTS RLS UPDATED:
   - Marketing Manager/MACX can see accounts from marketing-originated leads
*/
