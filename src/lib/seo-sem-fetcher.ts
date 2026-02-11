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

export async function fetchGSCData(targetDate: string, endDate?: string, sites?: string[]): Promise<{ success: boolean; error?: string }> {
  const tokens = await getGoogleTokens('google_search_console')
  if (!tokens) return { success: false, error: 'Google Search Console not configured or token expired' }

  const admin = createAdminClient()
  const configSites = sites || tokens.extraConfig.sites || ['sc-domain:ugc.id']
  const dateFrom = targetDate
  const dateTo = endDate || targetDate

  for (const siteUrl of configSites) {
    const siteName = siteUrl.replace('sc-domain:', '').replace('https://', '').replace('/', '')

    try {
      // 1. Fetch daily aggregate with date dimension for range support
      const dailyRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: dateFrom,
            endDate: dateTo,
            dimensions: ['date'],
            type: 'web',
          }),
        }
      )

      if (!dailyRes.ok) {
        const err = await dailyRes.text()
        throw new Error(`GSC daily fetch failed: ${err}`)
      }

      const dailyData = await dailyRes.json()

      // 2. Fetch device breakdown per date
      const deviceRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: dateFrom,
            endDate: dateTo,
            dimensions: ['date', 'device'],
            type: 'web',
          }),
        }
      )

      const deviceData = deviceRes.ok ? await deviceRes.json() : { rows: [] }
      // Group device data by date
      const deviceByDate = new Map<string, Record<string, number>>()
      for (const dr of deviceData.rows || []) {
        const d = dr.keys[0]
        if (!deviceByDate.has(d)) deviceByDate.set(d, {})
        deviceByDate.get(d)![dr.keys[1]] = dr.clicks || 0
      }

      // Upsert daily snapshots
      const snapshots = (dailyData.rows || []).map((row: any) => {
        const d = row.keys[0]
        const dm = deviceByDate.get(d) || {}
        return {
          fetch_date: d,
          site: siteName,
          gsc_total_clicks: row.clicks || 0,
          gsc_total_impressions: row.impressions || 0,
          gsc_avg_ctr: row.ctr || 0,
          gsc_avg_position: row.position || 0,
          gsc_desktop_clicks: dm['DESKTOP'] || 0,
          gsc_mobile_clicks: dm['MOBILE'] || 0,
          gsc_tablet_clicks: dm['TABLET'] || 0,
        }
      })

      for (let i = 0; i < snapshots.length; i += 100) {
        await (admin as any).from('marketing_seo_daily_snapshot')
          .upsert(snapshots.slice(i, i + 100), { onConflict: 'fetch_date,site' })
      }

      // 3. Fetch keyword data (top 5000 by clicks, aggregated across range)
      const kwRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: dateFrom,
            endDate: dateTo,
            dimensions: ['date', 'query'],
            rowLimit: 5000,
            type: 'web',
          }),
        }
      )

      if (kwRes.ok) {
        const kwData = await kwRes.json()
        const keywords = (kwData.rows || []).map((r: any) => ({
          fetch_date: r.keys[0],
          site: siteName,
          query: r.keys[1],
          clicks: r.clicks || 0,
          impressions: r.impressions || 0,
          ctr: r.ctr || 0,
          position: r.position || 0,
          device: null,
          country: null,
          is_branded: isBrandedQuery(r.keys[1]),
        }))

        if (keywords.length > 0) {
          // Delete range then bulk insert
          await (admin as any).from('marketing_seo_keywords')
            .delete()
            .eq('site', siteName)
            .gte('fetch_date', dateFrom)
            .lte('fetch_date', dateTo)
            .is('device', null)
            .is('country', null)

          for (let i = 0; i < keywords.length; i += 500) {
            await (admin as any).from('marketing_seo_keywords').insert(keywords.slice(i, i + 500))
          }
        }
      }

      // 4. Fetch page data (top 1000, aggregated across range)
      const pageRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: dateFrom,
            endDate: dateTo,
            dimensions: ['date', 'page'],
            rowLimit: 1000,
            type: 'web',
          }),
        }
      )

      if (pageRes.ok) {
        const pageData = await pageRes.json()
        const pages = (pageData.rows || []).map((r: any) => ({
          fetch_date: r.keys[0],
          site: siteName,
          page_url: r.keys[1],
          gsc_clicks: r.clicks || 0,
          gsc_impressions: r.impressions || 0,
          gsc_ctr: r.ctr || 0,
          gsc_position: r.position || 0,
        }))

        if (pages.length > 0) {
          await (admin as any).from('marketing_seo_pages')
            .delete()
            .eq('site', siteName)
            .gte('fetch_date', dateFrom)
            .lte('fetch_date', dateTo)

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

export async function fetchGA4Data(targetDate: string, endDate?: string, site?: string): Promise<{ success: boolean; error?: string }> {
  const tokens = await getGoogleTokens('google_analytics')
  if (!tokens) return { success: false, error: 'Google Analytics not configured or token expired' }

  const admin = createAdminClient()
  const dateFrom = targetDate
  const dateTo = endDate || targetDate

  // Support multiple properties from extra_config.properties
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
      // 1. Fetch organic sessions with date dimension for range support
      const reportRes = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
            dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
            metrics: [
              { name: 'sessions' },
              { name: 'totalUsers' },
              { name: 'newUsers' },
              { name: 'engagedSessions' },
              { name: 'engagementRate' },
              { name: 'averageSessionDuration' },
              { name: 'bounceRate' },
              { name: 'keyEvents' },
              { name: 'screenPageViews' },
            ],
            dimensionFilter: {
              filter: {
                fieldName: 'sessionDefaultChannelGroup',
                stringFilter: { matchType: 'EXACT', value: 'Organic Search' },
              },
            },
            limit: 10000,
          }),
        }
      )

      if (!reportRes.ok) {
        const err = await reportRes.text()
        throw new Error(`GA4 report failed for ${siteName} (${propertyId}): ${err}`)
      }

      const report = await reportRes.json()
      const snapshots: any[] = []

      for (const row of report.rows || []) {
        const rawDate = row.dimensionValues[0]?.value || '' // YYYYMMDD format
        const fetchDate = rawDate.length === 8
          ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
          : rawDate
        const metrics = row.metricValues || []

        snapshots.push({
          fetch_date: fetchDate,
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
        })
      }

      for (let i = 0; i < snapshots.length; i += 100) {
        await (admin as any).from('marketing_seo_daily_snapshot')
          .upsert(snapshots.slice(i, i + 100), { onConflict: 'fetch_date,site' })
      }

      // 2. Fetch per-page organic data (aggregated for latest date only to avoid huge data)
      const pageReportRes = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [
              { name: 'sessions' },
              { name: 'totalUsers' },
              { name: 'engagementRate' },
              { name: 'averageSessionDuration' },
              { name: 'bounceRate' },
              { name: 'keyEvents' },
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
        const pages: any[] = []
        for (const pr of pageReport.rows || []) {
          const pagePath = pr.dimensionValues[0]?.value
          const m = pr.metricValues || []
          if (!pagePath) continue

          pages.push({
            fetch_date: dateTo,
            site: siteName,
            page_url: `https://${siteName}${pagePath}`,
            ga_sessions: parseInt(m[0]?.value || '0'),
            ga_users: parseInt(m[1]?.value || '0'),
            ga_engagement_rate: parseFloat(m[2]?.value || '0'),
            ga_avg_session_duration: parseFloat(m[3]?.value || '0'),
            ga_bounce_rate: parseFloat(m[4]?.value || '0'),
            ga_conversions: parseInt(m[5]?.value || '0'),
          })
        }

        for (let i = 0; i < pages.length; i += 100) {
          await (admin as any).from('marketing_seo_pages')
            .upsert(pages.slice(i, i + 100), { onConflict: 'fetch_date,site,page_url' })
        }
      }
    } catch (err: any) {
      errors.push(err.message)
    }
  }

  if (errors.length > 0 && errors.length === properties.length) {
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
// Google Ads Fetcher (SEM)
// Uses Google Ads API REST + GAQL
// =====================================================

async function getGoogleAdsConfig(): Promise<{
  accessToken: string
  refreshToken: string
  customerId: string
  developerToken: string
  loginCustomerId: string
  extraConfig: Record<string, any>
} | null> {
  const admin = createAdminClient()
  const { data } = await (admin as any)
    .from('marketing_seo_config')
    .select('*')
    .eq('service', 'google_ads')
    .eq('is_active', true)
    .single()

  if (!data || !data.access_token) return null

  const devToken = data.extra_config?.developer_token || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
  const customerId = (data.extra_config?.customer_id || '').replace(/-/g, '')
  if (!devToken || !customerId) return null

  // Check token expiry and refresh if needed
  if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
    const refreshed = await refreshGoogleToken(data.refresh_token, 'google_ads')
    if (!refreshed) return null
    return {
      accessToken: refreshed.access_token,
      refreshToken: data.refresh_token,
      customerId,
      developerToken: devToken,
      loginCustomerId: (data.extra_config?.login_customer_id || '').replace(/-/g, ''),
      extraConfig: data.extra_config || {},
    }
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    customerId,
    developerToken: devToken,
    loginCustomerId: (data.extra_config?.login_customer_id || '').replace(/-/g, ''),
    extraConfig: data.extra_config || {},
  }
}

async function googleAdsQuery(config: { accessToken: string; customerId: string; developerToken: string; loginCustomerId: string }, query: string): Promise<any[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.accessToken}`,
    'developer-token': config.developerToken,
    'Content-Type': 'application/json',
  }
  if (config.loginCustomerId) {
    headers['login-customer-id'] = config.loginCustomerId
  }

  const res = await fetch(
    `https://googleads.googleapis.com/v23/customers/${config.customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Google Ads API error: ${err}`)
  }

  const data = await res.json()
  // searchStream returns array of result batches
  const allResults: any[] = []
  for (const batch of data) {
    if (batch.results) allResults.push(...batch.results)
  }
  return allResults
}

export async function fetchGoogleAdsData(targetDate: string, endDate?: string): Promise<{ success: boolean; error?: string }> {
  const config = await getGoogleAdsConfig()
  if (!config) return { success: false, error: 'Google Ads not configured or token expired' }

  const admin = createAdminClient()
  const dateFrom = targetDate
  const dateTo = endDate || targetDate
  const dateFilter = dateFrom === dateTo
    ? `segments.date = '${dateFrom}'`
    : `segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`

  try {
    // 1. Fetch campaign performance with segments.date for per-day breakdown
    const campaignResults = await googleAdsQuery(config, `
      SELECT
        segments.date,
        campaign.id, campaign.name, campaign.status,
        campaign_budget.amount_micros,
        metrics.cost_micros, metrics.impressions, metrics.clicks,
        metrics.ctr, metrics.average_cpc, metrics.conversions,
        metrics.conversions_value, metrics.cost_per_conversion,
        metrics.search_impression_share
      FROM campaign
      WHERE ${dateFilter}
        AND campaign.status != 'REMOVED'
    `)

    // Group results by date
    const campaignsByDate = new Map<string, any[]>()
    for (const r of campaignResults) {
      const rowDate = r.segments?.date || dateFrom
      if (!campaignsByDate.has(rowDate)) campaignsByDate.set(rowDate, [])
      campaignsByDate.get(rowDate)!.push(r)
    }

    const allCampaigns: any[] = []
    const allDailySpend: any[] = []

    campaignsByDate.forEach((rows, date) => {
      let totalSpend = 0, totalImpressions = 0, totalClicks = 0
      let totalConversions = 0, totalConversionValue = 0

      const campaigns = rows.map((r: any) => {
        const c = r.campaign || {}
        const m = r.metrics || {}
        const b = r.campaignBudget || {}

        // Google Ads REST API returns int64 fields as strings in JSON
        // Must explicitly convert to Number to avoid string concatenation bugs
        const spend = Number(m.costMicros || 0) / 1_000_000
        const clicks = Number(m.clicks) || 0
        const impressions = Number(m.impressions) || 0
        const conversions = parseFloat(m.conversions || '0')
        const convValue = parseFloat(m.conversionsValue || '0')
        const budget = Number(b.amountMicros || 0) / 1_000_000

        totalSpend += spend
        totalImpressions += impressions
        totalClicks += clicks
        totalConversions += conversions
        totalConversionValue += convValue

        return {
          fetch_date: date,
          platform: 'google_ads',
          campaign_id: String(c.id || ''),
          campaign_name: c.name || '',
          campaign_status: (c.status || '').toLowerCase(),
          spend,
          impressions,
          clicks,
          ctr: Number(m.ctr) || 0,
          avg_cpc: Number(m.averageCpc || 0) / 1_000_000,
          conversions,
          conversion_value: convValue,
          cost_per_conversion: spend > 0 && conversions > 0 ? spend / conversions : 0,
          roas: spend > 0 ? convValue / spend : 0,
          impression_share: Number(m.searchImpressionShare) || 0,
          quality_score_avg: null,
          daily_budget: budget,
          budget_utilization: budget > 0 ? (spend / budget) * 100 : 0,
        }
      })

      allCampaigns.push(...campaigns)

      const activeCampaigns = campaigns.filter((c: any) => c.campaign_status === 'enabled').length
      allDailySpend.push({
        fetch_date: date,
        platform: 'google_ads',
        total_spend: totalSpend,
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        total_conversions: totalConversions,
        total_conversion_value: totalConversionValue,
        avg_cpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
        avg_cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
        overall_roas: totalSpend > 0 ? totalConversionValue / totalSpend : 0,
        active_campaigns: activeCampaigns,
      })
    })

    // Upsert campaigns - delete date range first
    if (allCampaigns.length > 0) {
      let delQuery = (admin as any).from('marketing_sem_campaigns')
        .delete()
        .eq('platform', 'google_ads')
        .gte('fetch_date', dateFrom)
        .lte('fetch_date', dateTo)
      await delQuery

      for (let i = 0; i < allCampaigns.length; i += 100) {
        await (admin as any).from('marketing_sem_campaigns').insert(allCampaigns.slice(i, i + 100))
      }
    }

    // Upsert daily spend aggregates
    for (const ds of allDailySpend) {
      await (admin as any).from('marketing_sem_daily_spend').upsert(ds, { onConflict: 'fetch_date,platform' })
    }

    // 2. Fetch keyword performance (aggregate across date range, latest date only for keywords)
    try {
      const kwResults = await googleAdsQuery(config, `
        SELECT
          segments.date,
          campaign.id, campaign.name,
          ad_group.id, ad_group.name,
          ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
          metrics.cost_micros, metrics.impressions, metrics.clicks,
          metrics.ctr, metrics.average_cpc, metrics.conversions,
          ad_group_criterion.quality_info.quality_score
        FROM keyword_view
        WHERE ${dateFilter}
        ORDER BY metrics.cost_micros DESC
        LIMIT 1000
      `)

      const keywords = kwResults.map((r: any) => {
        const kw = r.adGroupCriterion?.keyword || {}
        const m = r.metrics || {}
        const qi = r.adGroupCriterion?.qualityInfo || {}
        return {
          fetch_date: r.segments?.date || dateFrom,
          campaign_id: String(r.campaign?.id || ''),
          campaign_name: r.campaign?.name || '',
          ad_group_id: String(r.adGroup?.id || ''),
          ad_group_name: r.adGroup?.name || '',
          keyword_text: kw.text || '',
          match_type: (kw.matchType || '').toLowerCase(),
          spend: Number(m.costMicros || 0) / 1_000_000,
          impressions: Number(m.impressions) || 0,
          clicks: Number(m.clicks) || 0,
          ctr: Number(m.ctr) || 0,
          avg_cpc: Number(m.averageCpc || 0) / 1_000_000,
          conversions: parseFloat(m.conversions || '0'),
          quality_score: qi.qualityScore || null,
        }
      })

      if (keywords.length > 0) {
        await (admin as any).from('marketing_sem_keywords')
          .delete()
          .gte('fetch_date', dateFrom)
          .lte('fetch_date', dateTo)

        for (let i = 0; i < keywords.length; i += 500) {
          await (admin as any).from('marketing_sem_keywords').insert(keywords.slice(i, i + 500))
        }
      }
    } catch (kwErr: any) {
      console.error('Google Ads keyword fetch error:', kwErr.message)
    }

    // 3. Fetch search terms
    try {
      const stResults = await googleAdsQuery(config, `
        SELECT
          segments.date,
          search_term_view.search_term,
          campaign.name, ad_group.name,
          segments.keyword.info.text,
          metrics.impressions, metrics.clicks,
          metrics.cost_micros, metrics.conversions
        FROM search_term_view
        WHERE ${dateFilter}
        ORDER BY metrics.impressions DESC
        LIMIT 500
      `)

      const searchTerms = stResults.map((r: any) => {
        const m = r.metrics || {}
        return {
          fetch_date: r.segments?.date || dateFrom,
          search_term: r.searchTermView?.searchTerm || '',
          campaign_name: r.campaign?.name || '',
          ad_group_name: r.adGroup?.name || '',
          keyword_text: r.segments?.keyword?.info?.text || '',
          impressions: Number(m.impressions) || 0,
          clicks: Number(m.clicks) || 0,
          spend: Number(m.costMicros || 0) / 1_000_000,
          conversions: parseFloat(m.conversions || '0'),
        }
      })

      if (searchTerms.length > 0) {
        await (admin as any).from('marketing_sem_search_terms')
          .delete()
          .gte('fetch_date', dateFrom)
          .lte('fetch_date', dateTo)

        for (let i = 0; i < searchTerms.length; i += 500) {
          await (admin as any).from('marketing_sem_search_terms').insert(searchTerms.slice(i, i + 500))
        }
      }
    } catch (stErr: any) {
      console.error('Google Ads search terms fetch error:', stErr.message)
    }

    // Update last fetch
    await (admin as any).from('marketing_seo_config')
      .update({ last_fetch_at: new Date().toISOString(), last_fetch_error: null })
      .eq('service', 'google_ads')

    return { success: true }
  } catch (err: any) {
    await (admin as any).from('marketing_seo_config')
      .update({ last_fetch_error: err.message })
      .eq('service', 'google_ads')
    return { success: false, error: `Google Ads fetch error: ${err.message}` }
  }
}

// =====================================================
// GA4 Demographics Fetcher
// =====================================================

export async function fetchGA4Demographics(targetDate: string, endDate?: string): Promise<{ success: boolean; error?: string }> {
  const tokens = await getGoogleTokens('google_analytics')
  if (!tokens) return { success: false, error: 'Google Analytics not configured or token expired' }

  const admin = createAdminClient()
  const dateFrom = targetDate
  const dateTo = endDate || targetDate

  const properties: Array<{ property_id: string; site: string }> = tokens.extraConfig.properties || []
  if (properties.length === 0 && tokens.propertyId) {
    properties.push({ property_id: tokens.propertyId, site: tokens.extraConfig.site || 'ugc.id' })
  }

  if (properties.length === 0) {
    return { success: false, error: 'GA4 property_id not configured' }
  }

  const errors: string[] = []

  const dimensionConfigs = [
    { name: 'userAgeBracket', type: 'age' },
    { name: 'userGender', type: 'gender' },
    { name: 'country', type: 'country' },
    { name: 'city', type: 'city' },
    { name: 'newVsReturning', type: 'new_returning' },
    { name: 'language', type: 'language' },
  ]

  for (const prop of properties) {
    const propertyId = prop.property_id
    const siteName = prop.site || 'ugc.id'

    for (const dimConfig of dimensionConfigs) {
      try {
        const reportRes = await fetch(
          `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
              dimensions: [{ name: dimConfig.name }],
              metrics: [
                { name: 'sessions' },
                { name: 'totalUsers' },
                { name: 'newUsers' },
                { name: 'engagedSessions' },
                { name: 'engagementRate' },
                { name: 'bounceRate' },
                { name: 'keyEvents' },
                { name: 'screenPageViews' },
              ],
              orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
              limit: dimConfig.type === 'city' ? 50 : dimConfig.type === 'country' ? 30 : 100,
            }),
          }
        )

        if (!reportRes.ok) {
          const err = await reportRes.text()
          console.error(`GA4 demographics (${dimConfig.type}) failed:`, err)
          continue
        }

        const report = await reportRes.json()
        const rows: any[] = []

        for (const row of report.rows || []) {
          const dimValue = row.dimensionValues[0]?.value || '(unknown)'
          const m = row.metricValues || []

          rows.push({
            fetch_date: dateTo,
            site: siteName,
            dimension_type: dimConfig.type,
            dimension_value: dimValue,
            sessions: parseInt(m[0]?.value || '0'),
            users: parseInt(m[1]?.value || '0'),
            new_users: parseInt(m[2]?.value || '0'),
            engaged_sessions: parseInt(m[3]?.value || '0'),
            engagement_rate: parseFloat(m[4]?.value || '0'),
            bounce_rate: parseFloat(m[5]?.value || '0'),
            conversions: parseInt(m[6]?.value || '0'),
            page_views: parseInt(m[7]?.value || '0'),
          })
        }

        if (rows.length > 0) {
          await (admin as any).from('marketing_ga4_demographics')
            .delete()
            .eq('fetch_date', dateTo)
            .eq('site', siteName)
            .eq('dimension_type', dimConfig.type)

          for (let i = 0; i < rows.length; i += 100) {
            await (admin as any).from('marketing_ga4_demographics').insert(rows.slice(i, i + 100))
          }
        }
      } catch (err: any) {
        errors.push(`${dimConfig.type}: ${err.message}`)
      }
    }
  }

  if (errors.length > 0) {
    console.error('GA4 demographics partial errors:', errors.join('; '))
  }

  return { success: true }
}

// =====================================================
// GA4 UTM Tracking & Landing Pages Fetcher
// =====================================================

export async function fetchGA4UTMData(targetDate: string, endDate?: string): Promise<{ success: boolean; error?: string }> {
  const tokens = await getGoogleTokens('google_analytics')
  if (!tokens) return { success: false, error: 'Google Analytics not configured or token expired' }

  const admin = createAdminClient()
  const dateFrom = targetDate
  const dateTo = endDate || targetDate

  const properties: Array<{ property_id: string; site: string }> = tokens.extraConfig.properties || []
  if (properties.length === 0 && tokens.propertyId) {
    properties.push({ property_id: tokens.propertyId, site: tokens.extraConfig.site || 'ugc.id' })
  }

  if (properties.length === 0) {
    return { success: false, error: 'GA4 property_id not configured' }
  }

  const errors: string[] = []

  for (const prop of properties) {
    const propertyId = prop.property_id
    const siteName = prop.site || 'ugc.id'

    // 1. Fetch UTM/source attribution data
    try {
      const utmRes = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
            dimensions: [
              { name: 'sessionSource' },
              { name: 'sessionMedium' },
              { name: 'sessionCampaignName' },
              { name: 'sessionDefaultChannelGroup' },
            ],
            metrics: [
              { name: 'sessions' },
              { name: 'totalUsers' },
              { name: 'newUsers' },
              { name: 'engagedSessions' },
              { name: 'engagementRate' },
              { name: 'bounceRate' },
              { name: 'averageSessionDuration' },
              { name: 'screenPageViews' },
              { name: 'keyEvents' },
            ],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 500,
          }),
        }
      )

      if (utmRes.ok) {
        const report = await utmRes.json()
        const rows: any[] = []

        for (const row of report.rows || []) {
          const dims = row.dimensionValues || []
          const m = row.metricValues || []

          rows.push({
            fetch_date: dateTo,
            site: siteName,
            source: dims[0]?.value || '(direct)',
            medium: dims[1]?.value || '(none)',
            campaign: dims[2]?.value || '(not set)',
            channel_group: dims[3]?.value || null,
            sessions: parseInt(m[0]?.value || '0'),
            users: parseInt(m[1]?.value || '0'),
            new_users: parseInt(m[2]?.value || '0'),
            engaged_sessions: parseInt(m[3]?.value || '0'),
            engagement_rate: parseFloat(m[4]?.value || '0'),
            bounce_rate: parseFloat(m[5]?.value || '0'),
            avg_session_duration: parseFloat(m[6]?.value || '0'),
            page_views: parseInt(m[7]?.value || '0'),
            conversions: parseInt(m[8]?.value || '0'),
          })
        }

        if (rows.length > 0) {
          await (admin as any).from('marketing_ga4_utm_tracking')
            .delete()
            .eq('fetch_date', dateTo)
            .eq('site', siteName)

          for (let i = 0; i < rows.length; i += 100) {
            await (admin as any).from('marketing_ga4_utm_tracking').insert(rows.slice(i, i + 100))
          }
        }
      }
    } catch (err: any) {
      errors.push(`UTM: ${err.message}`)
    }

    // 2. Fetch landing page performance with source/medium
    try {
      const lpRes = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
            dimensions: [
              { name: 'landingPage' },
              { name: 'sessionSource' },
              { name: 'sessionMedium' },
            ],
            metrics: [
              { name: 'sessions' },
              { name: 'totalUsers' },
              { name: 'engagedSessions' },
              { name: 'engagementRate' },
              { name: 'bounceRate' },
              { name: 'keyEvents' },
            ],
            orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
            limit: 500,
          }),
        }
      )

      if (lpRes.ok) {
        const report = await lpRes.json()
        const rows: any[] = []

        for (const row of report.rows || []) {
          const dims = row.dimensionValues || []
          const m = row.metricValues || []

          rows.push({
            fetch_date: dateTo,
            site: siteName,
            landing_page: dims[0]?.value || '/',
            source: dims[1]?.value || '(direct)',
            medium: dims[2]?.value || '(none)',
            sessions: parseInt(m[0]?.value || '0'),
            users: parseInt(m[1]?.value || '0'),
            engaged_sessions: parseInt(m[2]?.value || '0'),
            engagement_rate: parseFloat(m[3]?.value || '0'),
            bounce_rate: parseFloat(m[4]?.value || '0'),
            conversions: parseInt(m[5]?.value || '0'),
          })
        }

        if (rows.length > 0) {
          await (admin as any).from('marketing_ga4_landing_pages')
            .delete()
            .eq('fetch_date', dateTo)
            .eq('site', siteName)

          for (let i = 0; i < rows.length; i += 100) {
            await (admin as any).from('marketing_ga4_landing_pages').insert(rows.slice(i, i + 100))
          }
        }
      }
    } catch (err: any) {
      errors.push(`Landing pages: ${err.message}`)
    }
  }

  if (errors.length > 0) {
    console.error('GA4 UTM fetch partial errors:', errors.join('; '))
  }

  return { success: true }
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

  // Fetch Google Ads data (uses yesterday, not 3 days ago)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]
  results.push({ service: 'google_ads', ...await fetchGoogleAdsData(yesterdayStr) })

  return { results }
}

export async function runWeeklyVitalsFetch(): Promise<{
  results: { service: string; success: boolean; error?: string }[]
}> {
  const results = []
  results.push({ service: 'pagespeed', ...await fetchPageSpeedData() })
  return { results }
}
