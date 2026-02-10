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
    const month = searchParams.get('month') // format: 2026-02
    const now = new Date()
    const year = month ? parseInt(month.split('-')[0]) : now.getFullYear()
    const mon = month ? parseInt(month.split('-')[1]) : now.getMonth() + 1
    const startOfMonth = `${year}-${String(mon).padStart(2, '0')}-01`
    const endOfMonth = new Date(year, mon, 0).toISOString().split('T')[0]

    // All plans this month
    const { data: monthPlans } = await (supabase as any)
      .from('marketing_content_plans')
      .select('id, status, platform, scheduled_date, linked_content_id')
      .gte('scheduled_date', startOfMonth)
      .lte('scheduled_date', endOfMonth)

    const plans = monthPlans || []
    const kpis = {
      totalPlanned: plans.length,
      published: plans.filter((p: any) => p.status === 'published').length,
      inReview: plans.filter((p: any) => p.status === 'in_review').length,
      draft: plans.filter((p: any) => p.status === 'draft').length,
      approved: plans.filter((p: any) => p.status === 'approved').length,
      rejected: plans.filter((p: any) => p.status === 'rejected').length,
      completionRate: plans.length > 0
        ? Math.round((plans.filter((p: any) => p.status === 'published').length / plans.length) * 100)
        : 0,
    }

    // Upcoming this week
    const today = now.toISOString().split('T')[0]
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const { data: upcoming } = await (supabase as any)
      .from('marketing_content_plans')
      .select('id, title, platform, content_type, scheduled_date, scheduled_time, status, assigned_to, campaign:marketing_content_campaigns(name, color)')
      .gte('scheduled_date', today)
      .lte('scheduled_date', nextWeek)
      .in('status', ['draft', 'in_review', 'approved'])
      .order('scheduled_date', { ascending: true })
      .limit(10)

    // Needs attention: overdue (past date, not published/archived) + rejected
    const { data: needsAttention } = await (supabase as any)
      .from('marketing_content_plans')
      .select('id, title, platform, content_type, scheduled_date, status, created_by, creator:profiles!marketing_content_plans_created_by_fkey(name)')
      .or(`and(scheduled_date.lt.${today},status.in.(draft,in_review,approved)),status.eq.rejected`)
      .order('scheduled_date', { ascending: true })
      .limit(10)

    // Recent activity
    const { data: recentActivity } = await (supabase as any)
      .from('marketing_content_activity_log')
      .select('*, actor:profiles!marketing_content_activity_log_user_id_fkey(name, role)')
      .order('created_at', { ascending: false })
      .limit(15)

    return NextResponse.json({
      kpis,
      upcoming: upcoming || [],
      needsAttention: needsAttention || [],
      recentActivity: recentActivity || [],
    })
  } catch (error) {
    console.error('Error fetching overview:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
