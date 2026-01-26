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
 * GET /api/ticketing/overview/drilldown
 *
 * Returns a list of tickets for drilldown view with minimal metadata.
 * Used when clicking on metric cards to see the underlying data.
 *
 * Query params:
 * - metric: The metric to drill down into:
 *   - 'first_response_met' | 'first_response_breached' | 'first_response_pending'
 *   - 'resolution_met' | 'resolution_breached' | 'resolution_pending'
 *   - 'first_quote_met' | 'first_quote_breached' | 'first_quote_pending'
 *   - 'status_<status>' (e.g., 'status_open', 'status_closed')
 * - ticket_type: 'RFQ' | 'GEN' | 'TOTAL' (default: 'TOTAL')
 * - period: number of days (default: 30)
 * - department: department filter (only for director/admin)
 * - limit: max results (default: 100)
 * - offset: pagination offset (default: 0)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const metric = searchParams.get('metric')
    const ticketType = searchParams.get('ticket_type') || 'TOTAL'
    const period = parseInt(searchParams.get('period') || '30')
    const departmentFilter = searchParams.get('department')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!metric) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter: metric',
        error_code: 'VALIDATION_ERROR',
      }, { status: 422 })
    }

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

    // Build base query for tickets with SLA data
    let ticketQuery = (supabase as any)
      .from('tickets')
      .select(`
        id,
        ticket_code,
        subject,
        status,
        department,
        ticket_type,
        created_by,
        assigned_to,
        created_at,
        updated_at,
        creator:profiles!tickets_created_by_fkey(name),
        assignee:profiles!tickets_assigned_to_fkey(name),
        sla_tracking:ticket_sla_tracking!ticket_sla_tracking_ticket_id_fkey(
          first_response_at,
          first_response_met,
          resolution_at,
          resolution_met
        ),
        metrics:ticket_response_metrics!ticket_response_metrics_ticket_id_fkey(
          time_to_first_quote_seconds
        )
      `)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false })

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

    // Allow department filter override for directors/admins
    if (departmentFilter && analyticsScope.scope === 'all') {
      filteredTickets = filteredTickets.filter((t: any) => t.department === departmentFilter)
    }

    // Apply metric-specific filter
    let drilldownTickets: any[] = []

    if (metric.startsWith('status_')) {
      // Status drilldown (e.g., 'status_open', 'status_closed')
      const status = metric.replace('status_', '')
      drilldownTickets = filteredTickets.filter((t: any) => t.status === status)
    } else if (metric.startsWith('first_response_')) {
      // First response SLA drilldown
      const ticketsWithSLA = filteredTickets.filter((t: any) => t.sla_tracking)

      if (metric === 'first_response_met') {
        drilldownTickets = ticketsWithSLA.filter((t: any) =>
          t.sla_tracking?.first_response_at && t.sla_tracking?.first_response_met === true
        )
      } else if (metric === 'first_response_breached') {
        drilldownTickets = ticketsWithSLA.filter((t: any) =>
          t.sla_tracking?.first_response_at && t.sla_tracking?.first_response_met === false
        )
      } else if (metric === 'first_response_pending') {
        drilldownTickets = ticketsWithSLA.filter((t: any) =>
          !t.sla_tracking?.first_response_at
        )
      }
    } else if (metric.startsWith('resolution_')) {
      // Resolution SLA drilldown
      const ticketsWithSLA = filteredTickets.filter((t: any) => t.sla_tracking)

      if (metric === 'resolution_met') {
        drilldownTickets = ticketsWithSLA.filter((t: any) =>
          t.sla_tracking?.resolution_at && t.sla_tracking?.resolution_met === true
        )
      } else if (metric === 'resolution_breached') {
        drilldownTickets = ticketsWithSLA.filter((t: any) =>
          t.sla_tracking?.resolution_at && t.sla_tracking?.resolution_met === false
        )
      } else if (metric === 'resolution_pending') {
        drilldownTickets = ticketsWithSLA.filter((t: any) =>
          !t.sla_tracking?.resolution_at
        )
      }
    } else if (metric.startsWith('first_quote_')) {
      // First quote SLA drilldown (RFQ only)
      const rfqTickets = filteredTickets.filter((t: any) => t.ticket_type === 'RFQ')
      const firstQuoteSlaSeconds = 24 * 3600

      if (metric === 'first_quote_met') {
        drilldownTickets = rfqTickets.filter((t: any) =>
          t.metrics?.time_to_first_quote_seconds &&
          t.metrics.time_to_first_quote_seconds <= firstQuoteSlaSeconds
        )
      } else if (metric === 'first_quote_breached') {
        drilldownTickets = rfqTickets.filter((t: any) =>
          t.metrics?.time_to_first_quote_seconds &&
          t.metrics.time_to_first_quote_seconds > firstQuoteSlaSeconds
        )
      } else if (metric === 'first_quote_pending') {
        drilldownTickets = rfqTickets.filter((t: any) =>
          !t.metrics?.time_to_first_quote_seconds
        )
      }
    } else {
      return NextResponse.json({
        success: false,
        error: `Unknown metric: ${metric}`,
        error_code: 'VALIDATION_ERROR',
      }, { status: 422 })
    }

    // Apply pagination
    const totalCount = drilldownTickets.length
    const paginatedTickets = drilldownTickets.slice(offset, offset + limit)

    // Map to minimal response format
    const responseData = paginatedTickets.map((t: any) => ({
      id: t.id,
      ticket_code: t.ticket_code,
      subject: t.subject,
      status: t.status,
      department: t.department,
      ticket_type: t.ticket_type,
      created_at: t.created_at,
      updated_at: t.updated_at,
      creator_name: t.creator?.name || null,
      assignee_name: t.assignee?.name || null,
      first_response_at: t.sla_tracking?.first_response_at || null,
      first_response_met: t.sla_tracking?.first_response_met ?? null,
      resolution_at: t.sla_tracking?.resolution_at || null,
      resolution_met: t.sla_tracking?.resolution_met ?? null,
      time_to_first_quote_seconds: t.metrics?.time_to_first_quote_seconds || null,
    }))

    return NextResponse.json({
      success: true,
      data: {
        metric,
        ticket_type_filter: ticketType,
        period_days: period,
        scope: analyticsScope.scope,
        scope_department: analyticsScope.department,
        total_count: totalCount,
        limit,
        offset,
        has_more: offset + limit < totalCount,
        tickets: responseData,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
