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

  // Fetch unclaimed leads from v_lead_bidding view
  // The view already joins with lead_handover_pool and profiles
  const { data: leads } = await (supabase as any)
    .from('v_lead_bidding')
    .select('*')
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
    pool_id: lead.pool_id || null,
    handed_over_at: lead.handed_over_at || null,
    handover_notes: lead.handover_notes || null,
    handed_over_by_name: lead.handed_over_by_name || null,
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
