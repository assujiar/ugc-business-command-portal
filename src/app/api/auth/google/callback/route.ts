// =====================================================
// Google OAuth2 Callback Handler
// Handles redirect after user grants consent for GSC/GA4
// Stores tokens in marketing_seo_config table
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // 1. Verify the user is authenticated and has marketing access
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) {
      return NextResponse.redirect(new URL('/marketing/seo-sem?error=forbidden', request.url))
    }

    // 2. Extract OAuth callback params
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state') // contains service name (e.g., 'google_search_console' or 'google_analytics')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(new URL(`/marketing/seo-sem?error=${encodeURIComponent(error)}&tab=settings`, request.url))
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/marketing/seo-sem?error=missing_code&tab=settings', request.url))
    }

    // 3. Exchange authorization code for tokens
    // Use request origin as most reliable source for redirect_uri
    // It MUST match exactly what was used in the OAuth initiation URL
    const requestOrigin = new URL(request.url).origin
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || requestOrigin
    const redirectUri = `${appUrl}/api/auth/google/callback`

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const errData = await tokenRes.text()
      console.error('Google token exchange failed:', errData)
      return NextResponse.redirect(new URL(`/marketing/seo-sem?error=token_exchange_failed&tab=settings`, request.url))
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in } = tokenData

    if (!access_token) {
      return NextResponse.redirect(new URL('/marketing/seo-sem?error=no_access_token&tab=settings', request.url))
    }

    // 4. Store tokens in marketing_seo_config
    const admin = createAdminClient()
    const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString()

    // Parse state to get service
    let service = state
    let propertyId = ''
    let ga4Properties: Array<{ property_id: string; site: string; name: string }> = []

    // For GA4, fetch ALL available properties
    if (service === 'google_analytics') {
      try {
        const accountsRes = await fetch(
          'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
          { headers: { Authorization: `Bearer ${access_token}` } }
        )
        if (accountsRes.ok) {
          const accountsData = await accountsRes.json()
          const summaries = accountsData.accountSummaries || []
          for (const acct of summaries) {
            for (const prop of acct.propertySummaries || []) {
              const pid = prop.property?.replace('properties/', '') || ''
              if (pid) {
                ga4Properties.push({
                  property_id: pid,
                  site: prop.displayName || '',
                  name: `${acct.displayName || ''} - ${prop.displayName || ''}`.trim().replace(/^- /, ''),
                })
                if (!propertyId) propertyId = pid // first as primary
              }
            }
          }
        }
      } catch (e) {
        console.error('Error fetching GA4 properties:', e)
      }
    }

    // For Google Ads, we just store the token (customer_id is set separately via settings)
    if (service === 'google_ads') {
      // Fetch accessible customer accounts
      try {
        const custRes = await fetch(
          `https://googleads.googleapis.com/v18/customers:listAccessibleCustomers`,
          { headers: { Authorization: `Bearer ${access_token}`, 'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '' } }
        )
        if (custRes.ok) {
          const custData = await custRes.json()
          const customerIds = (custData.resourceNames || []).map((r: string) => r.replace('customers/', ''))
          // Store detected customer IDs in extra_config
          if (customerIds.length > 0) {
            // Get existing config to preserve developer_token and customer_id
            const { data: existingAds } = await (admin as any).from('marketing_seo_config')
              .select('extra_config').eq('service', 'google_ads').single()
            const existingExtra = existingAds?.extra_config || {}
            updateData.extra_config = { ...existingExtra, detected_customers: customerIds }
          }
        }
      } catch (e) {
        console.error('Error listing Google Ads customers:', e)
      }
    }

    // For GSC, fetch available sites
    let gscSites: string[] = []
    if (service === 'google_search_console') {
      try {
        const sitesRes = await fetch(
          'https://www.googleapis.com/webmasters/v3/sites',
          { headers: { Authorization: `Bearer ${access_token}` } }
        )
        if (sitesRes.ok) {
          const sitesData = await sitesRes.json()
          gscSites = (sitesData.siteEntry || []).map((s: any) => s.siteUrl)
        }
      } catch (e) {
        console.error('Error fetching GSC sites:', e)
      }
    }

    const updateData: Record<string, any> = {
      access_token,
      token_expires_at: expiresAt,
      is_active: true,
      last_fetch_error: null,
      updated_at: new Date().toISOString(),
    }

    // Only update refresh_token if we got a new one (it's only sent on first auth)
    if (refresh_token) {
      updateData.refresh_token = refresh_token
    }

    if (propertyId) {
      updateData.property_id = propertyId
    }

    if (ga4Properties.length > 0) {
      updateData.extra_config = { properties: ga4Properties, site: ga4Properties[0]?.site || '' }
    }

    if (gscSites.length > 0) {
      updateData.extra_config = { sites: gscSites }
    }

    await (admin as any)
      .from('marketing_seo_config')
      .update(updateData)
      .eq('service', service)

    // 5. Redirect back to SEO-SEM settings with success
    return NextResponse.redirect(
      new URL(`/marketing/seo-sem?success=${service}&tab=settings`, request.url)
    )
  } catch (error) {
    console.error('Google OAuth callback error:', error)
    return NextResponse.redirect(new URL('/marketing/seo-sem?error=callback_failed&tab=settings', request.url))
  }
}
