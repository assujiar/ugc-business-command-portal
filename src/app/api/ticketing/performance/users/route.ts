import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, getAnalyticsScope, canViewAnalyticsRankings } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

// OPS departments that get first quote metrics
const OPS_DEPARTMENTS = ['DTD', 'EXI', 'TRF', 'DOM']

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
            fastest_first_response: [],
            fastest_stage_response: [],
          },
          total_users: 0,
        },
      })
    }

    // Calculate date range
    const periodDays = parseInt(period)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - periodDays)

    // Fetch ALL tickets (we need both creator and assignee info)
    let ticketQuery = (supabase as any)
      .from('tickets')
      .select(`
        id,
        status,
        priority,
        department,
        ticket_type,
        created_by,
        assigned_to,
        created_at,
        first_response_at,
        resolved_at,
        closed_at,
        close_outcome,
        creator:profiles!tickets_created_by_fkey(user_id, name, email, role),
        assignee:profiles!tickets_assigned_to_fkey(user_id, name, email, role),
        sla_tracking:ticket_sla_tracking(first_response_met, resolution_met),
        metrics:ticket_response_metrics(time_to_first_quote_seconds)
      `)
      .gte('created_at', startDate.toISOString())

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
        ticket_id,
        response_time_seconds,
        response_direction,
        is_internal,
        created_at,
        user:profiles!ticket_comments_user_id_fkey(user_id, name, email, role),
        ticket:tickets!ticket_comments_ticket_id_fkey(id, created_by, assigned_to, department)
      `)
      .gte('created_at', startDate.toISOString())
      .eq('is_internal', false)
      .not('response_time_seconds', 'is', null)

    const { data: comments, error: commentsError } = await commentsQuery

    if (commentsError) {
      console.error('Error fetching comments:', commentsError)
      return NextResponse.json({ error: commentsError.message }, { status: 500 })
    }

    // ============================================
    // TRACK USERS BY ROLE: ASSIGNEE vs CREATOR
    // ============================================
    // Assignee metrics: assigned_tickets, resolved, closed, SLA, first_response, stage_response, resolution_time
    // Creator metrics: created_tickets, stage_response ONLY (no first_response)

    interface UserMetrics {
      user_id: string
      name: string
      role: string
      // Assignee metrics (tiket yang di-assign ke dia)
      assigned_tickets: number
      resolved_tickets: number
      closed_tickets: number
      won_tickets: number
      lost_tickets: number
      sla_fr_met: number
      sla_fr_breached: number
      sla_res_met: number
      sla_res_breached: number
      total_resolution_hours: number
      by_status: Record<string, number>
      by_priority: Record<string, number>
      by_type: {
        RFQ: { assigned: number; resolved: number; closed: number; won: number; lost: number; sla_fr_met: number; sla_fr_breached: number; total_res_hours: number; first_quote_seconds: number; first_quote_count: number }
        GEN: { assigned: number; resolved: number; closed: number; sla_fr_met: number; sla_fr_breached: number; total_res_hours: number }
      }
      // Creator metrics (tiket yang dia buat)
      created_tickets: number
      // Response metrics
      first_response_count: number
      first_response_total_seconds: number
      stage_response_count: number
      stage_response_total_seconds: number
      // Flag apakah user ini OPS department
      is_ops: boolean
    }

    const userMetrics: Record<string, UserMetrics> = {}

    // Helper to initialize user metrics
    const initUserMetrics = (userId: string, name: string, role: string, isOps: boolean): UserMetrics => ({
      user_id: userId,
      name,
      role,
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
      by_type: {
        RFQ: { assigned: 0, resolved: 0, closed: 0, won: 0, lost: 0, sla_fr_met: 0, sla_fr_breached: 0, total_res_hours: 0, first_quote_seconds: 0, first_quote_count: 0 },
        GEN: { assigned: 0, resolved: 0, closed: 0, sla_fr_met: 0, sla_fr_breached: 0, total_res_hours: 0 },
      },
      created_tickets: 0,
      first_response_count: 0,
      first_response_total_seconds: 0,
      stage_response_count: 0,
      stage_response_total_seconds: 0,
      is_ops: isOps,
    })

    // Process tickets - track ASSIGNEE metrics
    for (const ticket of tickets || []) {
      const assigneeId = ticket.assigned_to
      const creatorId = ticket.created_by

      // Track ASSIGNEE metrics (only if ticket has assignee)
      if (assigneeId && ticket.assignee) {
        const assigneeName = ticket.assignee?.name || 'Unknown'
        const assigneeRole = ticket.assignee?.role || 'Unknown'
        const isOps = OPS_DEPARTMENTS.includes(ticket.department)

        if (!userMetrics[assigneeId]) {
          userMetrics[assigneeId] = initUserMetrics(assigneeId, assigneeName, assigneeRole, isOps)
        }

        const metrics = userMetrics[assigneeId]
        metrics.assigned_tickets++

        // Track by ticket type
        const ticketType = ticket.ticket_type as 'RFQ' | 'GEN'
        if (ticketType && metrics.by_type[ticketType]) {
          metrics.by_type[ticketType].assigned++
        }

        // Status
        metrics.by_status[ticket.status] = (metrics.by_status[ticket.status] || 0) + 1

        // Priority (active only)
        if (!['resolved', 'closed'].includes(ticket.status)) {
          metrics.by_priority[ticket.priority] = (metrics.by_priority[ticket.priority] || 0) + 1
        }

        // Resolved/closed
        if (ticket.status === 'resolved') {
          metrics.resolved_tickets++
          if (ticketType && metrics.by_type[ticketType]) {
            metrics.by_type[ticketType].resolved++
          }
        }
        if (ticket.status === 'closed') {
          metrics.closed_tickets++
          if (ticketType && metrics.by_type[ticketType]) {
            metrics.by_type[ticketType].closed++
          }
          if (ticket.close_outcome === 'won') {
            metrics.won_tickets++
            if (ticketType === 'RFQ') {
              metrics.by_type.RFQ.won++
            }
          }
          if (ticket.close_outcome === 'lost') {
            metrics.lost_tickets++
            if (ticketType === 'RFQ') {
              metrics.by_type.RFQ.lost++
            }
          }
        }

        // SLA
        const sla = ticket.sla_tracking?.[0]
        if (sla) {
          if (sla.first_response_met === true) {
            metrics.sla_fr_met++
            if (ticketType && metrics.by_type[ticketType]) {
              metrics.by_type[ticketType].sla_fr_met++
            }
          }
          if (sla.first_response_met === false) {
            metrics.sla_fr_breached++
            if (ticketType && metrics.by_type[ticketType]) {
              metrics.by_type[ticketType].sla_fr_breached++
            }
          }
          if (sla.resolution_met === true) metrics.sla_res_met++
          if (sla.resolution_met === false) metrics.sla_res_breached++
        }

        // Resolution time
        if (ticket.resolved_at) {
          const created = new Date(ticket.created_at)
          const resolved = new Date(ticket.resolved_at)
          const resHours = (resolved.getTime() - created.getTime()) / (1000 * 60 * 60)
          metrics.total_resolution_hours += resHours
          if (ticketType && metrics.by_type[ticketType]) {
            metrics.by_type[ticketType].total_res_hours += resHours
          }
        }

        // First quote time (for OPS with RFQ tickets)
        if (ticketType === 'RFQ' && ticket.metrics?.[0]?.time_to_first_quote_seconds) {
          metrics.by_type.RFQ.first_quote_seconds += ticket.metrics[0].time_to_first_quote_seconds
          metrics.by_type.RFQ.first_quote_count++
        }
      }

      // Track CREATOR (just the count, for context)
      if (creatorId && ticket.creator) {
        const creatorName = ticket.creator?.name || 'Unknown'
        const creatorRole = ticket.creator?.role || 'Unknown'

        if (!userMetrics[creatorId]) {
          userMetrics[creatorId] = initUserMetrics(creatorId, creatorName, creatorRole, false)
        }
        userMetrics[creatorId].created_tickets++
      }
    }

    // ============================================
    // Process COMMENTS for response metrics
    // ============================================
    // Group outbound comments by ticket
    const outboundComments = (comments || []).filter((c: any) => c.response_direction === 'outbound')

    const commentsByTicket: Record<string, any[]> = {}
    for (const comment of outboundComments) {
      const ticketId = comment.ticket_id
      if (!commentsByTicket[ticketId]) {
        commentsByTicket[ticketId] = []
      }
      commentsByTicket[ticketId].push(comment)
    }

    // Sort each ticket's comments by created_at
    for (const ticketId in commentsByTicket) {
      commentsByTicket[ticketId].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    }

    // Process comments per ticket
    for (const ticketId in commentsByTicket) {
      const ticketComments = commentsByTicket[ticketId]
      let foundFirstAssigneeResponse = false

      for (const comment of ticketComments) {
        const userId = comment.user_id
        const isAssignee = userId === comment.ticket?.assigned_to
        const isCreator = userId === comment.ticket?.created_by
        const responseSeconds = comment.response_time_seconds || 0

        // Ensure user exists in metrics
        if (!userMetrics[userId] && comment.user) {
          const isOps = OPS_DEPARTMENTS.includes(comment.ticket?.department || '')
          userMetrics[userId] = initUserMetrics(
            userId,
            comment.user.name || 'Unknown',
            comment.user.role || 'Unknown',
            isOps
          )
        }

        if (!userMetrics[userId]) continue

        // Determine response type:
        // - FIRST RESPONSE: Only for ASSIGNEE's first response on a ticket
        // - STAGE RESPONSE: All other responses (creator responses, subsequent assignee responses)
        if (isAssignee && !foundFirstAssigneeResponse) {
          // First response by assignee on this ticket
          userMetrics[userId].first_response_count++
          userMetrics[userId].first_response_total_seconds += responseSeconds
          foundFirstAssigneeResponse = true
        } else {
          // Stage response (tektokan)
          // - Creator's responses are ALWAYS stage responses
          // - Assignee's subsequent responses are stage responses
          userMetrics[userId].stage_response_count++
          userMetrics[userId].stage_response_total_seconds += responseSeconds
        }
      }
    }

    // ============================================
    // Build final user performance data
    // ============================================
    // ONLY include users who have been ASSIGNED at least 1 ticket
    // (creators without assigned tickets are not in the leaderboard)
    const userPerformance = Object.values(userMetrics)
      .filter(metrics => metrics.assigned_tickets > 0) // Only users with assigned tickets
      .map((metrics) => {
        const completedTickets = metrics.resolved_tickets + metrics.closed_tickets

        // Calculate by_type detailed metrics
        const byTypeDetailed: Record<string, any> = {}

        // RFQ type metrics
        const rfqData = metrics.by_type.RFQ
        const rfqCompleted = rfqData.resolved + rfqData.closed
        byTypeDetailed['RFQ'] = {
          tickets: {
            assigned: rfqData.assigned,
            resolved: rfqData.resolved,
            closed: rfqData.closed,
            active: rfqData.assigned - rfqCompleted,
            completion_rate: rfqData.assigned > 0 ? Math.round((rfqCompleted / rfqData.assigned) * 100) : 0,
          },
          win_loss: {
            won: rfqData.won,
            lost: rfqData.lost,
            win_rate: rfqData.closed > 0 ? Math.round((rfqData.won / rfqData.closed) * 100) : 0,
          },
          sla: {
            first_response: {
              met: rfqData.sla_fr_met,
              breached: rfqData.sla_fr_breached,
              compliance_rate: (rfqData.sla_fr_met + rfqData.sla_fr_breached) > 0
                ? Math.round((rfqData.sla_fr_met / (rfqData.sla_fr_met + rfqData.sla_fr_breached)) * 100)
                : 0,
            },
          },
          avg_resolution_seconds: rfqCompleted > 0 ? Math.round((rfqData.total_res_hours * 3600) / rfqCompleted) : 0,
          avg_resolution_hours: rfqCompleted > 0 ? Math.round((rfqData.total_res_hours / rfqCompleted) * 10) / 10 : 0,
          // First quote time (only for OPS departments)
          first_quote: metrics.is_ops ? {
            count: rfqData.first_quote_count,
            avg_seconds: rfqData.first_quote_count > 0
              ? Math.round(rfqData.first_quote_seconds / rfqData.first_quote_count)
              : 0,
          } : null,
        }

        // GEN type metrics
        const genData = metrics.by_type.GEN
        const genCompleted = genData.resolved + genData.closed
        byTypeDetailed['GEN'] = {
          tickets: {
            assigned: genData.assigned,
            resolved: genData.resolved,
            closed: genData.closed,
            active: genData.assigned - genCompleted,
            completion_rate: genData.assigned > 0 ? Math.round((genCompleted / genData.assigned) * 100) : 0,
          },
          sla: {
            first_response: {
              met: genData.sla_fr_met,
              breached: genData.sla_fr_breached,
              compliance_rate: (genData.sla_fr_met + genData.sla_fr_breached) > 0
                ? Math.round((genData.sla_fr_met / (genData.sla_fr_met + genData.sla_fr_breached)) * 100)
                : 0,
            },
          },
          avg_resolution_seconds: genCompleted > 0 ? Math.round((genData.total_res_hours * 3600) / genCompleted) : 0,
          avg_resolution_hours: genCompleted > 0 ? Math.round((genData.total_res_hours / genCompleted) * 10) / 10 : 0,
        }

        return {
          user_id: metrics.user_id,
          name: metrics.name,
          role: metrics.role,
          is_ops: metrics.is_ops,
          tickets: {
            assigned: metrics.assigned_tickets,
            created: metrics.created_tickets,
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
                : 0,
            },
            resolution: {
              met: metrics.sla_res_met,
              breached: metrics.sla_res_breached,
              compliance_rate: (metrics.sla_res_met + metrics.sla_res_breached) > 0
                ? Math.round((metrics.sla_res_met / (metrics.sla_res_met + metrics.sla_res_breached)) * 100)
                : 0,
            },
          },
          response: {
            // First Response - ONLY for assignees (response pertama assignee)
            first_response: {
              count: metrics.first_response_count,
              avg_seconds: metrics.first_response_count > 0
                ? Math.round(metrics.first_response_total_seconds / metrics.first_response_count)
                : 0,
            },
            // Stage Response - tektokan (semua respons lanjutan)
            stage_response: {
              count: metrics.stage_response_count,
              avg_seconds: metrics.stage_response_count > 0
                ? Math.round(metrics.stage_response_total_seconds / metrics.stage_response_count)
                : 0,
            },
            total_responses: metrics.first_response_count + metrics.stage_response_count,
          },
          avg_resolution_seconds: completedTickets > 0
            ? Math.round((metrics.total_resolution_hours * 3600) / completedTickets)
            : 0,
          avg_resolution_hours: completedTickets > 0
            ? Math.round((metrics.total_resolution_hours / completedTickets) * 10) / 10
            : 0,
          by_type: byTypeDetailed,
          by_status: metrics.by_status,
          by_priority: metrics.by_priority,
        }
      })

    // Sort by assigned tickets
    userPerformance.sort((a, b) => b.tickets.assigned - a.tickets.assigned)

    // Check if user can view rankings
    const showRankings = canViewAnalyticsRankings(profile.role)

    // ============================================
    // LEADERBOARD - NO THRESHOLDS
    // ============================================
    // If user has at least 1 assigned ticket, they're in the leaderboard
    // No minimum requirements like >= 5 tickets or >= 3 responses
    const leaderboard = showRankings ? {
      // Most assigned tickets
      most_tickets: [...userPerformance]
        .sort((a, b) => b.tickets.assigned - a.tickets.assigned)
        .slice(0, 5),

      // Highest completion rate (must have at least completed 1 ticket)
      highest_completion_rate: [...userPerformance]
        .filter(u => (u.tickets.resolved + u.tickets.closed) > 0)
        .sort((a, b) => b.tickets.completion_rate - a.tickets.completion_rate)
        .slice(0, 5),

      // Best SLA compliance (must have SLA data)
      best_sla_compliance: [...userPerformance]
        .filter(u =>
          (u.sla.first_response.met + u.sla.first_response.breached +
           u.sla.resolution.met + u.sla.resolution.breached) > 0
        )
        .sort((a, b) =>
          ((b.sla.first_response.compliance_rate + b.sla.resolution.compliance_rate) / 2) -
          ((a.sla.first_response.compliance_rate + a.sla.resolution.compliance_rate) / 2)
        )
        .slice(0, 5),

      // Fastest first response (must have at least 1 first response)
      fastest_first_response: [...userPerformance]
        .filter(u => u.response.first_response.count > 0 && u.response.first_response.avg_seconds > 0)
        .sort((a, b) => a.response.first_response.avg_seconds - b.response.first_response.avg_seconds)
        .slice(0, 5),

      // Fastest stage response (must have at least 1 stage response)
      fastest_stage_response: [...userPerformance]
        .filter(u => u.response.stage_response.count > 0 && u.response.stage_response.avg_seconds > 0)
        .sort((a, b) => a.response.stage_response.avg_seconds - b.response.stage_response.avg_seconds)
        .slice(0, 5),
    } : {
      most_tickets: [],
      highest_completion_rate: [],
      best_sla_compliance: [],
      fastest_first_response: [],
      fastest_stage_response: [],
    }

    return NextResponse.json({
      success: true,
      data: {
        period_days: periodDays,
        users: userPerformance,
        leaderboard,
        total_users: userPerformance.length,
        can_view_rankings: showRankings,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
