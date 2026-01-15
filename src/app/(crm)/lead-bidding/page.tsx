// =====================================================
// Lead Bidding Page - Unclaimed Leads for Sales
// Renamed from Sales Inbox
// Shows leads with status 'Assign to Sales' that are unclaimed
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { LeadBiddingTable } from '@/components/crm/lead-bidding-table'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canAccessSalesInbox } from '@/lib/permissions'

export default async function LeadBiddingPage() {
  const supabase = await createClient()
  const result = await getSessionAndProfile()

  if (!result.profile) {
    redirect('/login')
  }

  const profile = result.profile

  // Check if user has access
  if (!canAccessSalesInbox(profile.role)) {
    redirect('/dashboard')
  }

  // Fetch unclaimed leads from handover pool
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
      qualified_at,
      created_at,
      lead_handover_pool (
        pool_id,
        handed_over_at,
        handover_notes,
        expires_at,
        handed_over_by,
        profiles:handed_over_by (
          name
        )
      )
    `)
    .eq('triage_status', 'Assign to Sales')
    .or('claim_status.eq.unclaimed,claim_status.is.null')
    .order('priority', { ascending: false })

  // Transform data for the table
  const transformedLeads = (leads || []).map((lead: any) => ({
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
    pool_id: lead.lead_handover_pool?.[0]?.pool_id || null,
    handed_over_at: lead.lead_handover_pool?.[0]?.handed_over_at || null,
    handover_notes: lead.lead_handover_pool?.[0]?.handover_notes || null,
    expires_at: lead.lead_handover_pool?.[0]?.expires_at || null,
    handed_over_by_name: lead.lead_handover_pool?.[0]?.profiles?.name || null,
  }))

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Lead Bidding</h1>
        <p className="text-sm text-muted-foreground">
          Unclaimed leads ready for sales - Claim a lead to start working on it
        </p>
      </div>

      <LeadBiddingTable leads={transformedLeads} currentUserId={profile.user_id} userRole={profile.role} />
    </div>
  )
}
