// =====================================================
// Lead Bidding Page - Unclaimed Leads for Sales
// Renamed from Sales Inbox
// Shows leads with status 'Assign to Sales' that are unclaimed
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { LeadBiddingTable } from '@/components/crm/lead-bidding-table'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { canAccessSalesInbox } from '@/lib/permissions'
import { AnalyticsFilter } from '@/components/crm/analytics-filter'
import { Skeleton } from '@/components/ui/skeleton'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function LeadBiddingPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const result = await getSessionAndProfile()

  if (!result.profile) {
    redirect('/login')
  }

  const profile = result.profile

  // Check if user has access
  if (!canAccessSalesInbox(profile.role)) {
    redirect('/overview-crm')
  }

  // Get filter params
  const params = await searchParams
  const startDate = typeof params.startDate === 'string' ? params.startDate : null
  const endDate = typeof params.endDate === 'string' ? params.endDate : null

  // Fetch unclaimed leads from v_lead_bidding view
  // The view already joins with lead_handover_pool and profiles
  const { data: leads } = await (supabase as any)
    .from('v_lead_bidding')
    .select('*')
    .order('priority', { ascending: false })

  // Transform data for the table
  let transformedLeads = (leads || []).map((lead: any) => ({
    lead_id: lead.lead_id,
    company_name: lead.company_name,
    pic_name: lead.contact_name,
    pic_email: lead.contact_email,
    pic_phone: lead.contact_phone,
    source: lead.source,
    priority: lead.priority,
    potential_revenue: lead.potential_revenue,
    qualified_at: lead.qualified_at,
    created_at: lead.created_at,
    pool_id: lead.pool_id || null,
    handed_over_at: lead.handed_over_at || null,
    handover_notes: lead.handover_notes || null,
    handed_over_by_name: lead.handed_over_by_name || null,
  }))

  // Apply date filter
  if (startDate || endDate) {
    transformedLeads = transformedLeads.filter((lead: any) => {
      const leadDate = lead.created_at ? new Date(lead.created_at) : null
      if (!leadDate) return true
      if (startDate && leadDate < new Date(startDate)) return false
      if (endDate) {
        const endOfDay = new Date(endDate)
        endOfDay.setHours(23, 59, 59, 999)
        if (leadDate > endOfDay) return false
      }
      return true
    })
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Lead Bidding</h1>
        <p className="text-sm text-muted-foreground">
          Unclaimed leads ready for sales - Claim a lead to start working on it
        </p>
      </div>

      {/* Date Filter */}
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <AnalyticsFilter
          salesProfiles={[]}
          showSalespersonFilter={false}
        />
      </Suspense>

      <LeadBiddingTable leads={transformedLeads} currentUserId={profile.user_id} userRole={profile.role} />
    </div>
  )
}
