import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const VALID_TRANSITIONS: Record<string, { to: string[]; requiresApprover: boolean }[]> = {
  draft: [{ to: ['in_review'], requiresApprover: false }],
  in_review: [
    { to: ['approved'], requiresApprover: true },
    { to: ['rejected'], requiresApprover: true },
    { to: ['draft'], requiresApprover: false }, // withdraw
  ],
  approved: [{ to: ['published'], requiresApprover: false }],
  rejected: [{ to: ['draft'], requiresApprover: false }, { to: ['in_review'], requiresApprover: false }],
  published: [{ to: ['archived'], requiresApprover: true }],
  archived: [],
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

    const { data: plan } = await (supabase as any)
      .from('marketing_content_plans')
      .select('id, status, created_by, title')
      .eq('id', id)
      .single()
    if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Validate transition
    const transitions = VALID_TRANSITIONS[plan.status] || []
    const validTransition = transitions.find(t => t.to.includes(newStatus))
    if (!validTransition) {
      return NextResponse.json({ error: `Cannot transition from ${plan.status} to ${newStatus}` }, { status: 400 })
    }

    const isApprover = ['super admin', 'Director', 'Marketing Manager'].includes(profile.role)
    if (validTransition.requiresApprover && !isApprover) {
      return NextResponse.json({ error: 'Only Manager/Director can perform this action' }, { status: 403 })
    }

    // Rejection requires comment
    if (newStatus === 'rejected' && !comment) {
      return NextResponse.json({ error: 'Comment is required when rejecting' }, { status: 400 })
    }

    const updateData: any = {
      status: newStatus,
      status_changed_at: new Date().toISOString(),
      status_changed_by: user.id,
    }
    if (newStatus === 'published') updateData.published_at = new Date().toISOString()

    const { data: updated, error } = await (supabase as any)
      .from('marketing_content_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Add comment if provided
    if (comment) {
      const commentType = newStatus === 'approved' ? 'approval'
        : newStatus === 'rejected' ? 'rejection'
        : 'status_change'
      await (supabase as any).from('marketing_content_plan_comments').insert({
        content_plan_id: id,
        user_id: user.id,
        comment,
        comment_type: commentType,
      })
    }

    return NextResponse.json({ plan: updated })
  } catch (error) {
    console.error('Error changing status:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
