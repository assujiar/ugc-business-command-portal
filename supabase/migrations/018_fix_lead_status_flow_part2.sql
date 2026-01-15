-- =====================================================
-- Migration 018: Fix Lead Status Flow - Part 2
-- Migrate data and update views/functions
-- =====================================================
-- PREREQUISITE: Run 017_fix_lead_status_flow.sql first and wait for it to complete
-- This migration uses the 'Assign to Sales' enum value added in the previous migration

-- =====================================================
-- STEP 1: Migrate existing data from 'Handed Over' to 'Assign to Sales'
-- =====================================================

UPDATE leads
SET triage_status = 'Assign to Sales'::lead_triage_status
WHERE triage_status = 'Handed Over'::lead_triage_status;

-- =====================================================
-- STEP 2: Update VIEW v_my_leads
-- Change filter to use claim_status = 'claimed'
-- =====================================================

DROP VIEW IF EXISTS v_my_leads CASCADE;

CREATE VIEW v_my_leads (
  lead_id, company_name, contact_name, contact_email, customer_account_name,
  linked_opportunity_id, opportunity_stage, sales_owner_user_id, triage_status,
  claim_status, claimed_at, created_at, updated_at
) AS
SELECT
  l.lead_id,
  l.company_name,
  l.contact_name,
  l.contact_email,
  a.company_name,
  o.opportunity_id,
  o.stage,
  l.sales_owner_user_id,
  l.triage_status,
  l.claim_status,
  l.claimed_at,
  l.created_at,
  l.updated_at
FROM leads l
LEFT JOIN accounts a ON l.customer_id = a.account_id
LEFT JOIN opportunities o ON l.opportunity_id = o.opportunity_id
WHERE l.sales_owner_user_id IS NOT NULL
  AND l.claim_status = 'claimed'
ORDER BY l.claimed_at DESC;

COMMENT ON VIEW v_my_leads IS 'Leads claimed by salesperson - shows claimed leads with sales owner';

-- =====================================================
-- STEP 3: DROP existing RPC Functions first (with exact signatures)
-- This is needed because we're changing the function signatures
-- =====================================================

-- Drop old rpc_lead_triage (original signature)
DROP FUNCTION IF EXISTS rpc_lead_triage(TEXT, lead_triage_status, TEXT, TEXT);

-- Drop old rpc_lead_handover_to_sales_pool (original signature)
DROP FUNCTION IF EXISTS rpc_lead_handover_to_sales_pool(TEXT, TEXT, INTEGER, TEXT);

-- Drop old rpc_sales_claim_lead (original signature)
DROP FUNCTION IF EXISTS rpc_sales_claim_lead(BIGINT, BOOLEAN, BOOLEAN, TEXT);

-- =====================================================
-- STEP 4: Create updated RPC Functions
-- =====================================================

-- rpc_lead_triage - Remove auto-transition, Qualified stays as Qualified
CREATE OR REPLACE FUNCTION rpc_lead_triage(
  p_lead_id TEXT,
  p_new_status lead_triage_status,
  p_notes TEXT DEFAULT NULL,
  p_potential_revenue NUMERIC DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_lead RECORD;
  v_existing JSONB;
  v_pool_id BIGINT;
  v_result JSONB;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Lock the lead for update
  SELECT * INTO v_lead FROM leads WHERE lead_id = p_lead_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  -- Cannot change status of leads already assigned to sales
  IF v_lead.triage_status = 'Assign to Sales' THEN
    RAISE EXCEPTION 'Cannot change status of lead already assigned to sales';
  END IF;

  -- Validate potential_revenue for 'Assign to Sales' status
  IF p_new_status = 'Assign to Sales' THEN
    IF p_potential_revenue IS NULL OR p_potential_revenue <= 0 THEN
      RAISE EXCEPTION 'potential_revenue is required for Assign to Sales status';
    END IF;
  END IF;

  -- Update lead status
  UPDATE leads SET
    triage_status = p_new_status,
    updated_at = NOW(),
    disqualified_at = CASE WHEN p_new_status = 'Disqualified' THEN NOW() ELSE disqualified_at END,
    disqualification_reason = CASE WHEN p_new_status = 'Disqualified' THEN p_notes ELSE disqualification_reason END,
    -- For Assign to Sales status
    potential_revenue = CASE WHEN p_new_status = 'Assign to Sales' THEN p_potential_revenue ELSE potential_revenue END,
    claim_status = CASE WHEN p_new_status = 'Assign to Sales' THEN 'unclaimed' ELSE claim_status END,
    qualified_at = CASE WHEN p_new_status = 'Assign to Sales' THEN NOW() ELSE qualified_at END,
    handover_eligible = CASE WHEN p_new_status = 'Assign to Sales' THEN true ELSE handover_eligible END
  WHERE lead_id = p_lead_id;

  -- Create handover pool entry for 'Assign to Sales' status (for sales inbox/lead bidding)
  IF p_new_status = 'Assign to Sales' THEN
    INSERT INTO lead_handover_pool (
      lead_id,
      handed_over_by,
      handover_notes,
      priority,
      expires_at
    ) VALUES (
      p_lead_id,
      auth.uid(),
      p_notes,
      1,
      NOW() + INTERVAL '7 days'
    )
    ON CONFLICT (lead_id) DO NOTHING
    RETURNING pool_id INTO v_pool_id;
  END IF;

  -- NOTE: Qualified status stays as Qualified - NO auto-transition!
  -- Assign to Sales is done manually via separate action

  v_result := jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'new_status', p_new_status::TEXT,
    'pool_id', v_pool_id
  );

  -- Store idempotency result
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'triage-' || p_lead_id, v_result);
  END IF;

  -- Audit log
  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('leads', 'triage', 'lead', p_lead_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION rpc_lead_triage IS 'Lead triage - Qualified stays as Qualified, Assign to Sales requires potential_revenue';

-- rpc_lead_handover_to_sales_pool - Use 'Assign to Sales' status
CREATE OR REPLACE FUNCTION rpc_lead_handover_to_sales_pool(
  p_lead_id TEXT,
  p_notes TEXT DEFAULT NULL,
  p_priority INTEGER DEFAULT 1,
  p_potential_revenue NUMERIC DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_lead RECORD;
  v_existing JSONB;
  v_pool_id BIGINT;
  v_result JSONB;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Lock the lead
  SELECT * INTO v_lead FROM leads WHERE lead_id = p_lead_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  IF v_lead.triage_status = 'Assign to Sales' THEN
    RAISE EXCEPTION 'Lead already assigned to sales';
  END IF;

  -- Create pool entry
  INSERT INTO lead_handover_pool (
    lead_id,
    handed_over_by,
    handover_notes,
    priority,
    expires_at
  ) VALUES (
    p_lead_id,
    auth.uid(),
    p_notes,
    p_priority,
    NOW() + INTERVAL '7 days'
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    handover_notes = EXCLUDED.handover_notes,
    priority = EXCLUDED.priority,
    expires_at = EXCLUDED.expires_at
  RETURNING pool_id INTO v_pool_id;

  -- Update lead status to 'Assign to Sales'
  UPDATE leads SET
    triage_status = 'Assign to Sales',
    potential_revenue = COALESCE(p_potential_revenue, potential_revenue),
    claim_status = 'unclaimed',
    handover_eligible = true,
    qualified_at = COALESCE(qualified_at, NOW()),
    updated_at = NOW()
  WHERE lead_id = p_lead_id;

  v_result := jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'pool_id', v_pool_id,
    'new_status', 'Assign to Sales'
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'assign_to_sales-' || p_lead_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('leads', 'assign_to_sales', 'lead', p_lead_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION rpc_lead_handover_to_sales_pool IS 'Assign lead to sales pool - changes status to Assign to Sales';

-- rpc_sales_claim_lead - Status stays 'Assign to Sales', creates account & pipeline
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

  -- Create account if requested
  IF p_create_account AND v_lead.customer_id IS NULL THEN
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
      account_status,
      lead_id
    ) VALUES (
      v_account_id,
      v_lead.company_name,
      v_lead.contact_name,
      v_lead.contact_email,
      v_lead.contact_phone,
      v_lead.industry,
      auth.uid(),
      auth.uid(),
      'calon_account',
      v_pool.lead_id
    );

    -- Link lead to account
    UPDATE leads SET customer_id = v_account_id, account_id = v_account_id WHERE lead_id = v_pool.lead_id;
  ELSE
    v_account_id := v_lead.customer_id;
  END IF;

  -- Create opportunity (pipeline) if requested and account exists
  IF p_create_opportunity AND v_account_id IS NOT NULL THEN
    v_opportunity_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO opportunities (
      opportunity_id,
      name,
      account_id,
      lead_id,
      stage,
      estimated_value,
      currency,
      probability,
      owner_user_id,
      created_by
    ) VALUES (
      v_opportunity_id,
      'Pipeline - ' || v_lead.company_name,
      v_account_id,
      v_pool.lead_id,
      'Prospecting',
      COALESCE(v_lead.potential_revenue, 0),
      'IDR',
      10,
      auth.uid(),
      auth.uid()
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

COMMENT ON FUNCTION rpc_sales_claim_lead IS 'Claim lead from pool - creates account with calon_account status and pipeline with Prospecting stage';

-- =====================================================
-- STEP 5: Add unique constraint on lead_handover_pool.lead_id if not exists
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_handover_pool_lead_id_key'
  ) THEN
    ALTER TABLE lead_handover_pool ADD CONSTRAINT lead_handover_pool_lead_id_key UNIQUE (lead_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN
    NULL;
  WHEN duplicate_object THEN
    NULL;
END $$;

-- =====================================================
-- Summary of Changes:
-- 1. Migrated existing 'Handed Over' leads to 'Assign to Sales'
-- 2. Updated v_my_leads view to filter by claim_status = 'claimed'
-- 3. Dropped old functions and recreated with new signatures
-- 4. Updated rpc_lead_triage: No auto-transition, Qualified stays as Qualified
-- 5. Updated rpc_lead_handover_to_sales_pool: Sets status to 'Assign to Sales'
-- 6. Updated rpc_sales_claim_lead:
--    - Status stays as 'Assign to Sales' (only claim_status changes)
--    - Creates account with 'calon_account' status
--    - Creates pipeline with 'Prospecting' stage
-- =====================================================
