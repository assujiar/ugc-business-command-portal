import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
    const range = searchParams.get('range') || '30d'
    const site = searchParams.get('site') || '__all__'

    const admin = createAdminClient()
    const days = range === '7d' ? 7 : range === '90d' ? 90 : range === 'ytd' ? 0 : 30
    const now = new Date()
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() - 3) // GSC data delay

    let startDate: Date
    if (range === 'ytd') {
      startDate = new Date(now.getFullYear(), 0, 1)
    } else {
      startDate = new Date(endDate)
      startDate.setDate(startDate.getDate() - days)
    }

    const prevStartDate = new Date(startDate)
    prevStartDate.setDate(prevStartDate.getDate() - days)

    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]
    const prevStartStr = prevStartDate.toISOString().split('T')[0]
    const prevEndStr = startStr

    // YoY: Same period last year
    const yoyStartDate = new Date(startDate)
    yoyStartDate.setFullYear(yoyStartDate.getFullYear() - 1)
    const yoyEndDate = new Date(endDate)
    yoyEndDate.setFullYear(yoyEndDate.getFullYear() - 1)
    const yoyStartStr = yoyStartDate.toISOString().split('T')[0]
    const yoyEndStr = yoyEndDate.toISOString().split('T')[0]

    // Current period
    let currentQuery = (admin as any)
      .from('marketing_seo_daily_snapshot')
      .select('*')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)
      .order('fetch_date', { ascending: true })

    if (site !== '__all__') currentQuery = currentQuery.eq('site', site)

    const { data: currentData } = await currentQuery

    // Previous period
    let prevQuery = (admin as any)
      .from('marketing_seo_daily_snapshot')
      .select('*')
      .gte('fetch_date', prevStartStr)
      .lt('fetch_date', prevEndStr)

    if (site !== '__all__') prevQuery = prevQuery.eq('site', site)

    const { data: prevData } = await prevQuery

    const current = currentData || []
    const prev = prevData || []

    // YoY period
    let yoyQuery = (admin as any)
      .from('marketing_seo_daily_snapshot')
      .select('*')
      .gte('fetch_date', yoyStartStr)
      .lte('fetch_date', yoyEndStr)

    if (site !== '__all__') yoyQuery = yoyQuery.eq('site', site)

    const { data: yoyData } = await yoyQuery
    const yoy = yoyData || []

    // Aggregate KPIs
    const sumField = (arr: any[], field: string) => arr.reduce((s, r) => s + (Number(r[field]) || 0), 0)
    const avgField = (arr: any[], field: string) => {
      const vals = arr.map(r => Number(r[field]) || 0).filter(v => v > 0)
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    }

    const totalClicks = sumField(current, 'gsc_total_clicks')
    const totalImpressions = sumField(current, 'gsc_total_impressions')
    const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0
    const avgPosition = avgField(current, 'gsc_avg_position')
    const organicSessions = sumField(current, 'ga_organic_sessions')
    const organicConversions = sumField(current, 'ga_organic_conversions')
    const conversionRate = organicSessions > 0 ? organicConversions / organicSessions : 0

    const prevTotalClicks = sumField(prev, 'gsc_total_clicks')
    const prevTotalImpressions = sumField(prev, 'gsc_total_impressions')
    const prevAvgCtr = prevTotalImpressions > 0 ? prevTotalClicks / prevTotalImpressions : 0
    const prevAvgPosition = avgField(prev, 'gsc_avg_position')
    const prevOrganicSessions = sumField(prev, 'ga_organic_sessions')
    const prevOrganicConversions = sumField(prev, 'ga_organic_conversions')
    const prevConversionRate = prevOrganicSessions > 0 ? prevOrganicConversions / prevOrganicSessions : 0

    // YoY aggregates
    const yoyTotalClicks = sumField(yoy, 'gsc_total_clicks')
    const yoyTotalImpressions = sumField(yoy, 'gsc_total_impressions')
    const yoyAvgCtr = yoyTotalImpressions > 0 ? yoyTotalClicks / yoyTotalImpressions : 0
    const yoyAvgPosition = avgField(yoy, 'gsc_avg_position')
    const yoyOrganicSessions = sumField(yoy, 'ga_organic_sessions')
    const yoyOrganicConversions = sumField(yoy, 'ga_organic_conversions')
    const yoyConversionRate = yoyOrganicSessions > 0 ? yoyOrganicConversions / yoyOrganicSessions : 0

    const pctChange = (curr: number, prev: number) => prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0

    const kpis = {
      totalClicks: { value: totalClicks, change: pctChange(totalClicks, prevTotalClicks), yoy: pctChange(totalClicks, yoyTotalClicks) },
      totalImpressions: { value: totalImpressions, change: pctChange(totalImpressions, prevTotalImpressions), yoy: pctChange(totalImpressions, yoyTotalImpressions) },
      avgCtr: { value: avgCtr, change: pctChange(avgCtr, prevAvgCtr), yoy: pctChange(avgCtr, yoyAvgCtr) },
      avgPosition: { value: avgPosition, change: pctChange(avgPosition, prevAvgPosition), yoy: pctChange(avgPosition, yoyAvgPosition) },
      organicSessions: { value: organicSessions, change: pctChange(organicSessions, prevOrganicSessions), yoy: pctChange(organicSessions, yoyOrganicSessions) },
      conversionRate: { value: conversionRate, change: pctChange(conversionRate, prevConversionRate), yoy: pctChange(conversionRate, yoyConversionRate) },
    }

    // Daily trend data (aggregate by date if multi-site)
    const dailyMap = new Map<string, any>()
    for (const row of current) {
      const existing = dailyMap.get(row.fetch_date) || {
        date: row.fetch_date,
        clicks: 0, impressions: 0, sessions: 0, conversions: 0,
        desktop_clicks: 0, mobile_clicks: 0, tablet_clicks: 0,
      }
      existing.clicks += Number(row.gsc_total_clicks) || 0
      existing.impressions += Number(row.gsc_total_impressions) || 0
      existing.sessions += Number(row.ga_organic_sessions) || 0
      existing.conversions += Number(row.ga_organic_conversions) || 0
      existing.desktop_clicks += Number(row.gsc_desktop_clicks) || 0
      existing.mobile_clicks += Number(row.gsc_mobile_clicks) || 0
      existing.tablet_clicks += Number(row.gsc_tablet_clicks) || 0
      dailyMap.set(row.fetch_date, existing)
    }
    const dailyTrend = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

    // Device breakdown
    const deviceBreakdown = {
      desktop: sumField(current, 'gsc_desktop_clicks'),
      mobile: sumField(current, 'gsc_mobile_clicks'),
      tablet: sumField(current, 'gsc_tablet_clicks'),
    }

    // Available sites
    const { data: allSites } = await (admin as any)
      .from('marketing_seo_daily_snapshot')
      .select('site')
      .limit(100)

    const sites = Array.from(new Set((allSites || []).map((r: any) => r.site)))

    // Config status
    const { data: configs } = await (admin as any)
      .from('marketing_seo_config')
      .select('service, is_active, last_fetch_at, last_fetch_error')
      .in('service', ['google_search_console', 'google_analytics', 'pagespeed'])

    return NextResponse.json({
      kpis,
      dailyTrend,
      deviceBreakdown,
      sites,
      configs: configs || [],
      dateRange: { start: startStr, end: endStr },
    })
  } catch (error) {
    console.error('SEO overview error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
