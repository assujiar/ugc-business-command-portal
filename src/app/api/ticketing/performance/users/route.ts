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
        sla_tracking:ticket_sla_tracking!ticket_sla_tracking_ticket_id_fkey(first_response_met, resolution_met),
        metrics:ticket_response_metrics!ticket_response_metrics_ticket_id_fkey(time_to_first_quote_seconds)
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
    // TRACK USERS WITH SEPARATED METRICS:
    // as_creator vs as_assignee
    // ============================================

    interface UserMetrics {
      user_id: string
      name: string
      role: string
      is_ops: boolean

      // ========== AS CREATOR (tiket yang dia BUAT) ==========
      as_creator: {
        tickets_created: number
        // Stage response di tiket yang dia buat
        stage_response_count: number
        stage_response_total_seconds: number
      }

      // ========== AS ASSIGNEE (tiket yang di-ASSIGN ke dia) ==========
      as_assignee: {
        tickets_assigned: number
        tickets_resolved: number
        tickets_closed: number
        tickets_won: number
        tickets_lost: number
        // SLA metrics
        sla_fr_met: number
        sla_fr_breached: number
        sla_res_met: number
        sla_res_breached: number
        // Resolution time
        total_resolution_hours: number
        // First response di tiket yang di-assign ke dia
        first_response_count: number
        first_response_total_seconds: number
        // Stage response di tiket yang di-assign ke dia
        stage_response_count: number
        stage_response_total_seconds: number
        // First quote (OPS only)
        first_quote_count: number
        first_quote_total_seconds: number
        // By type
        by_type: {
          RFQ: {
            assigned: number
            resolved: number
            closed: number
            won: number
            lost: number
            sla_fr_met: number
            sla_fr_breached: number
            total_res_hours: number
          }
          GEN: {
            assigned: number
            resolved: number
            closed: number
            sla_fr_met: number
            sla_fr_breached: number
            total_res_hours: number
          }
        }
        by_status: Record<string, number>
        by_priority: Record<string, number>
      }
    }

    const userMetrics: Record<string, UserMetrics> = {}

    // Helper to initialize user metrics
    const initUserMetrics = (userId: string, name: string, role: string, isOps: boolean): UserMetrics => ({
      user_id: userId,
      name,
      role,
      is_ops: isOps,
      as_creator: {
        tickets_created: 0,
        stage_response_count: 0,
        stage_response_total_seconds: 0,
      },
      as_assignee: {
        tickets_assigned: 0,
        tickets_resolved: 0,
        tickets_closed: 0,
        tickets_won: 0,
        tickets_lost: 0,
        sla_fr_met: 0,
        sla_fr_breached: 0,
        sla_res_met: 0,
        sla_res_breached: 0,
        total_resolution_hours: 0,
        first_response_count: 0,
        first_response_total_seconds: 0,
        stage_response_count: 0,
        stage_response_total_seconds: 0,
        first_quote_count: 0,
        first_quote_total_seconds: 0,
        by_type: {
          RFQ: { assigned: 0, resolved: 0, closed: 0, won: 0, lost: 0, sla_fr_met: 0, sla_fr_breached: 0, total_res_hours: 0 },
          GEN: { assigned: 0, resolved: 0, closed: 0, sla_fr_met: 0, sla_fr_breached: 0, total_res_hours: 0 },
        },
        by_status: {},
        by_priority: { urgent: 0, high: 0, medium: 0, low: 0 },
      },
    })

    // Build ticket lookup for comment processing
    const ticketLookup: Record<string, any> = {}
    for (const ticket of tickets || []) {
      ticketLookup[ticket.id] = ticket
    }

    // Process tickets
    for (const ticket of tickets || []) {
      const assigneeId = ticket.assigned_to
      const creatorId = ticket.created_by
      const ticketType = ticket.ticket_type as 'RFQ' | 'GEN'
      const isOps = OPS_DEPARTMENTS.includes(ticket.department)

      // ========== Track CREATOR metrics ==========
      if (creatorId && ticket.creator) {
        if (!userMetrics[creatorId]) {
          userMetrics[creatorId] = initUserMetrics(
            creatorId,
            ticket.creator?.name || 'Unknown',
            ticket.creator?.role || 'Unknown',
            false // Creator's OPS status doesn't matter for creator metrics
          )
        }
        userMetrics[creatorId].as_creator.tickets_created++
      }

      // ========== Track ASSIGNEE metrics ==========
      if (assigneeId && ticket.assignee) {
        if (!userMetrics[assigneeId]) {
          userMetrics[assigneeId] = initUserMetrics(
            assigneeId,
            ticket.assignee?.name || 'Unknown',
            ticket.assignee?.role || 'Unknown',
            isOps
          )
        }

        const metrics = userMetrics[assigneeId].as_assignee
        metrics.tickets_assigned++

        // Track by ticket type
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
          metrics.tickets_resolved++
          if (ticketType && metrics.by_type[ticketType]) {
            metrics.by_type[ticketType].resolved++
          }
        }
        if (ticket.status === 'closed') {
          metrics.tickets_closed++
          if (ticketType && metrics.by_type[ticketType]) {
            metrics.by_type[ticketType].closed++
          }
          if (ticket.close_outcome === 'won') {
            metrics.tickets_won++
            if (ticketType === 'RFQ') {
              metrics.by_type.RFQ.won++
            }
          }
          if (ticket.close_outcome === 'lost') {
            metrics.tickets_lost++
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
          metrics.first_quote_count++
          metrics.first_quote_total_seconds += ticket.metrics[0].time_to_first_quote_seconds
        }
      }
    }

    // ============================================
    // Process COMMENTS for response metrics
    // SEPARATED by as_creator vs as_assignee
    // ============================================
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
      const ticket = ticketLookup[ticketId] || ticketComments[0]?.ticket
      let foundFirstAssigneeResponse = false

      for (const comment of ticketComments) {
        const userId = comment.user_id
        const ticketCreatorId = comment.ticket?.created_by || ticket?.created_by
        const ticketAssigneeId = comment.ticket?.assigned_to || ticket?.assigned_to
        const isAssignee = userId === ticketAssigneeId
        const isCreator = userId === ticketCreatorId
        const responseSeconds = comment.response_time_seconds || 0

        // Ensure user exists in metrics
        if (!userMetrics[userId] && comment.user) {
          const isOps = OPS_DEPARTMENTS.includes(comment.ticket?.department || ticket?.department || '')
          userMetrics[userId] = initUserMetrics(
            userId,
            comment.user.name || 'Unknown',
            comment.user.role || 'Unknown',
            isOps
          )
        }

        if (!userMetrics[userId]) continue

        // ========== Assign response to correct category ==========
        if (isAssignee) {
          // User is ASSIGNEE of this ticket
          if (!foundFirstAssigneeResponse) {
            // First Response (assignee's first response)
            userMetrics[userId].as_assignee.first_response_count++
            userMetrics[userId].as_assignee.first_response_total_seconds += responseSeconds
            foundFirstAssigneeResponse = true
          } else {
            // Stage Response (assignee's subsequent responses)
            userMetrics[userId].as_assignee.stage_response_count++
            userMetrics[userId].as_assignee.stage_response_total_seconds += responseSeconds
          }
        } else if (isCreator) {
          // User is CREATOR of this ticket (all their responses are stage responses)
          userMetrics[userId].as_creator.stage_response_count++
          userMetrics[userId].as_creator.stage_response_total_seconds += responseSeconds
        }
        // If user is neither creator nor assignee, we skip (shouldn't happen normally)
      }
    }

    // ============================================
    // Build final user performance data
    // ============================================
    const userPerformance = Object.values(userMetrics)
      .filter(metrics =>
        // Include if user has assigned tickets OR created tickets
        metrics.as_assignee.tickets_assigned > 0 || metrics.as_creator.tickets_created > 0
      )
      .map((metrics) => {
        const assignee = metrics.as_assignee
        const creator = metrics.as_creator
        const completedTickets = assignee.tickets_resolved + assignee.tickets_closed

        // Calculate by_type detailed metrics (for assignee only)
        const byTypeDetailed: Record<string, any> = {}

        // RFQ type metrics
        const rfqData = assignee.by_type.RFQ
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
        }

        // GEN type metrics
        const genData = assignee.by_type.GEN
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

          // ========== AS CREATOR (tiket yang dia BUAT) ==========
          as_creator: {
            tickets_created: creator.tickets_created,
            stage_response: {
              count: creator.stage_response_count,
              avg_seconds: creator.stage_response_count > 0
                ? Math.round(creator.stage_response_total_seconds / creator.stage_response_count)
                : 0,
            },
          },

          // ========== AS ASSIGNEE (tiket yang di-ASSIGN ke dia) ==========
          as_assignee: {
            tickets: {
              assigned: assignee.tickets_assigned,
              resolved: assignee.tickets_resolved,
              closed: assignee.tickets_closed,
              active: assignee.tickets_assigned - completedTickets,
              completion_rate: assignee.tickets_assigned > 0
                ? Math.round((completedTickets / assignee.tickets_assigned) * 100)
                : 0,
            },
            win_loss: {
              won: assignee.tickets_won,
              lost: assignee.tickets_lost,
              win_rate: assignee.tickets_closed > 0
                ? Math.round((assignee.tickets_won / assignee.tickets_closed) * 100)
                : 0,
            },
            sla: {
              first_response: {
                met: assignee.sla_fr_met,
                breached: assignee.sla_fr_breached,
                compliance_rate: (assignee.sla_fr_met + assignee.sla_fr_breached) > 0
                  ? Math.round((assignee.sla_fr_met / (assignee.sla_fr_met + assignee.sla_fr_breached)) * 100)
                  : 0,
              },
              resolution: {
                met: assignee.sla_res_met,
                breached: assignee.sla_res_breached,
                compliance_rate: (assignee.sla_res_met + assignee.sla_res_breached) > 0
                  ? Math.round((assignee.sla_res_met / (assignee.sla_res_met + assignee.sla_res_breached)) * 100)
                  : 0,
              },
            },
            first_response: {
              count: assignee.first_response_count,
              avg_seconds: assignee.first_response_count > 0
                ? Math.round(assignee.first_response_total_seconds / assignee.first_response_count)
                : 0,
            },
            stage_response: {
              count: assignee.stage_response_count,
              avg_seconds: assignee.stage_response_count > 0
                ? Math.round(assignee.stage_response_total_seconds / assignee.stage_response_count)
                : 0,
            },
            first_quote: metrics.is_ops ? {
              count: assignee.first_quote_count,
              avg_seconds: assignee.first_quote_count > 0
                ? Math.round(assignee.first_quote_total_seconds / assignee.first_quote_count)
                : 0,
            } : null,
            avg_resolution_seconds: completedTickets > 0
              ? Math.round((assignee.total_resolution_hours * 3600) / completedTickets)
              : 0,
            avg_resolution_hours: completedTickets > 0
              ? Math.round((assignee.total_resolution_hours / completedTickets) * 10) / 10
              : 0,
            by_type: byTypeDetailed,
            by_status: assignee.by_status,
            by_priority: assignee.by_priority,
          },
        }
      })

    // Sort by assigned tickets (primary) then created tickets (secondary)
    userPerformance.sort((a, b) => {
      const aAssigned = a.as_assignee.tickets.assigned
      const bAssigned = b.as_assignee.tickets.assigned
      if (bAssigned !== aAssigned) return bAssigned - aAssigned
      return b.as_creator.tickets_created - a.as_creator.tickets_created
    })

    // Check if user can view rankings
    const showRankings = canViewAnalyticsRankings(profile.role)

    // ============================================
    // LEADERBOARD - Only users with assigned tickets
    // ============================================
    const usersWithAssignedTickets = userPerformance.filter(u => u.as_assignee.tickets.assigned > 0)

    const leaderboard = showRankings ? {
      // Most assigned tickets
      most_tickets: [...usersWithAssignedTickets]
        .sort((a, b) => b.as_assignee.tickets.assigned - a.as_assignee.tickets.assigned)
        .slice(0, 5),

      // Highest completion rate (must have completed at least 1 ticket)
      highest_completion_rate: [...usersWithAssignedTickets]
        .filter(u => (u.as_assignee.tickets.resolved + u.as_assignee.tickets.closed) > 0)
        .sort((a, b) => b.as_assignee.tickets.completion_rate - a.as_assignee.tickets.completion_rate)
        .slice(0, 5),

      // Best SLA compliance (must have SLA data)
      best_sla_compliance: [...usersWithAssignedTickets]
        .filter(u =>
          (u.as_assignee.sla.first_response.met + u.as_assignee.sla.first_response.breached +
           u.as_assignee.sla.resolution.met + u.as_assignee.sla.resolution.breached) > 0
        )
        .sort((a, b) =>
          ((b.as_assignee.sla.first_response.compliance_rate + b.as_assignee.sla.resolution.compliance_rate) / 2) -
          ((a.as_assignee.sla.first_response.compliance_rate + a.as_assignee.sla.resolution.compliance_rate) / 2)
        )
        .slice(0, 5),

      // Fastest first response (must have at least 1 first response as assignee)
      fastest_first_response: [...usersWithAssignedTickets]
        .filter(u => u.as_assignee.first_response.count > 0 && u.as_assignee.first_response.avg_seconds > 0)
        .sort((a, b) => a.as_assignee.first_response.avg_seconds - b.as_assignee.first_response.avg_seconds)
        .slice(0, 5),

      // Fastest stage response (assignee stage response only)
      fastest_stage_response: [...usersWithAssignedTickets]
        .filter(u => u.as_assignee.stage_response.count > 0 && u.as_assignee.stage_response.avg_seconds > 0)
        .sort((a, b) => a.as_assignee.stage_response.avg_seconds - b.as_assignee.stage_response.avg_seconds)
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
