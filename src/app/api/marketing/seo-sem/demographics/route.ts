import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'
import { parseDateRange } from '@/lib/date-range-helper'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const site = searchParams.get('site') || '__all__'

    const admin = createAdminClient()
    const { startStr, endStr } = parseDateRange(searchParams)

    // Fetch all demographics data for the date range
    // We use the most recent fetch_date within range as demographics are aggregated
    let query = (admin as any)
      .from('marketing_ga4_demographics')
      .select('*')
      .gte('fetch_date', startStr)
      .lte('fetch_date', endStr)
      .order('sessions', { ascending: false })

    if (site !== '__all__') query = query.eq('site', site)

    const { data: demoData } = await query
    const rows = demoData || []

    // Group by dimension_type, keeping only latest fetch_date per type
    const grouped: Record<string, any[]> = {}
    for (const row of rows) {
      const type = row.dimension_type
      if (!grouped[type]) grouped[type] = []
      grouped[type].push(row)
    }

    // For each dimension type, deduplicate by dimension_value (keep latest fetch_date)
    const result: Record<string, any[]> = {}
    for (const [type, items] of Object.entries(grouped)) {
      const byValue = new Map<string, any>()
      for (const item of items) {
        const existing = byValue.get(item.dimension_value)
        if (!existing || item.fetch_date > existing.fetch_date) {
          byValue.set(item.dimension_value, item)
        }
      }
      result[type] = Array.from(byValue.values())
        .sort((a, b) => b.sessions - a.sessions)
    }

    return NextResponse.json({
      age: result.age || [],
      gender: result.gender || [],
      country: result.country || [],
      city: result.city || [],
      new_returning: result.new_returning || [],
      language: result.language || [],
      dateRange: { start: startStr, end: endStr },
    })
  } catch (error) {
    console.error('Demographics error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
