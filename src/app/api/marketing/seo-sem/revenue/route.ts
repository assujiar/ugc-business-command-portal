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

    // Map lead sources to marketing channels
    const SOURCE_TO_CHANNEL: Record<string, string> = {
      'Webform (SEM)': 'google_ads',
      'Webform (Organic)': 'organic',
      'Instagram': 'social',
      'Facebook': 'social',
      'TikTok': 'social',
      'Event': 'other',
      'Referral': 'referral',
      'Outbound': 'other',
      'Lainnya': 'other',
    }

    // Fetch all data in parallel
    const [
      { data: revenueData },
      { data: spendData },
      { data: leadsData },
      { data: oppsData },
      { data: quotationsData },
    ] = await Promise.all([
      (admin as any)
        .from('marketing_revenue_actuals')
        .select('*')
        .order('month', { ascending: false })
        .order('channel', { ascending: true }),
      // Use marketing_sem_campaigns (individual rows) instead of daily_spend
      // because daily_spend aggregate totals may be corrupted (string concatenation bug)
      (admin as any)
        .from('marketing_sem_campaigns')
        .select('fetch_date, platform, spend, clicks, conversions'),
      (admin as any)
        .from('leads')
        .select('lead_id, source, source_detail, created_at, potential_revenue'),
      (admin as any)
        .from('opportunities')
        .select('opportunity_id, source_lead_id, stage, closed_at, created_at'),
      (admin as any)
        .from('customer_quotations')
        .select('id, opportunity_id, total_selling_rate, status')
        .eq('status', 'accepted'),
    ])

    // Build accepted quotation value per opportunity
    const quotationValueByOpp = new Map<string, number>()
    for (const q of (quotationsData || [])) {
      if (!q.opportunity_id) continue
      quotationValueByOpp.set(
        q.opportunity_id,
        (quotationValueByOpp.get(q.opportunity_id) || 0) + (Number(q.total_selling_rate) || 0)
      )
    }

    // --- CRM: Aggregate leads by channel × month ---
    const crmLeadsByChannelMonth = new Map<string, number>()
    for (const lead of (leadsData || [])) {
      const channel = SOURCE_TO_CHANNEL[lead.source] || 'other'
      const month = (lead.created_at || '').substring(0, 7)
      if (!month) continue
      const key = `${channel}|${month}`
      crmLeadsByChannelMonth.set(key, (crmLeadsByChannelMonth.get(key) || 0) + 1)
    }

    // --- CRM: Build lead_id → channel map for opportunity attribution ---
    const leadChannelMap = new Map<string, string>()
    for (const lead of (leadsData || [])) {
      const channel = SOURCE_TO_CHANNEL[lead.source] || 'other'
      leadChannelMap.set(lead.lead_id, channel)
    }

    // --- CRM: Aggregate won deals by channel × month ---
    // Deal value = SUM of accepted quotation total_selling_rate (not estimated_value)
    const crmDealsByChannelMonth = new Map<string, { count: number; value: number }>()
    for (const opp of (oppsData || [])) {
      if (opp.stage !== 'Closed Won') continue
      const dateStr = opp.closed_at || opp.created_at || ''
      const month = dateStr.substring(0, 7)
      if (!month) continue
      const channel = opp.source_lead_id ? (leadChannelMap.get(opp.source_lead_id) || 'other') : 'other'
      const key = `${channel}|${month}`
      const existing = crmDealsByChannelMonth.get(key) || { count: 0, value: 0 }
      existing.count += 1
      existing.value += quotationValueByOpp.get(opp.opportunity_id) || 0
      crmDealsByChannelMonth.set(key, existing)
    }

    // --- Ad Spend: Aggregate by month + platform (from individual campaign rows) ---
    const spendByMonthChannel = new Map<string, { spend: number; clicks: number; conversions: number }>()
    for (const r of (spendData || [])) {
      const month = r.fetch_date.substring(0, 7)
      const key = `${r.platform}|${month}`
      const existing = spendByMonthChannel.get(key) || { spend: 0, clicks: 0, conversions: 0 }
      existing.spend += Number(r.spend) || 0
      existing.clicks += Number(r.clicks) || 0
      existing.conversions += Number(r.conversions) || 0
      spendByMonthChannel.set(key, existing)
    }

    // --- Build response rows: merge revenue + spend + CRM ---
    const rows = (revenueData || []).map((rev: any) => {
      const spendKey = `${rev.channel}|${rev.month}`
      const spend = spendByMonthChannel.get(spendKey)
      const crmLeads = crmLeadsByChannelMonth.get(spendKey) || 0
      const crmDeals = crmDealsByChannelMonth.get(spendKey) || { count: 0, value: 0 }
      return {
        ...rev,
        ad_spend: spend?.spend ?? 0,
        ad_clicks: spend?.clicks ?? 0,
        ad_conversions: spend?.conversions ?? 0,
        roas: spend && spend.spend > 0 ? rev.revenue / spend.spend : null,
        crm_leads: crmLeads,
        crm_deals: crmDeals.count,
        crm_deal_value: crmDeals.value,
      }
    })

    // --- Collect all months that have any data (spend, leads, or deals) ---
    const allMonthChannels = new Set<string>()
    for (const key of Array.from(spendByMonthChannel.keys())) allMonthChannels.add(key)
    for (const key of Array.from(crmLeadsByChannelMonth.keys())) allMonthChannels.add(key)
    for (const key of Array.from(crmDealsByChannelMonth.keys())) allMonthChannels.add(key)

    const availableMonths = new Set<string>()
    for (const key of Array.from(allMonthChannels)) {
      availableMonths.add(key.split('|')[1])
    }

    // --- Missing entries: months with spend or CRM data but no revenue entry ---
    const existingRevenueKeys = new Set((revenueData || []).map((r: any) => `${r.channel}|${r.month}`))
    const missingEntries: Array<{
      channel: string; month: string;
      ad_spend: number; ad_clicks: number; ad_conversions: number;
      crm_leads: number; crm_deals: number; crm_deal_value: number;
    }> = []

    for (const key of Array.from(allMonthChannels)) {
      if (existingRevenueKeys.has(key)) continue
      const [channel, month] = key.split('|')
      const spend = spendByMonthChannel.get(key)
      const crmLeads = crmLeadsByChannelMonth.get(key) || 0
      const crmDeals = crmDealsByChannelMonth.get(key) || { count: 0, value: 0 }
      // Only show if there's actual data
      if ((spend?.spend ?? 0) > 0 || crmLeads > 0 || crmDeals.count > 0) {
        missingEntries.push({
          channel,
          month,
          ad_spend: spend?.spend ?? 0,
          ad_clicks: spend?.clicks ?? 0,
          ad_conversions: spend?.conversions ?? 0,
          crm_leads: crmLeads,
          crm_deals: crmDeals.count,
          crm_deal_value: crmDeals.value,
        })
      }
    }

    return NextResponse.json({
      rows,
      missingEntries,
      availableMonths: Array.from(availableMonths).sort().reverse(),
      sourceMapping: SOURCE_TO_CHANNEL,
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
