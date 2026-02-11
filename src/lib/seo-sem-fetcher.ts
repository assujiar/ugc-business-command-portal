// =====================================================
// SEO-SEM Data Fetcher Library
// Integrates: Google Search Console, GA4, PageSpeed
// =====================================================

import { createAdminClient } from '@/lib/supabase/admin'

const BRAND_PATTERNS = ['ugc', 'utama global', 'utamaglobal', 'indocargo', 'utama indo cargo']

function isBrandedQuery(query: string): boolean {
  const lower = query.toLowerCase()
  return BRAND_PATTERNS.some(p => lower.includes(p))
}

// =====================================================
// Token Management (reuse Google OAuth pattern)
// =====================================================

async function getGoogleTokens(service: string): Promise<{
  accessToken: string
  refreshToken: string
  propertyId: string
  extraConfig: Record<string, any>
} | null> {
  const admin = createAdminClient()
  const { data } = await (admin as any)
    .from('marketing_seo_config')
    .select('*')
    .eq('service', service)
    .eq('is_active', true)
    .single()

  if (!data || !data.access_token) return null

  // Check token expiry and refresh if needed
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
    const refreshed = await refreshGoogleToken(data.refresh_token, service)
    if (!refreshed) return null
    return {
      accessToken: refreshed.access_token,
      refreshToken: data.refresh_token,
      propertyId: data.property_id || '',
      extraConfig: data.extra_config || {},
    }
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    propertyId: data.property_id || '',
    extraConfig: data.extra_config || {},
  }
}

async function refreshGoogleToken(refreshToken: string, service: string): Promise<{ access_token: string } | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) return null
    const data = await res.json()

    // Update token in DB
    const admin = createAdminClient()
    await (admin as any)
      .from('marketing_seo_config')
      .update({
        access_token: data.access_token,
        token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('service', service)

    return { access_token: data.access_token }
  } catch {
    return null
  }
}

// =====================================================
// Google Search Console Fetcher
// =====================================================

export async function fetchGSCData(targetDate: string, sites?: string[]): Promise<{ success: boolean; error?: string }> {
  const tokens = await getGoogleTokens('google_search_console')
  if (!tokens) return { success: false, error: 'Google Search Console not configured or token expired' }

  const admin = createAdminClient()
  const configSites = sites || tokens.extraConfig.sites || ['sc-domain:ugc.id']

  for (const siteUrl of configSites) {
    const siteName = siteUrl.replace('sc-domain:', '').replace('https://', '').replace('/', '')

    try {
      // 1. Fetch daily aggregate (all devices combined)
      const dailyRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: targetDate,
            endDate: targetDate,
            dimensions: [],
            type: 'web',
          }),
        }
      )

      if (!dailyRes.ok) {
        const err = await dailyRes.text()
        throw new Error(`GSC daily fetch failed: ${err}`)
      }

      const dailyData = await dailyRes.json()
      const row = dailyData.rows?.[0] || {}

      // 2. Fetch device breakdown
      const deviceRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: targetDate,
            endDate: targetDate,
            dimensions: ['device'],
            type: 'web',
          }),
        }
      )

      const deviceData = deviceRes.ok ? await deviceRes.json() : { rows: [] }
      const deviceMap: Record<string, number> = {}
      for (const dr of deviceData.rows || []) {
        deviceMap[dr.keys[0]] = dr.clicks || 0
      }

      // Upsert daily snapshot
      await (admin as any).from('marketing_seo_daily_snapshot').upsert({
        fetch_date: targetDate,
        site: siteName,
        gsc_total_clicks: row.clicks || 0,
        gsc_total_impressions: row.impressions || 0,
        gsc_avg_ctr: row.ctr || 0,
        gsc_avg_position: row.position || 0,
        gsc_desktop_clicks: deviceMap['DESKTOP'] || 0,
        gsc_mobile_clicks: deviceMap['MOBILE'] || 0,
        gsc_tablet_clicks: deviceMap['TABLET'] || 0,
      }, { onConflict: 'fetch_date,site' })

      // 3. Fetch keyword data (top 5000 by clicks)
      const kwRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: targetDate,
            endDate: targetDate,
            dimensions: ['query'],
            rowLimit: 5000,
            type: 'web',
          }),
        }
      )

      if (kwRes.ok) {
        const kwData = await kwRes.json()
        const keywords = (kwData.rows || []).map((r: any) => ({
          fetch_date: targetDate,
          site: siteName,
          query: r.keys[0],
          clicks: r.clicks || 0,
          impressions: r.impressions || 0,
          ctr: r.ctr || 0,
          position: r.position || 0,
          device: null,
          country: null,
          is_branded: isBrandedQuery(r.keys[0]),
        }))

        if (keywords.length > 0) {
          // Delete existing then insert (upsert with composite keys is tricky for bulk)
          await (admin as any).from('marketing_seo_keywords')
            .delete()
            .eq('fetch_date', targetDate)
            .eq('site', siteName)
            .is('device', null)
            .is('country', null)

          // Insert in batches of 500
          for (let i = 0; i < keywords.length; i += 500) {
            await (admin as any).from('marketing_seo_keywords').insert(keywords.slice(i, i + 500))
          }
        }
      }

      // 4. Fetch page data (top 1000)
      const pageRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: targetDate,
            endDate: targetDate,
            dimensions: ['page'],
            rowLimit: 1000,
            type: 'web',
          }),
        }
      )

      if (pageRes.ok) {
        const pageData = await pageRes.json()
        const pages = (pageData.rows || []).map((r: any) => ({
          fetch_date: targetDate,
          site: siteName,
          page_url: r.keys[0],
          gsc_clicks: r.clicks || 0,
          gsc_impressions: r.impressions || 0,
          gsc_ctr: r.ctr || 0,
          gsc_position: r.position || 0,
        }))

        if (pages.length > 0) {
          await (admin as any).from('marketing_seo_pages')
            .delete()
            .eq('fetch_date', targetDate)
            .eq('site', siteName)

          for (let i = 0; i < pages.length; i += 500) {
            await (admin as any).from('marketing_seo_pages').insert(pages.slice(i, i + 500))
          }
        }
      }

      // Update last fetch
      await (admin as any).from('marketing_seo_config')
        .update({ last_fetch_at: new Date().toISOString(), last_fetch_error: null })
        .eq('service', 'google_search_console')

    } catch (err: any) {
      await (admin as any).from('marketing_seo_config')
        .update({ last_fetch_error: err.message })
        .eq('service', 'google_search_console')
      return { success: false, error: `GSC fetch error for ${siteName}: ${err.message}` }
    }
  }

  return { success: true }
}

// =====================================================
// Google Analytics 4 Fetcher
// =====================================================

export async function fetchGA4Data(targetDate: string, site?: string): Promise<{ success: boolean; error?: string }> {
  const tokens = await getGoogleTokens('google_analytics')
  if (!tokens) return { success: false, error: 'Google Analytics not configured or token expired' }

  const admin = createAdminClient()

  // Support multiple properties from extra_config.properties
  // Fallback to single property_id for backward compatibility
  const properties: Array<{ property_id: string; site: string }> = tokens.extraConfig.properties || []
  if (properties.length === 0 && tokens.propertyId) {
    properties.push({ property_id: tokens.propertyId, site: site || tokens.extraConfig.site || 'ugc.id' })
  }

  if (properties.length === 0) {
    return { success: false, error: 'GA4 property_id not configured' }
  }

  const errors: string[] = []

  for (const prop of properties) {
    const propertyId = prop.property_id
    const siteName = prop.site || 'ugc.id'

    try {
      // 1. Fetch organic sessions aggregate
      const reportRes = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: targetDate, endDate: targetDate }],
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [
              { name: 'sessions' },
              { name: 'totalUsers' },
              { name: 'newUsers' },
              { name: 'engagedSessions' },
              { name: 'engagementRate' },
              { name: 'averageSessionDuration' },
              { name: 'bounceRate' },
              { name: 'conversions' },
              { name: 'screenPageViews' },
            ],
            dimensionFilter: {
              filter: {
                fieldName: 'sessionDefaultChannelGroup',
                stringFilter: { matchType: 'EXACT', value: 'Organic Search' },
              },
            },
          }),
        }
      )

      if (!reportRes.ok) {
        const err = await reportRes.text()
        throw new Error(`GA4 report failed for ${siteName} (${propertyId}): ${err}`)
      }

      const report = await reportRes.json()
      const row = report.rows?.[0]

      if (row) {
        const metrics = row.metricValues || []
        await (admin as any).from('marketing_seo_daily_snapshot').upsert({
          fetch_date: targetDate,
          site: siteName,
          ga_organic_sessions: parseInt(metrics[0]?.value || '0'),
          ga_organic_users: parseInt(metrics[1]?.value || '0'),
          ga_organic_new_users: parseInt(metrics[2]?.value || '0'),
          ga_organic_engaged_sessions: parseInt(metrics[3]?.value || '0'),
          ga_organic_engagement_rate: parseFloat(metrics[4]?.value || '0'),
          ga_organic_avg_session_duration: parseFloat(metrics[5]?.value || '0'),
          ga_organic_bounce_rate: parseFloat(metrics[6]?.value || '0'),
          ga_organic_conversions: parseInt(metrics[7]?.value || '0'),
          ga_organic_page_views: parseInt(metrics[8]?.value || '0'),
        }, { onConflict: 'fetch_date,site' })
      }

      // 2. Fetch per-page organic data
      const pageReportRes = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: targetDate, endDate: targetDate }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [
              { name: 'sessions' },
              { name: 'totalUsers' },
              { name: 'engagementRate' },
              { name: 'averageSessionDuration' },
              { name: 'bounceRate' },
              { name: 'conversions' },
            ],
            dimensionFilter: {
              filter: {
                fieldName: 'sessionDefaultChannelGroup',
                stringFilter: { matchType: 'EXACT', value: 'Organic Search' },
              },
            },
            limit: 500,
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          }),
        }
      )

      if (pageReportRes.ok) {
        const pageReport = await pageReportRes.json()
        for (const pr of pageReport.rows || []) {
          const pagePath = pr.dimensionValues[0]?.value
          const m = pr.metricValues || []
          if (!pagePath) continue

          const pageUrl = `https://${siteName}${pagePath}`
          await (admin as any).from('marketing_seo_pages')
            .upsert({
              fetch_date: targetDate,
              site: siteName,
              page_url: pageUrl,
              ga_sessions: parseInt(m[0]?.value || '0'),
              ga_users: parseInt(m[1]?.value || '0'),
              ga_engagement_rate: parseFloat(m[2]?.value || '0'),
              ga_avg_session_duration: parseFloat(m[3]?.value || '0'),
              ga_bounce_rate: parseFloat(m[4]?.value || '0'),
              ga_conversions: parseInt(m[5]?.value || '0'),
            }, { onConflict: 'fetch_date,site,page_url' })
        }
      }
    } catch (err: any) {
      errors.push(err.message)
    }
  }

  if (errors.length > 0 && errors.length === properties.length) {
    // All properties failed
    await (admin as any).from('marketing_seo_config')
      .update({ last_fetch_error: errors.join('; ') })
      .eq('service', 'google_analytics')
    return { success: false, error: `GA4 fetch errors: ${errors.join('; ')}` }
  }

  await (admin as any).from('marketing_seo_config')
    .update({
      last_fetch_at: new Date().toISOString(),
      last_fetch_error: errors.length > 0 ? `Partial: ${errors.join('; ')}` : null,
    })
    .eq('service', 'google_analytics')

  return { success: true }
}

// =====================================================
// PageSpeed Insights Fetcher
// =====================================================

export async function fetchPageSpeedData(urls?: string[]): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: config } = await (admin as any)
    .from('marketing_seo_config')
    .select('*')
    .eq('service', 'pagespeed')
    .single()

  const apiKey = config?.api_key || process.env.PAGESPEED_API_KEY
  if (!apiKey) return { success: false, error: 'PageSpeed API key not configured' }

  const targetUrls = urls || config?.extra_config?.urls || ['https://ugc.id', 'https://utamaglobalindocargo.com']
  const today = new Date().toISOString().split('T')[0]

  for (const url of targetUrls) {
    for (const strategy of ['mobile', 'desktop'] as const) {
      try {
        const params = new URLSearchParams({
          url,
          strategy,
          category: 'performance',
          key: apiKey,
        })

        const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`)
        if (!res.ok) {
          const err = await res.text()
          console.error(`PageSpeed fetch failed for ${url} (${strategy}): ${err}`)
          continue
        }

        const data = await res.json()
        const lhr = data.lighthouseResult
        if (!lhr) continue

        const audits = lhr.audits || {}
        const categories = lhr.categories || {}

        // INP is a field metric (real user data), not available in lab tests
        // Extract from CrUX loadingExperience if available
        const cruxMetrics = data.loadingExperience?.metrics || {}
        const cruxInp = cruxMetrics.INTERACTION_TO_NEXT_PAINT
        const inpMs = cruxInp?.percentile ?? null
        const inpCategory = cruxInp?.category || null

        // CrUX values for LCP/CLS (more accurate than lab when available)
        const cruxLcp = cruxMetrics.LARGEST_CONTENTFUL_PAINT_MS
        const cruxCls = cruxMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE

        // TBT - Total Blocking Time (30% weight, highest in Lighthouse!)
        const tbtMs = audits['total-blocking-time']?.numericValue ?? null
        const tbtRating = getVitalRating('tbt', tbtMs)

        // Extract diagnostics & opportunities from audit refs
        const perfCategory = categories.performance
        const auditRefs = perfCategory?.auditRefs || []
        const diagnostics: Array<{ id: string; title: string; description: string; displayValue?: string; score?: number; numericValue?: number }> = []
        const opportunities: Array<{ id: string; title: string; description: string; displayValue?: string; overallSavingsMs?: number; overallSavingsBytes?: number; score?: number }> = []

        for (const ref of auditRefs) {
          const audit = audits[ref.id]
          if (!audit) continue

          // Diagnostics: group === 'diagnostics', score < 1 means has issues
          if (ref.group === 'diagnostics' && audit.score !== null && audit.score < 1) {
            diagnostics.push({
              id: ref.id,
              title: audit.title || ref.id,
              description: audit.description || '',
              displayValue: audit.displayValue || undefined,
              score: audit.score,
              numericValue: audit.numericValue,
            })
          }

          // Opportunities: look for audits with details.overallSavingsMs
          if (audit.details?.overallSavingsMs > 0 || audit.details?.overallSavingsBytes > 0) {
            opportunities.push({
              id: ref.id,
              title: audit.title || ref.id,
              description: audit.description || '',
              displayValue: audit.displayValue || undefined,
              overallSavingsMs: audit.details.overallSavingsMs || 0,
              overallSavingsBytes: audit.details.overallSavingsBytes || 0,
              score: audit.score,
            })
          }
        }

        // Sort opportunities by potential savings (ms) descending
        opportunities.sort((a, b) => (b.overallSavingsMs || 0) - (a.overallSavingsMs || 0))

        // Resource breakdown from resource-summary audit
        const resourceSummary = audits['resource-summary']?.details?.items || []
        const resources: Array<{ resourceType: string; label: string; requestCount: number; transferSize: number }> = []
        for (const item of resourceSummary) {
          if (item.resourceType && item.resourceType !== 'total') {
            resources.push({
              resourceType: item.resourceType,
              label: item.label || item.resourceType,
              requestCount: item.requestCount || 0,
              transferSize: item.transferSize || 0,
            })
          }
        }
        // Total byte weight
        const totalByteWeight = audits['total-byte-weight']?.numericValue || null

        // Origin-level CrUX data (aggregated across entire domain)
        const originCrux = data.originLoadingExperience || null
        const originMetrics = originCrux?.metrics || {}

        await (admin as any).from('marketing_seo_web_vitals').upsert({
          fetch_date: today,
          page_url: url,
          strategy,
          performance_score: (perfCategory?.score || 0) * 100,
          lcp_ms: audits['largest-contentful-paint']?.numericValue || null,
          cls: audits['cumulative-layout-shift']?.numericValue || null,
          inp_ms: inpMs,
          fcp_ms: audits['first-contentful-paint']?.numericValue || null,
          ttfb_ms: audits['server-response-time']?.numericValue || null,
          speed_index_ms: audits['speed-index']?.numericValue || null,
          tbt_ms: tbtMs,
          tbt_rating: tbtRating,
          lcp_rating: cruxLcp?.category || getVitalRating('lcp', audits['largest-contentful-paint']?.numericValue),
          cls_rating: cruxCls?.category || getVitalRating('cls', audits['cumulative-layout-shift']?.numericValue),
          inp_rating: inpCategory || 'N/A',
          raw_response: {
            version: lhr.lighthouseVersion,
            categories: perfCategory,
            diagnostics,
            opportunities,
            resources,
            totalByteWeight,
            loadingExperience: data.loadingExperience ? {
              overall_category: data.loadingExperience.overall_category,
              metrics: cruxMetrics,
            } : null,
            originLoadingExperience: originCrux ? {
              overall_category: originCrux.overall_category,
              metrics: {
                LCP: originMetrics.LARGEST_CONTENTFUL_PAINT_MS ? { percentile: originMetrics.LARGEST_CONTENTFUL_PAINT_MS.percentile, category: originMetrics.LARGEST_CONTENTFUL_PAINT_MS.category } : null,
                CLS: originMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE ? { percentile: originMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile, category: originMetrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.category } : null,
                INP: originMetrics.INTERACTION_TO_NEXT_PAINT ? { percentile: originMetrics.INTERACTION_TO_NEXT_PAINT.percentile, category: originMetrics.INTERACTION_TO_NEXT_PAINT.category } : null,
                FCP: originMetrics.FIRST_CONTENTFUL_PAINT_MS ? { percentile: originMetrics.FIRST_CONTENTFUL_PAINT_MS.percentile, category: originMetrics.FIRST_CONTENTFUL_PAINT_MS.category } : null,
                TTFB: originMetrics.EXPERIMENTAL_TIME_TO_FIRST_BYTE ? { percentile: originMetrics.EXPERIMENTAL_TIME_TO_FIRST_BYTE.percentile, category: originMetrics.EXPERIMENTAL_TIME_TO_FIRST_BYTE.category } : null,
              },
            } : null,
          },
        }, { onConflict: 'fetch_date,page_url,strategy' })

      } catch (err: any) {
        console.error(`PageSpeed error for ${url} (${strategy}):`, err.message)
      }
    }
  }

  await (admin as any).from('marketing_seo_config')
    .update({ last_fetch_at: new Date().toISOString(), last_fetch_error: null })
    .eq('service', 'pagespeed')

  return { success: true }
}

function getVitalRating(type: string, value: number | null | undefined): string {
  if (value == null) return 'UNKNOWN'
  switch (type) {
    case 'lcp': return value <= 2500 ? 'FAST' : value <= 4000 ? 'AVERAGE' : 'SLOW'
    case 'cls': return value <= 0.1 ? 'FAST' : value <= 0.25 ? 'AVERAGE' : 'SLOW'
    case 'inp': return value <= 200 ? 'FAST' : value <= 500 ? 'AVERAGE' : 'SLOW'
    case 'tbt': return value <= 200 ? 'FAST' : value <= 600 ? 'AVERAGE' : 'SLOW'
    default: return 'UNKNOWN'
  }
}

// =====================================================
// Orchestrator: run all fetchers
// =====================================================

export async function runDailySEOFetch(): Promise<{
  results: { service: string; success: boolean; error?: string }[]
}> {
  // GSC data is delayed 2-3 days
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() - 3)
  const dateStr = targetDate.toISOString().split('T')[0]

  const results = []

  // Fetch GSC data
  results.push({ service: 'google_search_console', ...await fetchGSCData(dateStr) })

  // Fetch GA4 data
  results.push({ service: 'google_analytics', ...await fetchGA4Data(dateStr) })

  return { results }
}

export async function runWeeklyVitalsFetch(): Promise<{
  results: { service: string; success: boolean; error?: string }[]
}> {
  const results = []
  results.push({ service: 'pagespeed', ...await fetchPageSpeedData() })
  return { results }
}
