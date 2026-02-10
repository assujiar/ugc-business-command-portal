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

    let query = (supabase as any)
      .from('marketing_content_campaigns')
      .select('*, creator:profiles!marketing_content_campaigns_created_by_fkey(name)')
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data: campaigns, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Get plan counts per campaign
    const campaignsWithCounts = await Promise.all(
      (campaigns || []).map(async (c: any) => {
        const { count: totalPlans } = await (supabase as any)
          .from('marketing_content_plans')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', c.id)
        const { count: publishedPlans } = await (supabase as any)
          .from('marketing_content_plans')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', c.id)
          .eq('status', 'published')
        return { ...c, totalPlans: totalPlans || 0, publishedPlans: publishedPlans || 0 }
      })
    )

    return NextResponse.json({ campaigns: campaignsWithCounts })
  } catch (error) {
    console.error('Error fetching campaigns:', error)
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

    const body = await request.json()
    const { name, description, color, start_date, end_date } = body
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const { data, error } = await (supabase as any)
      .from('marketing_content_campaigns')
      .insert({ name, description, color: color || '#6366f1', start_date, end_date, created_by: user.id })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await (supabase as any).from('marketing_content_activity_log').insert({
      user_id: user.id, entity_type: 'campaign', entity_id: data.id, action: 'created', details: { name },
    })

    return NextResponse.json({ campaign: data }, { status: 201 })
  } catch (error) {
    console.error('Error creating campaign:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
