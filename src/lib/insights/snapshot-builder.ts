// =====================================================
// Growth Metrics Snapshot Builder
// Builds the data snapshot to send to AI for insights
// =====================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, UserRole, OpportunityStage, LostReason } from '@/types/database'
import type {
  InsightScope,
  InsightFilters,
  GrowthSnapshot,
  GrowthMetrics,
  GrowthExamples,
  TopDeal,
  TopAccount,
  LeadBySource,
  LossReasonCount,
} from '@/types/insights'
import { getTeamMemberIds } from './scope-resolver'

interface BuildSnapshotParams {
  filters: InsightFilters
  scope: InsightScope
  roleView: UserRole
  supabaseAdmin: any // Use any to avoid complex Supabase typing issues
}

/**
 * Builds a comprehensive growth metrics snapshot for AI analysis
 * Only sends summarized metrics + examples (not raw data)
 */
export async function buildGrowthSnapshot({
  filters,
  scope,
  roleView,
  supabaseAdmin,
}: BuildSnapshotParams): Promise<GrowthSnapshot> {
  const dataQualityFlags: string[] = []

  // Parse date filters
  const startDate = filters.startDate ? new Date(filters.startDate) : null
  const endDate = filters.endDate ? new Date(filters.endDate) : null

  // Get user IDs for scope filtering
  let scopeUserIds: string[] = []
  if (scope.scope_type === 'SELF') {
    const userId = scope.scope_key.replace('SELF:', '')
    scopeUserIds = [userId]
  } else if (scope.scope_type === 'TEAM') {
    const managerId = scope.scope_key.replace('TEAM:', '')
    if (managerId !== 'sales_support') {
      scopeUserIds = await getTeamMemberIds(managerId, supabaseAdmin)
    } else {
      // Sales support sees all sales team
      const { data: salespeople } = await supabaseAdmin
        .from('profiles')
        .select('user_id')
        .in('role', ['salesperson', 'sales manager', 'sales support'])
        .eq('is_active', true)
      scopeUserIds = (salespeople || []).map((p: any) => p.user_id)
    }
  }
  // ORG scope: no user filtering (see all data)

  // Build metrics
  const metrics = await buildMetrics({
    supabaseAdmin,
    startDate,
    endDate,
    scopeUserIds,
    scope,
    filters,
    dataQualityFlags,
  })

  // Build examples
  const examples = await buildExamples({
    supabaseAdmin,
    startDate,
    endDate,
    scopeUserIds,
    scope,
  })

  // Build previous period metrics for comparison
  let prevPeriod: { metrics: GrowthMetrics } | null = null
  if (startDate && endDate) {
    const duration = endDate.getTime() - startDate.getTime()
    const prevStartDate = new Date(startDate.getTime() - duration)
    const prevEndDate = new Date(startDate.getTime() - 1) // Day before start

    const prevMetrics = await buildMetrics({
      supabaseAdmin,
      startDate: prevStartDate,
      endDate: prevEndDate,
      scopeUserIds,
      scope,
      filters: { ...filters, startDate: prevStartDate.toISOString(), endDate: prevEndDate.toISOString() },
      dataQualityFlags: [], // Don't add quality flags for prev period
    })

    prevPeriod = { metrics: prevMetrics }
  }

  return {
    context: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      scope_type: scope.scope_type,
      role_view: roleView,
      filters,
    },
    metrics,
    examples,
    data_quality_flags: dataQualityFlags,
    prev_period: prevPeriod,
  }
}

interface BuildMetricsParams {
  supabaseAdmin: any
  startDate: Date | null
  endDate: Date | null
  scopeUserIds: string[]
  scope: InsightScope
  filters: InsightFilters
  dataQualityFlags: string[]
}

async function buildMetrics({
  supabaseAdmin,
  startDate,
  endDate,
  scopeUserIds,
  scope,
  filters,
  dataQualityFlags,
}: BuildMetricsParams): Promise<GrowthMetrics> {
  // =====================================================
  // Lead Metrics
  // =====================================================

  let leadsQuery = supabaseAdmin.from('leads').select('*')

  // Apply date filter
  if (startDate) {
    leadsQuery = leadsQuery.gte('created_at', startDate.toISOString())
  }
  if (endDate) {
    const endOfDay = new Date(endDate)
    endOfDay.setHours(23, 59, 59, 999)
    leadsQuery = leadsQuery.lte('created_at', endOfDay.toISOString())
  }

  // Apply scope filter
  if (scope.scope_type !== 'ORG' && scopeUserIds.length > 0) {
    leadsQuery = leadsQuery.or(
      `sales_owner_user_id.in.(${scopeUserIds.join(',')}),created_by.in.(${scopeUserIds.join(',')})`
    )
  }

  // Apply source filter
  if (filters.source) {
    leadsQuery = leadsQuery.eq('source', filters.source)
  }

  // Apply salesperson filter
  if (filters.salespersonId) {
    leadsQuery = leadsQuery.eq('sales_owner_user_id', filters.salespersonId)
  }

  const { data: leadsData } = await leadsQuery
  const leads: any[] = leadsData || []

  const leadsIn = leads.length

  // Leads by source
  const leadsBySourceMap: Record<string, number> = {}
  leads.forEach((lead: any) => {
    const source = lead.source || 'Unknown'
    leadsBySourceMap[source] = (leadsBySourceMap[source] || 0) + 1
  })
  const leadsBySource: LeadBySource[] = Object.entries(leadsBySourceMap)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  // Qualified rate
  const qualifiedLeads = leads.filter((l: any) => l.triage_status === 'Qualified').length
  const qualifiedRate = leadsIn > 0 ? Math.round((qualifiedLeads / leadsIn) * 100) : null

  // Lead to opportunity rate
  const convertedLeads = leads.filter((l: any) => l.opportunity_id).length
  const leadToOppRate = leadsIn > 0 ? Math.round((convertedLeads / leadsIn) * 100) : null

  if (leadsIn === 0) {
    dataQualityFlags.push('No leads found in selected period')
  }

  // =====================================================
  // Opportunity Metrics
  // =====================================================

  let oppsQuery = supabaseAdmin
    .from('opportunities')
    .select('*, accounts(company_name)')

  // Apply date filter
  if (startDate) {
    oppsQuery = oppsQuery.gte('created_at', startDate.toISOString())
  }
  if (endDate) {
    const endOfDay = new Date(endDate)
    endOfDay.setHours(23, 59, 59, 999)
    oppsQuery = oppsQuery.lte('created_at', endOfDay.toISOString())
  }

  // Apply scope filter
  if (scope.scope_type !== 'ORG' && scopeUserIds.length > 0) {
    oppsQuery = oppsQuery.in('owner_user_id', scopeUserIds)
  }

  // Apply salesperson filter
  if (filters.salespersonId) {
    oppsQuery = oppsQuery.eq('owner_user_id', filters.salespersonId)
  }

  const { data: oppsData } = await oppsQuery
  const opportunities: any[] = oppsData || []

  const oppsCreated = opportunities.length

  // Pipeline open value
  const activeOpps = opportunities.filter(
    (o: any) => !['Closed Won', 'Closed Lost'].includes(o.stage)
  )
  const pipelineOpenValue = activeOpps.reduce(
    (sum: number, o: any) => sum + (o.estimated_value || 0),
    0
  )

  // Pipeline stage distribution
  const pipelineStageDistribution: Record<string, number> = {}
  opportunities.forEach((opp: any) => {
    pipelineStageDistribution[opp.stage] =
      (pipelineStageDistribution[opp.stage] || 0) + 1
  })

  // Win rate
  const closedWon = opportunities.filter((o: any) => o.stage === 'Closed Won').length
  const closedLost = opportunities.filter((o: any) => o.stage === 'Closed Lost').length
  const totalClosed = closedWon + closedLost
  const oppToWinRate = totalClosed > 0 ? Math.round((closedWon / totalClosed) * 100) : null

  // Stalled opportunities (no activity in 7+ days or stage > threshold)
  const now = new Date()
  const stalledThresholdDays = 7
  const stalledOpps = activeOpps.filter((opp: any) => {
    const updatedAt = new Date(opp.updated_at)
    const daysSinceUpdate = Math.floor(
      (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysSinceUpdate >= stalledThresholdDays
  })
  const stalledOppsCount = stalledOpps.length

  // Loss reasons
  const lostOpps = opportunities.filter((o: any) => o.stage === 'Closed Lost' && o.lost_reason)
  const lossReasonMap: Record<string, number> = {}
  lostOpps.forEach((opp: any) => {
    if (opp.lost_reason) {
      lossReasonMap[opp.lost_reason] = (lossReasonMap[opp.lost_reason] || 0) + 1
    }
  })
  const topLossReasons: LossReasonCount[] = Object.entries(lossReasonMap)
    .map(([reason, count]) => ({ reason: reason as LostReason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  if (oppsCreated === 0) {
    dataQualityFlags.push('No opportunities found in selected period')
  }

  // =====================================================
  // Sales Cycle & Velocity Metrics
  // =====================================================

  // Get stage history for velocity calculations
  let stageHistoryQuery = supabaseAdmin
    .from('opportunity_stage_history')
    .select('*')

  if (startDate) {
    stageHistoryQuery = stageHistoryQuery.gte('changed_at', startDate.toISOString())
  }
  if (endDate) {
    const endOfDay = new Date(endDate)
    endOfDay.setHours(23, 59, 59, 999)
    stageHistoryQuery = stageHistoryQuery.lte('changed_at', endOfDay.toISOString())
  }

  const { data: stageHistoryData } = await stageHistoryQuery
  const stageHistory: any[] = stageHistoryData || []

  // Calculate average sales cycle (from created to closed won)
  const wonOpps = opportunities.filter((o: any) => o.stage === 'Closed Won' && o.closed_at)
  let avgSalesCycleDays: number | null = null
  if (wonOpps.length > 0) {
    const totalDays = wonOpps.reduce((sum: number, opp: any) => {
      const created = new Date(opp.created_at)
      const closed = new Date(opp.closed_at)
      const days = Math.floor((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
      return sum + days
    }, 0)
    avgSalesCycleDays = Math.round(totalDays / wonOpps.length)
  }

  // Calculate average time in stage
  const avgTimeInStageDays: Record<string, number> = {}
  // This would require more complex calculation with stage history
  // For now, mark as data quality flag if not available
  if (stageHistory.length === 0) {
    dataQualityFlags.push('Stage history not available for velocity metrics')
  }

  // =====================================================
  // Activity Metrics
  // =====================================================

  let activitiesQuery = supabaseAdmin.from('activities').select('*')

  // Apply date filter
  if (startDate) {
    activitiesQuery = activitiesQuery.gte('created_at', startDate.toISOString())
  }
  if (endDate) {
    const endOfDay = new Date(endDate)
    endOfDay.setHours(23, 59, 59, 999)
    activitiesQuery = activitiesQuery.lte('created_at', endOfDay.toISOString())
  }

  // Apply scope filter
  if (scope.scope_type !== 'ORG' && scopeUserIds.length > 0) {
    activitiesQuery = activitiesQuery.in('owner_user_id', scopeUserIds)
  }

  // Apply salesperson filter
  if (filters.salespersonId) {
    activitiesQuery = activitiesQuery.eq('owner_user_id', filters.salespersonId)
  }

  const { data: activitiesData } = await activitiesQuery
  const activities: any[] = activitiesData || []

  const activitiesTotal = activities.length

  // Activities by type
  const activitiesByType: Record<string, number> = {}
  activities.forEach((act: any) => {
    activitiesByType[act.activity_type] =
      (activitiesByType[act.activity_type] || 0) + 1
  })

  // Touches per opportunity
  const touchesPerOpp = oppsCreated > 0 ? Math.round(activitiesTotal / oppsCreated) : null

  if (activitiesTotal === 0) {
    dataQualityFlags.push('No activities found in selected period')
  }

  return {
    leads_in: leadsIn,
    leads_by_source: leadsBySource.length > 0 ? leadsBySource : null,
    lead_response_time_hours: null, // Would need more data to calculate
    qualified_rate: qualifiedRate,
    lead_to_opp_rate: leadToOppRate,
    opp_to_win_rate: oppToWinRate,
    opps_created: oppsCreated,
    pipeline_open_value: pipelineOpenValue,
    pipeline_stage_distribution: Object.keys(pipelineStageDistribution).length > 0
      ? pipelineStageDistribution as Record<OpportunityStage, number>
      : null,
    stalled_opps_count: stalledOppsCount,
    avg_sales_cycle_days: avgSalesCycleDays,
    avg_time_in_stage_days: Object.keys(avgTimeInStageDays).length > 0 ? avgTimeInStageDays : null,
    activities_total: activitiesTotal,
    activities_by_type: Object.keys(activitiesByType).length > 0 ? activitiesByType : null,
    touches_per_opp: touchesPerOpp,
    top_loss_reasons: topLossReasons.length > 0 ? topLossReasons : null,
  }
}

interface BuildExamplesParams {
  supabaseAdmin: any
  startDate: Date | null
  endDate: Date | null
  scopeUserIds: string[]
  scope: InsightScope
}

async function buildExamples({
  supabaseAdmin,
  startDate,
  endDate,
  scopeUserIds,
  scope,
}: BuildExamplesParams): Promise<GrowthExamples> {
  // =====================================================
  // Top 5 Biggest Open Deals
  // =====================================================

  let biggestDealsQuery = supabaseAdmin
    .from('opportunities')
    .select('opportunity_id, name, estimated_value, stage, created_at, accounts(company_name), profiles:owner_user_id(name)')
    .not('stage', 'in', '("Closed Won","Closed Lost")')
    .order('estimated_value', { ascending: false })
    .limit(5)

  if (scope.scope_type !== 'ORG' && scopeUserIds.length > 0) {
    biggestDealsQuery = biggestDealsQuery.in('owner_user_id', scopeUserIds)
  }

  const { data: biggestDealsData } = await biggestDealsQuery
  const biggestDeals: any[] = biggestDealsData || []

  const top5BiggestOpenDeals: TopDeal[] = biggestDeals.map((d: any) => ({
    opportunity_id: d.opportunity_id,
    name: d.name,
    account_name: d.accounts?.company_name || 'Unknown',
    estimated_value: d.estimated_value || 0,
    stage: d.stage,
    owner_name: d.profiles?.name,
  }))

  // =====================================================
  // Top 5 Oldest Stuck Deals (stalled opportunities)
  // =====================================================

  const now = new Date()
  const stalledThresholdDays = 7

  let stalledDealsQuery = supabaseAdmin
    .from('opportunities')
    .select('opportunity_id, name, estimated_value, stage, updated_at, accounts(company_name), profiles:owner_user_id(name)')
    .not('stage', 'in', '("Closed Won","Closed Lost")')
    .order('updated_at', { ascending: true })
    .limit(10) // Get more to filter

  if (scope.scope_type !== 'ORG' && scopeUserIds.length > 0) {
    stalledDealsQuery = stalledDealsQuery.in('owner_user_id', scopeUserIds)
  }

  const { data: stalledDealsRawData } = await stalledDealsQuery
  const stalledDealsRaw: any[] = stalledDealsRawData || []

  const top5OldestStuckDeals: TopDeal[] = stalledDealsRaw
    .filter((d: any) => {
      const updatedAt = new Date(d.updated_at)
      const daysSinceUpdate = Math.floor(
        (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      )
      return daysSinceUpdate >= stalledThresholdDays
    })
    .slice(0, 5)
    .map((d: any) => {
      const updatedAt = new Date(d.updated_at)
      const daysInStage = Math.floor(
        (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      )
      return {
        opportunity_id: d.opportunity_id,
        name: d.name,
        account_name: d.accounts?.company_name || 'Unknown',
        estimated_value: d.estimated_value || 0,
        stage: d.stage,
        days_in_stage: daysInStage,
        owner_name: d.profiles?.name,
      }
    })

  // =====================================================
  // Top 5 Accounts by Recent Activity
  // =====================================================

  // Get recent activities grouped by account
  let recentActivitiesQuery = supabaseAdmin
    .from('activities')
    .select('related_account_id, created_at')
    .not('related_account_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (scope.scope_type !== 'ORG' && scopeUserIds.length > 0) {
    recentActivitiesQuery = recentActivitiesQuery.in('owner_user_id', scopeUserIds)
  }

  const { data: recentActivitiesData } = await recentActivitiesQuery
  const recentActivities: any[] = recentActivitiesData || []

  // Count activities per account
  const accountActivityMap: Record<string, { count: number; lastDate: string }> = {}
  recentActivities.forEach((act: any) => {
    const accountId = act.related_account_id
    if (!accountActivityMap[accountId]) {
      accountActivityMap[accountId] = { count: 0, lastDate: act.created_at }
    }
    accountActivityMap[accountId].count++
    if (act.created_at > accountActivityMap[accountId].lastDate) {
      accountActivityMap[accountId].lastDate = act.created_at
    }
  })

  // Get top 5 account IDs by activity
  const topAccountIds = Object.entries(accountActivityMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([id]) => id)

  // Fetch account names
  let top5AccountsByActivity: TopAccount[] = []
  if (topAccountIds.length > 0) {
    const { data: accountsData } = await supabaseAdmin
      .from('accounts')
      .select('account_id, company_name')
      .in('account_id', topAccountIds)

    const accounts: any[] = accountsData || []

    top5AccountsByActivity = topAccountIds.map(id => {
      const account = accounts.find((a: any) => a.account_id === id)
      const activityData = accountActivityMap[id]
      return {
        account_id: id,
        company_name: account?.company_name || 'Unknown',
        recent_activity_count: activityData?.count || 0,
        last_activity_date: activityData?.lastDate,
      }
    })
  }

  return {
    top_5_biggest_open_deals: top5BiggestOpenDeals.length > 0 ? top5BiggestOpenDeals : undefined,
    top_5_oldest_stuck_deals: top5OldestStuckDeals.length > 0 ? top5OldestStuckDeals : undefined,
    top_5_accounts_by_recent_activity: top5AccountsByActivity.length > 0 ? top5AccountsByActivity : undefined,
  }
}

/**
 * Compute a deterministic hash for filters (for caching)
 */
export function computeFiltersHash(filters: InsightFilters): string {
  // Sort keys for consistency
  const sortedFilters = Object.keys(filters)
    .sort()
    .reduce((acc, key) => {
      const value = filters[key]
      if (value !== null && value !== undefined && value !== '') {
        acc[key] = value
      }
      return acc
    }, {} as Record<string, string | null | undefined>)

  // Create a simple hash from JSON string
  const jsonStr = JSON.stringify(sortedFilters)
  let hash = 0
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16)
}
