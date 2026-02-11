-- Migration 169: Fix budget_utilization column width
-- NUMERIC(6,4) can only hold max 99.9999, but budget utilization
-- can exceed 100% when daily spend exceeds the daily budget.
-- Change to NUMERIC(8,4) to allow up to 9999.9999%.

ALTER TABLE marketing_sem_campaigns
  ALTER COLUMN budget_utilization TYPE NUMERIC(8,4);
