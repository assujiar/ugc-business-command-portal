-- ============================================
-- Migration: 079_overview_performance_indexes.sql
--
-- PURPOSE: Add performance indexes for Overview API endpoints
-- These indexes optimize queries on:
-- - ticket_sla_tracking.created_at (used by metrics and drilldown)
-- - ticket_response_metrics.time_to_first_quote_seconds (RFQ metrics)
-- ============================================

-- Index for SLA metrics date range queries
CREATE INDEX IF NOT EXISTS idx_ticket_sla_tracking_created_at
ON public.ticket_sla_tracking(created_at DESC);

-- Composite index for SLA compliance filtering
CREATE INDEX IF NOT EXISTS idx_ticket_sla_tracking_first_response
ON public.ticket_sla_tracking(first_response_met)
WHERE first_response_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_sla_tracking_resolution
ON public.ticket_sla_tracking(resolution_met)
WHERE resolution_at IS NOT NULL;

-- Index for first quote metrics (RFQ performance tracking)
CREATE INDEX IF NOT EXISTS idx_ticket_response_metrics_first_quote
ON public.ticket_response_metrics(time_to_first_quote_seconds)
WHERE time_to_first_quote_seconds IS NOT NULL;

-- Composite index for tickets date range + type filtering (Overview queries)
CREATE INDEX IF NOT EXISTS idx_tickets_created_at_type
ON public.tickets(created_at DESC, ticket_type);

-- Index for tickets by type and status (drilldown queries)
CREATE INDEX IF NOT EXISTS idx_tickets_type_status
ON public.tickets(ticket_type, status);
