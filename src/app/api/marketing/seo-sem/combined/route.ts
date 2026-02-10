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

    const admin = createAdminClient()
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30
    const now = new Date()
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() - 3)
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - days)

    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]

    // Organic data
    const { data: seoData } = await (admin as any)
      .from('marketing_seo_daily_snapshot')
      .select('fetch_date, gsc_total_clicks, ga_organic_sessions, ga_organic_conversions')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)

    const seoRows = seoData || []
    const organicSessions = seoRows.reduce((s: number, r: any) => s + (Number(r.ga_organic_sessions) || 0), 0)
    const organicConversions = seoRows.reduce((s: number, r: any) => s + (Number(r.ga_organic_conversions) || 0), 0)

    // Paid data
    const { data: semData } = await (admin as any)
      .from('marketing_sem_daily_spend')
      .select('fetch_date, platform, total_spend, total_clicks, total_conversions, total_conversion_value')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)

    const semRows = semData || []
    const totalAdSpend = semRows.reduce((s: number, r: any) => s + (Number(r.total_spend) || 0), 0)
    const paidConversions = semRows.reduce((s: number, r: any) => s + (Number(r.total_conversions) || 0), 0)
    const paidSessions = semRows.reduce((s: number, r: any) => s + (Number(r.total_clicks) || 0), 0)

    const totalSessions = organicSessions + paidSessions

    // Channel split
    const channelSplit = {
      organic: { sessions: organicSessions, conversions: organicConversions, share: totalSessions > 0 ? organicSessions / totalSessions : 0 },
      paid: { sessions: paidSessions, conversions: paidConversions, share: totalSessions > 0 ? paidSessions / totalSessions : 0 },
    }

    // Blended metrics
    const totalConversions = organicConversions + paidConversions
    const blendedMetrics = {
      blendedCpa: totalConversions > 0 ? totalAdSpend / totalConversions : 0,
      organicShare: totalSessions > 0 ? (organicSessions / totalSessions) * 100 : 0,
      paidShare: totalSessions > 0 ? (paidSessions / totalSessions) * 100 : 0,
      totalAdSpend,
    }

    // Monthly trend (for stacked bar chart)
    const monthlyMap = new Map<string, { month: string; organic: number; paid: number }>()
    for (const r of seoRows) {
      const month = r.fetch_date.substring(0, 7)
      const existing = monthlyMap.get(month) || { month, organic: 0, paid: 0 }
      existing.organic += Number(r.ga_organic_sessions) || 0
      monthlyMap.set(month, existing)
    }
    for (const r of semRows) {
      const month = r.fetch_date.substring(0, 7)
      const existing = monthlyMap.get(month) || { month, organic: 0, paid: 0 }
      existing.paid += Number(r.total_clicks) || 0
      monthlyMap.set(month, existing)
    }
    const monthlyTrend = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month))

    // Keyword overlap: organic keywords that also appear in paid
    const { data: organicKws } = await (admin as any)
      .from('marketing_seo_keywords')
      .select('query, clicks, position')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)
      .is('device', null)
      .order('clicks', { ascending: false })
      .limit(200)

    const { data: paidKws } = await (admin as any)
      .from('marketing_sem_keywords')
      .select('keyword_text, clicks, avg_cpc')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)
      .limit(500)

    const paidKwMap = new Map<string, { clicks: number; cpc: number }>()
    for (const pk of (paidKws || [])) {
      const existing = paidKwMap.get(pk.keyword_text) || { clicks: 0, cpc: 0 }
      existing.clicks += Number(pk.clicks) || 0
      existing.cpc = Number(pk.avg_cpc) || 0
      paidKwMap.set(pk.keyword_text, existing)
    }

    const keywordOverlap = (organicKws || [])
      .filter((ok: any) => paidKwMap.has(ok.query))
      .map((ok: any) => {
        const paid = paidKwMap.get(ok.query)!
        return {
          keyword: ok.query,
          organicPosition: Number(ok.position),
          organicClicks: Number(ok.clicks),
          paidClicks: paid.clicks,
          paidCpc: paid.cpc,
        }
      })
      .slice(0, 20)

    return NextResponse.json({
      channelSplit,
      blendedMetrics,
      monthlyTrend,
      keywordOverlap,
    })
  } catch (error) {
    console.error('Combined view error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
