import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'
import { parseDateRange } from '@/lib/date-range-helper'

export const dynamic = 'force-dynamic'

function pctChange(curr: number, prev: number): number {
  if (prev > 0) return ((curr - prev) / prev) * 100
  return curr > 0 ? 100 : 0
}

// Sum a numeric field from campaign rows with explicit Number() conversion
function sumCampField(rows: any[], field: string): number {
  return rows.reduce((s: number, r: any) => s + (Number(r[field]) || 0), 0)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform') || '__all__'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10))
    const offset = (page - 1) * limit

    const admin = createAdminClient()
    const { startStr, endStr, yoyStartStr, yoyEndStr } = parseDateRange(searchParams)

    // Fetch campaign data for CURRENT period (used for both KPIs and campaign list)
    // NOTE: KPIs are computed from individual campaign rows (marketing_sem_campaigns),
    // NOT from marketing_sem_daily_spend, because daily_spend aggregate totals for
    // clicks/impressions may have been corrupted by a string-concatenation bug in the
    // fetcher (Google Ads REST API returns int64 as strings).
    let campQuery = (admin as any)
      .from('marketing_sem_campaigns')
      .select('*')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)
      .order('spend', { ascending: false })

    if (platform !== '__all__') campQuery = campQuery.eq('platform', platform)

    // Fetch campaign data for YoY period
    let yoyCampQuery = (admin as any)
      .from('marketing_sem_campaigns')
      .select('spend, impressions, clicks, conversions, conversion_value')
      .gte('fetch_date', yoyStartStr)
      .lte('fetch_date', yoyEndStr)

    if (platform !== '__all__') yoyCampQuery = yoyCampQuery.eq('platform', platform)

    // Fetch daily spend for trend chart (spend values are correct)
    let spendQuery = (admin as any)
      .from('marketing_sem_daily_spend')
      .select('fetch_date, platform, total_spend')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)

    if (platform !== '__all__') spendQuery = spendQuery.eq('platform', platform)

    // Parallel fetch: current campaigns, YoY campaigns, daily spend, configs, revenue
    const [
      { data: campData },
      { data: yoyCampData },
      { data: spendData },
      { data: configs },
      { data: revenueData },
    ] = await Promise.all([
      campQuery,
      yoyCampQuery,
      spendQuery,
      (admin as any)
        .from('marketing_seo_config')
        .select('service, is_active, last_fetch_at, last_fetch_error')
        .in('service', ['google_ads', 'meta_ads']),
      (admin as any)
        .from('marketing_revenue_actuals')
        .select('channel, month, revenue'),
    ])

    const campaigns = campData || []
    const yoyCampaigns = yoyCampData || []

    // --- Current period KPIs from individual campaign rows ---
    const totalSpend = sumCampField(campaigns, 'spend')
    const totalClicks = sumCampField(campaigns, 'clicks')
    const totalImpressions = sumCampField(campaigns, 'impressions')
    const totalConversions = sumCampField(campaigns, 'conversions')
    const totalConversionValue = sumCampField(campaigns, 'conversion_value')

    const currCpc = totalClicks > 0 ? totalSpend / totalClicks : 0
    const currCpa = totalConversions > 0 ? totalSpend / totalConversions : 0
    const currRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0

    // --- YoY period KPIs from individual campaign rows ---
    const yoySpend = sumCampField(yoyCampaigns, 'spend')
    const yoyClicks = sumCampField(yoyCampaigns, 'clicks')
    const yoyImpressions = sumCampField(yoyCampaigns, 'impressions')
    const yoyConversions = sumCampField(yoyCampaigns, 'conversions')
    const yoyConversionValue = sumCampField(yoyCampaigns, 'conversion_value')

    const yoyCpc = yoyClicks > 0 ? yoySpend / yoyClicks : 0
    const yoyCpa = yoyConversions > 0 ? yoySpend / yoyConversions : 0
    const yoyRoas = yoySpend > 0 ? yoyConversionValue / yoySpend : 0

    const kpis = {
      totalSpend: { value: totalSpend, yoy: pctChange(totalSpend, yoySpend) },
      totalConversions: { value: totalConversions, yoy: pctChange(totalConversions, yoyConversions) },
      avgCpc: { value: currCpc, yoy: pctChange(currCpc, yoyCpc) },
      avgCpa: { value: currCpa, yoy: pctChange(currCpa, yoyCpa) },
      overallRoas: { value: currRoas, yoy: pctChange(currRoas, yoyRoas) },
      totalImpressions: { value: totalImpressions, yoy: pctChange(totalImpressions, yoyImpressions) },
      totalClicks: { value: totalClicks, yoy: pctChange(totalClicks, yoyClicks) },
    }

    // --- Aggregate campaigns by campaign_id for display ---
    const campMap = new Map<string, any>()
    for (const c of campaigns) {
      const key = `${c.platform}|${c.campaign_id}`
      const existing = campMap.get(key)
      if (!existing) {
        campMap.set(key, {
          platform: c.platform,
          campaign_id: c.campaign_id,
          campaign_name: c.campaign_name,
          campaign_status: c.campaign_status,
          daily_budget: Number(c.daily_budget) || 0,
          budget_utilization: Number(c.budget_utilization) || 0,
          fetch_date: c.fetch_date,
          spend: Number(c.spend) || 0,
          impressions: Number(c.impressions) || 0,
          clicks: Number(c.clicks) || 0,
          conversions: Number(c.conversions) || 0,
          conversion_value: Number(c.conversion_value) || 0,
        })
      } else {
        existing.spend += Number(c.spend) || 0
        existing.impressions += Number(c.impressions) || 0
        existing.clicks += Number(c.clicks) || 0
        existing.conversions += Number(c.conversions) || 0
        existing.conversion_value += Number(c.conversion_value) || 0
        if (c.fetch_date > existing.fetch_date) {
          existing.campaign_name = c.campaign_name
          existing.campaign_status = c.campaign_status
          existing.daily_budget = Number(c.daily_budget) || 0
          existing.budget_utilization = Number(c.budget_utilization) || 0
          existing.fetch_date = c.fetch_date
        }
      }
    }

    const aggregatedCampaigns = Array.from(campMap.values()).map((c) => ({
      ...c,
      ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
      avg_cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
      cost_per_conversion: c.conversions > 0 ? c.spend / c.conversions : 0,
      roas: c.spend > 0 ? c.conversion_value / c.spend : 0,
    }))

    aggregatedCampaigns.sort((a, b) => b.spend - a.spend)

    const total = aggregatedCampaigns.length
    const paginatedCampaigns = aggregatedCampaigns.slice(offset, offset + limit)

    // Daily spend trend (only total_spend from daily_spend, which is correct)
    const spendRows = spendData || []
    const dailySpend = spendRows.map((r: any) => ({
      date: r.fetch_date,
      platform: r.platform,
      spend: Number(r.total_spend) || 0,
      clicks: 0,
      conversions: 0,
    }))

    // Aggregate actual revenue for ROAS calculation
    let actualRevenue = 0
    const startMonth = startStr.substring(0, 7)
    const endMonth = endStr.substring(0, 7)
    for (const rev of (revenueData || [])) {
      if (rev.month >= startMonth && rev.month <= endMonth && (platform === '__all__' || rev.channel === platform)) {
        actualRevenue += Number(rev.revenue) || 0
      }
    }
    const hasActualRevenue = actualRevenue > 0
    const actualRoas = totalSpend > 0 && hasActualRevenue ? actualRevenue / totalSpend : null

    return NextResponse.json({
      kpis,
      hasConversionValues: totalConversionValue > 0,
      hasActualRevenue,
      actualRevenue,
      actualRoas,
      campaigns: paginatedCampaigns,
      total,
      page,
      dailySpend,
      configs: configs || [],
      dateRange: { start: startStr, end: endStr },
      yoyDateRange: { start: yoyStartStr, end: yoyEndStr },
    })
  } catch (error) {
    console.error('SEM ads error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
