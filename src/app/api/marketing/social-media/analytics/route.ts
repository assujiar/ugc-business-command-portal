// =====================================================
// GET /api/marketing/social-media/analytics
// Returns social media analytics data for dashboard
// Reads from local database (no external API calls)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const VALID_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin']

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get profile for role check
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: string } | null }

    if (!profile || !canAccessMarketingPanel(profile.role as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform')
    const customStartDate = searchParams.get('start_date')
    const customEndDate = searchParams.get('end_date')
    const days = customStartDate && customEndDate
      ? Math.ceil((new Date(customEndDate).getTime() - new Date(customStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      : Math.min(parseInt(searchParams.get('days') || '30', 10), 365)

    if (platform && !VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }

    // Note: Tables not yet in generated types (migration 154), cast as any
    const adminClient = createAdminClient() as any
    let startDateStr: string
    let endDateStr: string | null = null

    if (customStartDate && customEndDate) {
      startDateStr = customStartDate
      endDateStr = customEndDate
    } else {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      startDateStr = startDate.toISOString().split('T')[0]
    }

    // 1. Get daily summaries for the period
    let summaryQuery = adminClient
      .from('marketing_social_media_daily_summary')
      .select('*')
      .gte('summary_date', startDateStr)
      .order('summary_date', { ascending: true })

    if (endDateStr) {
      summaryQuery = summaryQuery.lte('summary_date', endDateStr)
    }

    if (platform) {
      summaryQuery = summaryQuery.eq('platform', platform)
    }

    // 2. Get latest snapshot per platform
    let snapshotQuery = adminClient
      .from('marketing_social_media_analytics')
      .select('*')
      .eq('fetch_status', 'success')
      .order('fetched_at', { ascending: false })

    if (platform) {
      snapshotQuery = snapshotQuery.eq('platform', platform).limit(1)
    } else {
      snapshotQuery = snapshotQuery.limit(5) // one per platform
    }

    const [
      { data: dailySummaries, error: summaryError },
      { data: snapshots, error: snapshotError },
    ] = await Promise.all([summaryQuery, snapshotQuery]) as any[]

    if (summaryError) {
      console.error('Summary query error:', summaryError)
      return NextResponse.json({ error: summaryError.message }, { status: 500 })
    }

    if (snapshotError) {
      console.error('Snapshot query error:', snapshotError)
      return NextResponse.json({ error: snapshotError.message }, { status: 500 })
    }

    // 3. Compute aggregated summaries per platform
    const platformSummaries = VALID_PLATFORMS
      .filter(p => !platform || p === platform)
      .map(p => {
        const platformData = (dailySummaries || []).filter((d: any) => d.platform === p)
        const latestDay = platformData[platformData.length - 1]

        return {
          platform: p,
          followers_count: latestDay?.followers_count || 0,
          followers_gained: platformData.reduce((sum: number, d: any) => sum + (d.followers_gained || 0), 0),
          views_gained: platformData.reduce((sum: number, d: any) => sum + (d.views_gained || 0), 0),
          likes_gained: platformData.reduce((sum: number, d: any) => sum + (d.likes_gained || 0), 0),
          comments_gained: platformData.reduce((sum: number, d: any) => sum + (d.comments_gained || 0), 0),
          shares_gained: platformData.reduce((sum: number, d: any) => sum + (d.shares_gained || 0), 0),
          avg_engagement_rate: platformData.length > 0
            ? platformData.reduce((sum: number, d: any) => sum + (d.avg_engagement_rate || 0), 0) / platformData.length
            : 0,
        }
      })

    // 4. Pivot daily summaries for chart data (include likes, comments, shares)
    const dateMap = new Map<string, any>()
    for (const row of (dailySummaries || [])) {
      const date = row.summary_date
      if (!dateMap.has(date)) {
        dateMap.set(date, { date })
      }
      const entry = dateMap.get(date)
      const p = row.platform
      entry[`${p}_followers`] = row.followers_count || 0
      entry[`${p}_engagement`] = row.avg_engagement_rate || 0
      entry[`${p}_views`] = row.views_gained || 0
      entry[`${p}_likes`] = row.likes_gained || 0
      entry[`${p}_comments`] = row.comments_gained || 0
      entry[`${p}_shares`] = row.shares_gained || 0
      entry[`${p}_reach`] = row.avg_reach || 0
      entry[`${p}_impressions`] = row.avg_impressions || 0
      entry[`${p}_followers_gained`] = row.followers_gained || 0
    }

    const dailyChartData = Array.from(dateMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // 5. Compute weekly comparison (this week vs last week)
    const now = new Date()
    const dayOfWeek = now.getDay() // 0=Sun
    const thisWeekStart = new Date(now)
    thisWeekStart.setDate(now.getDate() - dayOfWeek)
    thisWeekStart.setHours(0, 0, 0, 0)
    const lastWeekStart = new Date(thisWeekStart)
    lastWeekStart.setDate(lastWeekStart.getDate() - 7)
    const lastWeekEnd = new Date(thisWeekStart)
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1)

    const thisWeekStr = thisWeekStart.toISOString().split('T')[0]
    const lastWeekStartStr = lastWeekStart.toISOString().split('T')[0]
    const lastWeekEndStr = lastWeekEnd.toISOString().split('T')[0]

    const weeklyComparison = VALID_PLATFORMS
      .filter(p => !platform || p === platform)
      .map(p => {
        const allData = (dailySummaries || []).filter((d: any) => d.platform === p)
        const thisWeek = allData.filter((d: any) => d.summary_date >= thisWeekStr)
        const lastWeek = allData.filter(
          (d: any) => d.summary_date >= lastWeekStartStr && d.summary_date <= lastWeekEndStr
        )

        const sumField = (arr: any[], field: string) =>
          arr.reduce((sum: number, d: any) => sum + (d[field] || 0), 0)
        const avgField = (arr: any[], field: string) =>
          arr.length > 0 ? arr.reduce((sum: number, d: any) => sum + (d[field] || 0), 0) / arr.length : 0

        const tw = {
          views: sumField(thisWeek, 'views_gained'),
          likes: sumField(thisWeek, 'likes_gained'),
          comments: sumField(thisWeek, 'comments_gained'),
          shares: sumField(thisWeek, 'shares_gained'),
          followers_gained: sumField(thisWeek, 'followers_gained'),
          engagement: avgField(thisWeek, 'avg_engagement_rate'),
          reach: sumField(thisWeek, 'avg_reach'),
          impressions: sumField(thisWeek, 'avg_impressions'),
        }
        const lw = {
          views: sumField(lastWeek, 'views_gained'),
          likes: sumField(lastWeek, 'likes_gained'),
          comments: sumField(lastWeek, 'comments_gained'),
          shares: sumField(lastWeek, 'shares_gained'),
          followers_gained: sumField(lastWeek, 'followers_gained'),
          engagement: avgField(lastWeek, 'avg_engagement_rate'),
          reach: sumField(lastWeek, 'avg_reach'),
          impressions: sumField(lastWeek, 'avg_impressions'),
        }

        const pctChange = (curr: number, prev: number) =>
          prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100)

        return {
          platform: p,
          this_week: tw,
          last_week: lw,
          changes: {
            views: pctChange(tw.views, lw.views),
            likes: pctChange(tw.likes, lw.likes),
            comments: pctChange(tw.comments, lw.comments),
            shares: pctChange(tw.shares, lw.shares),
            followers_gained: pctChange(tw.followers_gained, lw.followers_gained),
            engagement: pctChange(tw.engagement, lw.engagement),
            reach: pctChange(tw.reach, lw.reach),
            impressions: pctChange(tw.impressions, lw.impressions),
          },
        }
      })

    // 6. Compute weekly aggregated chart data (group daily into weeks)
    const weeklyChartData: any[] = []
    const sortedDaily = Array.from(dateMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Group into weeks
    const weekBuckets = new Map<string, any[]>()
    for (const day of sortedDaily) {
      const d = new Date(day.date)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay())
      const weekKey = weekStart.toISOString().split('T')[0]
      if (!weekBuckets.has(weekKey)) weekBuckets.set(weekKey, [])
      weekBuckets.get(weekKey)!.push(day)
    }

    for (const [weekKey, days] of Array.from(weekBuckets.entries())) {
      const weekEnd = new Date(weekKey)
      weekEnd.setDate(weekEnd.getDate() + 6)
      const entry: any = {
        week: weekKey,
        week_label: `${new Date(weekKey).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`,
      }

      const activePlats = VALID_PLATFORMS.filter(p => !platform || p === platform)
      for (const p of activePlats) {
        entry[`${p}_views`] = days.reduce((s: number, d: any) => s + (d[`${p}_views`] || 0), 0)
        entry[`${p}_likes`] = days.reduce((s: number, d: any) => s + (d[`${p}_likes`] || 0), 0)
        entry[`${p}_comments`] = days.reduce((s: number, d: any) => s + (d[`${p}_comments`] || 0), 0)
        entry[`${p}_shares`] = days.reduce((s: number, d: any) => s + (d[`${p}_shares`] || 0), 0)
        entry[`${p}_followers_gained`] = days.reduce((s: number, d: any) => s + (d[`${p}_followers_gained`] || 0), 0)
        entry[`${p}_engagement`] = days.length > 0
          ? days.reduce((s: number, d: any) => s + (d[`${p}_engagement`] || 0), 0) / days.length
          : 0
      }

      // Aggregated totals across all platforms
      entry.total_views = activePlats.reduce((s, p) => s + (entry[`${p}_views`] || 0), 0)
      entry.total_likes = activePlats.reduce((s, p) => s + (entry[`${p}_likes`] || 0), 0)
      entry.total_comments = activePlats.reduce((s, p) => s + (entry[`${p}_comments`] || 0), 0)
      entry.total_shares = activePlats.reduce((s, p) => s + (entry[`${p}_shares`] || 0), 0)
      entry.total_engagement = entry.total_views > 0
        ? ((entry.total_likes + entry.total_comments + entry.total_shares) / entry.total_views) * 100
        : 0

      weeklyChartData.push(entry)
    }

    // 7. Compute cross-platform comparison for bar chart
    const crossPlatformData = VALID_PLATFORMS
      .filter(p => !platform || p === platform)
      .map(p => {
        const s = platformSummaries.find((ps: any) => ps.platform === p)
        const snap = (snapshots || []).find((sn: any) => sn.platform === p)
        return {
          platform: p,
          followers: snap?.followers_count || 0,
          views: s?.views_gained || 0,
          likes: s?.likes_gained || 0,
          comments: s?.comments_gained || 0,
          shares: s?.shares_gained || 0,
          engagement_rate: s?.avg_engagement_rate || 0,
          reach: snap?.reach || 0,
          impressions: snap?.impressions || 0,
        }
      })

    // 8. Compute totals across all platforms
    const totalMetrics = {
      total_followers: platformSummaries.reduce((s: number, p: any) => s + (p.followers_count || 0), 0),
      total_followers_gained: platformSummaries.reduce((s: number, p: any) => s + (p.followers_gained || 0), 0),
      total_views: platformSummaries.reduce((s: number, p: any) => s + (p.views_gained || 0), 0),
      total_likes: platformSummaries.reduce((s: number, p: any) => s + (p.likes_gained || 0), 0),
      total_comments: platformSummaries.reduce((s: number, p: any) => s + (p.comments_gained || 0), 0),
      total_shares: platformSummaries.reduce((s: number, p: any) => s + (p.shares_gained || 0), 0),
      total_interactions: 0,
      avg_engagement_rate: 0,
    }
    totalMetrics.total_interactions = totalMetrics.total_likes + totalMetrics.total_comments + totalMetrics.total_shares
    const ratesWithData = platformSummaries.filter((p: any) => p.avg_engagement_rate > 0)
    totalMetrics.avg_engagement_rate = ratesWithData.length > 0
      ? ratesWithData.reduce((s: number, p: any) => s + p.avg_engagement_rate, 0) / ratesWithData.length
      : 0

    // 9. Deduplicate snapshots (one per platform)
    const seenPlatforms = new Set<string>()
    const latestSnapshots = (snapshots || []).filter((s: any) => {
      if (seenPlatforms.has(s.platform)) return false
      seenPlatforms.add(s.platform)
      return true
    }).map((s: any) => ({
      platform: s.platform,
      followers_count: s.followers_count,
      following_count: s.following_count,
      posts_count: s.posts_count,
      total_views: s.total_views,
      total_likes: s.total_likes,
      total_comments: s.total_comments,
      total_shares: s.total_shares,
      total_saves: s.total_saves,
      engagement_rate: s.engagement_rate,
      reach: s.reach,
      impressions: s.impressions,
      fetched_at: s.fetched_at,
      fetch_status: s.fetch_status,
    }))

    // 6. Find last fetch time
    const lastFetchTime = latestSnapshots.length > 0
      ? latestSnapshots.reduce((latest: string, s: any) =>
          new Date(s.fetched_at) > new Date(latest) ? s.fetched_at : latest,
          latestSnapshots[0].fetched_at
        )
      : null

    return NextResponse.json({
      summaries: platformSummaries,
      daily_data: dailyChartData,
      weekly_data: weeklyChartData,
      weekly_comparison: weeklyComparison,
      cross_platform: crossPlatformData,
      total_metrics: totalMetrics,
      latest_snapshots: latestSnapshots,
      last_fetch_time: lastFetchTime,
      period_days: days,
    })
  } catch (error) {
    console.error('Marketing analytics API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
