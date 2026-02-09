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
    const days = Math.min(parseInt(searchParams.get('days') || '30', 10), 365)
    const platform = searchParams.get('platform')

    if (platform && !VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }

    // Note: Tables not yet in generated types (migration 154), cast as any
    const adminClient = createAdminClient() as any
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    const startDateStr = startDate.toISOString().split('T')[0]

    // 1. Get daily summaries for the period
    let summaryQuery = adminClient
      .from('marketing_social_media_daily_summary')
      .select('*')
      .gte('summary_date', startDateStr)
      .order('summary_date', { ascending: true })

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

    // 4. Pivot daily summaries for chart data
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
    }

    const dailyChartData = Array.from(dateMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // 5. Deduplicate snapshots (one per platform)
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
