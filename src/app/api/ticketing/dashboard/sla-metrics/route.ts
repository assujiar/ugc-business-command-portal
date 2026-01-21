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

    // Build query for SLA tracking data with metrics
    // Note: ticket_response_metrics must be joined through tickets, not directly from ticket_sla_tracking
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
          created_at,
          metrics:ticket_response_metrics!ticket_response_metrics_ticket_id_fkey(
            assignee_first_response_seconds,
            assignee_first_response_business_seconds,
            time_to_first_quote_seconds,
            time_to_first_quote_business_seconds
          )
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

    // Calculate compliance rates (0% when no data, not 100%)
    const firstResponseCompliance = withFirstResponse.length > 0
      ? Math.round((firstResponseMet / withFirstResponse.length) * 100)
      : 0

    const resolutionCompliance = withResolution.length > 0
      ? Math.round((resolutionMet / withResolution.length) * 100)
      : 0

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
            : 0,  // No data = 0%, not 100%
        },
        resolution: {
          met: deptWithRes.filter((s: any) => s.resolution_met === true).length,
          breached: deptWithRes.filter((s: any) => s.resolution_met === false).length,
          pending: deptData.length - deptWithRes.length,
          compliance_rate: deptWithRes.length > 0
            ? Math.round((deptWithRes.filter((s: any) => s.resolution_met === true).length / deptWithRes.length) * 100)
            : 0,  // No data = 0%, not 100%
        },
      }
    }

    // SLA by ticket type with detailed metrics
    const byType: Record<string, any> = {}

    // RFQ specific metrics (includes first quote SLA)
    const rfqData = filteredData.filter((s: any) => s.ticket?.ticket_type === 'RFQ')
    const rfqWithFR = rfqData.filter((s: any) => s.first_response_at !== null)
    const rfqWithRes = rfqData.filter((s: any) => s.resolution_at !== null)
    // Use metrics table for first quote time (nested inside ticket)
    const rfqWithQuote = rfqData.filter((s: any) => s.ticket?.metrics?.time_to_first_quote_seconds !== null)

    // Calculate average first quote time for RFQ from metrics
    const avgFirstQuoteSeconds = rfqWithQuote.length > 0
      ? rfqWithQuote.reduce((sum: number, s: any) => sum + (s.ticket?.metrics?.time_to_first_quote_seconds || 0), 0) / rfqWithQuote.length
      : 0

    // First quote SLA compliance (assuming 24h SLA for first quote)
    const firstQuoteSlaHours = 24
    const rfqQuoteMet = rfqWithQuote.filter((s: any) =>
      (s.ticket?.metrics?.time_to_first_quote_seconds || 0) <= firstQuoteSlaHours * 3600
    ).length
    const rfqQuoteBreached = rfqWithQuote.length - rfqQuoteMet

    // Get RFQ tickets with first response metrics
    const rfqWithFRMetrics = rfqData.filter((s: any) => s.ticket?.metrics?.assignee_first_response_seconds !== null)

    byType['RFQ'] = {
      total: rfqData.length,
      first_response: {
        met: rfqWithFR.filter((s: any) => s.first_response_met === true).length,
        breached: rfqWithFR.filter((s: any) => s.first_response_met === false).length,
        pending: rfqData.length - rfqWithFR.length,
        compliance_rate: rfqWithFR.length > 0
          ? Math.round((rfqWithFR.filter((s: any) => s.first_response_met === true).length / rfqWithFR.length) * 100)
          : 0,  // No data = 0%, not 100%
        avg_seconds: rfqWithFRMetrics.length > 0
          ? Math.round(rfqWithFRMetrics.reduce((sum: number, s: any) =>
              sum + (s.ticket?.metrics?.assignee_first_response_seconds || 0), 0) / rfqWithFRMetrics.length)
          : 0,
      },
      first_quote: {
        met: rfqQuoteMet,
        breached: rfqQuoteBreached,
        pending: rfqData.length - rfqWithQuote.length,
        compliance_rate: rfqWithQuote.length > 0
          ? Math.round((rfqQuoteMet / rfqWithQuote.length) * 100)
          : 0,  // No data = 0%, not 100%
        avg_seconds: Math.round(avgFirstQuoteSeconds),
        sla_hours: firstQuoteSlaHours,
      },
      resolution: {
        met: rfqWithRes.filter((s: any) => s.resolution_met === true).length,
        breached: rfqWithRes.filter((s: any) => s.resolution_met === false).length,
        pending: rfqData.length - rfqWithRes.length,
        compliance_rate: rfqWithRes.length > 0
          ? Math.round((rfqWithRes.filter((s: any) => s.resolution_met === true).length / rfqWithRes.length) * 100)
          : 0,  // No data = 0%, not 100%
        avg_seconds: rfqWithRes.length > 0
          ? Math.round(rfqWithRes.reduce((sum: number, s: any) => {
              const created = new Date(s.created_at)
              const resolved = new Date(s.resolution_at)
              return sum + (resolved.getTime() - created.getTime()) / 1000
            }, 0) / rfqWithRes.length)
          : 0,
      },
      at_risk: rfqData.filter((s: any) => {
        if (s.first_response_at) return false
        const created = new Date(s.created_at)
        const now = new Date()
        const hoursPassed = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
        return hoursPassed >= (s.first_response_sla_hours || 4) * 0.75
      }).length,
    }

    // GEN specific metrics
    const genData = filteredData.filter((s: any) => s.ticket?.ticket_type === 'GEN')
    const genWithFR = genData.filter((s: any) => s.first_response_at !== null)
    const genWithRes = genData.filter((s: any) => s.resolution_at !== null)
    const genWithFRMetrics = genData.filter((s: any) => s.ticket?.metrics?.assignee_first_response_seconds !== null)

    byType['GEN'] = {
      total: genData.length,
      first_response: {
        met: genWithFR.filter((s: any) => s.first_response_met === true).length,
        breached: genWithFR.filter((s: any) => s.first_response_met === false).length,
        pending: genData.length - genWithFR.length,
        compliance_rate: genWithFR.length > 0
          ? Math.round((genWithFR.filter((s: any) => s.first_response_met === true).length / genWithFR.length) * 100)
          : 0,  // No data = 0%, not 100%
        avg_seconds: genWithFRMetrics.length > 0
          ? Math.round(genWithFRMetrics.reduce((sum: number, s: any) =>
              sum + (s.ticket?.metrics?.assignee_first_response_seconds || 0), 0) / genWithFRMetrics.length)
          : 0,
      },
      resolution: {
        met: genWithRes.filter((s: any) => s.resolution_met === true).length,
        breached: genWithRes.filter((s: any) => s.resolution_met === false).length,
        pending: genData.length - genWithRes.length,
        compliance_rate: genWithRes.length > 0
          ? Math.round((genWithRes.filter((s: any) => s.resolution_met === true).length / genWithRes.length) * 100)
          : 0,  // No data = 0%, not 100%
        avg_seconds: genWithRes.length > 0
          ? Math.round(genWithRes.reduce((sum: number, s: any) => {
              const created = new Date(s.created_at)
              const resolved = new Date(s.resolution_at)
              return sum + (resolved.getTime() - created.getTime()) / 1000
            }, 0) / genWithRes.length)
          : 0,
      },
      at_risk: genData.filter((s: any) => {
        if (s.first_response_at) return false
        const created = new Date(s.created_at)
        const now = new Date()
        const hoursPassed = (now.getTime() - created.getTime()) / (1000 * 60 * 60)
        return hoursPassed >= (s.first_response_sla_hours || 4) * 0.75
      }).length,
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
