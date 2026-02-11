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

    // Current period KPIs
    let spendQuery = (admin as any)
      .from('marketing_sem_daily_spend')
      .select('*')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)

    if (platform !== '__all__') spendQuery = spendQuery.eq('platform', platform)

    const { data: spendData } = await spendQuery
    const spendRows = spendData || []

    const totalSpend = spendRows.reduce((s: number, r: any) => s + (Number(r.total_spend) || 0), 0)
    const totalClicks = spendRows.reduce((s: number, r: any) => s + (Number(r.total_clicks) || 0), 0)
    const totalConversions = spendRows.reduce((s: number, r: any) => s + (Number(r.total_conversions) || 0), 0)
    const totalConversionValue = spendRows.reduce((s: number, r: any) => s + (Number(r.total_conversion_value) || 0), 0)
    const totalImpressions = spendRows.reduce((s: number, r: any) => s + (Number(r.total_impressions) || 0), 0)

    // YoY period KPIs
    let yoyQuery = (admin as any)
      .from('marketing_sem_daily_spend')
      .select('*')
      .gte('fetch_date', yoyStartStr)
      .lte('fetch_date', yoyEndStr)

    if (platform !== '__all__') yoyQuery = yoyQuery.eq('platform', platform)

    const { data: yoyData } = await yoyQuery
    const yoyRows = yoyData || []

    const yoySpend = yoyRows.reduce((s: number, r: any) => s + (Number(r.total_spend) || 0), 0)
    const yoyClicks = yoyRows.reduce((s: number, r: any) => s + (Number(r.total_clicks) || 0), 0)
    const yoyConversions = yoyRows.reduce((s: number, r: any) => s + (Number(r.total_conversions) || 0), 0)
    const yoyConversionValue = yoyRows.reduce((s: number, r: any) => s + (Number(r.total_conversion_value) || 0), 0)
    const yoyImpressions = yoyRows.reduce((s: number, r: any) => s + (Number(r.total_impressions) || 0), 0)

    const yoyCpc = yoyClicks > 0 ? yoySpend / yoyClicks : 0
    const yoyCpa = yoyConversions > 0 ? yoySpend / yoyConversions : 0
    const yoyRoas = yoySpend > 0 ? yoyConversionValue / yoySpend : 0

    const currCpc = totalClicks > 0 ? totalSpend / totalClicks : 0
    const currCpa = totalConversions > 0 ? totalSpend / totalConversions : 0
    const currRoas = totalSpend > 0 ? totalConversionValue / totalSpend : 0

    const kpis = {
      totalSpend: { value: totalSpend, yoy: pctChange(totalSpend, yoySpend) },
      totalConversions: { value: totalConversions, yoy: pctChange(totalConversions, yoyConversions) },
      avgCpc: { value: currCpc, yoy: pctChange(currCpc, yoyCpc) },
      avgCpa: { value: currCpa, yoy: pctChange(currCpa, yoyCpa) },
      overallRoas: { value: currRoas, yoy: pctChange(currRoas, yoyRoas) },
      totalImpressions: { value: totalImpressions, yoy: pctChange(totalImpressions, yoyImpressions) },
      totalClicks: { value: totalClicks, yoy: pctChange(totalClicks, yoyClicks) },
    }

    // Campaign data
    let campQuery = (admin as any)
      .from('marketing_sem_campaigns')
      .select('*')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)
      .order('spend', { ascending: false })

    if (platform !== '__all__') campQuery = campQuery.eq('platform', platform)

    const { data: campData } = await campQuery
    const campaigns = campData || []

    // Aggregate campaigns by campaign_id — SUM metrics across all dates in range
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
          // Summed metrics
          spend: Number(c.spend) || 0,
          impressions: Number(c.impressions) || 0,
          clicks: Number(c.clicks) || 0,
          conversions: Number(c.conversions) || 0,
          conversion_value: Number(c.conversion_value) || 0,
        })
      } else {
        // Accumulate metrics across days
        existing.spend += Number(c.spend) || 0
        existing.impressions += Number(c.impressions) || 0
        existing.clicks += Number(c.clicks) || 0
        existing.conversions += Number(c.conversions) || 0
        existing.conversion_value += Number(c.conversion_value) || 0
        // Keep metadata from the latest date row
        if (c.fetch_date > existing.fetch_date) {
          existing.campaign_name = c.campaign_name
          existing.campaign_status = c.campaign_status
          existing.daily_budget = Number(c.daily_budget) || 0
          existing.budget_utilization = Number(c.budget_utilization) || 0
          existing.fetch_date = c.fetch_date
        }
      }
    }

    // Compute derived metrics from aggregated totals
    const aggregatedCampaigns = Array.from(campMap.values()).map((c) => ({
      ...c,
      ctr: c.impressions > 0 ? c.clicks / c.impressions : 0,
      avg_cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
      cost_per_conversion: c.conversions > 0 ? c.spend / c.conversions : 0,
      roas: c.spend > 0 ? c.conversion_value / c.spend : 0,
    }))

    // Sort by total spend descending
    aggregatedCampaigns.sort((a, b) => b.spend - a.spend)

    const total = aggregatedCampaigns.length
    const paginatedCampaigns = aggregatedCampaigns.slice(offset, offset + limit)

    // Daily spend trend
    const dailySpend = spendRows.map((r: any) => ({
      date: r.fetch_date,
      platform: r.platform,
      spend: Number(r.total_spend) || 0,
      clicks: Number(r.total_clicks) || 0,
      conversions: Number(r.total_conversions) || 0,
    }))

    // Config status
    const { data: configs } = await (admin as any)
      .from('marketing_seo_config')
      .select('service, is_active, last_fetch_at, last_fetch_error')
      .in('service', ['google_ads', 'meta_ads'])

    return NextResponse.json({
      kpis,
      hasConversionValues: totalConversionValue > 0,
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
