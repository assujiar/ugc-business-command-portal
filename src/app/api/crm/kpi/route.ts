// =====================================================
// API Route: /api/crm/kpi
// KPI Calculations for CRM:
// - Conversion rate = leads assigned to sales / total leads
// - Total pipeline = sum of estimated_value (active + closed)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdmin, isMarketing, isSales, isMarketingManager, isSalesManager } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

// Force dynamic rendering (uses cookies)
export const dynamic = 'force-dynamic'

interface KPIMetrics {
  // Lead metrics
  total_leads: number
  leads_assigned_to_sales: number
  conversion_rate: number // Percentage
  leads_by_status: Record<string, number>
  leads_by_source: Record<string, number>

  // Pipeline metrics
  total_pipeline_value: number
  active_pipeline_value: number
  closed_won_value: number
  closed_lost_value: number
  pipeline_by_stage: Record<string, { count: number; value: number }>

  // Time-based metrics
  leads_this_month: number
  leads_last_month: number
  pipeline_this_month: number
  pipeline_last_month: number

  // Marketing visibility (if filtered)
  marketing_leads?: number
  marketing_pipeline_value?: number
}

// GET /api/crm/kpi - Get KPI metrics
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single()

    const userRole = profile?.role as UserRole | undefined

    // Check permissions
    if (!isAdmin(userRole) && !isMarketing(userRole) && !isSales(userRole)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const originalCreatorId = searchParams.get('original_creator_id')  // Filter by marketing creator
    const source = searchParams.get('source')  // Filter by lead source
    const dateFrom = searchParams.get('date_from')  // Start date filter
    const dateTo = searchParams.get('date_to')  // End date filter

    // Calculate date ranges
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

    // Use admin client to bypass RLS for aggregate calculations
    const client = adminClient as any

    // ===== LEAD METRICS =====

    // Total leads query
    let totalLeadsQuery = client.from('leads').select('lead_id', { count: 'exact', head: true })

    if (originalCreatorId) {
      totalLeadsQuery = totalLeadsQuery.eq('created_by', originalCreatorId)
    }
    if (source) {
      totalLeadsQuery = totalLeadsQuery.eq('source', source)
    }
    if (dateFrom) {
      totalLeadsQuery = totalLeadsQuery.gte('created_at', dateFrom)
    }
    if (dateTo) {
      totalLeadsQuery = totalLeadsQuery.lte('created_at', dateTo)
    }

    const { count: totalLeads } = await totalLeadsQuery

    // Leads assigned to sales
    let assignedLeadsQuery = client
      .from('leads')
      .select('lead_id', { count: 'exact', head: true })
      .eq('triage_status', 'Assign to Sales')

    if (originalCreatorId) {
      assignedLeadsQuery = assignedLeadsQuery.eq('created_by', originalCreatorId)
    }
    if (source) {
      assignedLeadsQuery = assignedLeadsQuery.eq('source', source)
    }
    if (dateFrom) {
      assignedLeadsQuery = assignedLeadsQuery.gte('created_at', dateFrom)
    }
    if (dateTo) {
      assignedLeadsQuery = assignedLeadsQuery.lte('created_at', dateTo)
    }

    const { count: leadsAssignedToSales } = await assignedLeadsQuery

    // Leads by status
    let leadsStatusQuery = client
      .from('leads')
      .select('triage_status')

    if (originalCreatorId) {
      leadsStatusQuery = leadsStatusQuery.eq('created_by', originalCreatorId)
    }
    if (source) {
      leadsStatusQuery = leadsStatusQuery.eq('source', source)
    }

    const { data: leadsStatusData } = await leadsStatusQuery

    const leadsByStatus: Record<string, number> = {}
    if (leadsStatusData) {
      for (const lead of leadsStatusData) {
        const status = lead.triage_status || 'Unknown'
        leadsByStatus[status] = (leadsByStatus[status] || 0) + 1
      }
    }

    // Leads by source
    let leadsSourceQuery = client
      .from('leads')
      .select('source')

    if (originalCreatorId) {
      leadsSourceQuery = leadsSourceQuery.eq('created_by', originalCreatorId)
    }

    const { data: leadsSourceData } = await leadsSourceQuery

    const leadsBySource: Record<string, number> = {}
    if (leadsSourceData) {
      for (const lead of leadsSourceData) {
        const src = lead.source || 'Unknown'
        leadsBySource[src] = (leadsBySource[src] || 0) + 1
      }
    }

    // Leads this month
    let leadsThisMonthQuery = client
      .from('leads')
      .select('lead_id', { count: 'exact', head: true })
      .gte('created_at', thisMonthStart.toISOString())

    if (originalCreatorId) {
      leadsThisMonthQuery = leadsThisMonthQuery.eq('created_by', originalCreatorId)
    }
    if (source) {
      leadsThisMonthQuery = leadsThisMonthQuery.eq('source', source)
    }

    const { count: leadsThisMonth } = await leadsThisMonthQuery

    // Leads last month
    let leadsLastMonthQuery = client
      .from('leads')
      .select('lead_id', { count: 'exact', head: true })
      .gte('created_at', lastMonthStart.toISOString())
      .lte('created_at', lastMonthEnd.toISOString())

    if (originalCreatorId) {
      leadsLastMonthQuery = leadsLastMonthQuery.eq('created_by', originalCreatorId)
    }
    if (source) {
      leadsLastMonthQuery = leadsLastMonthQuery.eq('source', source)
    }

    const { count: leadsLastMonth } = await leadsLastMonthQuery

    // ===== PIPELINE METRICS =====

    // All opportunities
    let pipelineQuery = client
      .from('opportunities')
      .select('opportunity_id, stage, estimated_value')

    if (originalCreatorId) {
      pipelineQuery = pipelineQuery.eq('original_creator_id', originalCreatorId)
    }
    if (dateFrom) {
      pipelineQuery = pipelineQuery.gte('created_at', dateFrom)
    }
    if (dateTo) {
      pipelineQuery = pipelineQuery.lte('created_at', dateTo)
    }

    const { data: pipelineData } = await pipelineQuery

    let totalPipelineValue = 0
    let activePipelineValue = 0
    let closedWonValue = 0
    let closedLostValue = 0
    const pipelineByStage: Record<string, { count: number; value: number }> = {}

    if (pipelineData) {
      for (const opp of pipelineData) {
        const value = opp.estimated_value || 0
        const stage = opp.stage || 'Unknown'

        // Total pipeline (active + closed won, excluding lost)
        if (stage !== 'Closed Lost') {
          totalPipelineValue += value
        }

        // Stage breakdown
        if (!pipelineByStage[stage]) {
          pipelineByStage[stage] = { count: 0, value: 0 }
        }
        pipelineByStage[stage].count += 1
        pipelineByStage[stage].value += value

        // Active vs closed
        if (stage === 'Closed Won') {
          closedWonValue += value
        } else if (stage === 'Closed Lost') {
          closedLostValue += value
        } else if (stage !== 'On Hold') {
          activePipelineValue += value
        }
      }
    }

    // Pipeline this month
    let pipelineThisMonthQuery = client
      .from('opportunities')
      .select('estimated_value')
      .gte('created_at', thisMonthStart.toISOString())
      .neq('stage', 'Closed Lost')

    if (originalCreatorId) {
      pipelineThisMonthQuery = pipelineThisMonthQuery.eq('original_creator_id', originalCreatorId)
    }

    const { data: pipelineThisMonthData } = await pipelineThisMonthQuery
    const pipelineThisMonth = (pipelineThisMonthData || [])
      .reduce((sum, opp) => sum + (opp.estimated_value || 0), 0)

    // Pipeline last month
    let pipelineLastMonthQuery = client
      .from('opportunities')
      .select('estimated_value')
      .gte('created_at', lastMonthStart.toISOString())
      .lte('created_at', lastMonthEnd.toISOString())
      .neq('stage', 'Closed Lost')

    if (originalCreatorId) {
      pipelineLastMonthQuery = pipelineLastMonthQuery.eq('original_creator_id', originalCreatorId)
    }

    const { data: pipelineLastMonthData } = await pipelineLastMonthQuery
    const pipelineLastMonth = (pipelineLastMonthData || [])
      .reduce((sum, opp) => sum + (opp.estimated_value || 0), 0)

    // Calculate conversion rate
    const conversionRate = totalLeads && totalLeads > 0
      ? ((leadsAssignedToSales || 0) / totalLeads) * 100
      : 0

    // Build response
    const metrics: KPIMetrics = {
      // Lead metrics
      total_leads: totalLeads || 0,
      leads_assigned_to_sales: leadsAssignedToSales || 0,
      conversion_rate: Math.round(conversionRate * 100) / 100, // 2 decimal places
      leads_by_status: leadsByStatus,
      leads_by_source: leadsBySource,

      // Pipeline metrics
      total_pipeline_value: totalPipelineValue,
      active_pipeline_value: activePipelineValue,
      closed_won_value: closedWonValue,
      closed_lost_value: closedLostValue,
      pipeline_by_stage: pipelineByStage,

      // Time-based metrics
      leads_this_month: leadsThisMonth || 0,
      leads_last_month: leadsLastMonth || 0,
      pipeline_this_month: pipelineThisMonth,
      pipeline_last_month: pipelineLastMonth,
    }

    // Add marketing-specific metrics if filtering by original_creator_id
    if (originalCreatorId) {
      metrics.marketing_leads = totalLeads || 0
      metrics.marketing_pipeline_value = totalPipelineValue
    }

    return NextResponse.json({ data: metrics })
  } catch (error) {
    console.error('Error calculating KPIs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
