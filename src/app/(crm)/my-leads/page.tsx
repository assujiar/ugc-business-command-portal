// =====================================================
// My Leads Page - Sales Department
// Shows leads claimed and created by salesperson
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { MyLeadsDashboard } from '@/components/crm/my-leads-dashboard'
import { AddLeadDialog } from '@/components/crm/add-lead-dialog'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { canAccessSalesInbox } from '@/lib/permissions'
import { AnalyticsFilter } from '@/components/crm/analytics-filter'
import { Skeleton } from '@/components/ui/skeleton'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function MyLeadsPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  // Check if user has access
  if (!canAccessSalesInbox(profile.role)) {
    redirect('/dashboard')
  }

  // Get filter params
  const params = await searchParams
  const startDate = typeof params.startDate === 'string' ? params.startDate : null
  const endDate = typeof params.endDate === 'string' ? params.endDate : null

  // Fetch leads owned by the sales person or created by them
  const { data: leads } = await supabase
    .from('leads')
    .select(`
      lead_id,
      company_name,
      contact_name,
      contact_email,
      contact_phone,
      triage_status,
      source,
      priority,
      potential_revenue,
      claim_status,
      claimed_by_name,
      claimed_at,
      created_at,
      created_by,
      sales_owner_user_id,
      account_id,
      opportunity_id
    `)
    .or(`sales_owner_user_id.eq.${profile.user_id},created_by.eq.${profile.user_id}`)
    .order('created_at', { ascending: false })

  // Transform data
  let transformedLeads = (leads || []).map((lead: any) => ({
    lead_id: lead.lead_id,
    company_name: lead.company_name,
    pic_name: lead.contact_name,
    pic_email: lead.contact_email,
    pic_phone: lead.contact_phone,
    triage_status: lead.triage_status,
    source: lead.source,
    priority: lead.priority,
    potential_revenue: lead.potential_revenue,
    claim_status: lead.claim_status,
    claimed_by_name: lead.claimed_by_name,
    claimed_at: lead.claimed_at,
    created_at: lead.created_at,
    is_own_lead: lead.created_by === profile.user_id,
    account_id: lead.account_id,
    opportunity_id: lead.opportunity_id,
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold">My Leads</h1>
          <p className="text-sm text-muted-foreground">
            Leads you have claimed and created
          </p>
        </div>
        <div className="flex-shrink-0">
          <AddLeadDialog />
        </div>
      </div>

      {/* Date Filter */}
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <AnalyticsFilter
          salesProfiles={[]}
          showSalespersonFilter={false}
        />
      </Suspense>

      <MyLeadsDashboard leads={transformedLeads} currentUserId={profile.user_id} userRole={profile.role} />
    </div>
  )
}
