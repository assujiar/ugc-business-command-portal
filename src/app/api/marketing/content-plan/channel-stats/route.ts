import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/marketing/content-plan/channel-stats
 * Returns per-platform statistics for content plans
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    const now = new Date()
    const year = month ? parseInt(month.split('-')[0]) : now.getFullYear()
    const mon = month ? parseInt(month.split('-')[1]) : now.getMonth() + 1
    const startOfMonth = `${year}-${String(mon).padStart(2, '0')}-01`
    const endOfMonth = new Date(year, mon, 0).toISOString().split('T')[0]
    const today = now.toISOString().split('T')[0]

    // Get all plans for the month with realization data
    const { data: allPlans } = await (supabase as any)
      .from('marketing_content_plans')
      .select('id, platform, status, content_type, scheduled_date, actual_post_url, actual_views, actual_likes, actual_comments, actual_shares, actual_engagement_rate, actual_reach, actual_impressions, realized_at, target_views, target_likes, target_comments, target_shares, target_engagement_rate')
      .gte('scheduled_date', startOfMonth)
      .lte('scheduled_date', endOfMonth)
      .is('parent_plan_id', null)

    const plans = allPlans || []
    const platforms = ['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin', 'twitter']

    // Build per-platform stats
    const channelStats = platforms.map(platform => {
      const platformPlans = plans.filter((p: any) => p.platform === platform)
      const published = platformPlans.filter((p: any) => p.status === 'published')
      const realized = platformPlans.filter((p: any) => p.realized_at)
      const overdue = platformPlans.filter((p: any) => p.status !== 'published' && p.scheduled_date < today)

      // Content type distribution
      const contentTypes: Record<string, number> = {}
      platformPlans.forEach((p: any) => {
        contentTypes[p.content_type] = (contentTypes[p.content_type] || 0) + 1
      })

      // Status distribution
      const statusDist: Record<string, number> = { draft: 0, planned: 0, published: 0, overdue: 0 }
      platformPlans.forEach((p: any) => {
        const isOverdue = p.status !== 'published' && p.scheduled_date < today
        if (isOverdue) {
          statusDist.overdue++
        } else {
          statusDist[p.status] = (statusDist[p.status] || 0) + 1
        }
      })

      // Aggregate actual metrics
      const totalActualViews = realized.reduce((sum: number, p: any) => sum + (p.actual_views || 0), 0)
      const totalActualLikes = realized.reduce((sum: number, p: any) => sum + (p.actual_likes || 0), 0)
      const totalActualComments = realized.reduce((sum: number, p: any) => sum + (p.actual_comments || 0), 0)
      const totalActualShares = realized.reduce((sum: number, p: any) => sum + (p.actual_shares || 0), 0)
      const avgEngagement = realized.length > 0
        ? realized.reduce((sum: number, p: any) => sum + (p.actual_engagement_rate || 0), 0) / realized.length
        : 0

      // Target metrics aggregate
      const totalTargetViews = platformPlans.reduce((sum: number, p: any) => sum + (p.target_views || 0), 0)
      const totalTargetLikes = platformPlans.reduce((sum: number, p: any) => sum + (p.target_likes || 0), 0)

      // Has evidence rate
      const withEvidence = realized.filter((p: any) => p.actual_post_url).length

      return {
        platform,
        total: platformPlans.length,
        draft: statusDist.draft,
        planned: statusDist.planned,
        published: published.length,
        overdue: overdue.length,
        realized: realized.length,
        withEvidence,
        completionRate: platformPlans.length > 0 ? Math.round((published.length / platformPlans.length) * 100) : 0,
        realizationRate: published.length > 0 ? Math.round((realized.length / published.length) * 100) : 0,
        contentTypes,
        statusDistribution: statusDist,
        metrics: {
          actualViews: totalActualViews,
          actualLikes: totalActualLikes,
          actualComments: totalActualComments,
          actualShares: totalActualShares,
          avgEngagement: Math.round(avgEngagement * 10000) / 100,
          targetViews: totalTargetViews,
          targetLikes: totalTargetLikes,
          viewsAchievement: totalTargetViews > 0 ? Math.round((totalActualViews / totalTargetViews) * 100) : 0,
          likesAchievement: totalTargetLikes > 0 ? Math.round((totalActualLikes / totalTargetLikes) * 100) : 0,
        },
      }
    })

    // Overall content type distribution
    const overallContentTypes: Record<string, number> = {}
    plans.forEach((p: any) => {
      overallContentTypes[p.content_type] = (overallContentTypes[p.content_type] || 0) + 1
    })

    // Overall status distribution
    const overallStatus: Record<string, number> = { draft: 0, planned: 0, published: 0, overdue: 0 }
    plans.forEach((p: any) => {
      const isOverdue = p.status !== 'published' && p.scheduled_date < today
      if (isOverdue) {
        overallStatus.overdue++
      } else {
        overallStatus[p.status] = (overallStatus[p.status] || 0) + 1
      }
    })

    return NextResponse.json({
      channelStats: channelStats.filter(s => s.total > 0),
      allChannelStats: channelStats,
      overallContentTypes,
      overallStatus,
      summary: {
        totalPlans: plans.length,
        totalPublished: plans.filter((p: any) => p.status === 'published').length,
        totalRealized: plans.filter((p: any) => p.realized_at).length,
        totalWithEvidence: plans.filter((p: any) => p.actual_post_url).length,
        totalOverdue: plans.filter((p: any) => p.status !== 'published' && p.scheduled_date < today).length,
        activePlatforms: channelStats.filter(s => s.total > 0).length,
      },
    })
  } catch (error) {
    console.error('Error fetching channel stats:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
