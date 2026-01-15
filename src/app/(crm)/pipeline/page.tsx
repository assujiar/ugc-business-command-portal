// =====================================================
// Pipeline Page - Sales Pipeline with Card View
// Shows opportunities grouped by stage with update dialog
// =====================================================

import { PipelineDashboard } from '@/components/crm/pipeline-dashboard'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canAccessPipeline } from '@/lib/permissions'

export default async function PipelinePage() {
  const supabase = await createClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  // Check if user has access
  if (!canAccessPipeline(profile.role)) {
    redirect('/dashboard')
  }

  // Fetch opportunities with related account and owner data
  // Step 1: Fetch ALL opportunities (no filter)
  const { data: opportunities, error: oppError } = await (supabase as any)
    .from('opportunities')
    .select('*')
    .order('created_at', { ascending: false })

  console.log('Pipeline DEBUG - Error:', oppError)
  console.log('Pipeline DEBUG - Data:', JSON.stringify(opportunities))
  console.log('Pipeline DEBUG - Count:', opportunities?.length || 0)

  // Step 2: Fetch account data for each opportunity
  const accountIds = Array.from(new Set((opportunities || []).map((o: any) => o.account_id).filter(Boolean))) as string[]
  let accountsMap: Record<string, { company_name: string; account_status: string | null }> = {}

  if (accountIds.length > 0) {
    const { data: accounts, error: accError } = await supabase
      .from('accounts')
      .select('account_id, company_name, account_status')
      .in('account_id', accountIds)

    if (accError) {
      console.error('Error fetching accounts:', accError)
    } else {
      accountsMap = (accounts || []).reduce((acc: any, a: any) => {
        acc[a.account_id] = { company_name: a.company_name, account_status: a.account_status }
        return acc
      }, {})
    }
  }

  // Step 3: Fetch owner profiles
  const ownerIds = Array.from(new Set((opportunities || []).map((o: any) => o.owner_user_id).filter(Boolean))) as string[]
  let ownersMap: Record<string, string> = {}

  if (ownerIds.length > 0) {
    const { data: owners, error: ownError } = await supabase
      .from('profiles')
      .select('user_id, name')
      .in('user_id', ownerIds)

    if (ownError) {
      console.error('Error fetching owners:', ownError)
    } else {
      ownersMap = (owners || []).reduce((acc: any, o: any) => {
        acc[o.user_id] = o.name
        return acc
      }, {})
    }
  }

  // Transform data - add all fields required by Opportunity interface
  const transformedOpportunities = (opportunities || []).map((opp: any) => ({
    opportunity_id: opp.opportunity_id,
    name: opp.name,
    stage: opp.stage,
    estimated_value: opp.estimated_value,
    currency: opp.currency,
    probability: opp.probability,
    expected_close_date: null,
    next_step: opp.next_step,
    next_step_due_date: opp.next_step_due_date,
    close_reason: null,
    lost_reason: opp.lost_reason,
    competitor_price: opp.competitor_price,
    customer_budget: opp.customer_budget,
    closed_at: opp.closed_at,
    notes: null,
    owner_user_id: opp.owner_user_id,
    account_id: opp.account_id,
    lead_id: opp.source_lead_id,
    created_at: opp.created_at,
    updated_at: opp.updated_at,
    account_name: accountsMap[opp.account_id]?.company_name || null,
    account_status: accountsMap[opp.account_id]?.account_status || null,
    owner_name: ownersMap[opp.owner_user_id] || null,
    is_overdue: opp.next_step_due_date && new Date(opp.next_step_due_date) < new Date() && !['Closed Won', 'Closed Lost'].includes(opp.stage),
  }))

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Manage your sales pipeline and opportunities
        </p>
      </div>

      <PipelineDashboard
        opportunities={transformedOpportunities}
        currentUserId={profile.user_id}
      />
    </div>
  )
}
