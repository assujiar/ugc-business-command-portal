import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'month'

    const now = new Date()
    let startDate: string
    if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    } else if (period === 'quarter') {
      startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().split('T')[0]
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    }

    // All requests in period
    const { data: allRequests } = await (supabase as any)
      .from('marketing_design_requests')
      .select('id, status, design_type, priority, requested_by, assigned_to, submitted_at, accepted_at, first_delivered_at, approved_at, revision_count, deadline, created_at')
      .gte('created_at', startDate)

    const requests = allRequests || []

    // KPIs
    const kpis = {
      total: requests.length,
      active: requests.filter((r: any) => !['approved', 'cancelled'].includes(r.status)).length,
      completed: requests.filter((r: any) => r.status === 'approved').length,
      cancelled: requests.filter((r: any) => r.status === 'cancelled').length,
      inProgress: requests.filter((r: any) => ['accepted', 'in_progress', 'delivered'].includes(r.status)).length,
      waitingReview: requests.filter((r: any) => r.status === 'delivered').length,
      revisionRequested: requests.filter((r: any) => r.status === 'revision_requested').length,
    }

    // Time metrics (for completed requests)
    const completed = requests.filter((r: any) => r.status === 'approved' && r.submitted_at && r.approved_at)
    let avgTurnaround = 0
    let avgFirstDelivery = 0
    let avgRevisions = 0
    let slaOnTime = 0

    if (completed.length > 0) {
      const turnarounds = completed.map((r: any) => new Date(r.approved_at).getTime() - new Date(r.submitted_at).getTime())
      avgTurnaround = turnarounds.reduce((a: number, b: number) => a + b, 0) / turnarounds.length

      const withFirstDelivery = completed.filter((r: any) => r.first_delivered_at && r.accepted_at)
      if (withFirstDelivery.length > 0) {
        const deliveryTimes = withFirstDelivery.map((r: any) => new Date(r.first_delivered_at).getTime() - new Date(r.accepted_at).getTime())
        avgFirstDelivery = deliveryTimes.reduce((a: number, b: number) => a + b, 0) / deliveryTimes.length
      }

      avgRevisions = completed.reduce((sum: number, r: any) => sum + (r.revision_count || 0), 0) / completed.length

      const withDeadline = completed.filter((r: any) => r.deadline)
      if (withDeadline.length > 0) {
        slaOnTime = withDeadline.filter((r: any) =>
          new Date(r.approved_at) <= new Date(r.deadline + 'T23:59:59')
        ).length
      }
    }

    // By design type
    const byType: Record<string, number> = {}
    requests.forEach((r: any) => { byType[r.design_type] = (byType[r.design_type] || 0) + 1 })

    // By priority
    const byPriority: Record<string, number> = {}
    requests.forEach((r: any) => { byPriority[r.priority] = (byPriority[r.priority] || 0) + 1 })

    // By status
    const byStatus: Record<string, number> = {}
    requests.forEach((r: any) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1 })

    // Top requesters
    const requesterCounts: Record<string, number> = {}
    requests.forEach((r: any) => { requesterCounts[r.requested_by] = (requesterCounts[r.requested_by] || 0) + 1 })

    // Fetch requester names
    const requesterIds = Object.keys(requesterCounts)
    let topRequesters: any[] = []
    if (requesterIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, name, role')
        .in('user_id', requesterIds)

      topRequesters = (profiles as any[] || []).map((p: any) => ({
        user_id: p.user_id,
        name: p.name,
        role: p.role,
        count: requesterCounts[p.user_id] || 0,
      })).sort((a: any, b: any) => b.count - a.count).slice(0, 5)
    }

    // Overdue requests
    const today = now.toISOString().split('T')[0]
    const overdue = requests.filter((r: any) =>
      r.deadline && r.deadline < today && !['approved', 'cancelled'].includes(r.status)
    ).length

    return NextResponse.json({
      kpis,
      timeMetrics: {
        avgTurnaroundMs: avgTurnaround,
        avgFirstDeliveryMs: avgFirstDelivery,
        avgRevisions: Math.round(avgRevisions * 10) / 10,
        slaOnTime,
        slaTotal: completed.filter((r: any) => r.deadline).length,
        completedCount: completed.length,
      },
      byType,
      byPriority,
      byStatus,
      topRequesters,
      overdue,
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
