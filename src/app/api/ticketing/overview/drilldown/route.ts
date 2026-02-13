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
 * - metric: The metric to drill down into (see below)
 * - ticket_type: 'RFQ' | 'GEN' | 'TOTAL' (default: 'TOTAL')
 * - period: number of days (default: 30)
 * - view_mode: 'received' | 'created' | null (matches overview dashboard filter)
 * - department: department filter (only for director/admin)
 * - limit: max results (default: 100)
 * - offset: pagination offset (default: 0)
 *
 * Supported metrics:
 * - Ticket counts: 'total', 'active', 'completed', 'today_created', 'today_resolved'
 * - Status: 'status_<status>' (e.g., 'status_open', 'status_closed')
 * - SLA First Response: 'first_response_met', 'first_response_breached', 'first_response_pending'
 * - SLA Resolution: 'resolution_met', 'resolution_breached', 'resolution_pending'
 * - First Quote: 'first_quote_met', 'first_quote_breached', 'first_quote_pending'
 * - Response Distribution: 'response_under_1h', 'response_1_to_4h', 'response_4_to_24h', 'response_over_24h'
 * - Quotation: 'quotation_draft', 'quotation_sent', 'quotation_accepted', 'quotation_rejected', 'quotation_expired'
 * - Ops Cost: 'ops_cost_draft', 'ops_cost_submitted', 'ops_cost_sent_to_customer', 'ops_cost_accepted', 'ops_cost_rejected'
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const metric = searchParams.get('metric')
    const ticketType = searchParams.get('ticket_type') || 'TOTAL'
    const period = parseInt(searchParams.get('period') || '30')
    const viewMode = searchParams.get('view_mode')
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

    // Build base query for tickets with SLA + metrics data
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
          time_to_first_quote_seconds,
          assignee_first_response_seconds
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

    // Apply view_mode filter (matches overview dashboard received/created tabs)
    if (viewMode === 'received') {
      filteredTickets = filteredTickets.filter((t: any) => t.assigned_to === user.id)
    } else if (viewMode === 'created') {
      filteredTickets = filteredTickets.filter((t: any) => t.created_by === user.id)
    }

    // Helper to get metrics (handles both object and array FK join)
    const getMetrics = (t: any) => Array.isArray(t.metrics) ? t.metrics[0] : t.metrics
    const getSla = (t: any) => Array.isArray(t.sla_tracking) ? t.sla_tracking[0] : t.sla_tracking

    // Apply metric-specific filter
    let drilldownTickets: any[] = []

    // ========== Ticket Count Metrics ==========
    if (metric === 'total') {
      drilldownTickets = filteredTickets
    } else if (metric === 'active') {
      drilldownTickets = filteredTickets.filter((t: any) => !['resolved', 'closed'].includes(t.status))
    } else if (metric === 'completed') {
      drilldownTickets = filteredTickets.filter((t: any) => ['resolved', 'closed'].includes(t.status))
    } else if (metric === 'today_created') {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      drilldownTickets = filteredTickets.filter((t: any) => new Date(t.created_at) >= todayStart)
    } else if (metric === 'today_resolved') {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      drilldownTickets = filteredTickets.filter((t: any) =>
        ['resolved', 'closed'].includes(t.status) && new Date(t.updated_at) >= todayStart
      )

    // ========== Status Metrics ==========
    } else if (metric.startsWith('status_')) {
      const status = metric.replace('status_', '')
      drilldownTickets = filteredTickets.filter((t: any) => t.status === status)

    // ========== First Response SLA ==========
    } else if (metric.startsWith('first_response_')) {
      if (metric === 'first_response_met') {
        drilldownTickets = filteredTickets.filter((t: any) => {
          const sla = getSla(t)
          return sla?.first_response_at && sla?.first_response_met === true
        })
      } else if (metric === 'first_response_breached') {
        drilldownTickets = filteredTickets.filter((t: any) => {
          const sla = getSla(t)
          return sla?.first_response_at && sla?.first_response_met === false
        })
      } else if (metric === 'first_response_pending') {
        drilldownTickets = filteredTickets.filter((t: any) => {
          const sla = getSla(t)
          return !sla?.first_response_at
        })
      }

    // ========== Resolution SLA ==========
    } else if (metric.startsWith('resolution_')) {
      if (metric === 'resolution_met') {
        drilldownTickets = filteredTickets.filter((t: any) => {
          const sla = getSla(t)
          return sla?.resolution_met === true
        })
      } else if (metric === 'resolution_breached') {
        drilldownTickets = filteredTickets.filter((t: any) => {
          const sla = getSla(t)
          return sla?.resolution_met === false
        })
      } else if (metric === 'resolution_pending') {
        drilldownTickets = filteredTickets.filter((t: any) => {
          const sla = getSla(t)
          return sla?.resolution_met == null && !['resolved', 'closed'].includes(t.status)
        })
      }

    // ========== First Quote SLA (RFQ only) ==========
    } else if (metric.startsWith('first_quote_')) {
      const rfqTickets = filteredTickets.filter((t: any) => t.ticket_type === 'RFQ')
      const firstQuoteSlaSeconds = 24 * 3600

      if (metric === 'first_quote_met') {
        drilldownTickets = rfqTickets.filter((t: any) => {
          const m = getMetrics(t)
          return m?.time_to_first_quote_seconds && m.time_to_first_quote_seconds <= firstQuoteSlaSeconds
        })
      } else if (metric === 'first_quote_breached') {
        drilldownTickets = rfqTickets.filter((t: any) => {
          const m = getMetrics(t)
          return m?.time_to_first_quote_seconds && m.time_to_first_quote_seconds > firstQuoteSlaSeconds
        })
      } else if (metric === 'first_quote_pending') {
        drilldownTickets = rfqTickets.filter((t: any) => {
          const m = getMetrics(t)
          return !m?.time_to_first_quote_seconds && !['resolved', 'closed'].includes(t.status)
        })
      }

    // ========== Response Time Distribution ==========
    } else if (metric.startsWith('response_')) {
      if (metric === 'response_under_1h') {
        drilldownTickets = filteredTickets.filter((t: any) => {
          const m = getMetrics(t)
          return m?.assignee_first_response_seconds != null && m.assignee_first_response_seconds < 3600
        })
      } else if (metric === 'response_1_to_4h') {
        drilldownTickets = filteredTickets.filter((t: any) => {
          const m = getMetrics(t)
          return m?.assignee_first_response_seconds != null &&
            m.assignee_first_response_seconds >= 3600 && m.assignee_first_response_seconds < 14400
        })
      } else if (metric === 'response_4_to_24h') {
        drilldownTickets = filteredTickets.filter((t: any) => {
          const m = getMetrics(t)
          return m?.assignee_first_response_seconds != null &&
            m.assignee_first_response_seconds >= 14400 && m.assignee_first_response_seconds < 86400
        })
      } else if (metric === 'response_over_24h') {
        drilldownTickets = filteredTickets.filter((t: any) => {
          const m = getMetrics(t)
          return m?.assignee_first_response_seconds != null && m.assignee_first_response_seconds >= 86400
        })
      }

    // ========== Quotation Metrics (find tickets with matching quotations) ==========
    } else if (metric.startsWith('quotation_')) {
      const quotationStatus = metric.replace('quotation_', '')
      const { data: quotations } = await (supabase as any)
        .from('customer_quotations')
        .select('ticket_id')
        .eq('status', quotationStatus)
        .gte('created_at', startDate.toISOString())

      const ticketIds = new Set((quotations || []).map((q: any) => q.ticket_id).filter(Boolean))
      drilldownTickets = filteredTickets.filter((t: any) => ticketIds.has(t.id))

    // ========== Ops Cost Metrics (find tickets with matching ops costs) ==========
    } else if (metric.startsWith('ops_cost_')) {
      const costStatus = metric.replace('ops_cost_', '')
      // 'rejected' combines rejected + revise_requested (matches dashboard display)
      const statusValues = costStatus === 'rejected'
        ? ['rejected', 'revise_requested']
        : [costStatus]

      const { data: costs } = await (supabase as any)
        .from('ticket_rate_quotes')
        .select('ticket_id')
        .in('status', statusValues)
        .gte('created_at', startDate.toISOString())

      const ticketIds = new Set((costs || []).map((c: any) => c.ticket_id).filter(Boolean))
      drilldownTickets = filteredTickets.filter((t: any) => ticketIds.has(t.id))

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
    const responseData = paginatedTickets.map((t: any) => {
      const sla = getSla(t)
      const m = getMetrics(t)
      return {
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
        first_response_at: sla?.first_response_at || null,
        first_response_met: sla?.first_response_met ?? null,
        resolution_at: sla?.resolution_at || null,
        resolution_met: sla?.resolution_met ?? null,
        time_to_first_quote_seconds: m?.time_to_first_quote_seconds || null,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        metric,
        ticket_type_filter: ticketType,
        period_days: period,
        view_mode: viewMode,
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
