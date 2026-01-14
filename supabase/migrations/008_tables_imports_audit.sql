-- =====================================================
-- Migration 008: Import Batches and Audit Logs
-- SOURCE: PDF Pages 2, 8, 25
-- =====================================================

-- =====================================================
-- IMPORT BATCHES TABLE
-- SOURCE: PDF Page 2
-- =====================================================
CREATE TABLE import_batches (
  batch_id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL, -- 'leads', 'targets', 'accounts', 'contacts'
  file_name TEXT,
  file_url TEXT,
  status import_batch_status DEFAULT 'pending',
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  success_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  imported_by UUID NOT NULL REFERENCES profiles(user_id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_import_batches_status ON import_batches(status);
CREATE INDEX idx_import_batches_user ON import_batches(imported_by);
CREATE INDEX idx_import_batches_created ON import_batches(created_at DESC);

-- =====================================================
-- AUDIT LOGS TABLE
-- SOURCE: PDF Page 8, 25
-- =====================================================
CREATE TABLE audit_logs (
  log_id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES profiles(user_id),
  module TEXT NOT NULL, -- 'crm', 'leads', 'opportunities', etc.
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'triage', 'claim', etc.
  record_id TEXT,
  record_type TEXT,
  before_data JSONB,
  after_data JSONB,
  correlation_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_module ON audit_logs(module);
CREATE INDEX idx_audit_record ON audit_logs(record_type, record_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_correlation ON audit_logs(correlation_id);

-- =====================================================
-- CRM IDEMPOTENCY TABLE
-- SOURCE: PDF Page 25
-- =====================================================
CREATE TABLE crm_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  request_fingerprint TEXT,
  response JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_idempotency_expires ON crm_idempotency(expires_at);

-- Function to check idempotency
CREATE OR REPLACE FUNCTION check_idempotency(p_key TEXT)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT response INTO v_result
  FROM crm_idempotency
  WHERE idempotency_key = p_key
    AND expires_at > NOW();

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Function to store idempotency
CREATE OR REPLACE FUNCTION store_idempotency(
  p_key TEXT,
  p_fingerprint TEXT,
  p_response JSONB,
  p_ttl_hours INTEGER DEFAULT 24
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO crm_idempotency (idempotency_key, request_fingerprint, response, expires_at)
  VALUES (p_key, p_fingerprint, p_response, NOW() + (p_ttl_hours || ' hours')::INTERVAL)
  ON CONFLICT (idempotency_key) DO UPDATE SET
    response = EXCLUDED.response,
    expires_at = EXCLUDED.expires_at;
END;
$$ LANGUAGE plpgsql;

-- Cleanup old idempotency records (run via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM crm_idempotency WHERE expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE import_batches IS 'Track bulk import jobs - SOURCE: PDF Page 2';
COMMENT ON TABLE audit_logs IS 'Central audit trail for all CRM actions - SOURCE: PDF Page 8';
COMMENT ON TABLE crm_idempotency IS 'Prevent duplicate processing of requests - SOURCE: PDF Page 25';
