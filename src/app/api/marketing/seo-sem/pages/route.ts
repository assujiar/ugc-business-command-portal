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
    const search = searchParams.get('search') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10))
    const sortBy = searchParams.get('sort') || 'gsc_clicks'
    const sortDir = searchParams.get('dir') || 'desc'
    const offset = (page - 1) * limit

    const admin = createAdminClient()
    const { startStr, endStr } = parseDateRange(searchParams, { gscDelay: true })

    // Fetch pages
    let query = (admin as any)
      .from('marketing_seo_pages')
      .select('*')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)

    if (site !== '__all__') query = query.eq('site', site)

    const { data: rawPages } = await query
    const pageRows = rawPages || []

    // Aggregate by page_url
    const pageMap = new Map<string, {
      page_url: string; site: string;
      gsc_clicks: number; gsc_impressions: number;
      gsc_ctr_sum: number; gsc_pos_sum: number;
      ga_sessions: number; ga_users: number;
      ga_engagement_sum: number; ga_bounce_sum: number;
      ga_duration_sum: number; ga_conversions: number; count: number
    }>()

    for (const r of pageRows) {
      const key = r.page_url
      const existing = pageMap.get(key) || {
        page_url: key, site: r.site,
        gsc_clicks: 0, gsc_impressions: 0,
        gsc_ctr_sum: 0, gsc_pos_sum: 0,
        ga_sessions: 0, ga_users: 0,
        ga_engagement_sum: 0, ga_bounce_sum: 0,
        ga_duration_sum: 0, ga_conversions: 0, count: 0,
      }
      existing.gsc_clicks += Number(r.gsc_clicks) || 0
      existing.gsc_impressions += Number(r.gsc_impressions) || 0
      existing.gsc_ctr_sum += Number(r.gsc_ctr) || 0
      existing.gsc_pos_sum += Number(r.gsc_position) || 0
      existing.ga_sessions += Number(r.ga_sessions) || 0
      existing.ga_users += Number(r.ga_users) || 0
      existing.ga_engagement_sum += Number(r.ga_engagement_rate) || 0
      existing.ga_bounce_sum += Number(r.ga_bounce_rate) || 0
      existing.ga_duration_sum += Number(r.ga_avg_session_duration) || 0
      existing.ga_conversions += Number(r.ga_conversions) || 0
      existing.count += 1
      pageMap.set(key, existing)
    }

    let pages = Array.from(pageMap.values()).map(p => ({
      page_url: p.page_url,
      site: p.site,
      gsc_clicks: p.gsc_clicks,
      gsc_impressions: p.gsc_impressions,
      gsc_ctr: p.count > 0 ? p.gsc_ctr_sum / p.count : 0,
      gsc_position: p.count > 0 ? Math.round((p.gsc_pos_sum / p.count) * 100) / 100 : 0,
      ga_sessions: p.ga_sessions,
      ga_users: p.ga_users,
      ga_engagement_rate: p.count > 0 ? p.ga_engagement_sum / p.count : 0,
      ga_bounce_rate: p.count > 0 ? p.ga_bounce_sum / p.count : 0,
      ga_avg_session_duration: p.count > 0 ? p.ga_duration_sum / p.count : 0,
      ga_conversions: p.ga_conversions,
    }))

    // Search filter
    if (search) pages = pages.filter(p => p.page_url.toLowerCase().includes(search.toLowerCase()))

    const total = pages.length

    // Sort
    const validSorts = ['gsc_clicks', 'gsc_impressions', 'gsc_ctr', 'gsc_position', 'ga_sessions', 'ga_engagement_rate', 'ga_bounce_rate', 'ga_conversions']
    const sf = validSorts.includes(sortBy) ? sortBy : 'gsc_clicks'
    pages.sort((a, b) => {
      const aVal = (a as any)[sf] ?? 0
      const bVal = (b as any)[sf] ?? 0
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })

    const paginated = pages.slice(offset, offset + limit)

    // For expandable rows: fetch top keywords per page URL (if requested)
    const expandUrl = searchParams.get('expand_url')
    let expandData = null
    if (expandUrl) {
      const { data: pageKws } = await (admin as any)
        .from('marketing_seo_keywords')
        .select('query, clicks, impressions, ctr, position')
        .gte('fetch_date', startStr)
        .lte('fetch_date', endStr)
        .is('device', null)
        .is('country', null)
        .order('clicks', { ascending: false })
        .limit(10)

      // Also fetch web vitals for this page
      const { data: vitals } = await (admin as any)
        .from('marketing_seo_web_vitals')
        .select('*')
        .eq('page_url', expandUrl)
        .order('fetch_date', { ascending: false })
        .limit(2)

      expandData = {
        keywords: pageKws || [],
        vitals: vitals || [],
      }
    }

    return NextResponse.json({ pages: paginated, total, page, expandData })
  } catch (error) {
    console.error('SEO pages error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
