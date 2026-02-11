import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'
import { runDailySEOFetch, runWeeklyVitalsFetch, fetchPageSpeedData, fetchGSCData, fetchGA4Data, fetchGoogleAdsData, fetchGA4Demographics } from '@/lib/seo-sem-fetcher'

export const dynamic = 'force-dynamic'

// Default backfill start date for YoY support
const BACKFILL_START = '2025-01-01'

export async function POST(request: NextRequest) {
  try {
    // Auth: service_role key OR authenticated marketing user
    const authHeader = request.headers.get('Authorization')
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    let isAuthorized = false

    // Check service role key (for cron jobs)
    if (authHeader && serviceKey && authHeader.replace('Bearer ', '') === serviceKey) {
      isAuthorized = true
    }

    // Check if user has marketing panel access
    if (!isAuthorized) {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
        if (profile && canAccessMarketingPanel(profile.role as any)) {
          isAuthorized = true
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { source, type, target_date, service: specificService, urls } = body

    const results: { service: string; success: boolean; error?: string }[] = []

    if (type === 'daily_seo' || !type) {
      // Run daily SEO fetch (GSC + GA4)
      const res = await runDailySEOFetch()
      results.push(...res.results)
    }

    if (type === 'weekly_vitals') {
      // Run weekly vitals fetch
      const res = await runWeeklyVitalsFetch()
      results.push(...res.results)
    }

    if (type === 'manual') {
      const startDt = body.start_date || BACKFILL_START

      if (specificService === 'google_search_console') {
        // GSC data delayed 2-3 days
        const endDt = target_date || new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
        results.push({ service: 'google_search_console', ...await fetchGSCData(startDt, endDt) })
      } else if (specificService === 'google_analytics') {
        const endDt = target_date || new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0]
        results.push({ service: 'google_analytics', ...await fetchGA4Data(startDt, endDt) })
      } else if (specificService === 'pagespeed') {
        results.push({ service: 'pagespeed', ...await fetchPageSpeedData(urls) })
      } else if (specificService === 'google_ads') {
        const endDt = target_date || new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0]
        results.push({ service: 'google_ads', ...await fetchGoogleAdsData(startDt, endDt) })
      } else if (specificService === 'ga4_demographics') {
        const endDt = target_date || new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0]
        results.push({ service: 'ga4_demographics', ...await fetchGA4Demographics(startDt, endDt) })
      } else {
        // Fetch all services with backfill
        const gscEnd = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
        const adsEnd = new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0]
        results.push({ service: 'google_search_console', ...await fetchGSCData(startDt, gscEnd) })
        results.push({ service: 'google_analytics', ...await fetchGA4Data(startDt, adsEnd) })
        results.push({ service: 'google_ads', ...await fetchGoogleAdsData(startDt, adsEnd) })
        results.push({ service: 'pagespeed', ...await fetchPageSpeedData() })
        results.push({ service: 'ga4_demographics', ...await fetchGA4Demographics(startDt, adsEnd) })
      }
    }

    return NextResponse.json({
      success: results.every(r => r.success),
      source: source || 'manual',
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('SEO-SEM fetch error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
