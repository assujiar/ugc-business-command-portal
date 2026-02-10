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
    const status = searchParams.get('status')
    const design_type = searchParams.get('design_type')
    const priority = searchParams.get('priority')
    const assigned_to = searchParams.get('assigned_to')
    const requested_by = searchParams.get('requested_by')
    const search = searchParams.get('search')
    const my_requests = searchParams.get('my_requests')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = (supabase as any)
      .from('marketing_design_requests')
      .select(`
        *,
        requester:profiles!marketing_design_requests_requested_by_fkey(user_id, name, role),
        assignee:profiles!marketing_design_requests_assigned_to_fkey(user_id, name, role),
        campaign:marketing_content_campaigns(id, name, color)
      `, { count: 'exact' })

    if (status && status !== 'all') query = query.eq('status', status)
    if (design_type && design_type !== 'all') query = query.eq('design_type', design_type)
    if (priority && priority !== 'all') query = query.eq('priority', priority)
    if (assigned_to) query = query.eq('assigned_to', assigned_to)
    if (requested_by) query = query.eq('requested_by', requested_by)
    if (my_requests === 'true') query = query.eq('requested_by', user.id)
    if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)

    query = query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    const { data: requests, error, count } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Get version counts per request
    const requestIds = (requests || []).map((r: any) => r.id)
    let versionCounts: Record<string, number> = {}
    if (requestIds.length > 0) {
      const { data: versions } = await (supabase as any)
        .from('marketing_design_versions')
        .select('request_id')
        .in('request_id', requestIds)

      if (versions) {
        versions.forEach((v: any) => {
          versionCounts[v.request_id] = (versionCounts[v.request_id] || 0) + 1
        })
      }
    }

    const enriched = (requests || []).map((r: any) => ({
      ...r,
      version_count: versionCounts[r.id] || 0,
    }))

    return NextResponse.json({ requests: enriched, total: count || 0, page })
  } catch (error) {
    console.error('Error fetching design requests:', error)
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

    // Only marketing requesters can create
    const requesterRoles = ['Director', 'super admin', 'Marketing Manager', 'Marcomm', 'DGO', 'MACX']
    if (!requesterRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Only marketing roles can create design requests' }, { status: 403 })
    }

    const body = await request.json()
    const {
      title, description, design_type, design_subtype, platform_target,
      dimensions, brand_guidelines, reference_urls, reference_notes,
      copy_text, cta_text, color_preferences, mood_tone, output_format,
      quantity, priority, deadline, campaign_id, submit_immediately,
    } = body

    if (!title || !description || !design_type) {
      return NextResponse.json({ error: 'Title, description, and design_type are required' }, { status: 400 })
    }

    const insertData: any = {
      title,
      description,
      design_type,
      design_subtype: design_subtype || null,
      platform_target: platform_target || [],
      dimensions: dimensions || null,
      brand_guidelines: brand_guidelines || null,
      reference_urls: reference_urls || [],
      reference_notes: reference_notes || null,
      copy_text: copy_text || null,
      cta_text: cta_text || null,
      color_preferences: color_preferences || null,
      mood_tone: mood_tone || null,
      output_format: output_format || ['png'],
      quantity: quantity || 1,
      priority: priority || 'medium',
      deadline: deadline || null,
      campaign_id: campaign_id || null,
      requested_by: user.id,
      status: submit_immediately ? 'submitted' : 'draft',
    }

    if (submit_immediately) {
      insertData.submitted_at = new Date().toISOString()
    }

    const { data: created, error } = await (supabase as any)
      .from('marketing_design_requests')
      .insert(insertData)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ request: created }, { status: 201 })
  } catch (error) {
    console.error('Error creating design request:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
