-- =====================================================
-- Migration 022: Add Evidence Original URL
-- Stores the original (non-watermarked) evidence URL for audit purposes
-- =====================================================

-- Check if pipeline_updates table exists before adding column
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pipeline_updates') THEN
        -- Add evidence_original_url column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'pipeline_updates' AND column_name = 'evidence_original_url'
        ) THEN
            ALTER TABLE pipeline_updates ADD COLUMN evidence_original_url TEXT;
            COMMENT ON COLUMN pipeline_updates.evidence_original_url IS 'Original evidence URL before watermarking (for audit purposes)';
        END IF;
    ELSE
        RAISE NOTICE 'Table pipeline_updates does not exist yet. Please run migration 014 first.';
    END IF;
END$$;

-- Index for queries that need original evidence (only if table and column exist)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pipeline_updates' AND column_name = 'evidence_original_url'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_pipeline_updates_original_evidence
        ON pipeline_updates(evidence_original_url)
        WHERE evidence_original_url IS NOT NULL;
    END IF;
END$$;
