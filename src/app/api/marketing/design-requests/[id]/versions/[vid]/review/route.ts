import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string; vid: string }> }

/**
 * PATCH - Requester reviews a design version (approve or request revision)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, vid } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { review_status, review_comment } = body

    // RBAC: VDCO cannot review designs they produce
    if (profile.role === 'VDCO') {
      return NextResponse.json({ error: 'VDCO tidak bisa mereview design yang mereka produksi' }, { status: 403 })
    }

    if (!review_status || !['approved', 'revision_requested'].includes(review_status)) {
      return NextResponse.json({ error: 'review_status must be approved or revision_requested' }, { status: 400 })
    }

    if (review_status === 'revision_requested' && !review_comment?.trim()) {
      return NextResponse.json({ error: 'Review comment is required for revision requests' }, { status: 400 })
    }

    // Check request ownership
    const { data: req } = await (supabase as any)
      .from('marketing_design_requests')
      .select('id, status, requested_by, revision_count')
      .eq('id', id)
      .single()

    if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

    const isRequester = req.requested_by === user.id || ['Director', 'super admin', 'Marketing Manager'].includes(profile.role)
    if (!isRequester) {
      return NextResponse.json({ error: 'Only requester can review designs' }, { status: 403 })
    }

    // Update the version
    const now = new Date().toISOString()
    const { data: version, error } = await (supabase as any)
      .from('marketing_design_versions')
      .update({
        review_status,
        reviewed_by: user.id,
        reviewed_at: now,
        review_comment: review_comment || null,
      })
      .eq('id', parseInt(vid))
      .eq('request_id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Update request status
    if (review_status === 'approved') {
      await (supabase as any)
        .from('marketing_design_requests')
        .update({ status: 'approved', approved_at: now })
        .eq('id', id)

      await (supabase as any).from('marketing_design_comments').insert({
        request_id: id, user_id: user.id,
        comment: `Design versi ${version.version_number} telah di-approve`,
        comment_type: 'approval', version_ref: version.version_number,
      })
    } else {
      await (supabase as any)
        .from('marketing_design_requests')
        .update({
          status: 'revision_requested',
          revision_count: (req.revision_count || 0) + 1,
        })
        .eq('id', id)

      await (supabase as any).from('marketing_design_comments').insert({
        request_id: id, user_id: user.id,
        comment: review_comment,
        comment_type: 'revision_feedback', version_ref: version.version_number,
      })
    }

    return NextResponse.json({ version })
  } catch (error) {
    console.error('Error reviewing design version:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
