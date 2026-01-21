import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, getAnalyticsScope } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/performance/departments - Get department performance metrics
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '30' // days

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profileData } = await (supabase as any)
      .from('profiles')
      .select('user_id, role')
      .eq('user_id', user.id)
      .single() as { data: ProfileData | null }

    const profile = profileData

    if (!profile || !canAccessTicketing(profile.role)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get analytics scope based on role
    const analyticsScope = getAnalyticsScope(profile.role, user.id)

    // Users with 'user' scope don't get department performance data
    if (analyticsScope.scope === 'user') {
      return NextResponse.json({
        success: true,
        data: {
          period_days: parseInt(period),
          departments: {},
          rankings: {
            by_volume: [],
            by_completion_rate: [],
            by_sla_compliance: [],
            by_win_rate: [],
          },
          total_tickets: 0,
        },
      })
    }

    // Calculate date range
    const periodDays = parseInt(period)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - periodDays)

    // Fetch tickets with SLA data
    let ticketQuery = (supabase as any)
      .from('tickets')
      .select(`
        id,
        ticket_code,
        status,
        priority,
        department,
        ticket_type,
        created_at,
        first_response_at,
        resolved_at,
        closed_at,
        close_outcome,
        sla_tracking:ticket_sla_tracking(
          first_response_met,
          resolution_met,
          first_response_sla_hours,
          resolution_sla_hours
        )
      `)
      .gte('created_at', startDate.toISOString())

    // For department scope, filter to only their department
    if (analyticsScope.scope === 'department' && analyticsScope.department) {
      ticketQuery = ticketQuery.eq('department', analyticsScope.department)
    }

    const { data: tickets, error: ticketsError } = await ticketQuery

    if (ticketsError) {
      console.error('Error fetching tickets:', ticketsError)
      return NextResponse.json({ error: ticketsError.message }, { status: 500 })
    }

    const allTickets = tickets || []

    // Calculate metrics by department
    const departments = ['MKT', 'SAL', 'DOM', 'EXI', 'DTD', 'TRF']
    const departmentMetrics: Record<string, any> = {}

    for (const dept of departments) {
      const deptTickets = allTickets.filter((t: any) => t.department === dept)
      const total = deptTickets.length

      // Status breakdown
      const statusCounts: Record<string, number> = {
        open: 0, need_response: 0, in_progress: 0, waiting_customer: 0,
        need_adjustment: 0, pending: 0, resolved: 0, closed: 0,
      }
      deptTickets.forEach((t: any) => {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1
      })

      // Type breakdown
      const rfqCount = deptTickets.filter((t: any) => t.ticket_type === 'RFQ').length
      const genCount = deptTickets.filter((t: any) => t.ticket_type === 'GEN').length

      // Win/loss for closed tickets
      const closedTickets = deptTickets.filter((t: any) => t.status === 'closed')
      const wonCount = closedTickets.filter((t: any) => t.close_outcome === 'won').length
      const lostCount = closedTickets.filter((t: any) => t.close_outcome === 'lost').length
      const winRate = closedTickets.length > 0
        ? Math.round((wonCount / closedTickets.length) * 100)
        : 0

      // SLA compliance
      const withSLA = deptTickets.filter((t: any) => t.sla_tracking && t.sla_tracking.length > 0)
      const slaData = withSLA.map((t: any) => t.sla_tracking[0]).filter(Boolean)

      const frMet = slaData.filter((s: any) => s.first_response_met === true).length
      const frBreached = slaData.filter((s: any) => s.first_response_met === false).length
      const resMet = slaData.filter((s: any) => s.resolution_met === true).length
      const resBreached = slaData.filter((s: any) => s.resolution_met === false).length

      // Average resolution time
      const resolvedTickets = deptTickets.filter((t: any) => t.resolved_at)
      const avgResolutionHours = resolvedTickets.length > 0
        ? resolvedTickets.reduce((sum: number, t: any) => {
            const created = new Date(t.created_at)
            const resolved = new Date(t.resolved_at)
            return sum + (resolved.getTime() - created.getTime()) / (1000 * 60 * 60)
          }, 0) / resolvedTickets.length
        : 0

      // Active vs completed
      const activeCount = deptTickets.filter((t: any) =>
        !['resolved', 'closed'].includes(t.status)
      ).length
      const completedCount = total - activeCount

      departmentMetrics[dept] = {
        total_tickets: total,
        active_tickets: activeCount,
        completed_tickets: completedCount,
        completion_rate: total > 0 ? Math.round((completedCount / total) * 100) : 0,
        by_status: statusCounts,
        by_type: {
          RFQ: rfqCount,
          GEN: genCount,
        },
        win_loss: {
          won: wonCount,
          lost: lostCount,
          win_rate: winRate,
        },
        sla: {
          first_response: {
            met: frMet,
            breached: frBreached,
            compliance_rate: (frMet + frBreached) > 0
              ? Math.round((frMet / (frMet + frBreached)) * 100)
              : 100,
          },
          resolution: {
            met: resMet,
            breached: resBreached,
            compliance_rate: (resMet + resBreached) > 0
              ? Math.round((resMet / (resMet + resBreached)) * 100)
              : 100,
          },
        },
        avg_resolution_hours: Math.round(avgResolutionHours * 10) / 10,
      }
    }

    // Calculate rankings
    const rankings = {
      by_volume: departments
        .map(dept => ({ department: dept, count: departmentMetrics[dept].total_tickets }))
        .sort((a, b) => b.count - a.count),
      by_completion_rate: departments
        .map(dept => ({ department: dept, rate: departmentMetrics[dept].completion_rate }))
        .sort((a, b) => b.rate - a.rate),
      by_sla_compliance: departments
        .map(dept => ({
          department: dept,
          rate: (departmentMetrics[dept].sla.first_response.compliance_rate +
                 departmentMetrics[dept].sla.resolution.compliance_rate) / 2,
        }))
        .sort((a, b) => b.rate - a.rate),
      by_win_rate: departments
        .map(dept => ({ department: dept, rate: departmentMetrics[dept].win_loss.win_rate }))
        .sort((a, b) => b.rate - a.rate),
    }

    return NextResponse.json({
      success: true,
      data: {
        period_days: periodDays,
        departments: departmentMetrics,
        rankings,
        total_tickets: allTickets.length,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
