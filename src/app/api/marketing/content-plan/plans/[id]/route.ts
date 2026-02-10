import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: plan, error } = await (supabase as any)
      .from('marketing_content_plans')
      .select(`
        *,
        campaign:marketing_content_campaigns(id, name, color, start_date, end_date),
        creator:profiles!marketing_content_plans_created_by_fkey(user_id, name, role),
        assignee:profiles!marketing_content_plans_assigned_to_fkey(user_id, name, role),
        status_changer:profiles!marketing_content_plans_status_changed_by_fkey(user_id, name, role),
        hashtags:marketing_content_plan_hashtags(
          hashtag:marketing_hashtags(id, tag, category)
        ),
        children:marketing_content_plans!marketing_content_plans_parent_plan_id_fkey(id, platform, status, scheduled_date)
      `)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })

    const { data: comments } = await (supabase as any)
      .from('marketing_content_plan_comments')
      .select('*, commenter:profiles!marketing_content_plan_comments_user_id_fkey(user_id, name, role)')
      .eq('content_plan_id', id)
      .order('created_at', { ascending: true })

    const { data: activity } = await (supabase as any)
      .from('marketing_content_activity_log')
      .select('*, actor:profiles!marketing_content_activity_log_user_id_fkey(user_id, name, role)')
      .eq('entity_type', 'content_plan')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(20)

    // Fetch linked content performance if linked
    let linkedContent = null
    if (plan.linked_content_id) {
      const { data } = await (supabase as any)
        .from('marketing_social_media_content')
        .select('*')
        .eq('id', plan.linked_content_id)
        .single()
      linkedContent = data
    }

    return NextResponse.json({ plan, comments: comments || [], activity: activity || [], linkedContent })
  } catch (error) {
    console.error('Error fetching content plan detail:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { hashtag_ids, ...updateFields } = body

    // Remove fields that shouldn't be directly updated
    delete updateFields.id
    delete updateFields.created_by
    delete updateFields.created_at

    const { data: plan, error } = await (supabase as any)
      .from('marketing_content_plans')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Update hashtags if provided
    if (hashtag_ids !== undefined) {
      await (supabase as any).from('marketing_content_plan_hashtags').delete().eq('content_plan_id', id)
      if (hashtag_ids.length > 0) {
        const links = hashtag_ids.map((hid: number) => ({ content_plan_id: id, hashtag_id: hid }))
        await (supabase as any).from('marketing_content_plan_hashtags').insert(links)
      }
    }

    await (supabase as any).from('marketing_content_activity_log').insert({
      user_id: user.id,
      entity_type: 'content_plan',
      entity_id: id,
      action: 'updated',
      details: { fields_changed: Object.keys(updateFields) },
    })

    return NextResponse.json({ plan })
  } catch (error) {
    console.error('Error updating content plan:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: plan } = await (supabase as any)
      .from('marketing_content_plans')
      .select('id, title, status, created_by')
      .eq('id', id)
      .single()

    if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isApprover = ['super admin', 'Director', 'Marketing Manager'].includes(profile.role)
    if (!isApprover && (plan.created_by !== user.id || plan.status !== 'draft')) {
      return NextResponse.json({ error: 'Can only delete own drafts' }, { status: 403 })
    }

    const { error } = await (supabase as any).from('marketing_content_plans').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await (supabase as any).from('marketing_content_activity_log').insert({
      user_id: user.id, entity_type: 'content_plan', entity_id: id,
      action: 'deleted', details: { title: plan.title },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting content plan:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
