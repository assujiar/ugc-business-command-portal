// =====================================================
// GET /api/auth/social-media/[platform]
// Initiates OAuth flow for social media platforms
// Redirects user to the platform's authorization URL
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const VALID_PLATFORMS = ['tiktok', 'instagram', 'facebook', 'youtube', 'linkedin'] as const

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params

  if (!VALID_PLATFORMS.includes(platform as any)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
  }

  try {
    // Verify user is authenticated with marketing access
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: string } | null }

    if (!profile || !canAccessMarketingPanel(profile.role as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    const redirectUri = `${appUrl}/api/auth/social-media/${platform}/callback`
    const state = `${platform}_${Date.now()}`

    let authUrl: string

    switch (platform) {
      case 'tiktok': {
        const clientKey = process.env.TIKTOK_CLIENT_KEY
        if (!clientKey) {
          return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY not configured' }, { status: 500 })
        }
        const params = new URLSearchParams({
          client_key: clientKey,
          scope: 'user.info.basic,video.list',
          response_type: 'code',
          redirect_uri: redirectUri,
          state,
        })
        authUrl = `https://www.tiktok.com/v2/auth/authorize/?${params}`
        break
      }

      case 'instagram':
      case 'facebook': {
        const appId = process.env.META_APP_ID
        if (!appId) {
          return NextResponse.json({ error: 'META_APP_ID not configured' }, { status: 500 })
        }
        // Instagram needs pages_show_list, instagram_basic, instagram_manage_insights
        // Facebook needs pages_show_list, pages_read_engagement, read_insights
        const scopes = platform === 'instagram'
          ? 'pages_show_list,instagram_basic,instagram_manage_insights'
          : 'pages_show_list,pages_read_engagement,read_insights,pages_read_user_content'
        const params = new URLSearchParams({
          client_id: appId,
          redirect_uri: redirectUri,
          scope: scopes,
          response_type: 'code',
          state,
        })
        authUrl = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params}`
        break
      }

      case 'youtube': {
        const clientId = process.env.GOOGLE_CLIENT_ID
        if (!clientId) {
          return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 })
        }
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly',
          response_type: 'code',
          access_type: 'offline',
          prompt: 'consent',
          state,
        })
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
        break
      }

      case 'linkedin': {
        const clientId = process.env.LINKEDIN_CLIENT_ID
        if (!clientId) {
          return NextResponse.json({ error: 'LINKEDIN_CLIENT_ID not configured' }, { status: 500 })
        }
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: 'r_organization_social rw_organization_admin r_organization_followers w_member_social',
          response_type: 'code',
          state,
        })
        authUrl = `https://www.linkedin.com/oauth/v2/authorization?${params}`
        break
      }

      default:
        return NextResponse.json({ error: 'Platform not supported' }, { status: 400 })
    }

    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error(`[OAuth] Error initiating ${platform} auth:`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const GRAPH_API_VERSION = 'v21.0'
