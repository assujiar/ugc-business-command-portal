// =====================================================
// POST /api/marketing/social-media/setup
// Initializes marketing_social_media_config from env vars
// Call once after deploying to seed the config table
//
// GET  - returns current config status
// POST - seeds/updates config from env vars
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin'] as const

// Platform configs derived from environment variables
function getPlatformSeeds(): Array<{
  platform: string
  account_id: string | null
  access_token: string | null
  api_base_url: string | null
  has_token: boolean
  note: string
}> {
  return [
    {
      platform: 'facebook',
      account_id: process.env.FACEBOOK_PAGE_ID || null,
      access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || null,
      api_base_url: 'https://graph.facebook.com/v21.0',
      has_token: !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
      note: 'Page Access Token (does not expire)',
    },
    {
      platform: 'instagram',
      account_id: null, // Will be populated via OAuth callback
      access_token: null, // Needs OAuth flow
      api_base_url: 'https://graph.facebook.com/v21.0',
      has_token: false,
      note: 'Requires OAuth - visit /api/auth/social-media/instagram',
    },
    {
      platform: 'youtube',
      account_id: process.env.YOUTUBE_CHANNEL_ID || null,
      access_token: null, // Needs OAuth flow
      api_base_url: 'https://www.googleapis.com/youtube/v3',
      has_token: false,
      note: 'Requires OAuth - visit /api/auth/social-media/youtube',
    },
    {
      platform: 'tiktok',
      account_id: null, // Will be populated via OAuth callback
      access_token: null, // Needs OAuth flow
      api_base_url: 'https://open.tiktokapis.com/v2',
      has_token: false,
      note: 'Requires OAuth - visit /api/auth/social-media/tiktok',
    },
    {
      platform: 'linkedin',
      account_id: process.env.LINKEDIN_ORGANIZATION_ID || null,
      access_token: null, // Needs OAuth flow
      api_base_url: 'https://api.linkedin.com',
      has_token: false,
      note: 'Requires OAuth - visit /api/auth/social-media/linkedin',
    },
  ]
}

async function verifyAccess(request: NextRequest) {
  // Allow service_role key (for automation/cron)
  const authHeader = request.headers.get('Authorization')
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '')
    if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return { authorized: true }
    }
  }

  // Otherwise check user session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { authorized: false, error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single() as { data: { role: string } | null }

  if (!profile || !canAccessMarketingPanel(profile.role as any)) {
    return { authorized: false, error: 'Forbidden' }
  }

  return { authorized: true }
}

// GET: Check current config status
export async function GET(request: NextRequest) {
  const auth = await verifyAccess(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === 'Forbidden' ? 403 : 401 })
  }

  try {
    const adminClient = createAdminClient() as any

    const { data: configs, error } = await adminClient
      .from('marketing_social_media_config')
      .select('platform, account_id, is_active, token_expires_at, updated_at, last_refresh_at, last_refresh_error')
      .order('platform')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const seeds = getPlatformSeeds()
    const status = PLATFORMS.map(p => {
      const existing = (configs || []).find((c: any) => c.platform === p)
      const seed = seeds.find(s => s.platform === p)

      return {
        platform: p,
        in_database: !!existing,
        is_active: existing?.is_active || false,
        has_account_id: !!existing?.account_id,
        has_token_in_env: seed?.has_token || false,
        token_expires_at: existing?.token_expires_at || null,
        last_refresh_error: existing?.last_refresh_error || null,
        note: existing ? (existing.is_active ? 'Configured' : 'Inactive') : (seed?.note || 'Not seeded'),
        env_vars_set: {
          facebook: { META_APP_ID: !!process.env.META_APP_ID, FACEBOOK_PAGE_ID: !!process.env.FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN: !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN },
          instagram: { META_APP_ID: !!process.env.META_APP_ID, META_APP_SECRET: !!process.env.META_APP_SECRET },
          youtube: { GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID, YOUTUBE_CHANNEL_ID: !!process.env.YOUTUBE_CHANNEL_ID },
          tiktok: { TIKTOK_CLIENT_KEY: !!process.env.TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET: !!process.env.TIKTOK_CLIENT_SECRET },
          linkedin: { LINKEDIN_CLIENT_ID: !!process.env.LINKEDIN_CLIENT_ID, LINKEDIN_ORGANIZATION_ID: !!process.env.LINKEDIN_ORGANIZATION_ID },
        }[p],
      }
    })

    return NextResponse.json({ platforms: status })
  } catch (error) {
    console.error('[Setup] Status check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Seed/update config table from env vars
export async function POST(request: NextRequest) {
  const auth = await verifyAccess(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === 'Forbidden' ? 403 : 401 })
  }

  try {
    const adminClient = createAdminClient() as any
    const seeds = getPlatformSeeds()
    const results: Array<{ platform: string; action: string; error?: string }> = []

    for (const seed of seeds) {
      try {
        // Check if platform already exists
        const { data: existing } = await adminClient
          .from('marketing_social_media_config')
          .select('id, access_token, account_id')
          .eq('platform', seed.platform)
          .single()

        if (existing) {
          // Update: only fill in missing fields, don't overwrite existing tokens
          const updates: Record<string, any> = { updated_at: new Date().toISOString() }
          let hasUpdates = false

          if (!existing.account_id && seed.account_id) {
            updates.account_id = seed.account_id
            hasUpdates = true
          }
          if (!existing.access_token && seed.access_token) {
            updates.access_token = seed.access_token
            updates.is_active = true
            hasUpdates = true
          }
          if (seed.api_base_url) {
            updates.api_base_url = seed.api_base_url
            hasUpdates = true
          }

          if (hasUpdates) {
            const { error: updateError } = await adminClient
              .from('marketing_social_media_config')
              .update(updates)
              .eq('id', existing.id)

            if (updateError) {
              results.push({ platform: seed.platform, action: 'update_failed', error: updateError.message })
            } else {
              results.push({ platform: seed.platform, action: 'updated' })
            }
          } else {
            results.push({ platform: seed.platform, action: 'already_configured' })
          }
        } else {
          // Insert new platform config
          const { error: insertError } = await adminClient
            .from('marketing_social_media_config')
            .insert({
              platform: seed.platform,
              account_id: seed.account_id,
              access_token: seed.access_token,
              api_base_url: seed.api_base_url,
              is_active: seed.has_token, // Only activate if we have a token
            })

          if (insertError) {
            results.push({ platform: seed.platform, action: 'insert_failed', error: insertError.message })
          } else {
            results.push({
              platform: seed.platform,
              action: seed.has_token ? 'seeded_with_token' : 'seeded_needs_oauth',
            })
          }
        }
      } catch (err) {
        results.push({
          platform: seed.platform,
          action: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const seeded = results.filter(r => r.action.startsWith('seeded')).length
    const updated = results.filter(r => r.action === 'updated').length
    const failed = results.filter(r => r.action.includes('failed') || r.action === 'error').length

    return NextResponse.json({
      message: 'Setup completed',
      summary: { seeded, updated, failed, total: results.length },
      results,
      next_steps: [
        'Facebook: Ready to fetch (Page Access Token from env)',
        'Instagram: Visit /api/auth/social-media/instagram to connect',
        'YouTube: Visit /api/auth/social-media/youtube to connect',
        'TikTok: Visit /api/auth/social-media/tiktok to connect',
        'LinkedIn: Visit /api/auth/social-media/linkedin to connect',
      ],
    })
  } catch (error) {
    console.error('[Setup] Seed error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
