import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, getAnalyticsScope } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/performance/users - Get user performance metrics
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '30' // days
    const departmentFilter = searchParams.get('department')

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

    // Users with 'user' scope don't get team performance data
    if (analyticsScope.scope === 'user') {
      return NextResponse.json({
        success: true,
        data: {
          period_days: parseInt(period),
          users: [],
          leaderboard: {
            most_tickets: [],
            highest_completion_rate: [],
            best_sla_compliance: [],
            fastest_response: [],
          },
          total_users: 0,
        },
      })
    }

    // Calculate date range
    const periodDays = parseInt(period)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - periodDays)

    // Fetch tickets assigned to users
    let ticketQuery = (supabase as any)
      .from('tickets')
      .select(`
        id,
        status,
        priority,
        department,
        ticket_type,
        assigned_to,
        created_at,
        first_response_at,
        resolved_at,
        closed_at,
        close_outcome,
        assignee:profiles!tickets_assigned_to_fkey(user_id, name, email, role),
        sla_tracking:ticket_sla_tracking(first_response_met, resolution_met)
      `)
      .gte('created_at', startDate.toISOString())
      .not('assigned_to', 'is', null)

    // Apply department filter based on analytics scope
    if (analyticsScope.scope === 'department' && analyticsScope.department) {
      ticketQuery = ticketQuery.eq('department', analyticsScope.department)
    } else if (departmentFilter && analyticsScope.scope === 'all') {
      ticketQuery = ticketQuery.eq('department', departmentFilter)
    }

    const { data: tickets, error: ticketsError } = await ticketQuery

    if (ticketsError) {
      console.error('Error fetching tickets:', ticketsError)
      return NextResponse.json({ error: ticketsError.message }, { status: 500 })
    }

    // Fetch comments for response metrics
    let commentsQuery = (supabase as any)
      .from('ticket_comments')
      .select(`
        id,
        user_id,
        response_time_seconds,
        response_direction,
        is_internal,
        created_at,
        user:profiles!ticket_comments_user_id_fkey(user_id, name, email, role)
      `)
      .gte('created_at', startDate.toISOString())
      .eq('is_internal', false)

    const { data: comments, error: commentsError } = await commentsQuery

    if (commentsError) {
      console.error('Error fetching comments:', commentsError)
      return NextResponse.json({ error: commentsError.message }, { status: 500 })
    }

    // Aggregate by user
    const userMetrics: Record<string, any> = {}

    // Process tickets
    for (const ticket of tickets || []) {
      const userId = ticket.assigned_to
      const userName = ticket.assignee?.name || 'Unknown'
      const userRole = ticket.assignee?.role || 'Unknown'

      if (!userMetrics[userId]) {
        userMetrics[userId] = {
          user_id: userId,
          name: userName,
          role: userRole,
          assigned_tickets: 0,
          resolved_tickets: 0,
          closed_tickets: 0,
          won_tickets: 0,
          lost_tickets: 0,
          sla_fr_met: 0,
          sla_fr_breached: 0,
          sla_res_met: 0,
          sla_res_breached: 0,
          total_resolution_hours: 0,
          by_status: {},
          by_priority: { urgent: 0, high: 0, medium: 0, low: 0 },
        }
      }

      const metrics = userMetrics[userId]
      metrics.assigned_tickets++

      // Status
      metrics.by_status[ticket.status] = (metrics.by_status[ticket.status] || 0) + 1

      // Priority (active only)
      if (!['resolved', 'closed'].includes(ticket.status)) {
        metrics.by_priority[ticket.priority] = (metrics.by_priority[ticket.priority] || 0) + 1
      }

      // Resolved/closed
      if (ticket.status === 'resolved') metrics.resolved_tickets++
      if (ticket.status === 'closed') {
        metrics.closed_tickets++
        if (ticket.close_outcome === 'won') metrics.won_tickets++
        if (ticket.close_outcome === 'lost') metrics.lost_tickets++
      }

      // SLA
      const sla = ticket.sla_tracking?.[0]
      if (sla) {
        if (sla.first_response_met === true) metrics.sla_fr_met++
        if (sla.first_response_met === false) metrics.sla_fr_breached++
        if (sla.resolution_met === true) metrics.sla_res_met++
        if (sla.resolution_met === false) metrics.sla_res_breached++
      }

      // Resolution time
      if (ticket.resolved_at) {
        const created = new Date(ticket.created_at)
        const resolved = new Date(ticket.resolved_at)
        metrics.total_resolution_hours += (resolved.getTime() - created.getTime()) / (1000 * 60 * 60)
      }
    }

    // Process comments for response metrics
    const userCommentMetrics: Record<string, { count: number; totalSeconds: number }> = {}
    for (const comment of comments || []) {
      if (comment.response_direction !== 'outbound') continue

      const userId = comment.user_id
      if (!userCommentMetrics[userId]) {
        userCommentMetrics[userId] = { count: 0, totalSeconds: 0 }
      }
      userCommentMetrics[userId].count++
      userCommentMetrics[userId].totalSeconds += comment.response_time_seconds || 0
    }

    // Merge comment metrics and calculate final values
    const userPerformance = Object.values(userMetrics).map((metrics: any) => {
      const commentMetrics = userCommentMetrics[metrics.user_id]
      const completedTickets = metrics.resolved_tickets + metrics.closed_tickets

      return {
        user_id: metrics.user_id,
        name: metrics.name,
        role: metrics.role,
        tickets: {
          assigned: metrics.assigned_tickets,
          resolved: metrics.resolved_tickets,
          closed: metrics.closed_tickets,
          active: metrics.assigned_tickets - completedTickets,
          completion_rate: metrics.assigned_tickets > 0
            ? Math.round((completedTickets / metrics.assigned_tickets) * 100)
            : 0,
        },
        win_loss: {
          won: metrics.won_tickets,
          lost: metrics.lost_tickets,
          win_rate: metrics.closed_tickets > 0
            ? Math.round((metrics.won_tickets / metrics.closed_tickets) * 100)
            : 0,
        },
        sla: {
          first_response: {
            met: metrics.sla_fr_met,
            breached: metrics.sla_fr_breached,
            compliance_rate: (metrics.sla_fr_met + metrics.sla_fr_breached) > 0
              ? Math.round((metrics.sla_fr_met / (metrics.sla_fr_met + metrics.sla_fr_breached)) * 100)
              : 100,
          },
          resolution: {
            met: metrics.sla_res_met,
            breached: metrics.sla_res_breached,
            compliance_rate: (metrics.sla_res_met + metrics.sla_res_breached) > 0
              ? Math.round((metrics.sla_res_met / (metrics.sla_res_met + metrics.sla_res_breached)) * 100)
              : 100,
          },
        },
        response: {
          total_responses: commentMetrics?.count || 0,
          avg_response_seconds: commentMetrics && commentMetrics.count > 0
            ? Math.round(commentMetrics.totalSeconds / commentMetrics.count)
            : 0,
          avg_response_hours: commentMetrics && commentMetrics.count > 0
            ? Math.round((commentMetrics.totalSeconds / commentMetrics.count / 3600) * 10) / 10
            : 0,
        },
        avg_resolution_seconds: completedTickets > 0
          ? Math.round((metrics.total_resolution_hours * 3600) / completedTickets)
          : 0,
        avg_resolution_hours: completedTickets > 0
          ? Math.round((metrics.total_resolution_hours / completedTickets) * 10) / 10
          : 0,
        by_status: metrics.by_status,
        by_priority: metrics.by_priority,
      }
    })

    // Sort by assigned tickets
    userPerformance.sort((a, b) => b.tickets.assigned - a.tickets.assigned)

    // Calculate leaderboard
    const leaderboard = {
      most_tickets: [...userPerformance].sort((a, b) => b.tickets.assigned - a.tickets.assigned).slice(0, 5),
      highest_completion_rate: [...userPerformance]
        .filter(u => u.tickets.assigned >= 5)
        .sort((a, b) => b.tickets.completion_rate - a.tickets.completion_rate)
        .slice(0, 5),
      best_sla_compliance: [...userPerformance]
        .filter(u => u.tickets.assigned >= 5)
        .sort((a, b) =>
          ((b.sla.first_response.compliance_rate + b.sla.resolution.compliance_rate) / 2) -
          ((a.sla.first_response.compliance_rate + a.sla.resolution.compliance_rate) / 2)
        )
        .slice(0, 5),
      fastest_response: [...userPerformance]
        .filter(u => u.response.total_responses >= 5)
        .sort((a, b) => a.response.avg_response_hours - b.response.avg_response_hours)
        .slice(0, 5),
    }

    return NextResponse.json({
      success: true,
      data: {
        period_days: periodDays,
        users: userPerformance,
        leaderboard,
        total_users: userPerformance.length,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
