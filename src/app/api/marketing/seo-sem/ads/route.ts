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
    const platform = searchParams.get('platform') || '__all__'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10))
    const offset = (page - 1) * limit

    const admin = createAdminClient()
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
    const now = new Date()
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() - 1)
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - days)

    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]

    // KPIs from daily spend
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

    const kpis = {
      totalSpend,
      totalConversions,
      avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      avgCpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
      overallRoas: totalSpend > 0 ? totalConversionValue / totalSpend : 0,
      totalImpressions,
      totalClicks,
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

    // Aggregate campaigns by campaign_id
    const campMap = new Map<string, any>()
    for (const c of campaigns) {
      const key = `${c.platform}|${c.campaign_id}`
      const existing = campMap.get(key)
      if (!existing || c.fetch_date > existing.fetch_date) {
        campMap.set(key, c)
      }
    }
    const aggregatedCampaigns = Array.from(campMap.values())
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
      campaigns: paginatedCampaigns,
      total,
      page,
      dailySpend,
      configs: configs || [],
    })
  } catch (error) {
    console.error('SEM ads error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
