import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * POST - VSDO delivers a design version
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Only VSDO/admin can deliver
    const producerRoles = ['VSDO', 'Director', 'super admin']
    if (!producerRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Only VSDO can deliver designs' }, { status: 403 })
    }

    const { data: req } = await (supabase as any)
      .from('marketing_design_requests')
      .select('id, status, first_delivered_at')
      .eq('id', id)
      .single()

    if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

    // Must be in_progress or accepted to deliver
    if (!['in_progress', 'accepted'].includes(req.status)) {
      return NextResponse.json({ error: `Cannot deliver when status is ${req.status}` }, { status: 400 })
    }

    const body = await request.json()
    const { design_url, design_url_2, thumbnail_url, file_format, notes } = body

    if (!design_url) {
      return NextResponse.json({ error: 'design_url is required' }, { status: 400 })
    }

    // Get next version number
    const { data: existingVersions } = await (supabase as any)
      .from('marketing_design_versions')
      .select('version_number')
      .eq('request_id', id)
      .order('version_number', { ascending: false })
      .limit(1)

    const nextVersion = existingVersions?.length > 0 ? existingVersions[0].version_number + 1 : 1

    const { data: version, error } = await (supabase as any)
      .from('marketing_design_versions')
      .insert({
        request_id: id,
        version_number: nextVersion,
        design_url,
        design_url_2: design_url_2 || null,
        thumbnail_url: thumbnail_url || null,
        file_format: file_format || null,
        notes: notes || null,
        delivered_by: user.id,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Update request status to delivered + set first_delivered_at if needed
    const updateData: any = { status: 'delivered' }
    if (!req.first_delivered_at) {
      updateData.first_delivered_at = new Date().toISOString()
    }

    await (supabase as any)
      .from('marketing_design_requests')
      .update(updateData)
      .eq('id', id)

    // Add system comment
    await (supabase as any).from('marketing_design_comments').insert({
      request_id: id,
      user_id: user.id,
      comment: `Design versi ${nextVersion} telah dikirim`,
      comment_type: 'system',
      version_ref: nextVersion,
    })

    return NextResponse.json({ version }, { status: 201 })
  } catch (error) {
    console.error('Error delivering design version:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
