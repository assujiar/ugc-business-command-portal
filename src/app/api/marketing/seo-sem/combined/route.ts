import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'
import { parseDateRange } from '@/lib/date-range-helper'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)

    const admin = createAdminClient()
    const { startStr, endStr } = parseDateRange(searchParams, { gscDelay: true })

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
    // Use case-insensitive matching and aggregate across dates
    const { data: organicKws } = await (admin as any)
      .from('marketing_seo_keywords')
      .select('query, clicks, position')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)
      .is('device', null)
      .order('clicks', { ascending: false })
      .limit(500)

    const { data: paidKws } = await (admin as any)
      .from('marketing_sem_keywords')
      .select('keyword_text, clicks, avg_cpc')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)
      .limit(1000)

    // Aggregate organic keywords by normalized query (lowercase, trimmed)
    const organicKwMap = new Map<string, { query: string; clicks: number; posSum: number; count: number }>()
    for (const ok of (organicKws || [])) {
      const key = (ok.query || '').toLowerCase().trim()
      if (!key) continue
      const existing = organicKwMap.get(key) || { query: ok.query, clicks: 0, posSum: 0, count: 0 }
      existing.clicks += Number(ok.clicks) || 0
      existing.posSum += Number(ok.position) || 0
      existing.count += 1
      organicKwMap.set(key, existing)
    }

    // Aggregate paid keywords by normalized text (lowercase, trimmed)
    const paidKwMap = new Map<string, { clicks: number; cpcSum: number; count: number }>()
    for (const pk of (paidKws || [])) {
      const key = (pk.keyword_text || '').toLowerCase().trim()
      if (!key) continue
      const existing = paidKwMap.get(key) || { clicks: 0, cpcSum: 0, count: 0 }
      existing.clicks += Number(pk.clicks) || 0
      existing.cpcSum += Number(pk.avg_cpc) || 0
      existing.count += 1
      paidKwMap.set(key, existing)
    }

    // Find overlapping keywords (case-insensitive)
    const keywordOverlap: any[] = []
    for (const [key, organic] of Array.from(organicKwMap.entries())) {
      const paid = paidKwMap.get(key)
      if (paid) {
        keywordOverlap.push({
          keyword: organic.query,
          organicPosition: organic.count > 0 ? Math.round((organic.posSum / organic.count) * 10) / 10 : 0,
          organicClicks: organic.clicks,
          paidClicks: paid.clicks,
          paidCpc: paid.count > 0 ? paid.cpcSum / paid.count : 0,
        })
      }
    }
    // Sort by total clicks (organic + paid) and take top 20
    keywordOverlap.sort((a, b) => (b.organicClicks + b.paidClicks) - (a.organicClicks + a.paidClicks))
    const topOverlap = keywordOverlap.slice(0, 20)

    return NextResponse.json({
      channelSplit,
      blendedMetrics,
      monthlyTrend,
      keywordOverlap: topOverlap,
    })
  } catch (error) {
    console.error('Combined view error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
