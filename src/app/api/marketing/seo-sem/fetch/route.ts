import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runDailySEOFetch, runWeeklyVitalsFetch, fetchPageSpeedData, fetchGSCData, fetchGA4Data } from '@/lib/seo-sem-fetcher'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Auth: only service_role or authenticated admin
    const authHeader = request.headers.get('Authorization')
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    let isAuthorized = false

    // Check service role key
    if (authHeader && serviceKey && authHeader.replace('Bearer ', '') === serviceKey) {
      isAuthorized = true
    }

    // Check if user is admin
    if (!isAuthorized) {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
        if (profile && ['super admin', 'Director', 'Marketing Manager'].includes(profile.role)) {
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
      // Manual fetch for specific service
      if (specificService === 'google_search_console') {
        const date = target_date || new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
        results.push({ service: 'google_search_console', ...await fetchGSCData(date) })
      } else if (specificService === 'google_analytics') {
        const date = target_date || new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
        results.push({ service: 'google_analytics', ...await fetchGA4Data(date) })
      } else if (specificService === 'pagespeed') {
        results.push({ service: 'pagespeed', ...await fetchPageSpeedData(urls) })
      } else {
        // Fetch all
        const seoRes = await runDailySEOFetch()
        results.push(...seoRes.results)
        const vitalsRes = await runWeeklyVitalsFetch()
        results.push(...vitalsRes.results)
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
