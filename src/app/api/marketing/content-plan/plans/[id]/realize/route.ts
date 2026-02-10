import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * PATCH /api/marketing/content-plan/plans/[id]/realize
 * Update realization data: actual metrics + evidence link
 * Auto-transitions planned→published when evidence URL is provided
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const {
      actual_post_url,
      actual_post_url_2,
      actual_views,
      actual_likes,
      actual_comments,
      actual_shares,
      actual_engagement_rate,
      actual_reach,
      actual_impressions,
      actual_saves,
      actual_clicks,
      realization_notes,
    } = body

    const admin = createAdminClient()

    // Get current plan
    const { data: plan } = await (admin as any)
      .from('marketing_content_plans')
      .select('id, title, status, realized_at')
      .eq('id', id)
      .single()

    if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

    // Build update object - only include fields that are provided
    const updateData: Record<string, any> = {
      realized_by: user.id,
    }

    if (actual_post_url !== undefined) updateData.actual_post_url = actual_post_url
    if (actual_post_url_2 !== undefined) updateData.actual_post_url_2 = actual_post_url_2
    if (actual_views !== undefined) updateData.actual_views = actual_views
    if (actual_likes !== undefined) updateData.actual_likes = actual_likes
    if (actual_comments !== undefined) updateData.actual_comments = actual_comments
    if (actual_shares !== undefined) updateData.actual_shares = actual_shares
    if (actual_engagement_rate !== undefined) updateData.actual_engagement_rate = actual_engagement_rate
    if (actual_reach !== undefined) updateData.actual_reach = actual_reach
    if (actual_impressions !== undefined) updateData.actual_impressions = actual_impressions
    if (actual_saves !== undefined) updateData.actual_saves = actual_saves
    if (actual_clicks !== undefined) updateData.actual_clicks = actual_clicks
    if (realization_notes !== undefined) updateData.realization_notes = realization_notes

    // Set realized_at if this is first realization
    if (!plan.realized_at) {
      updateData.realized_at = new Date().toISOString()
    }

    // Auto-set status to published if still planned (with evidence URL)
    if (plan.status === 'planned' && actual_post_url) {
      updateData.status = 'published'
      updateData.status_changed_at = new Date().toISOString()
      updateData.status_changed_by = user.id
      updateData.published_at = new Date().toISOString()
    }

    const { data: updatedArr, error } = await (admin as any)
      .from('marketing_content_plans')
      .update(updateData)
      .eq('id', id)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updatedArr || updatedArr.length === 0) return NextResponse.json({ error: 'Update failed - plan not found' }, { status: 404 })
    const updated = updatedArr[0]

    // Log activity
    await (admin as any).from('marketing_content_activity_log').insert({
      user_id: user.id,
      entity_type: 'content_plan',
      entity_id: id,
      action: 'realized',
      details: {
        actual_post_url,
        actual_views,
        actual_likes,
        has_evidence: !!actual_post_url,
      },
    })

    return NextResponse.json({ plan: updated })
  } catch (error) {
    console.error('Error updating realization:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
