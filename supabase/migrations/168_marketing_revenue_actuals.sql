-- Marketing Revenue Actuals
-- Manual input table for actual revenue per channel per month
-- Finance/marketing team updates these values, system calculates ROAS

CREATE TABLE IF NOT EXISTS marketing_revenue_actuals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel TEXT NOT NULL,          -- 'google_ads', 'meta_ads', 'organic', 'direct', 'referral', 'social', 'other'
  month TEXT NOT NULL,            -- 'YYYY-MM' format
  revenue NUMERIC(15,2) NOT NULL DEFAULT 0,
  leads_count INTEGER DEFAULT 0,  -- number of leads from this channel
  deals_count INTEGER DEFAULT 0,  -- number of closed deals
  notes TEXT,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel, month)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_revenue_actuals_channel_month
  ON marketing_revenue_actuals(channel, month);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION fn_update_revenue_actuals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_revenue_actuals_updated ON marketing_revenue_actuals;
CREATE TRIGGER trg_revenue_actuals_updated
  BEFORE UPDATE ON marketing_revenue_actuals
  FOR EACH ROW EXECUTE FUNCTION fn_update_revenue_actuals_timestamp();

-- RLS
ALTER TABLE marketing_revenue_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY revenue_actuals_select ON marketing_revenue_actuals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('super admin', 'Director', 'Marketing')
    )
  );

CREATE POLICY revenue_actuals_insert ON marketing_revenue_actuals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('super admin', 'Director', 'Marketing')
    )
  );

CREATE POLICY revenue_actuals_update ON marketing_revenue_actuals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('super admin', 'Director', 'Marketing')
    )
  );
