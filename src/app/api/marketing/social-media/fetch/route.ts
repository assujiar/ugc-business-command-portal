// =====================================================
// POST /api/marketing/social-media/fetch
// Webhook endpoint called by pg_cron (via pg_net)
// Fetches data from each platform's API and stores it
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // allow up to 60s for multiple API calls

const VALID_TIME_SLOTS = ['08:00', '12:00', '17:00']
const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin'] as const

// Verify the request is from pg_cron (service_role key) or admin
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return false

  const token = authHeader.replace('Bearer ', '')
  // Accept service_role key
  if (token === process.env.SUPABASE_SERVICE_ROLE_KEY) return true

  return false
}

// =====================================================
// Platform-specific fetch functions
// Each function should call the official platform API
// and return normalized analytics data.
//
// IMPORTANT: These are STUBS. You must implement the
// actual API calls using your platform credentials.
// See the implementation guide for details.
// =====================================================

interface ContentItem {
  content_id: string
  content_type: string // 'post' | 'video' | 'reel' | 'short' | 'carousel' | 'story' | 'article'
  title?: string
  caption?: string
  url?: string
  thumbnail_url?: string
  published_at?: string
  hashtags?: string[]
  views_count: number
  likes_count: number
  comments_count: number
  shares_count: number
  saves_count: number
  reach: number
  impressions: number
  engagement_rate: number
  click_count?: number
  video_duration_seconds?: number
  avg_watch_time_seconds?: number
  watch_through_rate?: number
  extra_metrics?: Record<string, any>
}

interface PlatformData {
  followers_count: number
  followers_gained: number
  following_count: number
  posts_count: number
  total_views: number
  total_likes: number
  total_comments: number
  total_shares: number
  total_saves: number
  engagement_rate: number
  reach: number
  impressions: number
  platform_specific_data: Record<string, any>
  top_posts: Array<Record<string, any>>
  audience_demographics: Record<string, any>
  raw_api_response: Record<string, any>
  // Content-level data for individual posts/videos
  content_items?: ContentItem[]
}

async function fetchTikTokData(config: any): Promise<PlatformData | null> {
  // TODO: Implement TikTok API fetch
  // API: https://developers.tiktok.com/doc/research-api-get-user-info
  // Required: Business Account + TikTok for Business API access
  //
  // Endpoints needed:
  // - GET /v2/user/info/ (followers, likes, video count)
  // - GET /v2/video/list/ (recent videos with metrics)
  //
  // Headers: { Authorization: 'Bearer {access_token}' }

  if (!config.access_token) return null

  try {
    // Placeholder - replace with actual API call
    // const response = await fetch(`${config.api_base_url}/user/info/`, {
    //   headers: { Authorization: `Bearer ${config.access_token}` },
    // })
    // const data = await response.json()

    return null // Return null until implemented
  } catch (error) {
    console.error('TikTok fetch error:', error)
    return null
  }
}

async function fetchInstagramData(config: any): Promise<PlatformData | null> {
  // TODO: Implement Instagram Graph API fetch
  // API: https://developers.facebook.com/docs/instagram-api/
  // Required: Instagram Business/Creator Account + Facebook App
  //
  // Endpoints needed:
  // - GET /{user-id}?fields=followers_count,media_count,... (account info)
  // - GET /{user-id}/insights?metric=reach,impressions,... (account insights)
  // - GET /{user-id}/media?fields=like_count,comments_count,... (recent posts)
  //
  // Headers: { Authorization: 'Bearer {access_token}' }

  if (!config.access_token) return null

  try {
    return null // Return null until implemented
  } catch (error) {
    console.error('Instagram fetch error:', error)
    return null
  }
}

async function fetchYouTubeData(config: any): Promise<PlatformData | null> {
  // TODO: Implement YouTube Data API v3 fetch
  // API: https://developers.google.com/youtube/v3
  // Required: YouTube channel + Google Cloud API key
  //
  // Endpoints needed:
  // - GET /channels?part=statistics,snippet (channel stats)
  // - GET /search?channelId={id}&order=date (recent videos)
  // - GET /videos?part=statistics (video metrics)
  //
  // Auth: API key or OAuth2 Bearer token

  if (!config.access_token) return null

  try {
    return null // Return null until implemented
  } catch (error) {
    console.error('YouTube fetch error:', error)
    return null
  }
}

async function fetchFacebookData(config: any): Promise<PlatformData | null> {
  // TODO: Implement Facebook Graph API fetch
  // API: https://developers.facebook.com/docs/graph-api/
  // Required: Facebook Page + Page Access Token
  //
  // Endpoints needed:
  // - GET /{page-id}?fields=followers_count,fan_count (page info)
  // - GET /{page-id}/insights?metric=page_impressions,page_engaged_users (page insights)
  // - GET /{page-id}/posts?fields=likes.summary(true),comments.summary(true) (recent posts)
  //
  // Headers: { Authorization: 'Bearer {page_access_token}' }

  if (!config.access_token) return null

  try {
    return null // Return null until implemented
  } catch (error) {
    console.error('Facebook fetch error:', error)
    return null
  }
}

async function fetchLinkedInData(config: any): Promise<PlatformData | null> {
  // TODO: Implement LinkedIn API fetch
  // API: https://learn.microsoft.com/en-us/linkedin/marketing/
  // Required: LinkedIn Company Page + Marketing API access
  //
  // Endpoints needed:
  // - GET /v2/organizationalEntityFollowerStatistics (follower stats)
  // - GET /v2/organizationalEntityShareStatistics (share/post stats)
  // - GET /v2/shares?owners=urn:li:organization:{id} (recent posts)
  //
  // Headers: { Authorization: 'Bearer {access_token}' }

  if (!config.access_token) return null

  try {
    return null // Return null until implemented
  } catch (error) {
    console.error('LinkedIn fetch error:', error)
    return null
  }
}

const FETCH_FUNCTIONS: Record<string, (config: any) => Promise<PlatformData | null>> = {
  tiktok: fetchTikTokData,
  instagram: fetchInstagramData,
  youtube: fetchYouTubeData,
  facebook: fetchFacebookData,
  linkedin: fetchLinkedInData,
}

// Save individual content items (posts/videos/reels) to the database
async function saveContentItems(
  adminClient: any,
  platform: string,
  items: ContentItem[]
) {
  const today = new Date().toISOString().split('T')[0]

  for (const item of items) {
    try {
      // Upsert content (update metrics if already exists)
      const { data: upserted, error: upsertError } = await adminClient
        .from('marketing_social_media_content')
        .upsert({
          platform,
          content_id: item.content_id,
          content_type: item.content_type,
          title: item.title || null,
          caption: item.caption || null,
          url: item.url || null,
          thumbnail_url: item.thumbnail_url || null,
          published_at: item.published_at || null,
          hashtags: item.hashtags || [],
          views_count: item.views_count || 0,
          likes_count: item.likes_count || 0,
          comments_count: item.comments_count || 0,
          shares_count: item.shares_count || 0,
          saves_count: item.saves_count || 0,
          reach: item.reach || 0,
          impressions: item.impressions || 0,
          engagement_rate: item.engagement_rate || 0,
          click_count: item.click_count || 0,
          video_duration_seconds: item.video_duration_seconds || null,
          avg_watch_time_seconds: item.avg_watch_time_seconds || null,
          watch_through_rate: item.watch_through_rate || null,
          extra_metrics: item.extra_metrics || {},
          last_fetched_at: new Date().toISOString(),
          fetch_date: today,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'platform,content_id',
        })
        .select('id')
        .single()

      if (upsertError) {
        console.error(`Content upsert error for ${platform}/${item.content_id}:`, upsertError)
        continue
      }

      // Record history snapshot for tracking metric changes over time
      if (upserted?.id) {
        await adminClient
          .from('marketing_social_media_content_history')
          .insert({
            content_id_ref: upserted.id,
            views_count: item.views_count || 0,
            likes_count: item.likes_count || 0,
            comments_count: item.comments_count || 0,
            shares_count: item.shares_count || 0,
            saves_count: item.saves_count || 0,
            engagement_rate: item.engagement_rate || 0,
          })
      }
    } catch (err) {
      console.error(`Content save error for ${platform}/${item.content_id}:`, err)
    }
  }
}

export async function POST(request: NextRequest) {
  // Verify authentication
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const timeSlot = body.time_slot || getCurrentTimeSlot()

    if (!VALID_TIME_SLOTS.includes(timeSlot)) {
      return NextResponse.json(
        { error: 'Invalid time_slot. Must be 08:00, 12:00, or 17:00' },
        { status: 400 }
      )
    }

    // Note: Tables not yet in generated types (migration 154), cast as any
    const adminClient = createAdminClient() as any
    const today = new Date().toISOString().split('T')[0]
    const results: Array<{ platform: string; status: string; error?: string }> = []

    // Get all active platform configs
    const { data: configs, error: configError } = await adminClient
      .from('marketing_social_media_config')
      .select('*')
      .eq('is_active', true)

    if (configError) {
      console.error('Config fetch error:', configError)
      return NextResponse.json({ error: 'Failed to fetch platform configs' }, { status: 500 })
    }

    // Fetch data from each platform in parallel
    const fetchPromises = (configs || []).map(async (config: any) => {
      const fetchFn = FETCH_FUNCTIONS[config.platform]
      if (!fetchFn) {
        results.push({ platform: config.platform, status: 'skipped', error: 'No fetch function' })
        return
      }

      try {
        const data = await fetchFn(config)

        if (!data) {
          // Insert a record marking this as not yet configured
          const { error: insertError } = await adminClient
            .from('marketing_social_media_analytics')
            .upsert({
              platform: config.platform,
              fetch_date: today,
              fetch_time_slot: timeSlot,
              fetch_status: 'failed',
              error_message: 'Platform API not yet configured. See implementation guide.',
              fetched_at: new Date().toISOString(),
            }, {
              onConflict: 'platform,fetch_date,fetch_time_slot',
            })

          if (insertError) {
            console.error(`Insert error for ${config.platform}:`, insertError)
          }

          results.push({
            platform: config.platform,
            status: 'not_configured',
            error: 'API credentials not set',
          })
          return
        }

        // Insert analytics snapshot
        const { error: insertError } = await adminClient
          .from('marketing_social_media_analytics')
          .upsert({
            platform: config.platform,
            fetch_date: today,
            fetch_time_slot: timeSlot,
            fetched_at: new Date().toISOString(),
            followers_count: data.followers_count,
            followers_gained: data.followers_gained,
            following_count: data.following_count,
            posts_count: data.posts_count,
            total_views: data.total_views,
            total_likes: data.total_likes,
            total_comments: data.total_comments,
            total_shares: data.total_shares,
            total_saves: data.total_saves,
            engagement_rate: data.engagement_rate,
            reach: data.reach,
            impressions: data.impressions,
            platform_specific_data: data.platform_specific_data,
            top_posts: data.top_posts,
            audience_demographics: data.audience_demographics,
            raw_api_response: data.raw_api_response,
            fetch_status: 'success',
            error_message: null,
          }, {
            onConflict: 'platform,fetch_date,fetch_time_slot',
          })

        if (insertError) {
          console.error(`Insert error for ${config.platform}:`, insertError)
          results.push({ platform: config.platform, status: 'error', error: insertError.message })
        } else {
          // Save content-level data if available
          if (data.content_items && data.content_items.length > 0) {
            await saveContentItems(adminClient, config.platform, data.content_items)
          }
          results.push({ platform: config.platform, status: 'success' })
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Fetch error for ${config.platform}:`, error)

        // Record the failure
        await adminClient
          .from('marketing_social_media_analytics')
          .upsert({
            platform: config.platform,
            fetch_date: today,
            fetch_time_slot: timeSlot,
            fetch_status: 'failed',
            error_message: errorMessage,
            fetched_at: new Date().toISOString(),
          }, {
            onConflict: 'platform,fetch_date,fetch_time_slot',
          })

        results.push({ platform: config.platform, status: 'error', error: errorMessage })
      }
    })

    await Promise.all(fetchPromises)

    // Trigger daily summary computation if this is the last time slot
    if (timeSlot === '17:00') {
      const { error: rpcError } = await adminClient.rpc('fn_compute_social_media_daily_summary', {
        p_date: today,
      })
      if (rpcError) {
        console.error('Daily summary computation error:', rpcError)
      }
    }

    return NextResponse.json({
      message: 'Fetch completed',
      time_slot: timeSlot,
      date: today,
      results,
    })
  } catch (error) {
    console.error('Social media fetch webhook error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function getCurrentTimeSlot(): string {
  // WIB = UTC+7
  const now = new Date()
  const wibHour = (now.getUTCHours() + 7) % 24

  if (wibHour >= 7 && wibHour < 11) return '08:00'
  if (wibHour >= 11 && wibHour < 16) return '12:00'
  return '17:00'
}
