// =====================================================
// GET /api/marketing/social-media/content
// Returns content-level analytics per platform
// Supports filtering by platform, content type,
// sorting by various metrics, and pagination.
// =====================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const VALID_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin']
const VALID_CONTENT_TYPES = ['post', 'video', 'reel', 'story', 'short', 'carousel', 'live', 'article']
const VALID_SORT_FIELDS = [
  'published_at', 'views_count', 'likes_count', 'comments_count',
  'shares_count', 'engagement_rate', 'reach', 'impressions'
]

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: string } | null }

    if (!profile || !canAccessMarketingPanel(profile.role as any)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform')
    const contentType = searchParams.get('content_type')
    const sortBy = searchParams.get('sort_by') || 'published_at'
    const sortOrder = searchParams.get('sort_order') === 'asc' ? true : false
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
    const search = searchParams.get('search')
    const days = parseInt(searchParams.get('days') || '30', 10)

    // Validation
    if (platform && !VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
    }
    if (contentType && !VALID_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'Invalid content_type' }, { status: 400 })
    }
    if (!VALID_SORT_FIELDS.includes(sortBy)) {
      return NextResponse.json({ error: 'Invalid sort_by field' }, { status: 400 })
    }

    // Note: Tables not yet in generated types (migration 155), cast as any
    const adminClient = createAdminClient() as any
    const offset = (page - 1) * limit

    // Calculate date filter
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    const startDateStr = startDate.toISOString()

    // Build query
    let query = adminClient
      .from('marketing_social_media_content')
      .select('*', { count: 'exact' })
      .gte('published_at', startDateStr)
      .order(sortBy, { ascending: sortOrder })
      .range(offset, offset + limit - 1)

    if (platform) {
      query = query.eq('platform', platform)
    }
    if (contentType) {
      query = query.eq('content_type', contentType)
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,caption.ilike.%${search}%`)
    }

    const { data: content, count, error } = await query

    if (error) {
      console.error('Content query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get top performers per platform (top 5 by engagement rate)
    let topQuery = adminClient
      .from('marketing_social_media_content')
      .select('id, platform, content_type, title, url, thumbnail_url, published_at, views_count, likes_count, comments_count, shares_count, engagement_rate')
      .gte('published_at', startDateStr)
      .order('engagement_rate', { ascending: false })
      .limit(20)

    if (platform) {
      topQuery = topQuery.eq('platform', platform)
    }

    const { data: topContent } = await topQuery

    // Get content type distribution
    let statsQuery = adminClient
      .from('marketing_social_media_content')
      .select('platform, content_type')
      .gte('published_at', startDateStr)

    if (platform) {
      statsQuery = statsQuery.eq('platform', platform)
    }

    const { data: allContent } = await statsQuery

    // Compute stats
    const contentTypeDistribution: Record<string, Record<string, number>> = {}
    const platformContentCount: Record<string, number> = {}

    for (const item of (allContent || [])) {
      // By platform
      platformContentCount[item.platform] = (platformContentCount[item.platform] || 0) + 1

      // By content type per platform
      const key = item.platform
      if (!contentTypeDistribution[key]) {
        contentTypeDistribution[key] = {}
      }
      contentTypeDistribution[key][item.content_type] =
        (contentTypeDistribution[key][item.content_type] || 0) + 1
    }

    return NextResponse.json({
      content: content || [],
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit),
      top_content: topContent || [],
      stats: {
        content_type_distribution: contentTypeDistribution,
        platform_content_count: platformContentCount,
      },
    })
  } catch (error) {
    console.error('Content analytics API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
