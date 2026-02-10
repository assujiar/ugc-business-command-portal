import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// Simplified transitions: draft→planned, planned→published, draft can also go straight to published
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['planned', 'published'],
  planned: ['draft', 'published'],
  published: [], // terminal state
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { status: newStatus, comment } = body
    if (!newStatus) return NextResponse.json({ error: 'status is required' }, { status: 400 })

    const admin = createAdminClient()

    const { data: plan } = await (admin as any)
      .from('marketing_content_plans')
      .select('id, status, created_by, title')
      .eq('id', id)
      .single()
    if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Validate transition
    const allowed = VALID_TRANSITIONS[plan.status] || []
    if (!allowed.includes(newStatus)) {
      return NextResponse.json({ error: `Cannot transition from ${plan.status} to ${newStatus}` }, { status: 400 })
    }

    const updateData: any = {
      status: newStatus,
      status_changed_at: new Date().toISOString(),
      status_changed_by: user.id,
    }
    if (newStatus === 'published') updateData.published_at = new Date().toISOString()

    const { data: updatedArr, error } = await (admin as any)
      .from('marketing_content_plans')
      .update(updateData)
      .eq('id', id)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updatedArr || updatedArr.length === 0) return NextResponse.json({ error: 'Update failed - plan not found' }, { status: 404 })
    const updated = updatedArr[0]

    // Add comment if provided
    if (comment) {
      await (admin as any).from('marketing_content_plan_comments').insert({
        content_plan_id: id,
        user_id: user.id,
        comment,
        comment_type: 'status_change',
      })
    }

    // Activity log
    await (admin as any).from('marketing_content_activity_log').insert({
      user_id: user.id,
      entity_type: 'content_plan',
      entity_id: id,
      action: 'status_changed',
      details: { from_status: plan.status, to_status: newStatus },
    })

    return NextResponse.json({ plan: updated })
  } catch (error) {
    console.error('Error changing status:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
