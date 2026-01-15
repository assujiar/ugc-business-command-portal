// =====================================================
// Pipeline Page - Sales Pipeline with Card View
// Shows opportunities grouped by stage with update dialog
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { PipelineDashboard } from '@/components/crm/pipeline-dashboard'
import { getSessionAndProfile } from '@/lib/supabase/server'
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

  // Fetch opportunities
  const { data: opportunities, error: oppError } = await supabase
    .from('opportunities')
    .select(`
      opportunity_id,
      name,
      stage,
      estimated_value,
      currency,
      probability,
      next_step,
      next_step_due_date,
      lost_reason,
      competitor_price,
      customer_budget,
      closed_at,
      outcome,
      owner_user_id,
      account_id,
      source_lead_id,
      created_at,
      updated_at
    `)
    .order('created_at', { ascending: false })

  if (oppError) {
    console.error('Error fetching opportunities:', oppError)
  }

  // Transform data
  const transformedOpportunities = (opportunities || []).map((opp: any) => ({
    opportunity_id: opp.opportunity_id,
    name: opp.name,
    stage: opp.stage,
    estimated_value: opp.estimated_value,
    currency: opp.currency,
    probability: opp.probability,
    next_step: opp.next_step,
    next_step_due_date: opp.next_step_due_date,
    lost_reason: opp.lost_reason,
    competitor_price: opp.competitor_price,
    customer_budget: opp.customer_budget,
    closed_at: opp.closed_at,
    outcome: opp.outcome,
    owner_user_id: opp.owner_user_id,
    account_id: opp.account_id,
    source_lead_id: opp.source_lead_id,
    created_at: opp.created_at,
    updated_at: opp.updated_at,
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
