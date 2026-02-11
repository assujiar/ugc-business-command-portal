import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAccessMarketingPanel } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const admin = createAdminClient()

    // Fetch all revenue actuals
    const { data: revenueData } = await (admin as any)
      .from('marketing_revenue_actuals')
      .select('*')
      .order('month', { ascending: false })
      .order('channel', { ascending: true })

    // Fetch ad spend by month & channel for ROAS calculation
    const { data: spendData } = await (admin as any)
      .from('marketing_sem_daily_spend')
      .select('fetch_date, platform, total_spend, total_clicks, total_conversions')

    // Aggregate spend by month + platform
    const spendByMonthChannel = new Map<string, { spend: number; clicks: number; conversions: number }>()
    for (const r of (spendData || [])) {
      const month = r.fetch_date.substring(0, 7) // YYYY-MM
      const key = `${r.platform}|${month}`
      const existing = spendByMonthChannel.get(key) || { spend: 0, clicks: 0, conversions: 0 }
      existing.spend += Number(r.total_spend) || 0
      existing.clicks += Number(r.total_clicks) || 0
      existing.conversions += Number(r.total_conversions) || 0
      spendByMonthChannel.set(key, existing)
    }

    // Build response: merge revenue with spend
    const rows = (revenueData || []).map((rev: any) => {
      const spendKey = `${rev.channel}|${rev.month}`
      const spend = spendByMonthChannel.get(spendKey)
      return {
        ...rev,
        ad_spend: spend?.spend ?? 0,
        ad_clicks: spend?.clicks ?? 0,
        ad_conversions: spend?.conversions ?? 0,
        roas: spend && spend.spend > 0 ? rev.revenue / spend.spend : null,
      }
    })

    // Also return available months (from spend data) so UI knows which months have spend
    const availableMonths = new Set<string>()
    for (const key of Array.from(spendByMonthChannel.keys())) {
      availableMonths.add(key.split('|')[1])
    }

    // Get spend-only months (months with spend but no revenue entry yet)
    const existingRevenueKeys = new Set((revenueData || []).map((r: any) => `${r.channel}|${r.month}`))
    const missingEntries: Array<{ channel: string; month: string; ad_spend: number; ad_clicks: number; ad_conversions: number }> = []
    for (const [key, spend] of Array.from(spendByMonthChannel.entries())) {
      if (!existingRevenueKeys.has(key) && spend.spend > 0) {
        const [channel, month] = key.split('|')
        missingEntries.push({
          channel,
          month,
          ad_spend: spend.spend,
          ad_clicks: spend.clicks,
          ad_conversions: spend.conversions,
        })
      }
    }

    return NextResponse.json({
      rows,
      missingEntries,
      availableMonths: Array.from(availableMonths).sort().reverse(),
    })
  } catch (error) {
    console.error('Revenue actuals error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}

// Upsert revenue actuals
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single() as { data: { role: string } | null }
    if (!profile || !canAccessMarketingPanel(profile.role as any)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const { entries } = body as {
      entries: Array<{
        channel: string
        month: string
        revenue: number
        leads_count?: number
        deals_count?: number
        notes?: string
      }>
    }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'entries array is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const results: any[] = []

    for (const entry of entries) {
      if (!entry.channel || !entry.month) continue

      const { data, error } = await (admin as any)
        .from('marketing_revenue_actuals')
        .upsert({
          channel: entry.channel,
          month: entry.month,
          revenue: entry.revenue || 0,
          leads_count: entry.leads_count || 0,
          deals_count: entry.deals_count || 0,
          notes: entry.notes || null,
          updated_by: user.id,
        }, { onConflict: 'channel,month' })
        .select()

      if (error) {
        results.push({ channel: entry.channel, month: entry.month, success: false, error: error.message })
      } else {
        results.push({ channel: entry.channel, month: entry.month, success: true, data })
      }
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Revenue upsert error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 })
  }
}
