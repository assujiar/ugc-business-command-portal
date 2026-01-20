// =====================================================
// Growth Insights Types
// For AI-generated summary and insights on dashboard
// =====================================================

import type { UserRole, LeadSource, OpportunityStage, LostReason } from './database'

// =====================================================
// Scope Types
// =====================================================

export type InsightScopeType = 'SELF' | 'TEAM' | 'ORG'

export interface InsightScope {
  scope_type: InsightScopeType
  scope_key: string
  allowed_user_ids?: string[] // For TEAM scope, list of team member user IDs
}

// =====================================================
// Filter Types
// =====================================================

export interface InsightFilters {
  startDate?: string | null
  endDate?: string | null
  salespersonId?: string | null
  source?: LeadSource | null
  [key: string]: string | null | undefined
}

// =====================================================
// Growth Snapshot Types (Data sent to AI)
// =====================================================

export interface LeadBySource {
  source: string
  count: number
}

export interface LossReasonCount {
  reason: LostReason | string
  count: number
}

export interface GrowthMetrics {
  // Lead acquisition
  leads_in?: number | null
  leads_by_source?: LeadBySource[] | null
  lead_response_time_hours?: number | null

  // Funnel conversion
  qualified_rate?: number | null       // lead → qualified percentage
  lead_to_opp_rate?: number | null     // leads converted to opportunities
  opp_to_win_rate?: number | null      // Closed Won / total closed

  // Pipeline growth
  opps_created?: number | null
  pipeline_open_value?: number | null
  pipeline_stage_distribution?: Record<OpportunityStage, number> | null
  stalled_opps_count?: number | null   // No activity X days or stage age > threshold

  // Velocity
  avg_sales_cycle_days?: number | null
  avg_time_in_stage_days?: Record<string, number> | null

  // Activity effectiveness
  activities_total?: number | null
  activities_by_type?: Record<string, number> | null
  touches_per_opp?: number | null

  // Loss intelligence
  top_loss_reasons?: LossReasonCount[] | null
}

export interface TopDeal {
  opportunity_id: string
  name: string
  account_name: string
  estimated_value: number
  stage: OpportunityStage
  days_in_stage?: number
  owner_name?: string
}

export interface TopAccount {
  account_id: string
  company_name: string
  recent_activity_count: number
  last_activity_date?: string
}

export interface GrowthExamples {
  top_5_biggest_open_deals?: TopDeal[]
  top_5_oldest_stuck_deals?: TopDeal[]
  top_5_accounts_by_recent_activity?: TopAccount[]
}

export interface GrowthSnapshotContext {
  startDate?: string | null
  endDate?: string | null
  scope_type: InsightScopeType
  role_view: UserRole
  filters: InsightFilters
}

export interface GrowthSnapshot {
  context: GrowthSnapshotContext
  metrics: GrowthMetrics
  examples: GrowthExamples
  data_quality_flags: string[]
  prev_period?: {
    metrics: GrowthMetrics
  } | null
}

// =====================================================
// AI Output Types (Structured output from Gemini)
// =====================================================

export interface SummaryTableRow {
  metric: string
  current: string | number
  previous?: string | number | null
  delta?: string | null
  note?: string | null
}

export interface Recommendation {
  title: string
  rationale: string
  effort: 'low' | 'medium' | 'high'
  impact: 'low' | 'medium' | 'high'
  owner_role: string
}

export interface InsightOutput {
  executive_summary: string
  summary_table: SummaryTableRow[]
  key_points: string[]
  risks: string[]
  mitigations: string[]
  recommendations: Recommendation[]
  next_steps: string[]
  data_gaps: string[]
}

// =====================================================
// API Response Types
// =====================================================

export interface InsightResponse {
  id: string
  scope_key: string
  filters_hash: string
  filters: InsightFilters
  role_view: string
  generated_at: string
  insight: InsightOutput
  metrics_snapshot?: GrowthSnapshot
  status: 'pending' | 'generating' | 'completed' | 'failed'
  error_message?: string | null
}

export interface InsightRegenerateRequest {
  startDate?: string | null
  endDate?: string | null
  salespersonId?: string | null
  source?: string | null
  otherFilters?: Record<string, string | null>
}

// =====================================================
// Quality Gate Types
// =====================================================

export const TARGET_KEYWORDS = [
  'target',
  'quota',
  'achievement',
  'attainment',
  'gap-to-target',
  'target pencapaian',
  'kuota',
  'pencapaian target',
] as const

export interface QualityGateResult {
  passed: boolean
  violations: string[]
}
