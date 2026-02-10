import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const category = searchParams.get('category')
    const limit = Math.min(200, parseInt(searchParams.get('limit') || '50', 10))

    let query = (supabase as any)
      .from('marketing_hashtags')
      .select('*')
      .order('usage_count', { ascending: false })
      .limit(limit)

    if (search) query = query.ilike('tag', `%${search}%`)
    if (category) query = query.eq('category', category)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ hashtags: data || [] })
  } catch (error) {
    console.error('Error fetching hashtags:', error)
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
    const { tag, category, platforms } = body
    if (!tag) return NextResponse.json({ error: 'tag is required' }, { status: 400 })

    const cleanTag = tag.replace(/^#/, '').toLowerCase().trim()
    if (!cleanTag) return NextResponse.json({ error: 'Invalid tag' }, { status: 400 })

    const { data, error } = await (supabase as any)
      .from('marketing_hashtags')
      .insert({ tag: cleanTag, category: category || 'general', platforms: platforms || [], created_by: user.id })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Hashtag already exists' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ hashtag: data }, { status: 201 })
  } catch (error) {
    console.error('Error creating hashtag:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
