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
    const pageUrl = searchParams.get('url') // specific page URL

    const admin = createAdminClient()

    if (pageUrl) {
      // Fetch vitals for a specific URL
      const { data: vitals } = await (admin as any)
        .from('marketing_seo_web_vitals')
        .select('*')
        .eq('page_url', pageUrl)
        .order('fetch_date', { ascending: false })
        .limit(20)

      return NextResponse.json({ vitals: vitals || [] })
    }

    // Get latest vitals for all monitored pages
    const { data: allVitals } = await (admin as any)
      .from('marketing_seo_web_vitals')
      .select('*')
      .order('fetch_date', { ascending: false })
      .limit(200)

    // Group by page_url, show latest per page+strategy
    const latestMap = new Map<string, any>()
    for (const v of (allVitals || [])) {
      const key = `${v.page_url}|${v.strategy}`
      if (!latestMap.has(key)) {
        latestMap.set(key, v)
      }
    }

    // Group by page_url
    const pageMap = new Map<string, { url: string; mobile: any; desktop: any }>()
    for (const v of Array.from(latestMap.values())) {
      // Extract enriched data from raw_response
      const raw = v.raw_response || {}
      const enriched = {
        ...v,
        diagnostics: raw.diagnostics || [],
        opportunities: raw.opportunities || [],
        resources: raw.resources || [],
        totalByteWeight: raw.totalByteWeight || null,
        originCrux: raw.originLoadingExperience || null,
      }
      const existing = pageMap.get(v.page_url) || { url: v.page_url, mobile: null, desktop: null }
      if (v.strategy === 'mobile') existing.mobile = enriched
      if (v.strategy === 'desktop') existing.desktop = enriched
      pageMap.set(v.page_url, existing)
    }

    const pages = Array.from(pageMap.values())

    // Historical trend (weekly scores for charts)
    const { data: trendData } = await (admin as any)
      .from('marketing_seo_web_vitals')
      .select('fetch_date, page_url, strategy, performance_score, lcp_ms, cls, inp_ms, tbt_ms')
      .order('fetch_date', { ascending: true })
      .limit(500)

    // Group trend by page_url + strategy
    const trendMap = new Map<string, any[]>()
    for (const t of (trendData || [])) {
      const key = `${t.page_url}|${t.strategy}`
      const arr = trendMap.get(key) || []
      arr.push({
        date: t.fetch_date,
        score: Number(t.performance_score) || 0,
        lcp: Number(t.lcp_ms) || 0,
        cls: Number(t.cls) || 0,
        inp: Number(t.inp_ms) || 0,
        tbt: Number(t.tbt_ms) || 0,
      })
      trendMap.set(key, arr)
    }

    const trends: Record<string, any[]> = {}
    for (const [key, data] of Array.from(trendMap.entries())) {
      trends[key] = data
    }

    // Config
    const { data: config } = await (admin as any)
      .from('marketing_seo_config')
      .select('is_active, last_fetch_at, extra_config')
      .eq('service', 'pagespeed')
      .single()

    return NextResponse.json({
      pages,
      trends,
      config: config || null,
    })
  } catch (error) {
    console.error('Web vitals error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
