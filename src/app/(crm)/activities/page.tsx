// =====================================================
// Activities Page
// Shows all sales activities with Planned/Completed tabs
// Data from sales_plans and pipeline_updates
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canAccessActivities, isAdmin } from '@/lib/permissions'
import { ActivitiesTabs } from '@/components/crm/activities-tabs'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function ActivitiesPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  if (!canAccessActivities(profile.role)) {
    redirect('/dashboard')
  }

  // Fetch activities from both sales_plans and pipeline_updates
  // We'll fetch separately and combine for better control

  // 1. Fetch from sales_plans
  let salesPlansQuery = adminClient
    .from('sales_plans')
    .select(`
      plan_id,
      activity_type,
      subject,
      description,
      status,
      scheduled_date,
      scheduled_time,
      completed_at,
      evidence_url,
      evidence_file_name,
      location_lat,
      location_lng,
      location_address,
      owner_user_id,
      account_id,
      opportunity_id,
      created_at,
      profiles:owner_user_id(name),
      accounts(company_name)
    `)
    .order('scheduled_date', { ascending: false })

  // Filter based on role
  if (profile.role === 'salesperson') {
    salesPlansQuery = salesPlansQuery.eq('owner_user_id', profile.user_id)
  }

  const { data: salesPlans } = await salesPlansQuery

  // 2. Fetch from pipeline_updates with opportunity/account info
  let pipelineUpdatesQuery = adminClient
    .from('pipeline_updates')
    .select(`
      update_id,
      approach_method,
      notes,
      old_stage,
      new_stage,
      updated_at,
      evidence_url,
      evidence_file_name,
      location_lat,
      location_lng,
      location_address,
      updated_by,
      opportunity_id,
      opportunities(
        name,
        account_id,
        accounts(company_name)
      ),
      profiles:updated_by(name)
    `)
    .order('updated_at', { ascending: false })

  // Filter based on role for pipeline updates
  if (profile.role === 'salesperson') {
    pipelineUpdatesQuery = pipelineUpdatesQuery.eq('updated_by', profile.user_id)
  }

  const { data: pipelineUpdates } = await pipelineUpdatesQuery

  // Transform sales_plans to unified format
  const salesPlanActivities = (salesPlans || []).map((sp: any) => ({
    activity_id: sp.plan_id,
    source_type: 'sales_plan' as const,
    activity_type: sp.activity_type,
    activity_detail: sp.subject,
    notes: sp.description,
    status: sp.status,
    scheduled_on: sp.scheduled_date,
    scheduled_time: sp.scheduled_time,
    completed_on: sp.completed_at,
    evidence_url: sp.evidence_url,
    evidence_file_name: sp.evidence_file_name,
    location_lat: sp.location_lat,
    location_lng: sp.location_lng,
    location_address: sp.location_address,
    owner_user_id: sp.owner_user_id,
    account_id: sp.account_id,
    opportunity_id: sp.opportunity_id,
    created_at: sp.created_at,
    sales_name: sp.profiles?.name || null,
    account_name: sp.accounts?.company_name || null,
  }))

  // Transform pipeline_updates to unified format
  const pipelineActivities = (pipelineUpdates || []).map((pu: any) => ({
    activity_id: pu.update_id,
    source_type: 'pipeline_update' as const,
    activity_type: pu.approach_method,
    activity_detail: `Pipeline Update: ${pu.old_stage || 'New'} → ${pu.new_stage}`,
    notes: pu.notes,
    status: 'completed' as const,
    scheduled_on: pu.updated_at,
    scheduled_time: null,
    completed_on: pu.updated_at,
    evidence_url: pu.evidence_url,
    evidence_file_name: pu.evidence_file_name,
    location_lat: pu.location_lat,
    location_lng: pu.location_lng,
    location_address: pu.location_address,
    owner_user_id: pu.updated_by,
    account_id: pu.opportunities?.account_id || null,
    opportunity_id: pu.opportunity_id,
    created_at: pu.updated_at,
    sales_name: pu.profiles?.name || null,
    account_name: pu.opportunities?.accounts?.company_name || null,
  }))

  // Combine all activities
  const allActivities = [...salesPlanActivities, ...pipelineActivities]

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Activities</h1>
        <p className="text-sm text-muted-foreground">
          View all sales activities from Sales Plan and Pipeline
        </p>
      </div>

      <ActivitiesTabs
        activities={allActivities}
        currentUserId={profile.user_id}
        userRole={profile.role}
      />
    </div>
  )
}
