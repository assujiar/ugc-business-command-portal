import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

const SUPERVISOR_ROLES = ['Director', 'super admin', 'Marketing Manager', 'MACX']
const PRODUCER_ROLE = 'VSDO'

const VALID_TRANSITIONS: Record<string, { targets: string[]; requesterOnly?: boolean; producerOnly?: boolean }> = {
  draft: { targets: ['submitted', 'cancelled'], requesterOnly: true },
  submitted: { targets: ['accepted', 'cancelled'], producerOnly: true },
  accepted: { targets: ['in_progress'], producerOnly: true },
  in_progress: { targets: ['delivered'], producerOnly: true },
  delivered: { targets: ['approved', 'revision_requested'], requesterOnly: true },
  revision_requested: { targets: ['in_progress'], producerOnly: true },
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
    const { status: targetStatus, comment, assigned_to } = body

    if (!targetStatus) return NextResponse.json({ error: 'status is required' }, { status: 400 })

    const { data: req } = await (supabase as any)
      .from('marketing_design_requests')
      .select('id, status, requested_by, assigned_to, first_delivered_at, revision_count')
      .eq('id', id)
      .single()

    if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Validate transition
    const transition = VALID_TRANSITIONS[req.status]
    if (!transition || !transition.targets.includes(targetStatus)) {
      return NextResponse.json({ error: `Cannot transition from ${req.status} to ${targetStatus}` }, { status: 400 })
    }

    const isSupervisor = SUPERVISOR_ROLES.includes(profile.role)
    const isProducer = profile.role === PRODUCER_ROLE
    const isRequester = req.requested_by === user.id

    if (transition.requesterOnly) {
      // VDCO cannot do requester actions (submit, approve, request revision)
      if (isProducer) return NextResponse.json({ error: 'VSDO tidak bisa melakukan aksi ini' }, { status: 403 })
      if (!isRequester && !isSupervisor) return NextResponse.json({ error: 'Hanya requester yang bisa melakukan aksi ini' }, { status: 403 })
    }
    if (transition.producerOnly) {
      // Only VDCO + supervisor can do producer actions (accept, start, deliver)
      if (!isProducer && !isSupervisor) return NextResponse.json({ error: 'Hanya VSDO yang bisa melakukan aksi ini' }, { status: 403 })
    }

    // Revision requires comment
    if (targetStatus === 'revision_requested' && !comment?.trim()) {
      return NextResponse.json({ error: 'Revision feedback is required' }, { status: 400 })
    }

    // Build update
    const updateData: any = { status: targetStatus }
    const now = new Date().toISOString()

    if (targetStatus === 'submitted') updateData.submitted_at = now
    if (targetStatus === 'accepted') {
      updateData.accepted_at = now
      if (assigned_to) updateData.assigned_to = assigned_to
      else if (!req.assigned_to) updateData.assigned_to = user.id
    }
    if (targetStatus === 'approved') updateData.approved_at = now
    if (targetStatus === 'cancelled') updateData.cancelled_at = now
    if (targetStatus === 'revision_requested') {
      updateData.revision_count = (req.revision_count || 0) + 1
    }
    if (targetStatus === 'in_progress' && req.status === 'revision_requested') {
      // VSDO starts working on revision - no special timestamp needed
    }

    const { data: updated, error } = await (supabase as any)
      .from('marketing_design_requests')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Add comment if provided
    if (comment?.trim()) {
      const commentType = targetStatus === 'revision_requested' ? 'revision_feedback'
        : targetStatus === 'approved' ? 'approval'
        : targetStatus === 'cancelled' ? 'system'
        : 'comment'

      await (supabase as any).from('marketing_design_comments').insert({
        request_id: id,
        user_id: user.id,
        comment: comment.trim(),
        comment_type: commentType,
      })
    }

    return NextResponse.json({ request: updated })
  } catch (error) {
    console.error('Error changing design request status:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
