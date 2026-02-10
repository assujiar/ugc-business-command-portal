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
    const device = searchParams.get('device') || '__all__'
    const branded = searchParams.get('branded') || '__all__'
    const search = searchParams.get('search') || ''
    const minImpressions = parseInt(searchParams.get('min_impressions') || '10', 10)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10))
    const sortBy = searchParams.get('sort') || 'clicks'
    const sortDir = searchParams.get('dir') || 'desc'
    const offset = (page - 1) * limit

    const admin = createAdminClient()
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30

    // Current period date range (GSC delay = 3 days)
    const now = new Date()
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() - 3)
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - days)
    const prevStartDate = new Date(startDate)
    prevStartDate.setDate(prevStartDate.getDate() - days)

    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]
    const prevStartStr = prevStartDate.toISOString().split('T')[0]

    // Fetch current period keywords (aggregate across dates)
    let kwQuery = (admin as any)
      .from('marketing_seo_keywords')
      .select('query, clicks, impressions, ctr, position, is_branded')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)

    if (site !== '__all__') kwQuery = kwQuery.eq('site', site)
    if (device !== '__all__') kwQuery = kwQuery.eq('device', device.toUpperCase())
    else kwQuery = kwQuery.is('device', null)

    const { data: currentKws } = await kwQuery
    const kwRows = currentKws || []

    // Aggregate by query
    const kwMap = new Map<string, {
      query: string; clicks: number; impressions: number;
      ctrSum: number; posSum: number; count: number; is_branded: boolean
    }>()

    for (const r of kwRows) {
      const key = r.query
      const existing = kwMap.get(key) || {
        query: key, clicks: 0, impressions: 0, ctrSum: 0, posSum: 0, count: 0, is_branded: r.is_branded,
      }
      existing.clicks += Number(r.clicks) || 0
      existing.impressions += Number(r.impressions) || 0
      existing.ctrSum += Number(r.ctr) || 0
      existing.posSum += Number(r.position) || 0
      existing.count += 1
      kwMap.set(key, existing)
    }

    // Fetch previous period for position change
    let prevKwQuery = (admin as any)
      .from('marketing_seo_keywords')
      .select('query, position')
      .gte('fetch_date', prevStartStr)
      .lt('fetch_date', startStr)

    if (site !== '__all__') prevKwQuery = prevKwQuery.eq('site', site)
    if (device !== '__all__') prevKwQuery = prevKwQuery.eq('device', device.toUpperCase())
    else prevKwQuery = prevKwQuery.is('device', null)

    const { data: prevKws } = await prevKwQuery
    const prevPosMap = new Map<string, { posSum: number; count: number }>()
    for (const r of (prevKws || [])) {
      const existing = prevPosMap.get(r.query) || { posSum: 0, count: 0 }
      existing.posSum += Number(r.position) || 0
      existing.count += 1
      prevPosMap.set(r.query, existing)
    }

    // Build result array
    let keywords = Array.from(kwMap.values()).map(kw => {
      const avgCtr = kw.count > 0 ? kw.ctrSum / kw.count : 0
      const avgPos = kw.count > 0 ? kw.posSum / kw.count : 0
      const prev = prevPosMap.get(kw.query)
      const prevAvgPos = prev && prev.count > 0 ? prev.posSum / prev.count : null
      // Position change: negative = improved (position went down = better ranking)
      const positionChange = prevAvgPos !== null ? prevAvgPos - avgPos : null

      return {
        query: kw.query,
        clicks: kw.clicks,
        impressions: kw.impressions,
        ctr: avgCtr,
        position: Math.round(avgPos * 100) / 100,
        positionChange: positionChange !== null ? Math.round(positionChange * 100) / 100 : null,
        is_branded: kw.is_branded,
      }
    })

    // Apply filters
    if (branded === 'branded') keywords = keywords.filter(k => k.is_branded)
    if (branded === 'non_branded') keywords = keywords.filter(k => !k.is_branded)
    if (search) keywords = keywords.filter(k => k.query.toLowerCase().includes(search.toLowerCase()))
    keywords = keywords.filter(k => k.impressions >= minImpressions)

    // Position distribution
    const distribution = {
      top3: keywords.filter(k => k.position <= 3).length,
      top10: keywords.filter(k => k.position > 3 && k.position <= 10).length,
      top20: keywords.filter(k => k.position > 10 && k.position <= 20).length,
      top50: keywords.filter(k => k.position > 20 && k.position <= 50).length,
      beyond50: keywords.filter(k => k.position > 50).length,
    }

    // Top gaining & losing keywords (by position change)
    const withChange = keywords.filter(k => k.positionChange !== null)
    const gaining = [...withChange].sort((a, b) => (b.positionChange || 0) - (a.positionChange || 0)).slice(0, 5)
    const losing = [...withChange].sort((a, b) => (a.positionChange || 0) - (b.positionChange || 0)).slice(0, 5)

    // Sort
    const total = keywords.length
    const validSort = ['clicks', 'impressions', 'ctr', 'position', 'positionChange']
    const sortField = validSort.includes(sortBy) ? sortBy : 'clicks'
    keywords.sort((a, b) => {
      const aVal = (a as any)[sortField] ?? 0
      const bVal = (b as any)[sortField] ?? 0
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })

    // Paginate
    const paginated = keywords.slice(offset, offset + limit)

    return NextResponse.json({
      keywords: paginated,
      total,
      page,
      distribution,
      gaining,
      losing,
    })
  } catch (error) {
    console.error('SEO keywords error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
