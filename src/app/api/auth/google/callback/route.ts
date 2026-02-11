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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
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

    // Parse state to get service and optional property_id
    let service = state
    let propertyId = ''

    // For GA4, we need to fetch available properties
    if (service === 'google_analytics') {
      // Try to get GA4 properties using the new token
      try {
        const accountsRes = await fetch(
          'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
          { headers: { Authorization: `Bearer ${access_token}` } }
        )
        if (accountsRes.ok) {
          const accountsData = await accountsRes.json()
          const summaries = accountsData.accountSummaries || []
          // Pick the first property (user can change later)
          for (const acct of summaries) {
            for (const prop of acct.propertySummaries || []) {
              if (!propertyId) {
                // Extract numeric property ID from resource name like 'properties/12345'
                propertyId = prop.property?.replace('properties/', '') || ''
              }
            }
          }
        }
      } catch (e) {
        console.error('Error fetching GA4 properties:', e)
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
