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
    const month = searchParams.get('month') // format: 2026-02
    const now = new Date()
    const year = month ? parseInt(month.split('-')[0]) : now.getFullYear()
    const mon = month ? parseInt(month.split('-')[1]) : now.getMonth() + 1
    const startOfMonth = `${year}-${String(mon).padStart(2, '0')}-01`
    const endOfMonth = new Date(year, mon, 0).toISOString().split('T')[0]

    // All plans this month (include realization data)
    const { data: monthPlans } = await (supabase as any)
      .from('marketing_content_plans')
      .select('id, status, platform, content_type, scheduled_date, linked_content_id, actual_post_url, realized_at, actual_views, actual_likes, actual_comments, actual_shares, actual_engagement_rate')
      .gte('scheduled_date', startOfMonth)
      .lte('scheduled_date', endOfMonth)
      .is('parent_plan_id', null)

    const plans = monthPlans || []

    // Overall KPIs
    const kpis = {
      totalPlanned: plans.length,
      published: plans.filter((p: any) => p.status === 'published').length,
      inReview: plans.filter((p: any) => p.status === 'in_review').length,
      draft: plans.filter((p: any) => p.status === 'draft').length,
      approved: plans.filter((p: any) => p.status === 'approved').length,
      rejected: plans.filter((p: any) => p.status === 'rejected').length,
      realized: plans.filter((p: any) => p.realized_at).length,
      withEvidence: plans.filter((p: any) => p.actual_post_url).length,
      completionRate: plans.length > 0
        ? Math.round((plans.filter((p: any) => p.status === 'published').length / plans.length) * 100)
        : 0,
    }

    // Per-channel KPIs
    const platforms = ['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin', 'twitter']
    const channelKpis = platforms.map(platform => {
      const pp = plans.filter((p: any) => p.platform === platform)
      return {
        platform,
        total: pp.length,
        published: pp.filter((p: any) => p.status === 'published').length,
        draft: pp.filter((p: any) => p.status === 'draft').length,
        inReview: pp.filter((p: any) => p.status === 'in_review').length,
        approved: pp.filter((p: any) => p.status === 'approved').length,
        rejected: pp.filter((p: any) => p.status === 'rejected').length,
        realized: pp.filter((p: any) => p.realized_at).length,
        withEvidence: pp.filter((p: any) => p.actual_post_url).length,
        completionRate: pp.length > 0 ? Math.round((pp.filter((p: any) => p.status === 'published').length / pp.length) * 100) : 0,
      }
    }).filter(c => c.total > 0)

    // Content type distribution
    const contentTypeDist: Record<string, number> = {}
    plans.forEach((p: any) => {
      contentTypeDist[p.content_type] = (contentTypeDist[p.content_type] || 0) + 1
    })

    // Status distribution for chart
    const statusDist = {
      draft: kpis.draft,
      in_review: kpis.inReview,
      approved: kpis.approved,
      published: kpis.published,
      rejected: kpis.rejected,
    }

    // Upcoming this week
    const today = now.toISOString().split('T')[0]
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data: upcoming } = await (supabase as any)
      .from('marketing_content_plans')
      .select('id, title, platform, content_type, scheduled_date, scheduled_time, status, priority, assigned_to, campaign:marketing_content_campaigns(name, color)')
      .gte('scheduled_date', today)
      .lte('scheduled_date', nextWeek)
      .in('status', ['draft', 'in_review', 'approved'])
      .order('scheduled_date', { ascending: true })
      .limit(10)

    // Needs attention: overdue (past date, not published/archived) + rejected
    const { data: needsAttention } = await (supabase as any)
      .from('marketing_content_plans')
      .select('id, title, platform, content_type, scheduled_date, status, priority, created_by, creator:profiles!marketing_content_plans_created_by_fkey(name)')
      .or(`and(scheduled_date.lt.${today},status.in.(draft,in_review,approved)),status.eq.rejected`)
      .order('scheduled_date', { ascending: true })
      .limit(10)

    // Published but not realized (need evidence)
    const { data: needsRealization } = await (supabase as any)
      .from('marketing_content_plans')
      .select('id, title, platform, content_type, scheduled_date, status, published_at, actual_post_url')
      .eq('status', 'published')
      .is('realized_at', null)
      .order('published_at', { ascending: true })
      .limit(10)

    // Recent activity
    const { data: recentActivity } = await (supabase as any)
      .from('marketing_content_activity_log')
      .select('*, actor:profiles!marketing_content_activity_log_user_id_fkey(name, role)')
      .order('created_at', { ascending: false })
      .limit(15)

    return NextResponse.json({
      kpis,
      channelKpis,
      contentTypeDist,
      statusDist,
      upcoming: upcoming || [],
      needsAttention: needsAttention || [],
      needsRealization: needsRealization || [],
      recentActivity: recentActivity || [],
    })
  } catch (error) {
    console.error('Error fetching overview:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
