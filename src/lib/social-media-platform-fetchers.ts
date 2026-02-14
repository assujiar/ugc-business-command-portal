// =====================================================
// Social Media Platform API Fetchers
// Implements real API calls for each social media platform
// =====================================================

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'
const LINKEDIN_API_BASE = 'https://api.linkedin.com'

// =====================================================
// Shared types
// =====================================================

export interface ContentItem {
  content_id: string
  content_type: string
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

export interface PlatformData {
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
  content_items?: ContentItem[]
}

interface PlatformConfig {
  access_token?: string
  refresh_token?: string
  account_id?: string
  api_base_url?: string
}

// =====================================================
// Helper: Safe JSON fetch with error handling
// =====================================================

async function safeFetch(url: string, options?: RequestInit): Promise<any> {
  const response = await fetch(url, options)
  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`HTTP ${response.status}: ${errorBody}`)
  }
  return response.json()
}

// Extract hashtags from text
function extractHashtags(text: string | undefined | null): string[] {
  if (!text) return []
  const matches = text.match(/#[\w\u00C0-\u024F]+/g)
  return matches || []
}

// =====================================================
// 1. TikTok API Fetcher
// Uses TikTok API v2 for Business accounts
// Docs: https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/
// =====================================================

export async function fetchTikTokData(config: PlatformConfig): Promise<PlatformData | null> {
  if (!config.access_token) return null

  try {
    // Step 1: Get user info
    const userInfoRes = await safeFetch(`${TIKTOK_API_BASE}/user/info/?fields=open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count`, {
      headers: { Authorization: `Bearer ${config.access_token}` },
    })

    const userInfo = userInfoRes?.data?.user || {}
    const followersCount = userInfo.follower_count || 0
    const followingCount = userInfo.following_count || 0
    const totalLikes = userInfo.likes_count || 0
    const videoCount = userInfo.video_count || 0

    // Step 2: Get recent videos (max 20)
    const videoListRes = await safeFetch(`${TIKTOK_API_BASE}/video/list/?fields=id,title,cover_image_url,share_url,create_time,duration,like_count,comment_count,share_count,view_count`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ max_count: 20 }),
    })

    const videos = videoListRes?.data?.videos || []
    let totalViews = 0
    let totalComments = 0
    let totalShares = 0
    let totalVideoLikes = 0

    const contentItems: ContentItem[] = videos.map((video: any) => {
      const views = video.view_count || 0
      const likes = video.like_count || 0
      const comments = video.comment_count || 0
      const shares = video.share_count || 0
      totalViews += views
      totalVideoLikes += likes
      totalComments += comments
      totalShares += shares

      const totalInteractions = likes + comments + shares
      const engRate = views > 0 ? (totalInteractions / views) * 100 : 0

      return {
        content_id: String(video.id),
        content_type: 'video',
        title: video.title || '',
        url: video.share_url,
        thumbnail_url: video.cover_image_url,
        published_at: video.create_time ? new Date(video.create_time * 1000).toISOString() : undefined,
        hashtags: extractHashtags(video.title),
        views_count: views,
        likes_count: likes,
        comments_count: comments,
        shares_count: shares,
        saves_count: 0,
        reach: views,
        impressions: views,
        engagement_rate: parseFloat(engRate.toFixed(4)),
        video_duration_seconds: video.duration || undefined,
      } satisfies ContentItem
    })

    // Calculate engagement rate
    const totalInteractions = totalVideoLikes + totalComments + totalShares
    const engagementRate = totalViews > 0 ? (totalInteractions / totalViews) * 100 : 0

    // Top posts by views
    const topPosts = contentItems
      .sort((a, b) => b.views_count - a.views_count)
      .slice(0, 5)
      .map(item => ({
        id: item.content_id,
        title: item.title,
        views: item.views_count,
        likes: item.likes_count,
        comments: item.comments_count,
        shares: item.shares_count,
        url: item.url,
      }))

    return {
      followers_count: followersCount,
      followers_gained: 0, // TikTok API doesn't provide daily gains directly
      following_count: followingCount,
      posts_count: videoCount,
      total_views: totalViews,
      total_likes: totalVideoLikes,
      total_comments: totalComments,
      total_shares: totalShares,
      total_saves: 0,
      engagement_rate: parseFloat(engagementRate.toFixed(4)),
      reach: totalViews,
      impressions: totalViews,
      platform_specific_data: {
        display_name: userInfo.display_name,
        avatar_url: userInfo.avatar_url,
        total_profile_likes: totalLikes,
      },
      top_posts: topPosts,
      audience_demographics: {},
      raw_api_response: { user_info: userInfoRes, video_list: { video_count: videos.length } },
      content_items: contentItems,
    }
  } catch (error) {
    console.error('[TikTok] Fetch error:', error)
    throw error
  }
}

// =====================================================
// 2. Instagram Graph API Fetcher
// Docs: https://developers.facebook.com/docs/instagram-api/
// =====================================================

export async function fetchInstagramData(config: PlatformConfig): Promise<PlatformData | null> {
  if (!config.access_token) return null

  // account_id is the Instagram Business Account ID
  const igAccountId = config.account_id
  if (!igAccountId) {
    console.error('[Instagram] No Instagram Business Account ID configured')
    return null
  }

  try {
    // Step 1: Get account info
    const accountInfo = await safeFetch(
      `${GRAPH_API_BASE}/${igAccountId}?fields=followers_count,follows_count,media_count,name,username,profile_picture_url&access_token=${config.access_token}`
    )

    const followersCount = accountInfo.followers_count || 0
    const followingCount = accountInfo.follows_count || 0
    const mediaCount = accountInfo.media_count || 0

    // Step 2: Get account-level insights (last 30 days)
    let accountReach = 0
    let accountImpressions = 0
    try {
      const insightsRes = await safeFetch(
        `${GRAPH_API_BASE}/${igAccountId}/insights?metric=reach,impressions,follower_count&period=day&since=${Math.floor(Date.now() / 1000) - 86400}&until=${Math.floor(Date.now() / 1000)}&access_token=${config.access_token}`
      )
      const insightsData = insightsRes?.data || []
      for (const metric of insightsData) {
        if (metric.name === 'reach' && metric.values?.length > 0) {
          accountReach = metric.values[metric.values.length - 1]?.value || 0
        }
        if (metric.name === 'impressions' && metric.values?.length > 0) {
          accountImpressions = metric.values[metric.values.length - 1]?.value || 0
        }
      }
    } catch (insightErr) {
      console.warn('[Instagram] Could not fetch account insights:', insightErr)
    }

    // Step 3: Get recent media (last 25 posts)
    const mediaRes = await safeFetch(
      `${GRAPH_API_BASE}/${igAccountId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,insights.metric(reach,impressions,saved,shares)&limit=25&access_token=${config.access_token}`
    )

    const posts = mediaRes?.data || []
    let totalLikes = 0
    let totalComments = 0
    let totalShares = 0
    let totalSaves = 0
    let totalReach = accountReach
    let totalImpressions = accountImpressions

    const contentItems: ContentItem[] = posts.map((post: any) => {
      const likes = post.like_count || 0
      const comments = post.comments_count || 0
      totalLikes += likes
      totalComments += comments

      // Extract insights if available
      let postReach = 0
      let postImpressions = 0
      let postSaves = 0
      let postShares = 0
      if (post.insights?.data) {
        for (const insight of post.insights.data) {
          if (insight.name === 'reach') postReach = insight.values?.[0]?.value || 0
          if (insight.name === 'impressions') postImpressions = insight.values?.[0]?.value || 0
          if (insight.name === 'saved') postSaves = insight.values?.[0]?.value || 0
          if (insight.name === 'shares') postShares = insight.values?.[0]?.value || 0
        }
      }
      totalSaves += postSaves
      totalShares += postShares

      const totalInteractions = likes + comments + postSaves + postShares
      const engRate = postReach > 0 ? (totalInteractions / postReach) * 100 : 0

      // Determine content type
      let contentType = 'post'
      if (post.media_type === 'VIDEO') contentType = 'reel'
      else if (post.media_type === 'CAROUSEL_ALBUM') contentType = 'carousel'

      return {
        content_id: post.id,
        content_type: contentType,
        caption: post.caption || '',
        url: post.permalink,
        thumbnail_url: post.thumbnail_url || post.media_url,
        published_at: post.timestamp,
        hashtags: extractHashtags(post.caption),
        views_count: postImpressions,
        likes_count: likes,
        comments_count: comments,
        shares_count: postShares,
        saves_count: postSaves,
        reach: postReach,
        impressions: postImpressions,
        engagement_rate: parseFloat(engRate.toFixed(4)),
      } satisfies ContentItem
    })

    // Calculate overall engagement
    const totalInteractions = totalLikes + totalComments + totalSaves + totalShares
    const engagementRate = followersCount > 0 ? (totalInteractions / (contentItems.length || 1) / followersCount) * 100 : 0

    // Top posts by likes
    const topPosts = contentItems
      .sort((a, b) => b.likes_count - a.likes_count)
      .slice(0, 5)
      .map(item => ({
        id: item.content_id,
        caption: item.caption?.substring(0, 100),
        likes: item.likes_count,
        comments: item.comments_count,
        saves: item.saves_count,
        url: item.url,
      }))

    // Step 4: Try to get audience demographics
    let demographics: Record<string, any> = {}
    try {
      const demoRes = await safeFetch(
        `${GRAPH_API_BASE}/${igAccountId}/insights?metric=audience_city,audience_country,audience_gender_age&period=lifetime&access_token=${config.access_token}`
      )
      if (demoRes?.data) {
        for (const metric of demoRes.data) {
          demographics[metric.name] = metric.values?.[0]?.value || {}
        }
      }
    } catch (demoErr) {
      console.warn('[Instagram] Could not fetch demographics:', demoErr)
    }

    return {
      followers_count: followersCount,
      followers_gained: 0,
      following_count: followingCount,
      posts_count: mediaCount,
      total_views: totalImpressions,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_shares: totalShares,
      total_saves: totalSaves,
      engagement_rate: parseFloat(engagementRate.toFixed(4)),
      reach: totalReach,
      impressions: totalImpressions,
      platform_specific_data: {
        username: accountInfo.username,
        name: accountInfo.name,
        profile_picture_url: accountInfo.profile_picture_url,
      },
      top_posts: topPosts,
      audience_demographics: demographics,
      raw_api_response: {
        account_info: { id: accountInfo.id, username: accountInfo.username },
        media_count: posts.length,
      },
      content_items: contentItems,
    }
  } catch (error) {
    console.error('[Instagram] Fetch error:', error)
    throw error
  }
}

// =====================================================
// 3. YouTube Data API v3 Fetcher
// Docs: https://developers.google.com/youtube/v3
// =====================================================

export async function fetchYouTubeData(config: PlatformConfig): Promise<PlatformData | null> {
  if (!config.access_token) return null

  const channelId = config.account_id || process.env.YOUTUBE_CHANNEL_ID
  if (!channelId) {
    console.error('[YouTube] No channel ID configured')
    return null
  }

  try {
    // Step 1: Get channel statistics
    const channelRes = await safeFetch(
      `${YOUTUBE_API_BASE}/channels?part=statistics,snippet,contentDetails&id=${channelId}&access_token=${config.access_token}`
    )

    const channel = channelRes?.items?.[0]
    if (!channel) {
      console.error('[YouTube] Channel not found:', channelId)
      return null
    }

    const stats = channel.statistics || {}
    const subscriberCount = parseInt(stats.subscriberCount || '0', 10)
    const totalViews = parseInt(stats.viewCount || '0', 10)
    const videoCount = parseInt(stats.videoCount || '0', 10)

    // Step 2: Get recent videos (search for latest uploads)
    const searchRes = await safeFetch(
      `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&order=date&maxResults=20&type=video&access_token=${config.access_token}`
    )

    const videoItems = searchRes?.items || []
    const videoIds = videoItems.map((item: any) => item.id?.videoId).filter(Boolean)

    let recentVideosData: any[] = []
    if (videoIds.length > 0) {
      // Step 3: Get video statistics
      const videosRes = await safeFetch(
        `${YOUTUBE_API_BASE}/videos?part=statistics,snippet,contentDetails&id=${videoIds.join(',')}&access_token=${config.access_token}`
      )
      recentVideosData = videosRes?.items || []
    }

    let recentViews = 0
    let recentLikes = 0
    let recentComments = 0
    let recentShares = 0

    const contentItems: ContentItem[] = recentVideosData.map((video: any) => {
      const videoStats = video.statistics || {}
      const views = parseInt(videoStats.viewCount || '0', 10)
      const likes = parseInt(videoStats.likeCount || '0', 10)
      const comments = parseInt(videoStats.commentCount || '0', 10)
      const favorites = parseInt(videoStats.favoriteCount || '0', 10)

      recentViews += views
      recentLikes += likes
      recentComments += comments

      const totalInteractions = likes + comments
      const engRate = views > 0 ? (totalInteractions / views) * 100 : 0

      // Parse duration (ISO 8601 format like PT1H2M3S)
      let durationSeconds: number | undefined
      const durationStr = video.contentDetails?.duration
      if (durationStr) {
        const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
        if (match) {
          const hours = parseInt(match[1] || '0', 10)
          const minutes = parseInt(match[2] || '0', 10)
          const seconds = parseInt(match[3] || '0', 10)
          durationSeconds = hours * 3600 + minutes * 60 + seconds
        }
      }

      return {
        content_id: video.id,
        content_type: (durationSeconds && durationSeconds < 61) ? 'short' : 'video',
        title: video.snippet?.title || '',
        caption: video.snippet?.description?.substring(0, 500) || '',
        url: `https://www.youtube.com/watch?v=${video.id}`,
        thumbnail_url: video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.default?.url,
        published_at: video.snippet?.publishedAt,
        hashtags: extractHashtags(video.snippet?.description),
        views_count: views,
        likes_count: likes,
        comments_count: comments,
        shares_count: 0,
        saves_count: favorites,
        reach: views,
        impressions: views,
        engagement_rate: parseFloat(engRate.toFixed(4)),
        video_duration_seconds: durationSeconds,
      } satisfies ContentItem
    })

    // Calculate engagement rate
    const totalInteractions = recentLikes + recentComments
    const engagementRate = recentViews > 0 ? (totalInteractions / recentViews) * 100 : 0

    // Top videos by views
    const topPosts = contentItems
      .sort((a, b) => b.views_count - a.views_count)
      .slice(0, 5)
      .map(item => ({
        id: item.content_id,
        title: item.title,
        views: item.views_count,
        likes: item.likes_count,
        comments: item.comments_count,
        url: item.url,
      }))

    return {
      followers_count: subscriberCount,
      followers_gained: 0,
      following_count: 0,
      posts_count: videoCount,
      total_views: recentViews,
      total_likes: recentLikes,
      total_comments: recentComments,
      total_shares: recentShares,
      total_saves: 0,
      engagement_rate: parseFloat(engagementRate.toFixed(4)),
      reach: recentViews,
      impressions: recentViews,
      platform_specific_data: {
        channel_title: channel.snippet?.title,
        channel_description: channel.snippet?.description?.substring(0, 200),
        channel_thumbnail: channel.snippet?.thumbnails?.default?.url,
        total_channel_views: totalViews,
        subscriber_count: subscriberCount,
      },
      top_posts: topPosts,
      audience_demographics: {},
      raw_api_response: {
        channel_id: channelId,
        channel_stats: stats,
        recent_video_count: recentVideosData.length,
      },
      content_items: contentItems,
    }
  } catch (error) {
    console.error('[YouTube] Fetch error:', error)
    throw error
  }
}

// =====================================================
// 4. Facebook Graph API Fetcher
// Docs: https://developers.facebook.com/docs/graph-api/
// =====================================================

export async function fetchFacebookData(config: PlatformConfig): Promise<PlatformData | null> {
  if (!config.access_token) return null

  const pageId = config.account_id || process.env.FACEBOOK_PAGE_ID
  if (!pageId) {
    console.error('[Facebook] No Page ID configured')
    return null
  }

  try {
    // Step 1: Get page info
    const pageInfo = await safeFetch(
      `${GRAPH_API_BASE}/${pageId}?fields=followers_count,fan_count,name,category,about,picture.type(large)&access_token=${config.access_token}`
    )

    const followersCount = pageInfo.followers_count || pageInfo.fan_count || 0

    // Step 2: Get page-level insights
    let pageReach = 0
    let pageImpressions = 0
    let pageEngagedUsers = 0
    let newFans = 0
    try {
      const insightsRes = await safeFetch(
        `${GRAPH_API_BASE}/${pageId}/insights?metric=page_impressions,page_impressions_unique,page_engaged_users,page_fan_adds&period=day&since=${Math.floor(Date.now() / 1000) - 86400 * 2}&until=${Math.floor(Date.now() / 1000)}&access_token=${config.access_token}`
      )

      const insightsData = insightsRes?.data || []
      for (const metric of insightsData) {
        const latestValue = metric.values?.[metric.values.length - 1]?.value || 0
        if (metric.name === 'page_impressions') pageImpressions = latestValue
        if (metric.name === 'page_impressions_unique') pageReach = latestValue
        if (metric.name === 'page_engaged_users') pageEngagedUsers = latestValue
        if (metric.name === 'page_fan_adds') newFans = latestValue
      }
    } catch (insightErr) {
      console.warn('[Facebook] Could not fetch page insights:', insightErr)
    }

    // Step 3: Get recent posts (last 25)
    const postsRes = await safeFetch(
      `${GRAPH_API_BASE}/${pageId}/posts?fields=id,message,created_time,permalink_url,full_picture,type,shares,likes.summary(true).limit(0),comments.summary(true).limit(0),insights.metric(post_impressions,post_impressions_unique,post_engaged_users,post_clicks)&limit=25&access_token=${config.access_token}`
    )

    const posts = postsRes?.data || []
    let totalLikes = 0
    let totalComments = 0
    let totalShares = 0

    const contentItems: ContentItem[] = posts.map((post: any) => {
      const likes = post.likes?.summary?.total_count || 0
      const comments = post.comments?.summary?.total_count || 0
      const shares = post.shares?.count || 0
      totalLikes += likes
      totalComments += comments
      totalShares += shares

      // Extract post-level insights
      let postImpressions = 0
      let postReach = 0
      let postClicks = 0
      if (post.insights?.data) {
        for (const insight of post.insights.data) {
          if (insight.name === 'post_impressions') postImpressions = insight.values?.[0]?.value || 0
          if (insight.name === 'post_impressions_unique') postReach = insight.values?.[0]?.value || 0
          if (insight.name === 'post_clicks') postClicks = insight.values?.[0]?.value || 0
        }
      }

      const totalInteractions = likes + comments + shares
      const engRate = postReach > 0 ? (totalInteractions / postReach) * 100 : 0

      // Determine content type
      let contentType = 'post'
      if (post.type === 'video') contentType = 'video'
      else if (post.type === 'photo') contentType = 'post'

      return {
        content_id: post.id,
        content_type: contentType,
        caption: post.message || '',
        url: post.permalink_url,
        thumbnail_url: post.full_picture,
        published_at: post.created_time,
        hashtags: extractHashtags(post.message),
        views_count: postImpressions,
        likes_count: likes,
        comments_count: comments,
        shares_count: shares,
        saves_count: 0,
        reach: postReach,
        impressions: postImpressions,
        engagement_rate: parseFloat(engRate.toFixed(4)),
        click_count: postClicks,
      } satisfies ContentItem
    })

    // Overall engagement
    const totalInteractions = totalLikes + totalComments + totalShares
    const engagementRate = followersCount > 0
      ? (totalInteractions / (contentItems.length || 1) / followersCount) * 100
      : 0

    // Top posts by likes
    const topPosts = contentItems
      .sort((a, b) => b.likes_count - a.likes_count)
      .slice(0, 5)
      .map(item => ({
        id: item.content_id,
        message: item.caption?.substring(0, 100),
        likes: item.likes_count,
        comments: item.comments_count,
        shares: item.shares_count,
        url: item.url,
      }))

    // Step 4: Try to get audience demographics
    let demographics: Record<string, any> = {}
    try {
      const demoRes = await safeFetch(
        `${GRAPH_API_BASE}/${pageId}/insights?metric=page_fans_city,page_fans_country,page_fans_gender_age&period=lifetime&access_token=${config.access_token}`
      )
      if (demoRes?.data) {
        for (const metric of demoRes.data) {
          demographics[metric.name] = metric.values?.[0]?.value || {}
        }
      }
    } catch (demoErr) {
      console.warn('[Facebook] Could not fetch demographics:', demoErr)
    }

    return {
      followers_count: followersCount,
      followers_gained: newFans,
      following_count: 0,
      posts_count: posts.length,
      total_views: pageImpressions,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_shares: totalShares,
      total_saves: 0,
      engagement_rate: parseFloat(engagementRate.toFixed(4)),
      reach: pageReach,
      impressions: pageImpressions,
      platform_specific_data: {
        page_name: pageInfo.name,
        category: pageInfo.category,
        page_engaged_users: pageEngagedUsers,
        picture_url: pageInfo.picture?.data?.url,
      },
      top_posts: topPosts,
      audience_demographics: demographics,
      raw_api_response: {
        page_id: pageId,
        page_name: pageInfo.name,
        post_count: posts.length,
      },
      content_items: contentItems,
    }
  } catch (error) {
    console.error('[Facebook] Fetch error:', error)
    throw error
  }
}

// =====================================================
// 5. LinkedIn API Fetcher
// Docs: https://learn.microsoft.com/en-us/linkedin/marketing/
// =====================================================

export async function fetchLinkedInData(config: PlatformConfig): Promise<PlatformData | null> {
  if (!config.access_token) return null

  const orgId = config.account_id || process.env.LINKEDIN_ORGANIZATION_ID
  if (!orgId) {
    console.error('[LinkedIn] No Organization ID configured')
    return null
  }

  const headers = {
    Authorization: `Bearer ${config.access_token}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': '202401',
  }

  try {
    // Step 1: Get organization follower count
    let followersCount = 0
    try {
      const followerRes = await safeFetch(
        `${LINKEDIN_API_BASE}/rest/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${orgId}`,
        { headers }
      )
      const followerData = followerRes?.elements?.[0]
      if (followerData) {
        // Sum follower counts from segments
        const followerCounts = followerData.followerCountsByAssociationType || []
        for (const segment of followerCounts) {
          followersCount += segment.followerCounts?.organicFollowerCount || 0
          followersCount += segment.followerCounts?.paidFollowerCount || 0
        }
      }
      // Fallback: try direct count
      if (followersCount === 0 && followerData?.totalFollowerCount) {
        followersCount = followerData.totalFollowerCount
      }
    } catch (followerErr) {
      console.warn('[LinkedIn] Could not fetch follower stats, trying alternative:', followerErr)
      // Alternative: Get org info for follower count
      try {
        const orgRes = await safeFetch(
          `${LINKEDIN_API_BASE}/rest/organizations/${orgId}`,
          { headers }
        )
        followersCount = orgRes?.followerCount || 0
      } catch {
        console.warn('[LinkedIn] Could not get org info either')
      }
    }

    // Step 2: Get share statistics (aggregate)
    let totalImpressions = 0
    let totalClicks = 0
    let totalLikes = 0
    let totalComments = 0
    let totalShares = 0
    let totalEngagement = 0

    try {
      const shareStatsRes = await safeFetch(
        `${LINKEDIN_API_BASE}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${orgId}`,
        { headers }
      )

      const shareStats = shareStatsRes?.elements?.[0]?.totalShareStatistics
      if (shareStats) {
        totalImpressions = shareStats.impressionCount || 0
        totalClicks = shareStats.clickCount || 0
        totalLikes = shareStats.likeCount || 0
        totalComments = shareStats.commentCount || 0
        totalShares = shareStats.shareCount || 0
        totalEngagement = shareStats.engagement || 0
      }
    } catch (shareErr) {
      console.warn('[LinkedIn] Could not fetch share statistics:', shareErr)
    }

    // Step 3: Get recent posts
    let contentItems: ContentItem[] = []
    try {
      const postsRes = await safeFetch(
        `${LINKEDIN_API_BASE}/rest/posts?q=author&author=urn:li:organization:${orgId}&count=20&sortBy=LAST_MODIFIED`,
        { headers }
      )

      const posts = postsRes?.elements || []

      for (const post of posts) {
        const postUrn = post.id || post['$URN']
        if (!postUrn) continue

        // Try to get individual post statistics
        let postLikes = 0
        let postComments = 0
        let postImpressions = 0
        let postClicks = 0

        try {
          const postStatsRes = await safeFetch(
            `${LINKEDIN_API_BASE}/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${orgId}&shares=List(${encodeURIComponent(postUrn)})`,
            { headers }
          )
          const postStats = postStatsRes?.elements?.[0]?.totalShareStatistics
          if (postStats) {
            postLikes = postStats.likeCount || 0
            postComments = postStats.commentCount || 0
            postImpressions = postStats.impressionCount || 0
            postClicks = postStats.clickCount || 0
          }
        } catch {
          // Individual post stats not available
        }

        const totalInteractions = postLikes + postComments
        const engRate = postImpressions > 0 ? (totalInteractions / postImpressions) * 100 : 0

        // Determine content type
        let contentType = 'article'
        if (post.content?.media?.id) contentType = 'post'
        if (post.content?.article) contentType = 'article'

        contentItems.push({
          content_id: postUrn,
          content_type: contentType,
          caption: post.commentary || post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || '',
          url: `https://www.linkedin.com/feed/update/${postUrn}`,
          published_at: post.createdAt ? new Date(post.createdAt).toISOString() : post.publishedAt,
          hashtags: extractHashtags(post.commentary),
          views_count: postImpressions,
          likes_count: postLikes,
          comments_count: postComments,
          shares_count: 0,
          saves_count: 0,
          reach: postImpressions,
          impressions: postImpressions,
          engagement_rate: parseFloat(engRate.toFixed(4)),
          click_count: postClicks,
        })
      }
    } catch (postErr) {
      console.warn('[LinkedIn] Could not fetch posts:', postErr)
    }

    // Calculate engagement rate
    const engagementRate = totalImpressions > 0
      ? ((totalLikes + totalComments + totalShares + totalClicks) / totalImpressions) * 100
      : totalEngagement * 100

    // Top posts by impressions
    const topPosts = contentItems
      .sort((a, b) => b.views_count - a.views_count)
      .slice(0, 5)
      .map(item => ({
        id: item.content_id,
        caption: item.caption?.substring(0, 100),
        impressions: item.views_count,
        likes: item.likes_count,
        comments: item.comments_count,
        url: item.url,
      }))

    // Step 4: Try to get follower demographics
    let demographics: Record<string, any> = {}
    try {
      const demoRes = await safeFetch(
        `${LINKEDIN_API_BASE}/rest/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${orgId}`,
        { headers }
      )
      const demoData = demoRes?.elements?.[0]
      if (demoData) {
        demographics = {
          followerCountsByFunction: demoData.followerCountsByFunction || [],
          followerCountsBySeniority: demoData.followerCountsBySeniority || [],
          followerCountsByIndustry: demoData.followerCountsByIndustry || [],
          followerCountsByGeoCountry: demoData.followerCountsByGeoCountry || [],
        }
      }
    } catch (demoErr) {
      console.warn('[LinkedIn] Could not fetch demographics:', demoErr)
    }

    return {
      followers_count: followersCount,
      followers_gained: 0,
      following_count: 0,
      posts_count: contentItems.length,
      total_views: totalImpressions,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_shares: totalShares,
      total_saves: 0,
      engagement_rate: parseFloat(engagementRate.toFixed(4)),
      reach: totalImpressions,
      impressions: totalImpressions,
      platform_specific_data: {
        organization_id: orgId,
        total_clicks: totalClicks,
      },
      top_posts: topPosts,
      audience_demographics: demographics,
      raw_api_response: {
        organization_id: orgId,
        post_count: contentItems.length,
      },
      content_items: contentItems,
    }
  } catch (error) {
    console.error('[LinkedIn] Fetch error:', error)
    throw error
  }
}
