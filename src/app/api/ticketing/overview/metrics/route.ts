import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, getAnalyticsScope } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
  department?: string
}

/**
 * GET /api/ticketing/overview/metrics
 *
 * Returns aggregated metrics for the Overview dashboard with:
 * - RFQ/GEN/TOTAL split
 * - Role-based scoping (director/manager/user)
 * - SLA compliance rates
 * - Ticket status distribution
 * - Quotation analytics (for sales/marketing)
 *
 * Query params:
 * - ticket_type: 'RFQ' | 'GEN' | 'TOTAL' (default: 'TOTAL')
 * - period: number of days (default: 30)
 * - department: department filter (only for director/admin)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const ticketType = searchParams.get('ticket_type') || 'TOTAL'
    const period = parseInt(searchParams.get('period') || '30')
    const departmentFilter = searchParams.get('department')

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role, department')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    if (!profileData || !canAccessTicketing(profileData.role)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Get analytics scope based on role
    const analyticsScope = getAnalyticsScope(profileData.role, user.id)

    // Calculate date range
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - period)

    // Build base query for tickets
    let ticketQuery = (supabase as any)
      .from('tickets')
      .select(`
        id,
        ticket_code,
        status,
        department,
        ticket_type,
        created_by,
        assigned_to,
        created_at,
        updated_at,
        sla_tracking:ticket_sla_tracking!ticket_sla_tracking_ticket_id_fkey(
          first_response_at,
          first_response_met,
          resolution_at,
          resolution_met,
          first_response_sla_hours,
          resolution_sla_hours
        ),
        metrics:ticket_response_metrics!ticket_response_metrics_ticket_id_fkey(
          creator_first_response_seconds,
          creator_avg_response_seconds,
          assignee_first_response_seconds,
          assignee_avg_response_seconds,
          time_to_first_quote_seconds
        )
      `)
      .gte('created_at', startDate.toISOString())

    // Apply ticket type filter
    if (ticketType !== 'TOTAL') {
      ticketQuery = ticketQuery.eq('ticket_type', ticketType)
    }

    const { data: ticketsData, error: ticketsError } = await ticketQuery

    if (ticketsError) {
      console.error('Error fetching tickets:', ticketsError)
      return NextResponse.json({ success: false, error: ticketsError.message }, { status: 500 })
    }

    // Apply role-based scoping
    let filteredTickets = ticketsData || []
    if (analyticsScope.scope === 'user') {
      filteredTickets = filteredTickets.filter((t: any) =>
        t.created_by === user.id || t.assigned_to === user.id
      )
    } else if (analyticsScope.scope === 'department') {
      if (analyticsScope.department) {
        filteredTickets = filteredTickets.filter((t: any) => t.department === analyticsScope.department)
      }
    }
    // 'all' scope: no additional filtering

    // Allow department filter override for directors/admins
    if (departmentFilter && analyticsScope.scope === 'all') {
      filteredTickets = filteredTickets.filter((t: any) => t.department === departmentFilter)
    }

    // Calculate metrics
    const totalTickets = filteredTickets.length

    // Ticket status distribution
    const statusDistribution: Record<string, number> = {}
    const allStatuses = ['open', 'need_response', 'in_progress', 'waiting_customer', 'need_adjustment', 'pending', 'resolved', 'closed']
    allStatuses.forEach(status => { statusDistribution[status] = 0 })
    filteredTickets.forEach((t: any) => {
      if (statusDistribution[t.status] !== undefined) {
        statusDistribution[t.status]++
      }
    })

    // SLA compliance metrics
    const ticketsWithSLA = filteredTickets.filter((t: any) => t.sla_tracking)
    const ticketsWithFirstResponse = ticketsWithSLA.filter((t: any) => t.sla_tracking?.first_response_at)
    const ticketsWithResolution = ticketsWithSLA.filter((t: any) => t.sla_tracking?.resolution_at)

    const firstResponseMet = ticketsWithFirstResponse.filter((t: any) => t.sla_tracking?.first_response_met === true).length
    const resolutionMet = ticketsWithResolution.filter((t: any) => t.sla_tracking?.resolution_met === true).length

    // Response time metrics (from metrics table)
    const ticketsWithMetrics = filteredTickets.filter((t: any) => t.metrics)

    const creatorFirstResponseAvg = ticketsWithMetrics.length > 0
      ? ticketsWithMetrics
          .filter((t: any) => t.metrics?.creator_first_response_seconds)
          .reduce((sum: number, t: any) => sum + (t.metrics.creator_first_response_seconds || 0), 0) /
        (ticketsWithMetrics.filter((t: any) => t.metrics?.creator_first_response_seconds).length || 1)
      : 0

    const assigneeFirstResponseAvg = ticketsWithMetrics.length > 0
      ? ticketsWithMetrics
          .filter((t: any) => t.metrics?.assignee_first_response_seconds)
          .reduce((sum: number, t: any) => sum + (t.metrics.assignee_first_response_seconds || 0), 0) /
        (ticketsWithMetrics.filter((t: any) => t.metrics?.assignee_first_response_seconds).length || 1)
      : 0

    // First quote metrics (RFQ only)
    const rfqTickets = filteredTickets.filter((t: any) => t.ticket_type === 'RFQ')
    const rfqWithFirstQuote = rfqTickets.filter((t: any) => t.metrics?.time_to_first_quote_seconds)
    const avgFirstQuoteSeconds = rfqWithFirstQuote.length > 0
      ? rfqWithFirstQuote.reduce((sum: number, t: any) => sum + (t.metrics.time_to_first_quote_seconds || 0), 0) / rfqWithFirstQuote.length
      : 0

    // First quote SLA (24h)
    const firstQuoteSlaSeconds = 24 * 3600
    const firstQuoteMet = rfqWithFirstQuote.filter((t: any) =>
      (t.metrics.time_to_first_quote_seconds || 0) <= firstQuoteSlaSeconds
    ).length

    // Split metrics by type for TOTAL
    const rfqMetrics = ticketType === 'TOTAL' ? calculateTypeMetrics(filteredTickets.filter((t: any) => t.ticket_type === 'RFQ')) : null
    const genMetrics = ticketType === 'TOTAL' ? calculateTypeMetrics(filteredTickets.filter((t: any) => t.ticket_type === 'GEN')) : null

    return NextResponse.json({
      success: true,
      data: {
        period_days: period,
        ticket_type_filter: ticketType,
        scope: analyticsScope.scope,
        scope_department: analyticsScope.department,

        // Overall counts
        total_tickets: totalTickets,

        // Status distribution
        status_distribution: statusDistribution,

        // SLA compliance
        sla_compliance: {
          first_response: {
            total: ticketsWithSLA.length,
            responded: ticketsWithFirstResponse.length,
            met: firstResponseMet,
            breached: ticketsWithFirstResponse.length - firstResponseMet,
            pending: ticketsWithSLA.length - ticketsWithFirstResponse.length,
            compliance_rate: ticketsWithFirstResponse.length > 0
              ? Math.round((firstResponseMet / ticketsWithFirstResponse.length) * 100)
              : 0,
          },
          resolution: {
            total: ticketsWithSLA.length,
            resolved: ticketsWithResolution.length,
            met: resolutionMet,
            breached: ticketsWithResolution.length - resolutionMet,
            pending: ticketsWithSLA.length - ticketsWithResolution.length,
            compliance_rate: ticketsWithResolution.length > 0
              ? Math.round((resolutionMet / ticketsWithResolution.length) * 100)
              : 0,
          },
        },

        // Response times
        response_times: {
          creator_first_response_avg_seconds: Math.round(creatorFirstResponseAvg),
          assignee_first_response_avg_seconds: Math.round(assigneeFirstResponseAvg),
        },

        // Ops metrics (first quote - RFQ only)
        ops_metrics: {
          first_quote: {
            total: rfqTickets.length,
            with_quote: rfqWithFirstQuote.length,
            met: firstQuoteMet,
            breached: rfqWithFirstQuote.length - firstQuoteMet,
            pending: rfqTickets.length - rfqWithFirstQuote.length,
            avg_seconds: Math.round(avgFirstQuoteSeconds),
            sla_hours: 24,
            compliance_rate: rfqWithFirstQuote.length > 0
              ? Math.round((firstQuoteMet / rfqWithFirstQuote.length) * 100)
              : 0,
          },
        },

        // Type breakdown (only for TOTAL)
        by_type: ticketType === 'TOTAL' ? { RFQ: rfqMetrics, GEN: genMetrics } : null,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// Helper function to calculate metrics for a specific ticket type
function calculateTypeMetrics(tickets: any[]) {
  const total = tickets.length
  const ticketsWithSLA = tickets.filter((t: any) => t.sla_tracking)
  const ticketsWithFirstResponse = ticketsWithSLA.filter((t: any) => t.sla_tracking?.first_response_at)
  const ticketsWithResolution = ticketsWithSLA.filter((t: any) => t.sla_tracking?.resolution_at)

  const firstResponseMet = ticketsWithFirstResponse.filter((t: any) => t.sla_tracking?.first_response_met === true).length
  const resolutionMet = ticketsWithResolution.filter((t: any) => t.sla_tracking?.resolution_met === true).length

  return {
    total,
    first_response: {
      met: firstResponseMet,
      breached: ticketsWithFirstResponse.length - firstResponseMet,
      pending: ticketsWithSLA.length - ticketsWithFirstResponse.length,
      compliance_rate: ticketsWithFirstResponse.length > 0
        ? Math.round((firstResponseMet / ticketsWithFirstResponse.length) * 100)
        : 0,
    },
    resolution: {
      met: resolutionMet,
      breached: ticketsWithResolution.length - resolutionMet,
      pending: ticketsWithSLA.length - ticketsWithResolution.length,
      compliance_rate: ticketsWithResolution.length > 0
        ? Math.round((resolutionMet / ticketsWithResolution.length) * 100)
        : 0,
    },
  }
}
