import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

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
    const { linked_content_id } = body

    if (!linked_content_id) return NextResponse.json({ error: 'linked_content_id is required' }, { status: 400 })

    // Verify the content exists
    const { data: content } = await (supabase as any)
      .from('marketing_social_media_content')
      .select('id, platform, title')
      .eq('id', linked_content_id)
      .single()

    if (!content) return NextResponse.json({ error: 'Linked content not found' }, { status: 404 })

    const { data: planArr, error } = await (supabase as any)
      .from('marketing_content_plans')
      .update({ linked_content_id })
      .eq('id', id)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!planArr || planArr.length === 0) return NextResponse.json({ error: 'Plan not found or update not allowed' }, { status: 404 })
    const plan = planArr[0]

    await (supabase as any).from('marketing_content_activity_log').insert({
      user_id: user.id, entity_type: 'content_plan', entity_id: id,
      action: 'linked', details: { linked_content_id, content_title: content.title },
    })

    return NextResponse.json({ plan, linkedContent: content })
  } catch (error) {
    console.error('Error linking content:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
