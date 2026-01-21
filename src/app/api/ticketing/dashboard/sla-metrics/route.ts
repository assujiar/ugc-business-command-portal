import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessTicketing, getAnalyticsScope } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

interface ProfileData {
  user_id: string
  role: UserRole
}

// GET /api/ticketing/dashboard/sla-metrics - Get SLA compliance metrics
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const departmentFilter = searchParams.get('department')
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

    // Calculate date range
    const periodDays = parseInt(period)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - periodDays)

    // Build query for SLA tracking data
    let query = (supabase as any)
      .from('ticket_sla_tracking')
      .select(`
        *,
        ticket:tickets!ticket_sla_tracking_ticket_id_fkey(
          id,
          ticket_code,
          status,
          department,
          ticket_type,
          created_by,
          assigned_to,
          created_at
        )
      `)
      .gte('created_at', startDate.toISOString())

    const { data: slaData, error: slaError } = await query

    if (slaError) {
      console.error('Error fetching SLA data:', slaError)
      return NextResponse.json({ error: slaError.message }, { status: 500 })
    }

    // Filter by analytics scope
    let filteredData = slaData || []
    if (analyticsScope.scope === 'user') {
      // User scope: only see their own tickets
      filteredData = filteredData.filter((s: any) =>
        s.ticket?.created_by === user.id || s.ticket?.assigned_to === user.id
      )
    } else if (analyticsScope.scope === 'department') {
      // Department scope: see department tickets
      if (analyticsScope.department) {
        filteredData = filteredData.filter((s: any) => s.ticket?.department === analyticsScope.department)
      }
    }
    // 'all' scope: no additional filtering

    // Allow optional department filter override (for admins)
    if (departmentFilter && analyticsScope.scope === 'all') {
      filteredData = filteredData.filter((s: any) => s.ticket?.department === departmentFilter)
    }

    // Calculate SLA metrics
    const totalWithSLA = filteredData.length
    const withFirstResponse = filteredData.filter((s: any) => s.first_response_at !== null)
    const withResolution = filteredData.filter((s: any) => s.resolution_at !== null)

    const firstResponseMet = withFirstResponse.filter((s: any) => s.first_response_met === true).length
    const firstResponseBreached = withFirstResponse.filter((s: any) => s.first_response_met === false).length

    const resolutionMet = withResolution.filter((s: any) => s.resolution_met === true).length
    const resolutionBreached = withResolution.filter((s: any) => s.resolution_met === false).length

    // Calculate compliance rates
    const firstResponseCompliance = withFirstResponse.length > 0
      ? Math.round((firstResponseMet / withFirstResponse.length) * 100)
      : 100

    const resolutionCompliance = withResolution.length > 0
      ? Math.round((resolutionMet / withResolution.length) * 100)
      : 100

    // Calculate average times in seconds
    const avgFirstResponseSeconds = withFirstResponse.length > 0
      ? withFirstResponse.reduce((sum: number, s: any) => {
          const created = new Date(s.created_at)
          const responded = new Date(s.first_response_at)
          return sum + (responded.getTime() - created.getTime()) / 1000
        }, 0) / withFirstResponse.length
      : 0

    const avgResolutionSeconds = withResolution.length > 0
      ? withResolution.reduce((sum: number, s: any) => {
          const created = new Date(s.created_at)
          const resolved = new Date(s.resolution_at)
          return sum + (resolved.getTime() - created.getTime()) / 1000
        }, 0) / withResolution.length
      : 0

    // SLA by department
    const departments = ['MKT', 'SAL', 'DOM', 'EXI', 'DTD', 'TRF']
    const byDepartment: Record<string, any> = {}

    for (const dept of departments) {
      const deptData = filteredData.filter((s: any) => s.ticket?.department === dept)
      const deptWithFR = deptData.filter((s: any) => s.first_response_at !== null)
      const deptWithRes = deptData.filter((s: any) => s.resolution_at !== null)

      byDepartment[dept] = {
        total: deptData.length,
        first_response: {
          met: deptWithFR.filter((s: any) => s.first_response_met === true).length,
          breached: deptWithFR.filter((s: any) => s.first_response_met === false).length,
          pending: deptData.length - deptWithFR.length,
          compliance_rate: deptWithFR.length > 0
            ? Math.round((deptWithFR.filter((s: any) => s.first_response_met === true).length / deptWithFR.length) * 100)
            : 100,
        },
        resolution: {
          met: deptWithRes.filter((s: any) => s.resolution_met === true).length,
          breached: deptWithRes.filter((s: any) => s.resolution_met === false).length,
          pending: deptData.length - deptWithRes.length,
          compliance_rate: deptWithRes.length > 0
            ? Math.round((deptWithRes.filter((s: any) => s.resolution_met === true).length / deptWithRes.length) * 100)
            : 100,
        },
      }
    }

    // SLA by ticket type
    const byType: Record<string, any> = {}
    for (const type of ['RFQ', 'GEN']) {
      const typeData = filteredData.filter((s: any) => s.ticket?.ticket_type === type)
      const typeWithFR = typeData.filter((s: any) => s.first_response_at !== null)
      const typeWithRes = typeData.filter((s: any) => s.resolution_at !== null)

      byType[type] = {
        total: typeData.length,
        first_response_compliance: typeWithFR.length > 0
          ? Math.round((typeWithFR.filter((s: any) => s.first_response_met === true).length / typeWithFR.length) * 100)
          : 100,
        resolution_compliance: typeWithRes.length > 0
          ? Math.round((typeWithRes.filter((s: any) => s.resolution_met === true).length / typeWithRes.length) * 100)
          : 100,
      }
    }

    // At-risk tickets (approaching SLA breach)
    const atRiskTickets = filteredData.filter((s: any) => {
      if (s.first_response_at) return false // Already responded
      const created = new Date(s.created_at)
      const now = new Date()
      const hoursPassed = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
      const threshold = s.first_response_sla_hours * 0.75 // 75% of SLA
      return hoursPassed >= threshold
    }).length

    return NextResponse.json({
      success: true,
      data: {
        period_days: periodDays,
        overall: {
          total_tickets: totalWithSLA,
          first_response: {
            met: firstResponseMet,
            breached: firstResponseBreached,
            pending: totalWithSLA - withFirstResponse.length,
            compliance_rate: firstResponseCompliance,
            avg_seconds: Math.round(avgFirstResponseSeconds),
            avg_hours: Math.round(avgFirstResponseSeconds / 3600 * 10) / 10,
          },
          resolution: {
            met: resolutionMet,
            breached: resolutionBreached,
            pending: totalWithSLA - withResolution.length,
            compliance_rate: resolutionCompliance,
            avg_seconds: Math.round(avgResolutionSeconds),
            avg_hours: Math.round(avgResolutionSeconds / 3600 * 10) / 10,
          },
        },
        by_department: byDepartment,
        by_type: byType,
        at_risk_count: atRiskTickets,
      },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
