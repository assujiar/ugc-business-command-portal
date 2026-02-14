// =====================================================
// GET /api/auth/social-media/[platform]/callback
// OAuth callback handler for social media platforms
// Exchanges auth code for tokens and stores in DB
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const GRAPH_API_VERSION = 'v21.0'
const VALID_PLATFORMS = ['tiktok', 'instagram', 'facebook', 'youtube', 'linkedin'] as const

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const redirectBase = '/marketing/digital-performance'

  if (!VALID_PLATFORMS.includes(platform as any)) {
    return NextResponse.redirect(new URL(`${redirectBase}?error=invalid_platform`, request.url))
  }

  try {
    // 1. Verify user is authenticated with marketing access
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
      return NextResponse.redirect(new URL(`${redirectBase}?error=forbidden`, request.url))
    }

    // 2. Extract OAuth callback params
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(
        new URL(`${redirectBase}?error=${encodeURIComponent(error)}&platform=${platform}`, request.url)
      )
    }

    if (!code) {
      return NextResponse.redirect(
        new URL(`${redirectBase}?error=missing_code&platform=${platform}`, request.url)
      )
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
    const redirectUri = `${appUrl}/api/auth/social-media/${platform}/callback`
    const admin = createAdminClient() as any

    let accessToken: string
    let refreshToken: string | undefined
    let expiresIn: number
    let accountId: string | undefined

    // 3. Exchange code for tokens (platform-specific)
    switch (platform) {
      case 'tiktok': {
        const clientKey = process.env.TIKTOK_CLIENT_KEY || ''
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET || ''

        const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }),
        })

        if (!tokenRes.ok) {
          const errText = await tokenRes.text()
          console.error('[OAuth/TikTok] Token exchange failed:', errText)
          return NextResponse.redirect(new URL(`${redirectBase}?error=token_exchange_failed&platform=tiktok`, request.url))
        }

        const tokenData = await tokenRes.json()
        accessToken = tokenData.access_token
        refreshToken = tokenData.refresh_token
        expiresIn = tokenData.expires_in || 86400
        accountId = tokenData.open_id
        break
      }

      case 'instagram':
      case 'facebook': {
        const appId = process.env.META_APP_ID || ''
        const appSecret = process.env.META_APP_SECRET || ''

        // Exchange code for short-lived token
        const tokenRes = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?` +
          new URLSearchParams({
            client_id: appId,
            client_secret: appSecret,
            redirect_uri: redirectUri,
            code,
          })
        )

        if (!tokenRes.ok) {
          const errText = await tokenRes.text()
          console.error(`[OAuth/${platform}] Token exchange failed:`, errText)
          return NextResponse.redirect(new URL(`${redirectBase}?error=token_exchange_failed&platform=${platform}`, request.url))
        }

        const shortLivedData = await tokenRes.json()

        // Exchange for long-lived token
        const longLivedRes = await fetch(
          `https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token?` +
          new URLSearchParams({
            grant_type: 'fb_exchange_token',
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: shortLivedData.access_token,
          })
        )

        if (!longLivedRes.ok) {
          // Fall back to short-lived token
          accessToken = shortLivedData.access_token
          expiresIn = shortLivedData.expires_in || 3600
        } else {
          const longLivedData = await longLivedRes.json()
          accessToken = longLivedData.access_token
          expiresIn = longLivedData.expires_in || 5184000 // 60 days
        }

        // For Instagram: get Instagram Business Account ID
        if (platform === 'instagram') {
          try {
            // Get pages, then get instagram_business_account from first page
            const pagesRes = await fetch(
              `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=instagram_business_account,name&access_token=${accessToken}`
            )
            if (pagesRes.ok) {
              const pagesData = await pagesRes.json()
              const pageWithIg = (pagesData.data || []).find((p: any) => p.instagram_business_account)
              if (pageWithIg?.instagram_business_account?.id) {
                accountId = pageWithIg.instagram_business_account.id
              }
            }
          } catch (e) {
            console.error('[OAuth/Instagram] Error fetching IG Business Account ID:', e)
          }
        } else {
          // Facebook: get page ID and page access token
          try {
            const pagesRes = await fetch(
              `https://graph.facebook.com/${GRAPH_API_VERSION}/me/accounts?fields=id,name,access_token&access_token=${accessToken}`
            )
            if (pagesRes.ok) {
              const pagesData = await pagesRes.json()
              const firstPage = pagesData.data?.[0]
              if (firstPage) {
                accountId = firstPage.id
                // Use page access token (never expires) instead of user token
                accessToken = firstPage.access_token
                expiresIn = 0 // page tokens don't expire
              }
            }
          } catch (e) {
            console.error('[OAuth/Facebook] Error fetching page info:', e)
          }
        }
        break
      }

      case 'youtube': {
        const clientId = process.env.GOOGLE_CLIENT_ID || ''
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        })

        if (!tokenRes.ok) {
          const errText = await tokenRes.text()
          console.error('[OAuth/YouTube] Token exchange failed:', errText)
          return NextResponse.redirect(new URL(`${redirectBase}?error=token_exchange_failed&platform=youtube`, request.url))
        }

        const tokenData = await tokenRes.json()
        accessToken = tokenData.access_token
        refreshToken = tokenData.refresh_token
        expiresIn = tokenData.expires_in || 3600

        // Get channel ID
        try {
          const channelRes = await fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          )
          if (channelRes.ok) {
            const channelData = await channelRes.json()
            accountId = channelData.items?.[0]?.id || process.env.YOUTUBE_CHANNEL_ID
          }
        } catch (e) {
          console.error('[OAuth/YouTube] Error fetching channel info:', e)
          accountId = process.env.YOUTUBE_CHANNEL_ID
        }
        break
      }

      case 'linkedin': {
        const clientId = process.env.LINKEDIN_CLIENT_ID || ''
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET || ''

        const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
          }),
        })

        if (!tokenRes.ok) {
          const errText = await tokenRes.text()
          console.error('[OAuth/LinkedIn] Token exchange failed:', errText)
          return NextResponse.redirect(new URL(`${redirectBase}?error=token_exchange_failed&platform=linkedin`, request.url))
        }

        const tokenData = await tokenRes.json()
        accessToken = tokenData.access_token
        refreshToken = tokenData.refresh_token
        expiresIn = tokenData.expires_in || 5184000

        accountId = process.env.LINKEDIN_ORGANIZATION_ID
        break
      }

      default:
        return NextResponse.redirect(new URL(`${redirectBase}?error=unsupported_platform`, request.url))
    }

    // 4. Store tokens in marketing_social_media_config (upsert)
    const expiresAt = expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null

    const upsertData: Record<string, any> = {
      platform,
      access_token: accessToken,
      is_active: true,
      updated_at: new Date().toISOString(),
    }

    if (refreshToken) {
      upsertData.refresh_token = refreshToken
    }
    if (expiresAt) {
      upsertData.token_expires_at = expiresAt
    }
    if (accountId) {
      upsertData.account_id = accountId
    }

    const { error: upsertError } = await admin
      .from('marketing_social_media_config')
      .upsert(upsertData, { onConflict: 'platform' })

    if (upsertError) {
      console.error(`[OAuth/${platform}] Failed to save tokens:`, upsertError)
      return NextResponse.redirect(
        new URL(`${redirectBase}?error=save_failed&platform=${platform}`, request.url)
      )
    }

    // 5. Redirect back to dashboard with success
    return NextResponse.redirect(
      new URL(`${redirectBase}?success=${platform}`, request.url)
    )
  } catch (error) {
    console.error(`[OAuth/${platform}] Callback error:`, error)
    return NextResponse.redirect(
      new URL(`${redirectBase}?error=callback_failed&platform=${platform}`, request.url)
    )
  }
}
