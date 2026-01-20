import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, canViewAllTickets } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/dashboard/response-time - Get response time analytics
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const department = searchParams.get('department')
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

    const canViewAll = canViewAllTickets(profile.role)

    // Calculate date range
    const periodDays = parseInt(period)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - periodDays)

    // Fetch comments with response time data
    let query = (supabase as any)
      .from('ticket_comments')
      .select(`
        id,
        ticket_id,
        is_internal,
        response_time_seconds,
        response_direction,
        created_at,
        ticket:tickets!ticket_comments_ticket_id_fkey(
          id,
          department,
          ticket_type,
          created_by,
          assigned_to
        ),
        user:profiles!ticket_comments_user_id_fkey(user_id, name, role)
      `)
      .gte('created_at', startDate.toISOString())
      .eq('is_internal', false)
      .not('response_time_seconds', 'is', null)
      .order('created_at', { ascending: false })

    const { data: comments, error: commentsError } = await query

    if (commentsError) {
      console.error('Error fetching comments:', commentsError)
      return NextResponse.json({ error: commentsError.message }, { status: 500 })
    }

    // Filter by access
    let filteredComments = comments || []
    if (!canViewAll) {
      filteredComments = filteredComments.filter((c: any) =>
        c.ticket?.created_by === user.id || c.ticket?.assigned_to === user.id
      )
    }
    if (department) {
      filteredComments = filteredComments.filter((c: any) => c.ticket?.department === department)
    }

    // Calculate metrics
    const outboundComments = filteredComments.filter((c: any) => c.response_direction === 'outbound')

    const totalResponses = outboundComments.length
    const avgResponseSeconds = totalResponses > 0
      ? outboundComments.reduce((sum: number, c: any) => sum + (c.response_time_seconds || 0), 0) / totalResponses
      : 0

    // Convert to hours/minutes
    const avgResponseHours = avgResponseSeconds / 3600
    const avgResponseMinutes = avgResponseSeconds / 60

    // Response time distribution
    const under1Hour = outboundComments.filter((c: any) => c.response_time_seconds <= 3600).length
    const under4Hours = outboundComments.filter((c: any) => c.response_time_seconds <= 14400).length
    const under24Hours = outboundComments.filter((c: any) => c.response_time_seconds <= 86400).length
    const over24Hours = outboundComments.filter((c: any) => c.response_time_seconds > 86400).length

    // By department
    const departments = ['MKT', 'SAL', 'DOM', 'EXI', 'DTD', 'TRF']
    const byDepartment: Record<string, any> = {}

    for (const dept of departments) {
      const deptComments = outboundComments.filter((c: any) => c.ticket?.department === dept)
      const deptTotal = deptComments.length
      const deptAvg = deptTotal > 0
        ? deptComments.reduce((sum: number, c: any) => sum + (c.response_time_seconds || 0), 0) / deptTotal
        : 0

      byDepartment[dept] = {
        total_responses: deptTotal,
        avg_response_seconds: Math.round(deptAvg),
        avg_response_hours: Math.round(deptAvg / 3600 * 10) / 10,
        under_1_hour: deptComments.filter((c: any) => c.response_time_seconds <= 3600).length,
        under_4_hours: deptComments.filter((c: any) => c.response_time_seconds <= 14400).length,
      }
    }

    // By user (top responders)
    const userResponseTimes: Record<string, { name: string; count: number; totalSeconds: number }> = {}
    for (const comment of outboundComments) {
      const userId = comment.user?.user_id
      const userName = comment.user?.name || 'Unknown'
      if (!userResponseTimes[userId]) {
        userResponseTimes[userId] = { name: userName, count: 0, totalSeconds: 0 }
      }
      userResponseTimes[userId].count++
      userResponseTimes[userId].totalSeconds += comment.response_time_seconds || 0
    }

    const topResponders = Object.entries(userResponseTimes)
      .map(([userId, data]) => ({
        user_id: userId,
        name: data.name,
        total_responses: data.count,
        avg_response_hours: Math.round(data.totalSeconds / data.count / 3600 * 10) / 10,
      }))
      .sort((a, b) => b.total_responses - a.total_responses)
      .slice(0, 10)

    // Daily trend (last 7 days)
    const dailyTrend: { date: string; count: number; avg_hours: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      date.setHours(0, 0, 0, 0)
      const nextDate = new Date(date)
      nextDate.setDate(nextDate.getDate() + 1)

      const dayComments = outboundComments.filter((c: any) => {
        const commentDate = new Date(c.created_at)
        return commentDate >= date && commentDate < nextDate
      })

      const dayAvg = dayComments.length > 0
        ? dayComments.reduce((sum: number, c: any) => sum + (c.response_time_seconds || 0), 0) / dayComments.length
        : 0

      dailyTrend.push({
        date: date.toISOString().split('T')[0],
        count: dayComments.length,
        avg_hours: Math.round(dayAvg / 3600 * 10) / 10,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        period_days: periodDays,
        overall: {
          total_responses: totalResponses,
          avg_response_seconds: Math.round(avgResponseSeconds),
          avg_response_minutes: Math.round(avgResponseMinutes),
          avg_response_hours: Math.round(avgResponseHours * 10) / 10,
        },
        distribution: {
          under_1_hour: under1Hour,
          under_4_hours: under4Hours,
          under_24_hours: under24Hours,
          over_24_hours: over24Hours,
        },
        distribution_percentages: {
          under_1_hour: totalResponses > 0 ? Math.round((under1Hour / totalResponses) * 100) : 0,
          under_4_hours: totalResponses > 0 ? Math.round((under4Hours / totalResponses) * 100) : 0,
          under_24_hours: totalResponses > 0 ? Math.round((under24Hours / totalResponses) * 100) : 0,
          over_24_hours: totalResponses > 0 ? Math.round((over24Hours / totalResponses) * 100) : 0,
        },
        by_department: byDepartment,
        top_responders: topResponders,
        daily_trend: dailyTrend,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
