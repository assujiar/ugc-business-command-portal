// =====================================================
// GET/POST /api/marketing/seo-sem/config
// Manage SEO-SEM service configuration
// GET: fetch all config statuses
// POST: update config (API keys, URLs, property IDs, etc.)
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel, isAdmin } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: configs } = await (admin as any)
      .from('marketing_seo_config')
      .select('id, service, is_active, property_id, extra_config, last_fetch_at, last_fetch_error, token_expires_at, created_at, updated_at')
      .order('service')

    // Mask sensitive data - only show connection status
    const safeConfigs = (configs || []).map((c: any) => ({
      id: c.id,
      service: c.service,
      is_active: c.is_active,
      is_connected: c.is_active && !c.last_fetch_error,
      has_token: !!c.token_expires_at,
      token_valid: c.token_expires_at ? new Date(c.token_expires_at) > new Date() : false,
      property_id: c.property_id || null,
      extra_config: c.extra_config || {},
      last_fetch_at: c.last_fetch_at,
      last_fetch_error: c.last_fetch_error,
      updated_at: c.updated_at,
    }))

    // Generate OAuth URLs for services that need it
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const redirectUri = `${appUrl}/api/auth/google/callback`
    const clientId = process.env.GOOGLE_CLIENT_ID || ''

    const oauthUrls: Record<string, string> = {}

    if (clientId) {
      // GSC OAuth URL
      oauthUrls.google_search_console = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        access_type: 'offline',
        prompt: 'consent',
        state: 'google_search_console',
      })}`

      // GA4 OAuth URL
      oauthUrls.google_analytics = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/analytics',
        access_type: 'offline',
        prompt: 'consent',
        state: 'google_analytics',
      })}`
    }

    return NextResponse.json({
      configs: safeConfigs,
      oauthUrls,
      hasGoogleClientId: !!clientId,
      hasPageSpeedKey: !!(process.env.PAGESPEED_API_KEY),
    })
  } catch (error) {
    console.error('SEO-SEM config error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Only admin/director can modify settings
    if (!isAdmin(profile.role as any)) {
      return NextResponse.json({ error: 'Only Director/Super Admin can modify settings' }, { status: 403 })
    }

    const body = await request.json()
    const { action, service, data } = body

    const admin = createAdminClient()

    switch (action) {
      case 'update_pagespeed_key': {
        // Store PageSpeed API key in config
        await (admin as any).from('marketing_seo_config')
          .update({
            api_key: data.api_key,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('service', 'pagespeed')
        return NextResponse.json({ success: true })
      }

      case 'update_pagespeed_urls': {
        // Update monitored URLs
        const { data: existing } = await (admin as any).from('marketing_seo_config')
          .select('extra_config')
          .eq('service', 'pagespeed')
          .single()

        await (admin as any).from('marketing_seo_config')
          .update({
            extra_config: { ...(existing?.extra_config || {}), urls: data.urls },
            updated_at: new Date().toISOString(),
          })
          .eq('service', 'pagespeed')
        return NextResponse.json({ success: true })
      }

      case 'update_gsc_sites': {
        const { data: existing } = await (admin as any).from('marketing_seo_config')
          .select('extra_config')
          .eq('service', 'google_search_console')
          .single()

        await (admin as any).from('marketing_seo_config')
          .update({
            extra_config: { ...(existing?.extra_config || {}), sites: data.sites },
            updated_at: new Date().toISOString(),
          })
          .eq('service', 'google_search_console')
        return NextResponse.json({ success: true })
      }

      case 'update_ga4_property': {
        await (admin as any).from('marketing_seo_config')
          .update({
            property_id: data.property_id,
            extra_config: { ...(data.extra_config || {}), site: data.site },
            updated_at: new Date().toISOString(),
          })
          .eq('service', 'google_analytics')
        return NextResponse.json({ success: true })
      }

      case 'update_ga4_properties': {
        // Multiple GA4 properties support
        const properties = data.properties || []
        const primaryPropertyId = properties[0]?.property_id || ''
        const primarySite = properties[0]?.site || ''

        // Get existing extra_config to preserve tokens etc
        const { data: existing } = await (admin as any).from('marketing_seo_config')
          .select('extra_config')
          .eq('service', 'google_analytics')
          .single()

        await (admin as any).from('marketing_seo_config')
          .update({
            property_id: primaryPropertyId,
            extra_config: { ...(existing?.extra_config || {}), site: primarySite, properties },
            updated_at: new Date().toISOString(),
          })
          .eq('service', 'google_analytics')
        return NextResponse.json({ success: true })
      }

      case 'disconnect': {
        await (admin as any).from('marketing_seo_config')
          .update({
            access_token: null,
            refresh_token: null,
            token_expires_at: null,
            is_active: false,
            api_key: service === 'pagespeed' ? null : undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('service', service)
        return NextResponse.json({ success: true })
      }

      case 'toggle_active': {
        await (admin as any).from('marketing_seo_config')
          .update({ is_active: data.is_active, updated_at: new Date().toISOString() })
          .eq('service', service)
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('SEO-SEM config update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
