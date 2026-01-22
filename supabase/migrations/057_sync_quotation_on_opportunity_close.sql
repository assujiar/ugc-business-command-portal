-- ============================================
-- Migration: 057_sync_quotation_on_opportunity_close.sql
-- Fix: Sync quotation status when opportunity is closed (won/lost)
--
-- When an opportunity stage changes to "Closed Won" or "Closed Lost",
-- automatically update all linked active quotations to "accepted" or "rejected"
-- ============================================

-- ============================================
-- UPDATE rpc_opportunity_change_stage function
-- Add call to sync_opportunity_to_quotation when closing
-- ============================================

CREATE OR REPLACE FUNCTION rpc_opportunity_change_stage(
  p_opportunity_id TEXT,
  p_new_stage opportunity_stage,
  p_notes TEXT DEFAULT NULL,
  p_close_reason TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_opp RECORD;
  v_existing JSONB;
  v_result JSONB;
  v_quotation_sync JSONB;
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

  -- Update opportunity
  UPDATE opportunities SET
    stage = p_new_stage,
    close_reason = CASE WHEN p_new_stage IN ('Closed Won', 'Closed Lost') THEN p_close_reason ELSE close_reason END,
    closed_at = CASE WHEN p_new_stage IN ('Closed Won', 'Closed Lost') THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE opportunity_id = p_opportunity_id;

  -- Stage history is auto-logged by trigger (004_tables_opportunities.sql)

  -- Sync quotation status when opportunity is closed
  IF p_new_stage = 'Closed Won' THEN
    v_quotation_sync := public.sync_opportunity_to_quotation(p_opportunity_id, 'won');
  ELSIF p_new_stage = 'Closed Lost' THEN
    v_quotation_sync := public.sync_opportunity_to_quotation(p_opportunity_id, 'lost');
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'opportunity_id', p_opportunity_id,
    'old_stage', v_opp.stage::TEXT,
    'new_stage', p_new_stage::TEXT,
    'quotation_sync', v_quotation_sync
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, 'stage_change-' || p_opportunity_id, v_result);
  END IF;

  INSERT INTO audit_logs (module, action, record_type, record_id, user_id, after_data)
  VALUES ('opportunities', 'stage_change', 'opportunity', p_opportunity_id, auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Also create a trigger for direct UPDATE on opportunities table
-- In case someone updates stage directly without using RPC
-- ============================================

CREATE OR REPLACE FUNCTION trigger_sync_quotation_on_opportunity_close()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when stage changes to Closed Won or Closed Lost
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    IF NEW.stage = 'Closed Won' THEN
      PERFORM public.sync_opportunity_to_quotation(NEW.opportunity_id, 'won');
    ELSIF NEW.stage = 'Closed Lost' THEN
      PERFORM public.sync_opportunity_to_quotation(NEW.opportunity_id, 'lost');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_sync_quotation_on_opportunity_close ON opportunities;

-- Create trigger
CREATE TRIGGER trg_sync_quotation_on_opportunity_close
  AFTER UPDATE ON opportunities
  FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage AND NEW.stage IN ('Closed Won', 'Closed Lost'))
  EXECUTE FUNCTION trigger_sync_quotation_on_opportunity_close();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON FUNCTION rpc_opportunity_change_stage IS 'Opportunity stage transition with quotation sync - SOURCE: PDF Page 31';
COMMENT ON FUNCTION trigger_sync_quotation_on_opportunity_close IS 'Auto-sync quotation status when opportunity closes';
