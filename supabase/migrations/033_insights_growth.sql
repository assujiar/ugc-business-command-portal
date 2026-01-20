-- =====================================================
-- Migration: Growth Insights Table
-- Purpose: Store AI-generated growth insights with caching
-- =====================================================

-- Create insights_growth table
CREATE TABLE IF NOT EXISTS public.insights_growth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope & Filtering
    scope_key TEXT NOT NULL,           -- e.g., 'SELF:user_id', 'TEAM:manager_id', 'ORG:default'
    filters_hash TEXT NOT NULL,        -- MD5 hash of filter parameters for caching
    filters JSONB NOT NULL DEFAULT '{}',  -- Actual filter values (startDate, endDate, salespersonId, etc.)
    role_view TEXT NOT NULL,           -- Role that generated this insight

    -- Generation metadata
    generated_by_user_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Data snapshots
    metrics_snapshot JSONB NOT NULL DEFAULT '{}',  -- Raw metrics sent to AI
    insight_json JSONB NOT NULL DEFAULT '{}',      -- AI-generated insight output

    -- AI model info
    model TEXT DEFAULT 'gemini-1.5-flash',
    latency_ms INTEGER,
    tokens_in INTEGER,
    tokens_out INTEGER,

    -- Caching
    is_latest BOOLEAN NOT NULL DEFAULT TRUE,

    -- Generation status
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_insights_growth_latest
    ON public.insights_growth(scope_key, filters_hash, role_view, is_latest)
    WHERE is_latest = TRUE;

CREATE INDEX IF NOT EXISTS idx_insights_growth_generated_at
    ON public.insights_growth(generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_insights_growth_scope_key
    ON public.insights_growth(scope_key);

CREATE INDEX IF NOT EXISTS idx_insights_growth_user
    ON public.insights_growth(generated_by_user_id);

CREATE INDEX IF NOT EXISTS idx_insights_growth_status
    ON public.insights_growth(status)
    WHERE status IN ('pending', 'generating');

-- Create function to update is_latest flag
CREATE OR REPLACE FUNCTION update_insights_growth_latest()
RETURNS TRIGGER AS $$
BEGIN
    -- Set is_latest = false for previous records with same scope
    UPDATE public.insights_growth
    SET is_latest = FALSE, updated_at = NOW()
    WHERE scope_key = NEW.scope_key
      AND filters_hash = NEW.filters_hash
      AND role_view = NEW.role_view
      AND id != NEW.id
      AND is_latest = TRUE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update is_latest
DROP TRIGGER IF EXISTS trg_insights_growth_latest ON public.insights_growth;
CREATE TRIGGER trg_insights_growth_latest
    AFTER INSERT ON public.insights_growth
    FOR EACH ROW
    EXECUTE FUNCTION update_insights_growth_latest();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_insights_growth_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trg_insights_growth_updated_at ON public.insights_growth;
CREATE TRIGGER trg_insights_growth_updated_at
    BEFORE UPDATE ON public.insights_growth
    FOR EACH ROW
    EXECUTE FUNCTION update_insights_growth_updated_at();

-- Enable RLS
ALTER TABLE public.insights_growth ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Policy: Users can view insights they generated
CREATE POLICY "Users can view own insights"
    ON public.insights_growth
    FOR SELECT
    USING (auth.uid() = generated_by_user_id);

-- Policy: Users can view insights for their scope (SELF)
CREATE POLICY "Users can view self scope insights"
    ON public.insights_growth
    FOR SELECT
    USING (scope_key = 'SELF:' || auth.uid()::text);

-- Policy: Admin/Director can view all insights
CREATE POLICY "Admins can view all insights"
    ON public.insights_growth
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE user_id = auth.uid()
            AND role IN ('Director', 'super admin')
        )
    );

-- Policy: Sales managers can view team insights
CREATE POLICY "Sales managers can view team insights"
    ON public.insights_growth
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE user_id = auth.uid()
            AND role = 'sales manager'
        )
        AND (scope_key LIKE 'TEAM:%' OR scope_key LIKE 'SELF:%')
    );

-- Policy: Marketing managers can view org insights
CREATE POLICY "Marketing managers can view marketing insights"
    ON public.insights_growth
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE user_id = auth.uid()
            AND role IN ('Marketing Manager', 'MACX')
        )
        AND scope_key LIKE 'ORG:%'
    );

-- Policy: Users can insert insights for their scope
CREATE POLICY "Users can insert insights"
    ON public.insights_growth
    FOR INSERT
    WITH CHECK (auth.uid() = generated_by_user_id);

-- Policy: Users can update their own insights
CREATE POLICY "Users can update own insights"
    ON public.insights_growth
    FOR UPDATE
    USING (auth.uid() = generated_by_user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.insights_growth TO authenticated;

-- Add comments
COMMENT ON TABLE public.insights_growth IS 'Stores AI-generated growth insights for dashboard overview';
COMMENT ON COLUMN public.insights_growth.scope_key IS 'Deterministic scope identifier: SELF:<user_id>, TEAM:<manager_id>, ORG:<org_id>';
COMMENT ON COLUMN public.insights_growth.filters_hash IS 'MD5 hash of filter parameters for efficient caching lookup';
COMMENT ON COLUMN public.insights_growth.is_latest IS 'Flag to identify the most recent insight for a given scope/filter combination';
