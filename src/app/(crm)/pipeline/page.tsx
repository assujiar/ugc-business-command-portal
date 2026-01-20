// =====================================================
// Pipeline Page - Sales Pipeline with Card View
// Shows opportunities grouped by stage with update dialog
// Uses original_creator_id for marketing visibility (efficient)
// Now includes Pipeline and Opportunity tabs
// =====================================================

import { PipelineTabs } from '@/components/crm/pipeline-tabs'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { canAccessPipeline, isAdmin } from '@/lib/permissions'
import { AnalyticsFilter } from '@/components/crm/analytics-filter'
import { Skeleton } from '@/components/ui/skeleton'
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

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PipelinePage({ searchParams }: PageProps) {
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

  // Get filter params
  const params = await searchParams
  const startDate = typeof params.startDate === 'string' ? params.startDate : null
  const endDate = typeof params.endDate === 'string' ? params.endDate : null
  const salespersonId = typeof params.salespersonId === 'string' ? params.salespersonId : null

  // Fetch sales profiles for filter dropdown (only salesperson role)
  const { data: salesProfiles } = await (adminClient as any)
    .from('profiles')
    .select('user_id, name, email, role')
    .eq('role', 'salesperson')

  // Step 1: Fetch opportunities from view
  // v_pipeline_with_updates already includes:
  // - original_creator_id, original_creator_name, original_creator_role, original_creator_department
  // - original_creator_is_marketing (computed boolean)
  // - account_name, owner_name, lead_created_by
  // - lead_source, competitor_price, customer_budget (added in migration 030)
  // This eliminates the need for separate lead and creator profile queries
  const { data: allOpportunities, error: oppError } = await (adminClient as any)
    .from('v_pipeline_with_updates')
    .select('*')
    .order('created_at', { ascending: false })

  if (oppError) {
    console.error('Pipeline ERROR:', oppError)
  }

  // Step 2: Filter opportunities based on user role
  // Using original_creator_id from view for efficient visibility check
  // The view now has COALESCE(original_creator_id, lead.created_by) as fallback
  let filteredOpportunities = allOpportunities || []

  if (!isAdmin(profile.role)) {
    filteredOpportunities = (allOpportunities || []).filter((opp: any) => {
      // Salesperson: Pipeline they own OR created
      if (profile.role === 'salesperson') {
        if (opp.owner_user_id === profile.user_id) return true
        if (opp.created_by === profile.user_id) return true
        // Also check if they are the original creator (created the lead)
        if (opp.original_creator_id === profile.user_id) return true
        // Fallback: check lead_created_by for legacy data
        if (opp.lead_created_by === profile.user_id) return true
        return false
      }

      // Sales Manager: All pipelines owned/created by sales department
      if (profile.role === 'sales manager') {
        // Check if owner is in sales (via owner check) or if original creator is sales
        // For now, sales manager sees all pipelines that have a sales owner
        if (opp.owner_user_id) return true
        return false
      }

      // Sales Support: Same as salesperson
      if (profile.role === 'sales support') {
        if (opp.owner_user_id === profile.user_id) return true
        if (opp.created_by === profile.user_id) return true
        if (opp.original_creator_id === profile.user_id) return true
        if (opp.lead_created_by === profile.user_id) return true
        return false
      }

      // Individual Marketing (Marcomm, VSDO, DGO): Only pipelines from leads they created
      // Uses original_creator_id which is preserved across retries
      // Also checks lead_marketing_owner and lead_created_by as fallbacks
      if (isIndividualMarketingRole(profile.role)) {
        // Check original_creator_id (set on new records)
        if (opp.original_creator_id === profile.user_id) return true
        // Fallback: check lead_created_by (for legacy data without original_creator_id)
        if (opp.lead_created_by === profile.user_id) return true
        // Fallback: check lead_marketing_owner (if they were assigned as marketing owner)
        if (opp.lead_marketing_owner === profile.user_id) return true
        return false
      }

      // Marketing Manager/MACX: All pipelines from marketing department leads
      // Uses original_creator_is_marketing computed field from view
      // The view now has fallback logic built-in
      if (isMarketingManagerRole(profile.role)) {
        // Check computed field from view (has fallback logic)
        if (opp.original_creator_is_marketing === true) return true

        // Additional fallback: check original_creator_role directly
        if (opp.original_creator_role) {
          const marketingRoles: UserRole[] = ['Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VSDO']
          if (marketingRoles.includes(opp.original_creator_role)) return true
        }

        // Additional fallback: check original_creator_department
        if (opp.original_creator_department &&
            opp.original_creator_department.toLowerCase().includes('marketing')) {
          return true
        }

        return false
      }

      return false
    })
  }

  // Step 2.5: Apply date and salesperson filters
  if (startDate || endDate || salespersonId) {
    filteredOpportunities = filteredOpportunities.filter((opp: any) => {
      // Date filter
      if (startDate || endDate) {
        const oppDate = opp.created_at ? new Date(opp.created_at) : null
        if (oppDate) {
          if (startDate && oppDate < new Date(startDate)) return false
          if (endDate) {
            const endOfDay = new Date(endDate)
            endOfDay.setHours(23, 59, 59, 999)
            if (oppDate > endOfDay) return false
          }
        }
      }
      // Salesperson filter
      if (salespersonId && opp.owner_user_id !== salespersonId) {
        return false
      }
      return true
    })
  }

  // Step 3: Fetch stage history from pipeline_updates table
  const opportunityIds: string[] = filteredOpportunities.map((o: any) => o.opportunity_id)
  const stageHistoryMap: Record<string, Array<{ new_stage: string; changed_at: string }>> = {}

  // Initialize map for all opportunity IDs
  for (const id of opportunityIds) {
    stageHistoryMap[id] = []
  }

  if (opportunityIds.length > 0) {
    // Fetch from pipeline_updates - this is the source of truth
    const { data: pipelineUpdates } = await (adminClient as any)
      .from('pipeline_updates')
      .select('opportunity_id, new_stage, updated_at')
      .in('opportunity_id', opportunityIds)
      .order('updated_at', { ascending: true })

    // Add all stage changes from pipeline_updates
    const updatesArr = (pipelineUpdates || []) as Array<{
      opportunity_id: string
      new_stage: string | null
      updated_at: string
    }>
    for (let i = 0; i < updatesArr.length; i++) {
      const p = updatesArr[i]
      if (p.new_stage && stageHistoryMap[p.opportunity_id]) {
        stageHistoryMap[p.opportunity_id].push({
          new_stage: p.new_stage,
          changed_at: p.updated_at,
        })
      }
    }
  }

  // Determine if user can update any pipeline (admin or salesperson)
  const userCanUpdate = isAdmin(profile.role) || profile.role === 'salesperson'

  // Transform data - use values from v_pipeline_with_updates view
  // View already has all the joined data we need
  const transformedOpportunities = filteredOpportunities.map((opp: any) => ({
    opportunity_id: opp.opportunity_id,
    name: opp.name,
    stage: opp.stage,
    estimated_value: opp.estimated_value,
    currency: opp.currency,
    probability: opp.probability,
    expected_close_date: opp.next_step_due_date, // Using next_step_due_date as expected_close_date
    next_step: opp.next_step,
    next_step_due_date: opp.next_step_due_date,
    close_reason: opp.outcome,
    lost_reason: opp.lost_reason,
    competitor_price: opp.competitor_price,
    customer_budget: opp.customer_budget,
    closed_at: opp.closed_at,
    notes: opp.notes,
    owner_user_id: opp.owner_user_id,
    account_id: opp.account_id,
    lead_id: opp.source_lead_id,
    created_at: opp.created_at,
    updated_at: opp.updated_at,
    // From view (pre-joined)
    account_name: opp.account_name,
    account_status: opp.account_status,
    owner_name: opp.owner_name,
    // Lead source for Opportunity tab
    lead_source: opp.lead_source,
    // is_overdue calculation (client will also check for hydration safety)
    is_overdue: opp.next_step_due_date && new Date(opp.next_step_due_date) < new Date() &&
                !['Closed Won', 'Closed Lost'].includes(opp.stage),
    stage_history: stageHistoryMap[opp.opportunity_id] || [],
    // Original creator info for client-side permission checks if needed
    original_creator_id: opp.original_creator_id,
    original_creator_name: opp.original_creator_name,
    original_creator_role: opp.original_creator_role,
    original_creator_department: opp.original_creator_department,
    original_creator_is_marketing: opp.original_creator_is_marketing,
    // Lead info for fallback visibility checks
    lead_created_by: opp.lead_created_by,
    lead_marketing_owner: opp.lead_marketing_owner,
    // Attempt number for retry tracking
    attempt_number: opp.attempt_number,
  }))

  // Determine if user can see salesperson filter (management roles only)
  const showSalespersonFilter = isAdmin(profile.role) || profile.role === 'sales manager' ||
    profile.role === 'Marketing Manager' || profile.role === 'MACX'

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Manage your sales pipeline and opportunities
        </p>
      </div>

      {/* Filter Section */}
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <AnalyticsFilter
          salesProfiles={(salesProfiles || []).map((p: any) => ({
            user_id: p.user_id,
            name: p.name,
            email: p.email,
            role: p.role,
          }))}
          showSalespersonFilter={showSalespersonFilter}
        />
      </Suspense>

      <PipelineTabs
        opportunities={transformedOpportunities}
        currentUserId={profile.user_id}
        userRole={profile.role}
        canUpdate={userCanUpdate}
      />
    </div>
  )
}
