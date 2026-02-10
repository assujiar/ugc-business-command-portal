import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const platform = searchParams.get('platform')
    const status = searchParams.get('status')
    const campaignId = searchParams.get('campaign_id')
    const assignedTo = searchParams.get('assigned_to')
    const search = searchParams.get('search')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const offset = (page - 1) * limit

    let query = (supabase as any)
      .from('marketing_content_plans')
      .select(`
        *,
        campaign:marketing_content_campaigns(id, name, color),
        creator:profiles!marketing_content_plans_created_by_fkey(user_id, name, role),
        assignee:profiles!marketing_content_plans_assigned_to_fkey(user_id, name, role),
        hashtags:marketing_content_plan_hashtags(
          hashtag:marketing_hashtags(id, tag, category)
        )
      `, { count: 'exact' })
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true, nullsFirst: false })

    if (startDate) query = query.gte('scheduled_date', startDate)
    if (endDate) query = query.lte('scheduled_date', endDate)
    if (platform) query = query.eq('platform', platform)
    if (status) query = query.eq('status', status)
    if (campaignId) query = query.eq('campaign_id', campaignId)
    if (assignedTo) query = query.eq('assigned_to', assignedTo)
    if (search) query = query.or(`title.ilike.%${search}%,caption.ilike.%${search}%`)

    query = query.range(offset, offset + limit - 1)

    const { data: plans, count, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Get status counts for the filtered date range
    let countQuery = (supabase as any)
      .from('marketing_content_plans')
      .select('status', { count: 'exact', head: false })
    if (startDate) countQuery = countQuery.gte('scheduled_date', startDate)
    if (endDate) countQuery = countQuery.lte('scheduled_date', endDate)
    const { data: allForCounts } = await countQuery

    const statusCounts = { draft: 0, in_review: 0, approved: 0, rejected: 0, published: 0, archived: 0 }
    if (allForCounts) {
      for (const p of allForCounts) {
        if (p.status in statusCounts) statusCounts[p.status as keyof typeof statusCounts]++
      }
    }

    return NextResponse.json({ plans: plans || [], total: count || 0, page, statusCounts })
  } catch (error) {
    console.error('Error fetching content plans:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { title, platform, content_type, scheduled_date, scheduled_time, caption, notes, campaign_id, assigned_to, priority, visual_url, visual_thumbnail_url, target_views, target_likes, target_comments, target_shares, target_engagement_rate, hashtag_ids, cross_post_platforms, submit_for_review } = body

    if (!title || !platform || !scheduled_date) {
      return NextResponse.json({ error: 'title, platform, and scheduled_date are required' }, { status: 400 })
    }

    const platforms = cross_post_platforms && cross_post_platforms.length > 0
      ? [platform, ...cross_post_platforms.filter((p: string) => p !== platform)]
      : [platform]

    const createdPlans = []
    let parentId: string | null = null

    for (let i = 0; i < platforms.length; i++) {
      const planData: any = {
        title,
        platform: platforms[i],
        content_type: content_type || 'post',
        scheduled_date,
        scheduled_time: scheduled_time || null,
        caption: caption || null,
        notes: notes || null,
        campaign_id: campaign_id || null,
        assigned_to: assigned_to || null,
        priority: priority || 'medium',
        visual_url: visual_url || null,
        visual_thumbnail_url: visual_thumbnail_url || null,
        target_views: target_views || null,
        target_likes: target_likes || null,
        target_comments: target_comments || null,
        target_shares: target_shares || null,
        target_engagement_rate: target_engagement_rate || null,
        created_by: user.id,
        status: submit_for_review ? 'in_review' : 'draft',
        parent_plan_id: parentId,
      }

      const { data: plan, error } = await (supabase as any)
        .from('marketing_content_plans')
        .insert(planData)
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (i === 0 && platforms.length > 1) parentId = plan.id
      createdPlans.push(plan)

      // Link hashtags
      if (hashtag_ids && hashtag_ids.length > 0) {
        const hashtagLinks = hashtag_ids.map((hid: number) => ({
          content_plan_id: plan.id,
          hashtag_id: hid,
        }))
        await (supabase as any).from('marketing_content_plan_hashtags').insert(hashtagLinks)
      }

      // Activity log
      await (supabase as any).from('marketing_content_activity_log').insert({
        user_id: user.id,
        entity_type: 'content_plan',
        entity_id: plan.id,
        action: 'created',
        details: { title, platform: platforms[i], status: plan.status },
      })
    }

    return NextResponse.json({ plans: createdPlans }, { status: 201 })
  } catch (error) {
    console.error('Error creating content plan:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
