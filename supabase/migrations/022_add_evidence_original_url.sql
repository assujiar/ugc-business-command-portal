-- =====================================================
-- Migration 022: Add Evidence Original URL
-- Stores the original (non-watermarked) evidence URL for audit purposes
-- =====================================================

-- Add evidence_original_url column to pipeline_updates
ALTER TABLE pipeline_updates
  ADD COLUMN IF NOT EXISTS evidence_original_url TEXT;

-- Add comment
COMMENT ON COLUMN pipeline_updates.evidence_original_url IS 'Original evidence URL before watermarking (for audit purposes)';

-- Index for queries that need original evidence
CREATE INDEX IF NOT EXISTS idx_pipeline_updates_original_evidence ON pipeline_updates(evidence_original_url) WHERE evidence_original_url IS NOT NULL;
