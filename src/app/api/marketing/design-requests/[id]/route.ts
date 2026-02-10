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

    const { data: req, error } = await (supabase as any)
      .from('marketing_design_requests')
      .select(`
        *,
        requester:profiles!marketing_design_requests_requested_by_fkey(user_id, name, role),
        assignee:profiles!marketing_design_requests_assigned_to_fkey(user_id, name, role),
        campaign:marketing_content_campaigns(id, name, color)
      `)
      .eq('id', id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 404 })

    // Fetch versions
    const { data: versions } = await (supabase as any)
      .from('marketing_design_versions')
      .select('*, deliverer:profiles!marketing_design_versions_delivered_by_fkey(user_id, name, role), reviewer:profiles!marketing_design_versions_reviewed_by_fkey(user_id, name, role)')
      .eq('request_id', id)
      .order('version_number', { ascending: true })

    // Fetch comments
    const { data: comments } = await (supabase as any)
      .from('marketing_design_comments')
      .select('*, commenter:profiles!marketing_design_comments_user_id_fkey(user_id, name, role)')
      .eq('request_id', id)
      .order('created_at', { ascending: true })

    // Calculate time metrics
    const timeMetrics: any = {}
    if (req.submitted_at && req.accepted_at) {
      timeMetrics.timeToAcceptMs = new Date(req.accepted_at).getTime() - new Date(req.submitted_at).getTime()
    }
    if (req.accepted_at && req.first_delivered_at) {
      timeMetrics.timeToFirstDeliveryMs = new Date(req.first_delivered_at).getTime() - new Date(req.accepted_at).getTime()
    }
    if (req.submitted_at && req.approved_at) {
      timeMetrics.totalTurnaroundMs = new Date(req.approved_at).getTime() - new Date(req.submitted_at).getTime()
    }
    if (req.deadline && req.approved_at) {
      timeMetrics.slaStatus = new Date(req.approved_at) <= new Date(req.deadline + 'T23:59:59') ? 'on_time' : 'overdue'
    } else if (req.deadline && !req.approved_at && req.status !== 'cancelled') {
      timeMetrics.slaStatus = new Date() <= new Date(req.deadline + 'T23:59:59') ? 'on_track' : 'at_risk'
    }

    return NextResponse.json({
      request: req,
      versions: versions || [],
      comments: comments || [],
      timeMetrics,
      userRole: profile.role,
    })
  } catch (error) {
    console.error('Error fetching design request detail:', error)
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

    const { data: existing } = await (supabase as any)
      .from('marketing_design_requests')
      .select('id, status, requested_by')
      .eq('id', id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Only drafts can be edited, and only by requester or approvers
    if (existing.status !== 'draft') {
      return NextResponse.json({ error: 'Can only edit draft requests' }, { status: 400 })
    }

    const isApprover = ['Director', 'super admin', 'Marketing Manager'].includes(profile.role)
    if (existing.requested_by !== user.id && !isApprover) {
      return NextResponse.json({ error: 'Can only edit own requests' }, { status: 403 })
    }

    const body = await request.json()
    // Remove fields that shouldn't be directly updated
    delete body.id; delete body.requested_by; delete body.created_at; delete body.status

    const { data: updated, error } = await (supabase as any)
      .from('marketing_design_requests')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ request: updated })
  } catch (error) {
    console.error('Error updating design request:', error)
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

    const { data: existing } = await (supabase as any)
      .from('marketing_design_requests')
      .select('id, status, requested_by')
      .eq('id', id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isApprover = ['Director', 'super admin', 'Marketing Manager'].includes(profile.role)
    if (!isApprover && (existing.requested_by !== user.id || existing.status !== 'draft')) {
      return NextResponse.json({ error: 'Can only delete own drafts' }, { status: 403 })
    }

    const { error } = await (supabase as any).from('marketing_design_requests').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting design request:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
