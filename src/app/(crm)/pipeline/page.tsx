// =====================================================
// Pipeline Page - Sales Pipeline with Card View
// Shows opportunities grouped by stage with update dialog
// =====================================================

import { PipelineDashboard } from '@/components/crm/pipeline-dashboard'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { canAccessPipeline, isAdmin } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

// Force dynamic rendering - required for authenticated pages
export const dynamic = 'force-dynamic'

// Helper to check if user is in sales department
function isSalesRole(role: UserRole): boolean {
  return role === 'salesperson' || role === 'sales manager' || role === 'sales support'
}

// Helper to check if user is individual marketing (can only see own leads)
function isIndividualMarketingRole(role: UserRole): boolean {
  return role === 'Marcomm' || role === 'VSDO' || role === 'DGO'
}

// Helper to check if user is marketing manager/macx (can see all marketing dept leads)
function isMarketingManagerRole(role: UserRole): boolean {
  return role === 'Marketing Manager' || role === 'MACX'
}

export default async function PipelinePage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  // Check if user has access
  if (!canAccessPipeline(profile.role)) {
    redirect('/dashboard')
  }

  // Step 1: Fetch opportunities from view (includes computed is_overdue)
  // Using v_pipeline_with_updates view which has is_overdue calculated by database
  const { data: allOpportunities, error: oppError } = await (adminClient as any)
    .from('v_pipeline_with_updates')
    .select('*')
    .order('created_at', { ascending: false })

  if (oppError) {
    console.error('Pipeline ERROR:', oppError)
  }

  // Step 2: Fetch lead info for all opportunities with lead_id (from view)
  const leadIds = Array.from(new Set((allOpportunities || [])
    .map((o: any) => o.lead_id)
    .filter(Boolean))) as string[]

  let leadsMap: Record<string, {
    created_by: string | null
    sales_owner_user_id: string | null
    marketing_owner_user_id: string | null
  }> = {}

  if (leadIds.length > 0) {
    const { data: leads } = await (adminClient as any)
      .from('leads')
      .select('lead_id, created_by, sales_owner_user_id, marketing_owner_user_id')
      .in('lead_id', leadIds)

    leadsMap = (leads || []).reduce((acc: any, l: any) => {
      acc[l.lead_id] = {
        created_by: l.created_by,
        sales_owner_user_id: l.sales_owner_user_id,
        marketing_owner_user_id: l.marketing_owner_user_id,
      }
      return acc
    }, {})
  }

  // Step 3: Fetch creator profiles to determine their department (for marketing manager/macx)
  let creatorProfilesMap: Record<string, { department: string | null; role: UserRole | null }> = {}

  if (isMarketingManagerRole(profile.role) || profile.role === 'sales manager') {
    const creatorIds = Array.from(new Set(Object.values(leadsMap)
      .map((l: any) => l.created_by)
      .filter(Boolean))) as string[]

    if (creatorIds.length > 0) {
      const { data: creators } = await supabase
        .from('profiles')
        .select('user_id, department, role')
        .in('user_id', creatorIds)

      creatorProfilesMap = (creators || []).reduce((acc: any, c: any) => {
        acc[c.user_id] = { department: c.department, role: c.role }
        return acc
      }, {})
    }
  }

  // Step 4: Filter opportunities based on user role
  let filteredOpportunities = allOpportunities || []

  if (!isAdmin(profile.role)) {
    filteredOpportunities = (allOpportunities || []).filter((opp: any) => {
      const leadInfo = leadsMap[opp.lead_id]

      // Salesperson: Pipeline from leads they created OR claimed
      if (profile.role === 'salesperson') {
        if (leadInfo?.created_by === profile.user_id) return true
        if (leadInfo?.sales_owner_user_id === profile.user_id) return true
        if (opp.owner_user_id === profile.user_id) return true
        return false
      }

      // Sales Manager: Pipeline from all sales department leads
      if (profile.role === 'sales manager') {
        // Check if lead creator is in sales department
        if (leadInfo?.created_by) {
          const creatorProfile = creatorProfilesMap[leadInfo.created_by]
          if (creatorProfile?.department?.toLowerCase().includes('sales')) return true
          if (creatorProfile?.role && isSalesRole(creatorProfile.role)) return true
        }
        // Also include if sales_owner is set (lead was claimed by sales)
        if (leadInfo?.sales_owner_user_id) return true
        return false
      }

      // Sales Support: Same as salesperson
      if (profile.role === 'sales support') {
        if (leadInfo?.created_by === profile.user_id) return true
        if (leadInfo?.sales_owner_user_id === profile.user_id) return true
        if (opp.owner_user_id === profile.user_id) return true
        return false
      }

      // Individual Marketing (Marcomm, VSDO, DGO): Only leads they created
      if (isIndividualMarketingRole(profile.role)) {
        if (leadInfo?.created_by === profile.user_id) return true
        if (leadInfo?.marketing_owner_user_id === profile.user_id) return true
        return false
      }

      // Marketing Manager/MACX: All marketing department leads
      if (isMarketingManagerRole(profile.role)) {
        if (leadInfo?.created_by) {
          const creatorProfile = creatorProfilesMap[leadInfo.created_by]
          if (creatorProfile?.department?.toLowerCase().includes('marketing')) return true
          // Check if creator role is marketing
          const marketingRoles: UserRole[] = ['Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO']
          if (creatorProfile?.role && marketingRoles.includes(creatorProfile.role)) return true
        }
        return false
      }

      return false
    })
  }

  // Step 5: Fetch account data for filtered opportunities
  const accountIds = Array.from(new Set(filteredOpportunities.map((o: any) => o.account_id).filter(Boolean))) as string[]
  let accountsMap: Record<string, { company_name: string; account_status: string | null }> = {}

  if (accountIds.length > 0) {
    const { data: accounts } = await supabase
      .from('accounts')
      .select('account_id, company_name, account_status')
      .in('account_id', accountIds)

    accountsMap = (accounts || []).reduce((acc: any, a: any) => {
      acc[a.account_id] = { company_name: a.company_name, account_status: a.account_status }
      return acc
    }, {})
  }

  // Step 6: Fetch owner profiles for filtered opportunities
  const ownerIds = Array.from(new Set(filteredOpportunities.map((o: any) => o.owner_user_id).filter(Boolean))) as string[]
  let ownersMap: Record<string, string> = {}

  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from('profiles')
      .select('user_id, name')
      .in('user_id', ownerIds)

    ownersMap = (owners || []).reduce((acc: any, o: any) => {
      acc[o.user_id] = o.name
      return acc
    }, {})
  }

  // Step 7: Fetch stage history for filtered opportunities
  // Use both opportunity_stage_history and pipeline_updates as fallback
  // pipeline_updates always records stage changes, stage_history might be empty
  const opportunityIds = filteredOpportunities.map((o: any) => o.opportunity_id)
  let stageHistoryMap: Record<string, Array<{ new_stage: string; changed_at: string }>> = {}

  if (opportunityIds.length > 0) {
    // First try opportunity_stage_history
    const { data: stageHistory } = await supabase
      .from('opportunity_stage_history')
      .select('opportunity_id, to_stage, new_stage, changed_at')
      .in('opportunity_id', opportunityIds)
      .order('changed_at', { ascending: true })

    // Also fetch pipeline_updates as fallback source
    const { data: pipelineUpdates } = await (adminClient as any)
      .from('pipeline_updates')
      .select('opportunity_id, new_stage, updated_at')
      .in('opportunity_id', opportunityIds)
      .order('updated_at', { ascending: true })

    // Initialize map
    opportunityIds.forEach((id: string) => {
      stageHistoryMap[id] = []
    })

    // First add from stage_history
    (stageHistory || []).forEach((h: any) => {
      const stage = h.new_stage || h.to_stage
      if (stage) {
        stageHistoryMap[h.opportunity_id].push({
          new_stage: stage,
          changed_at: h.changed_at,
        })
      }
    })

    // Then add from pipeline_updates (as fallback for missing entries)
    (pipelineUpdates || []).forEach((p: any) => {
      if (p.new_stage) {
        const existingStages = stageHistoryMap[p.opportunity_id].map((h: any) => h.new_stage)
        // Only add if this stage isn't already in history
        if (!existingStages.includes(p.new_stage)) {
          stageHistoryMap[p.opportunity_id].push({
            new_stage: p.new_stage,
            changed_at: p.updated_at,
          })
        }
      }
    })

    // Sort each opportunity's history by changed_at
    Object.keys(stageHistoryMap).forEach((oppId) => {
      stageHistoryMap[oppId].sort((a: any, b: any) =>
        new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
      )
    })
  }

  // Determine if user can update any pipeline (admin or salesperson)
  const userCanUpdate = isAdmin(profile.role) || profile.role === 'salesperson'

  // Transform data - use values from v_pipeline_with_updates view
  // View already has: account_name, owner_name, is_overdue, lead_id (from source_lead_id)
  const transformedOpportunities = filteredOpportunities.map((opp: any) => ({
    opportunity_id: opp.opportunity_id,
    name: opp.name,
    stage: opp.stage,
    estimated_value: opp.estimated_value,
    currency: opp.currency,
    probability: opp.probability,
    expected_close_date: opp.expected_close_date,
    next_step: opp.next_step,
    next_step_due_date: opp.next_step_due_date,
    close_reason: opp.close_reason,
    lost_reason: opp.lost_reason,
    competitor_price: opp.competitor_price,
    customer_budget: opp.customer_budget,
    closed_at: opp.closed_at,
    notes: opp.notes,
    owner_user_id: opp.owner_user_id,
    account_id: opp.account_id,
    lead_id: opp.lead_id,
    created_at: opp.created_at,
    updated_at: opp.updated_at,
    // From view (pre-calculated)
    account_name: opp.account_name || accountsMap[opp.account_id]?.company_name || null,
    account_status: opp.account_status || accountsMap[opp.account_id]?.account_status || null,
    owner_name: opp.owner_name || ownersMap[opp.owner_user_id] || null,
    // is_overdue from database (NOW() calculated at query time)
    // Client will still use mounted check for hydration safety
    is_overdue: opp.is_overdue || false,
    stage_history: stageHistoryMap[opp.opportunity_id] || [],
    // Include lead info for permission checks in client
    lead_created_by: leadsMap[opp.lead_id]?.created_by || null,
    lead_sales_owner: leadsMap[opp.lead_id]?.sales_owner_user_id || null,
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
        userRole={profile.role}
        canUpdate={userCanUpdate}
      />
    </div>
  )
}
