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
    const site = searchParams.get('site') || '__all__'

    const admin = createAdminClient()
    const { startStr, endStr } = parseDateRange(searchParams)

    // 1. UTM/Source data
    let utmQuery = (admin as any)
      .from('marketing_ga4_utm_tracking')
      .select('*')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)
      .order('sessions', { ascending: false })

    if (site !== '__all__') utmQuery = utmQuery.eq('site', site)

    const { data: utmData } = await utmQuery
    const utmRows = utmData || []

    // Deduplicate by source/medium/campaign (keep latest fetch_date)
    const utmMap = new Map<string, any>()
    for (const row of utmRows) {
      const key = `${row.source}|${row.medium}|${row.campaign}`
      const existing = utmMap.get(key)
      if (!existing || row.fetch_date > existing.fetch_date) {
        utmMap.set(key, row)
      }
    }
    const utmList = Array.from(utmMap.values()).sort((a, b) => b.sessions - a.sessions)

    // Aggregate by channel group
    const channelMap = new Map<string, { sessions: number; users: number; conversions: number; engaged_sessions: number; bounce_rate: number; count: number }>()
    for (const row of utmList) {
      const ch = row.channel_group || 'Other'
      const existing = channelMap.get(ch) || { sessions: 0, users: 0, conversions: 0, engaged_sessions: 0, bounce_rate: 0, count: 0 }
      existing.sessions += row.sessions
      existing.users += row.users
      existing.conversions += row.conversions
      existing.engaged_sessions += row.engaged_sessions
      existing.bounce_rate += row.bounce_rate * row.sessions // weighted
      existing.count++
      channelMap.set(ch, existing)
    }

    const channels = Array.from(channelMap.entries())
      .map(([name, data]) => ({
        channel: name,
        sessions: data.sessions,
        users: data.users,
        conversions: data.conversions,
        engaged_sessions: data.engaged_sessions,
        bounce_rate: data.sessions > 0 ? data.bounce_rate / data.sessions : 0,
        conversion_rate: data.sessions > 0 ? data.conversions / data.sessions : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions)

    // Aggregate by source/medium
    const smMap = new Map<string, any>()
    for (const row of utmList) {
      const key = `${row.source} / ${row.medium}`
      const existing = smMap.get(key) || { source_medium: key, sessions: 0, users: 0, conversions: 0, bounce_rate: 0 }
      existing.sessions += row.sessions
      existing.users += row.users
      existing.conversions += row.conversions
      existing.bounce_rate += row.bounce_rate * row.sessions
      smMap.set(key, existing)
    }
    const sourceMediums = Array.from(smMap.values())
      .map(sm => ({
        ...sm,
        bounce_rate: sm.sessions > 0 ? sm.bounce_rate / sm.sessions : 0,
        conversion_rate: sm.sessions > 0 ? sm.conversions / sm.sessions : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions)

    // UTM campaigns (only named campaigns, not "(not set)")
    const campaigns = utmList
      .filter(r => r.campaign && r.campaign !== '(not set)' && r.campaign !== '(organic)')
      .slice(0, 50)

    // 2. Landing page data
    let lpQuery = (admin as any)
      .from('marketing_ga4_landing_pages')
      .select('*')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)
      .order('sessions', { ascending: false })

    if (site !== '__all__') lpQuery = lpQuery.eq('site', site)

    const { data: lpData } = await lpQuery
    const lpRows = lpData || []

    // Deduplicate landing pages
    const lpMap = new Map<string, any>()
    for (const row of lpRows) {
      const key = `${row.landing_page}|${row.source}|${row.medium}`
      const existing = lpMap.get(key)
      if (!existing || row.fetch_date > existing.fetch_date) {
        lpMap.set(key, row)
      }
    }

    // Aggregate by landing page only
    const pageMap = new Map<string, any>()
    for (const row of Array.from(lpMap.values())) {
      const existing = pageMap.get(row.landing_page) || { landing_page: row.landing_page, sessions: 0, users: 0, conversions: 0, bounce_rate: 0, engaged_sessions: 0 }
      existing.sessions += row.sessions
      existing.users += row.users
      existing.conversions += row.conversions
      existing.bounce_rate += (row.bounce_rate || 0) * row.sessions
      existing.engaged_sessions += row.engaged_sessions
      pageMap.set(row.landing_page, existing)
    }
    const landingPages = Array.from(pageMap.values())
      .map(lp => ({
        ...lp,
        bounce_rate: lp.sessions > 0 ? lp.bounce_rate / lp.sessions : 0,
        conversion_rate: lp.sessions > 0 ? lp.conversions / lp.sessions : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 30)

    // Summary KPIs
    const totalSessions = utmList.reduce((s, r) => s + r.sessions, 0)
    const totalUsers = utmList.reduce((s, r) => s + r.users, 0)
    const totalConversions = utmList.reduce((s, r) => s + r.conversions, 0)
    const totalNewUsers = utmList.reduce((s, r) => s + r.new_users, 0)

    return NextResponse.json({
      kpis: {
        totalSessions,
        totalUsers,
        totalConversions,
        totalNewUsers,
        overallConversionRate: totalSessions > 0 ? totalConversions / totalSessions : 0,
      },
      channels,
      sourceMediums: sourceMediums.slice(0, 30),
      campaigns,
      landingPages,
      dateRange: { start: startStr, end: endStr },
    })
  } catch (error) {
    console.error('UTM tracking error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
