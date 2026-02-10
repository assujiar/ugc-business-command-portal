// =====================================================
// Activities Page
// Shows all sales activities with Planned/Completed tabs
// Data from sales_plans, pipeline_updates, AND activities table
// =====================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { canAccessActivities, isAdmin } from '@/lib/permissions'
import { ActivitiesTabs } from '@/components/crm/activities-tabs'
import { AnalyticsFilter } from '@/components/crm/analytics-filter'
import { Skeleton } from '@/components/ui/skeleton'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function ActivitiesPage({ searchParams }: PageProps) {
  const adminClient = createAdminClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  if (!canAccessActivities(profile.role)) {
    redirect('/overview-crm')
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

  // Fetch activities from sales_plans, pipeline_updates, AND activities table
  // We'll fetch separately and combine for better control

  // 1. Fetch from sales_plans (new structure)
  let salesPlansQuery = (adminClient as any)
    .from('sales_plans')
    .select(`
      plan_id,
      plan_type,
      company_name,
      pic_name,
      pic_phone,
      pic_email,
      planned_activity_method,
      actual_activity_method,
      plan_notes,
      realization_notes,
      status,
      planned_date,
      realized_at,
      evidence_url,
      evidence_file_name,
      location_lat,
      location_lng,
      location_address,
      owner_user_id,
      potential_status,
      created_lead_id,
      created_account_id,
      created_opportunity_id,
      created_at,
      profiles:owner_user_id(name),
      source_account:source_account_id(company_name)
    `)
    .order('planned_date', { ascending: false })

  // Filter based on role
  if (profile.role === 'salesperson') {
    salesPlansQuery = salesPlansQuery.eq('owner_user_id', profile.user_id)
  }

  const { data: salesPlans } = await salesPlansQuery

  // 2. Fetch from pipeline_updates with opportunity/account info
  let pipelineUpdatesQuery = (adminClient as any)
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

  // 3. Fetch from activities table (quotation sent/rejected/accepted and manual pipeline updates)
  // This table stores activities created by RPC functions for quotation lifecycle events
  let activitiesQuery = (adminClient as any)
    .from('activities')
    .select(`
      activity_id,
      activity_type,
      subject,
      description,
      status,
      due_date,
      completed_at,
      related_opportunity_id,
      related_lead_id,
      related_account_id,
      owner_user_id,
      created_by,
      created_at,
      profiles:owner_user_id(name),
      opportunities:related_opportunity_id(
        name,
        account_id,
        accounts(company_name)
      )
    `)
    .order('created_at', { ascending: false })

  // Filter based on role for activities
  if (profile.role === 'salesperson') {
    activitiesQuery = activitiesQuery.eq('owner_user_id', profile.user_id)
  }

  const { data: crmActivities } = await activitiesQuery

  // Transform sales_plans to unified format
  const salesPlanActivities = (salesPlans || []).map((sp: any) => ({
    activity_id: sp.plan_id,
    source_type: 'sales_plan' as const,
    plan_type: sp.plan_type,
    activity_type: sp.actual_activity_method || sp.planned_activity_method,
    activity_detail: sp.company_name,
    notes: sp.realization_notes || sp.plan_notes,
    status: sp.status,
    scheduled_on: sp.planned_date,
    scheduled_time: null,
    completed_on: sp.realized_at,
    evidence_url: sp.evidence_url,
    evidence_file_name: sp.evidence_file_name,
    location_lat: sp.location_lat,
    location_lng: sp.location_lng,
    location_address: sp.location_address,
    owner_user_id: sp.owner_user_id,
    account_id: sp.created_account_id,
    opportunity_id: sp.created_opportunity_id,
    created_at: sp.created_at,
    sales_name: sp.profiles?.name || null,
    account_name: sp.source_account?.company_name || sp.company_name || null,
    potential_status: sp.potential_status,
    pic_name: sp.pic_name,
    pic_phone: sp.pic_phone,
  }))

  // Transform pipeline_updates to unified format
  const pipelineActivities = (pipelineUpdates || []).map((pu: any) => ({
    activity_id: pu.update_id,
    source_type: 'pipeline_update' as const,
    plan_type: 'pipeline',
    activity_type: pu.approach_method,
    activity_detail: `Pipeline: ${pu.old_stage || 'New'} → ${pu.new_stage}`,
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
    potential_status: null,
    pic_name: null,
    pic_phone: null,
  }))

  // Transform activities table entries to unified format
  // These come from RPC functions (quotation sent, rejected, accepted, pipeline update)
  const crmActivityItems = (crmActivities || []).map((act: any) => ({
    activity_id: act.activity_id,
    source_type: 'crm_activity' as const,
    plan_type: 'pipeline',
    activity_type: act.activity_type,
    activity_detail: act.subject || '',
    notes: act.description,
    status: (act.status === 'Completed' || act.status === 'Done') ? 'completed' as const : 'planned' as const,
    scheduled_on: act.due_date,
    scheduled_time: null,
    completed_on: act.completed_at,
    evidence_url: null,
    evidence_file_name: null,
    location_lat: null,
    location_lng: null,
    location_address: null,
    owner_user_id: act.owner_user_id,
    account_id: act.related_account_id,
    opportunity_id: act.related_opportunity_id,
    created_at: act.created_at,
    sales_name: act.profiles?.name || null,
    account_name: act.opportunities?.accounts?.company_name || null,
    potential_status: null,
    pic_name: null,
    pic_phone: null,
  }))

  // Deduplicate: pipeline_updates and activities may duplicate for the same event
  // Use a Set to track opportunity_id + timestamp combinations to remove duplicates
  const pipelineUpdateKeys = new Set(
    pipelineActivities.map((pu: any) => {
      const ts = pu.completed_on ? new Date(pu.completed_on).getTime() : 0
      return `${pu.opportunity_id}_${Math.floor(ts / 60000)}` // 1-minute window
    })
  )

  // Only include CRM activities that don't have a matching pipeline_update within same minute
  const uniqueCrmActivities = crmActivityItems.filter((act: any) => {
    const ts = act.completed_on ? new Date(act.completed_on).getTime() : 0
    const key = `${act.opportunity_id}_${Math.floor(ts / 60000)}`
    return !pipelineUpdateKeys.has(key)
  })

  // Combine all activities
  let allActivities = [...salesPlanActivities, ...pipelineActivities, ...uniqueCrmActivities]

  // Apply date and salesperson filters
  if (startDate || endDate || salespersonId) {
    allActivities = allActivities.filter((activity) => {
      // Date filter - use scheduled_on or completed_on
      if (startDate || endDate) {
        const activityDate = activity.completed_on || activity.scheduled_on
        if (activityDate) {
          const date = new Date(activityDate)
          if (startDate && date < new Date(startDate)) return false
          if (endDate) {
            const endOfDay = new Date(endDate)
            endOfDay.setHours(23, 59, 59, 999)
            if (date > endOfDay) return false
          }
        }
      }
      // Salesperson filter
      if (salespersonId && activity.owner_user_id !== salespersonId) {
        return false
      }
      return true
    })
  }

  // Determine if user can see salesperson filter (management roles only)
  const showSalespersonFilter = isAdmin(profile.role) || profile.role === 'sales manager' ||
    profile.role === 'Marketing Manager' || profile.role === 'MACX'

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Activities</h1>
        <p className="text-sm text-muted-foreground">
          View all sales activities from Sales Plan, Pipeline, and Quotation Events
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

      <ActivitiesTabs
        activities={allActivities}
        currentUserId={profile.user_id}
        userRole={profile.role}
      />
    </div>
  )
}
