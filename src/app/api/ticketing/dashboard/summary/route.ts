import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canViewAllTickets, getUserTicketingDepartment } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/dashboard/summary - Get dashboard summary metrics
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const department = searchParams.get('department')

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

    const canViewAll = canViewAllTickets(profile.role)
    const userDepartment = getUserTicketingDepartment(profile.role)

    // Build base query conditions
    let conditions: string[] = []

    if (!canViewAll) {
      // Non-ops users only see their own tickets
      conditions.push(`(created_by.eq.${user.id},assigned_to.eq.${user.id})`)
    } else if (department) {
      // Admin/ops filtering by department
      conditions.push(`department.eq.${department}`)
    }

    // Fetch all tickets for calculations
    let query = (supabase as any)
      .from('tickets')
      .select('id, status, priority, department, ticket_type, created_at, resolved_at, closed_at')

    if (!canViewAll) {
      query = query.or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`)
    } else if (department) {
      query = query.eq('department', department)
    }

    const { data: tickets, error: ticketsError } = await query

    if (ticketsError) {
      console.error('Error fetching tickets:', ticketsError)
      return NextResponse.json({ error: ticketsError.message }, { status: 500 })
    }

    const allTickets = tickets || []

    // Calculate metrics
    const totalTickets = allTickets.length
    const openTickets = allTickets.filter((t: any) => t.status === 'open').length
    const needResponseTickets = allTickets.filter((t: any) => t.status === 'need_response').length
    const inProgressTickets = allTickets.filter((t: any) => t.status === 'in_progress').length
    const waitingCustomerTickets = allTickets.filter((t: any) => t.status === 'waiting_customer').length
    const needAdjustmentTickets = allTickets.filter((t: any) => t.status === 'need_adjustment').length
    const pendingTickets = allTickets.filter((t: any) => t.status === 'pending').length
    const resolvedTickets = allTickets.filter((t: any) => t.status === 'resolved').length
    const closedTickets = allTickets.filter((t: any) => t.status === 'closed').length

    // By priority
    const urgentTickets = allTickets.filter((t: any) => t.priority === 'urgent' && !['resolved', 'closed'].includes(t.status)).length
    const highTickets = allTickets.filter((t: any) => t.priority === 'high' && !['resolved', 'closed'].includes(t.status)).length
    const mediumTickets = allTickets.filter((t: any) => t.priority === 'medium' && !['resolved', 'closed'].includes(t.status)).length
    const lowTickets = allTickets.filter((t: any) => t.priority === 'low' && !['resolved', 'closed'].includes(t.status)).length

    // By type
    const rfqTickets = allTickets.filter((t: any) => t.ticket_type === 'RFQ').length
    const genTickets = allTickets.filter((t: any) => t.ticket_type === 'GEN').length

    // By department
    const byDepartment = allTickets.reduce((acc: Record<string, number>, t: any) => {
      acc[t.department] = (acc[t.department] || 0) + 1
      return acc
    }, {})

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recentTickets = allTickets.filter((t: any) => new Date(t.created_at) >= sevenDaysAgo).length

    // Today's tickets
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayTickets = allTickets.filter((t: any) => new Date(t.created_at) >= today).length

    // Resolved today
    const resolvedToday = allTickets.filter((t: any) =>
      t.resolved_at && new Date(t.resolved_at) >= today
    ).length

    return NextResponse.json({
      success: true,
      data: {
        total_tickets: totalTickets,
        by_status: {
          open: openTickets,
          need_response: needResponseTickets,
          in_progress: inProgressTickets,
          waiting_customer: waitingCustomerTickets,
          need_adjustment: needAdjustmentTickets,
          pending: pendingTickets,
          resolved: resolvedTickets,
          closed: closedTickets,
        },
        by_priority: {
          urgent: urgentTickets,
          high: highTickets,
          medium: mediumTickets,
          low: lowTickets,
        },
        by_type: {
          RFQ: rfqTickets,
          GEN: genTickets,
        },
        by_department: byDepartment,
        activity: {
          created_last_7_days: recentTickets,
          created_today: todayTickets,
          resolved_today: resolvedToday,
        },
        active_tickets: openTickets + needResponseTickets + inProgressTickets + waitingCustomerTickets + needAdjustmentTickets + pendingTickets,
        completed_tickets: resolvedTickets + closedTickets,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
