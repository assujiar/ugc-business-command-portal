-- =====================================================
-- Migration 011: RPC Functions for Atomic Workflows
-- SOURCE: PDF Section 7, Pages 28-32
-- =====================================================

-- =====================================================
-- RPC_LEAD_TRIAGE - Handle triage status changes
-- SOURCE: PDF Page 28
-- Auto-handover when status = 'Qualified'
-- =====================================================
CREATE OR REPLACE FUNCTION rpc_lead_triage(
  p_lead_id TEXT,
  p_new_status lead_triage_status,
  p_notes TEXT DEFAULT NULL,
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

  -- Validate transition based on current status
  IF v_lead.triage_status = 'Handed Over' THEN
    RAISE EXCEPTION 'Cannot change status of handed over lead';
  END IF;

  -- Update lead status
  UPDATE leads SET
    triage_status = p_new_status,
    updated_at = NOW(),
    disqualified_at = CASE WHEN p_new_status = 'Disqualified' THEN NOW() ELSE NULL END,
    disqualification_reason = CASE WHEN p_new_status = 'Disqualified' THEN p_notes ELSE disqualification_reason END
  WHERE lead_id = p_lead_id;

  -- Auto-handover on Qualified (SOURCE: PDF Page 29)
  IF p_new_status = 'Qualified' THEN
    -- Create handover pool entry
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
    RETURNING pool_id INTO v_pool_id;

    -- Update lead to Handed Over
    UPDATE leads SET
      triage_status = 'Handed Over',
      handover_eligible = true,
      updated_at = NOW()
    WHERE lead_id = p_lead_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'new_status', p_new_status::TEXT,
    'pool_id', v_pool_id
  );

  -- Store idempotency result
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, v_result);
  END IF;

  -- Audit log
  INSERT INTO audit_logs (entity_type, entity_id, action, actor_user_id, details)
  VALUES ('lead', p_lead_id, 'triage', auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC_LEAD_HANDOVER_TO_SALES_POOL - Manual handover
-- SOURCE: PDF Page 29
-- =====================================================
CREATE OR REPLACE FUNCTION rpc_lead_handover_to_sales_pool(
  p_lead_id TEXT,
  p_notes TEXT DEFAULT NULL,
  p_priority INTEGER DEFAULT 1,
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

  IF v_lead.triage_status = 'Handed Over' THEN
    RAISE EXCEPTION 'Lead already handed over';
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
  RETURNING pool_id INTO v_pool_id;

  -- Update lead status
  UPDATE leads SET
    triage_status = 'Handed Over',
    handover_eligible = true,
    updated_at = NOW()
  WHERE lead_id = p_lead_id;

  v_result := jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'pool_id', v_pool_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, v_result);
  END IF;

  INSERT INTO audit_logs (entity_type, entity_id, action, actor_user_id, details)
  VALUES ('lead', p_lead_id, 'handover', auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC_SALES_CLAIM_LEAD - Atomic claim with race safety
-- SOURCE: PDF Page 30
-- Uses FOR UPDATE SKIP LOCKED for race safety
-- =====================================================
CREATE OR REPLACE FUNCTION rpc_sales_claim_lead(
  p_pool_id BIGINT,
  p_create_account BOOLEAN DEFAULT true,
  p_create_opportunity BOOLEAN DEFAULT false,
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
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

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

  -- Update lead ownership
  UPDATE leads SET
    sales_owner_user_id = auth.uid(),
    claimed_at = NOW(),
    handover_eligible = false,
    updated_at = NOW()
  WHERE lead_id = v_pool.lead_id;

  -- Create account if requested (SOURCE: PDF Page 30)
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
      created_by
    ) VALUES (
      v_account_id,
      v_lead.company_name,
      v_lead.pic_name,
      v_lead.pic_email,
      v_lead.pic_phone,
      v_lead.industry,
      auth.uid(),
      auth.uid()
    );

    -- Link lead to account
    UPDATE leads SET customer_id = v_account_id WHERE lead_id = v_pool.lead_id;
  ELSE
    v_account_id := v_lead.customer_id;
  END IF;

  -- Create opportunity if requested
  IF p_create_opportunity AND v_account_id IS NOT NULL THEN
    v_opportunity_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO opportunities (
      opportunity_id,
      name,
      account_id,
      lead_id,
      stage,
      owner_user_id,
      created_by
    ) VALUES (
      v_opportunity_id,
      'Opportunity from ' || v_lead.company_name,
      v_account_id,
      v_pool.lead_id,
      'Prospecting',
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
    'opportunity_id', v_opportunity_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, v_result);
  END IF;

  INSERT INTO audit_logs (entity_type, entity_id, action, actor_user_id, details)
  VALUES ('lead', v_pool.lead_id, 'claim', auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC_LEAD_CONVERT - Convert lead to opportunity
-- SOURCE: PDF Page 31
-- =====================================================
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

  -- Ensure account exists
  IF v_lead.customer_id IS NULL THEN
    v_account_id := 'ACC' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO accounts (
      account_id,
      company_name,
      pic_name,
      pic_email,
      pic_phone,
      industry,
      owner_user_id,
      created_by
    ) VALUES (
      v_account_id,
      v_lead.company_name,
      v_lead.pic_name,
      v_lead.pic_email,
      v_lead.pic_phone,
      v_lead.industry,
      auth.uid(),
      auth.uid()
    );

    UPDATE leads SET customer_id = v_account_id WHERE lead_id = p_lead_id;
  ELSE
    v_account_id := v_lead.customer_id;
  END IF;

  -- Create opportunity
  v_opportunity_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

  INSERT INTO opportunities (
    opportunity_id,
    name,
    account_id,
    lead_id,
    stage,
    estimated_value,
    owner_user_id,
    created_by
  ) VALUES (
    v_opportunity_id,
    p_opportunity_name,
    v_account_id,
    p_lead_id,
    'Prospecting',
    p_estimated_value,
    auth.uid(),
    auth.uid()
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
    PERFORM store_idempotency(p_idempotency_key, v_result);
  END IF;

  INSERT INTO audit_logs (entity_type, entity_id, action, actor_user_id, details)
  VALUES ('lead', p_lead_id, 'convert', auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC_OPPORTUNITY_CHANGE_STAGE - Stage transition
-- SOURCE: PDF Page 31
-- =====================================================
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

  v_result := jsonb_build_object(
    'success', true,
    'opportunity_id', p_opportunity_id,
    'old_stage', v_opp.stage::TEXT,
    'new_stage', p_new_stage::TEXT
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, v_result);
  END IF;

  INSERT INTO audit_logs (entity_type, entity_id, action, actor_user_id, details)
  VALUES ('opportunity', p_opportunity_id, 'stage_change', auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC_TARGET_CONVERT - Convert target to account/opp
-- SOURCE: PDF Page 32
-- =====================================================
CREATE OR REPLACE FUNCTION rpc_target_convert(
  p_target_id TEXT,
  p_create_opportunity BOOLEAN DEFAULT true,
  p_opportunity_name TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_target RECORD;
  v_existing JSONB;
  v_account_id TEXT;
  v_opportunity_id TEXT;
  v_result JSONB;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Lock target
  SELECT * INTO v_target FROM prospecting_targets WHERE target_id = p_target_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target not found: %', p_target_id;
  END IF;

  IF v_target.status = 'converted' THEN
    RAISE EXCEPTION 'Target already converted';
  END IF;

  IF v_target.converted_account_id IS NOT NULL THEN
    RAISE EXCEPTION 'Target already has account: %', v_target.converted_account_id;
  END IF;

  -- Create account
  v_account_id := 'ACC' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

  INSERT INTO accounts (
    account_id,
    company_name,
    pic_name,
    pic_email,
    pic_phone,
    industry,
    owner_user_id,
    created_by
  ) VALUES (
    v_account_id,
    v_target.company_name,
    v_target.pic_name,
    v_target.pic_email,
    v_target.pic_phone,
    v_target.industry,
    auth.uid(),
    auth.uid()
  );

  -- Create opportunity if requested
  IF p_create_opportunity THEN
    v_opportunity_id := 'OPP' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO opportunities (
      opportunity_id,
      name,
      account_id,
      stage,
      owner_user_id,
      created_by
    ) VALUES (
      v_opportunity_id,
      COALESCE(p_opportunity_name, 'Opportunity from ' || v_target.company_name),
      v_account_id,
      'Prospecting',
      auth.uid(),
      auth.uid()
    );
  END IF;

  -- Update target
  UPDATE prospecting_targets SET
    status = 'converted',
    converted_account_id = v_account_id,
    converted_at = NOW(),
    updated_at = NOW()
  WHERE target_id = p_target_id;

  v_result := jsonb_build_object(
    'success', true,
    'target_id', p_target_id,
    'account_id', v_account_id,
    'opportunity_id', v_opportunity_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, v_result);
  END IF;

  INSERT INTO audit_logs (entity_type, entity_id, action, actor_user_id, details)
  VALUES ('target', p_target_id, 'convert', auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC_ACTIVITY_COMPLETE_AND_NEXT - Complete + next
-- SOURCE: PDF Page 32
-- =====================================================
CREATE OR REPLACE FUNCTION rpc_activity_complete_and_next(
  p_activity_id TEXT,
  p_outcome TEXT DEFAULT NULL,
  p_create_follow_up BOOLEAN DEFAULT false,
  p_follow_up_days INTEGER DEFAULT 7,
  p_follow_up_type activity_type_v2 DEFAULT 'Task',
  p_follow_up_subject TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_activity RECORD;
  v_existing JSONB;
  v_follow_up_id TEXT;
  v_result JSONB;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Lock activity
  SELECT * INTO v_activity FROM activities WHERE activity_id = p_activity_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found: %', p_activity_id;
  END IF;

  IF v_activity.status = 'Done' THEN
    RAISE EXCEPTION 'Activity already completed';
  END IF;

  -- Complete the activity
  UPDATE activities SET
    status = 'Done',
    outcome = p_outcome,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE activity_id = p_activity_id;

  -- Create follow-up if requested
  IF p_create_follow_up THEN
    v_follow_up_id := 'ACT' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO activities (
      activity_id,
      activity_type,
      subject,
      description,
      status,
      due_date,
      related_account_id,
      related_contact_id,
      related_opportunity_id,
      related_lead_id,
      owner_user_id,
      created_by
    ) VALUES (
      v_follow_up_id,
      p_follow_up_type,
      COALESCE(p_follow_up_subject, 'Follow-up: ' || v_activity.subject),
      'Follow-up from activity ' || p_activity_id,
      'Planned',
      CURRENT_DATE + p_follow_up_days,
      v_activity.related_account_id,
      v_activity.related_contact_id,
      v_activity.related_opportunity_id,
      v_activity.related_lead_id,
      auth.uid(),
      auth.uid()
    );
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'activity_id', p_activity_id,
    'follow_up_id', v_follow_up_id
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, v_result);
  END IF;

  INSERT INTO audit_logs (entity_type, entity_id, action, actor_user_id, details)
  VALUES ('activity', p_activity_id, 'complete', auth.uid(), v_result);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- RPC_CADENCE_ADVANCE - Advance cadence to next step
-- SOURCE: PDF Page 12
-- =====================================================
CREATE OR REPLACE FUNCTION rpc_cadence_advance(
  p_enrollment_id BIGINT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_enrollment RECORD;
  v_next_step RECORD;
  v_existing JSONB;
  v_activity_id TEXT;
  v_result JSONB;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    v_existing := check_idempotency(p_idempotency_key);
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Lock enrollment
  SELECT * INTO v_enrollment FROM cadence_enrollments WHERE enrollment_id = p_enrollment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found: %', p_enrollment_id;
  END IF;

  IF v_enrollment.status != 'Active' THEN
    RAISE EXCEPTION 'Enrollment not active';
  END IF;

  -- Get next step
  SELECT * INTO v_next_step
  FROM cadence_steps
  WHERE cadence_id = v_enrollment.cadence_id
    AND step_number = v_enrollment.current_step + 1;

  IF NOT FOUND THEN
    -- No more steps, mark completed
    UPDATE cadence_enrollments SET
      status = 'Completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE enrollment_id = p_enrollment_id;

    v_result := jsonb_build_object(
      'success', true,
      'enrollment_id', p_enrollment_id,
      'status', 'Completed'
    );
  ELSE
    -- Advance to next step
    UPDATE cadence_enrollments SET
      current_step = v_next_step.step_number,
      updated_at = NOW()
    WHERE enrollment_id = p_enrollment_id;

    -- Create activity for the step
    v_activity_id := 'ACT' || TO_CHAR(NOW(), 'YYYYMMDD') || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));

    INSERT INTO activities (
      activity_id,
      activity_type,
      subject,
      description,
      status,
      due_date,
      related_account_id,
      related_opportunity_id,
      cadence_enrollment_id,
      cadence_step_number,
      owner_user_id,
      created_by
    ) VALUES (
      v_activity_id,
      v_next_step.activity_type,
      v_next_step.subject_template,
      v_next_step.description_template,
      'Planned',
      CURRENT_DATE + v_next_step.delay_days,
      v_enrollment.account_id,
      v_enrollment.opportunity_id,
      p_enrollment_id,
      v_next_step.step_number,
      v_enrollment.enrolled_by,
      v_enrollment.enrolled_by
    );

    v_result := jsonb_build_object(
      'success', true,
      'enrollment_id', p_enrollment_id,
      'new_step', v_next_step.step_number,
      'activity_id', v_activity_id
    );
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM store_idempotency(p_idempotency_key, v_result);
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION rpc_lead_triage IS 'Atomic lead triage with auto-handover - SOURCE: PDF Page 28';
COMMENT ON FUNCTION rpc_lead_handover_to_sales_pool IS 'Manual handover to sales pool - SOURCE: PDF Page 29';
COMMENT ON FUNCTION rpc_sales_claim_lead IS 'Race-safe lead claim with optional account/opp creation - SOURCE: PDF Page 30';
COMMENT ON FUNCTION rpc_lead_convert IS 'Convert lead to opportunity - SOURCE: PDF Page 31';
COMMENT ON FUNCTION rpc_opportunity_change_stage IS 'Opportunity stage transition - SOURCE: PDF Page 31';
COMMENT ON FUNCTION rpc_target_convert IS 'Convert target to account/opportunity - SOURCE: PDF Page 32';
COMMENT ON FUNCTION rpc_activity_complete_and_next IS 'Complete activity and create follow-up - SOURCE: PDF Page 32';
COMMENT ON FUNCTION rpc_cadence_advance IS 'Advance cadence enrollment to next step - SOURCE: PDF Page 12';
