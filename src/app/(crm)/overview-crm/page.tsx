// =====================================================
// CRM Dashboard Page - Comprehensive Role-Based Analytics
// Server component: fetches data, passes to client
// =====================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { isAdmin, isMarketing, isSales, isOps } from '@/lib/permissions'
import { Skeleton } from '@/components/ui/skeleton'
import { CRMDashboardContent } from '@/components/crm/crm-dashboard-content'
import { DashboardInsightsSection } from '@/components/crm/dashboard-insights-section'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const adminClient = createAdminClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  // Ops users should go to ticketing overview
  if (isOps(profile.role)) {
    redirect('/overview-ticket')
  }

  const role = profile.role
  const userId = profile.user_id
  const userName = profile.name || 'User'

  // Get filter params
  const params = await searchParams
  const startDate = typeof params.startDate === 'string' ? params.startDate : null
  const endDate = typeof params.endDate === 'string' ? params.endDate : null
  const salespersonId = typeof params.salespersonId === 'string' ? params.salespersonId : null

  // =====================================================
  // Build queries with role-based scoping
  // =====================================================

  let leadsQuery = (adminClient as any).from('leads').select('lead_id, company_name, source, triage_status, sales_owner_user_id, marketing_owner_user_id, created_by, opportunity_id, account_id, created_at, handed_over_at, claimed_at')
  let opportunitiesQuery = (adminClient as any).from('opportunities').select('opportunity_id, name, account_id, stage, estimated_value, owner_user_id, original_creator_id, created_at, closed_at, lost_reason')
  let accountsQuery = (adminClient as any).from('accounts').select('account_id, company_name, account_status, industry, owner_user_id, original_creator_id, created_at, first_transaction_date, last_transaction_date')
  let salesPlansQuery = (adminClient as any).from('sales_plans').select('plan_id, plan_type, status, potential_status, owner_user_id, source_account_id, created_at')
  let pipelineUpdatesQuery = (adminClient as any).from('pipeline_updates').select('update_id, opportunity_id, approach_method, updated_by, created_at, updated_at')
  let activitiesQuery = (adminClient as any).from('activities').select('activity_id, activity_type, status, owner_user_id, created_at, completed_at, related_account_id, related_opportunity_id')

  // Role-based data scoping:
  // - salesperson: own data only
  // - sales manager & sales support: all sales dept data
  // - director & superadmin: all data
  if (isAdmin(role)) {
    // Admin/Director see all data
  } else if (role === 'salesperson') {
    leadsQuery = leadsQuery.or(`sales_owner_user_id.eq.${userId},created_by.eq.${userId}`)
    opportunitiesQuery = opportunitiesQuery.eq('owner_user_id', userId)
    accountsQuery = accountsQuery.eq('owner_user_id', userId)
    salesPlansQuery = salesPlansQuery.eq('owner_user_id', userId)
    pipelineUpdatesQuery = pipelineUpdatesQuery.eq('updated_by', userId)
    activitiesQuery = activitiesQuery.eq('owner_user_id', userId)
  } else if (role === 'sales manager' || role === 'sales support') {
    // See all sales department data - no filter needed
  } else if (role === 'Marketing Manager' || role === 'MACX') {
    leadsQuery = leadsQuery.not('marketing_owner_user_id', 'is', null)
  } else if (role === 'Marcomm' || role === 'DGO' || role === 'VDCO') {
    // Individual marketing roles see their own data
    leadsQuery = leadsQuery.or(`marketing_owner_user_id.eq.${userId},created_by.eq.${userId}`)
  } else {
    leadsQuery = leadsQuery.or(`sales_owner_user_id.eq.${userId},created_by.eq.${userId}`)
    opportunitiesQuery = opportunitiesQuery.eq('owner_user_id', userId)
    accountsQuery = accountsQuery.eq('owner_user_id', userId)
    salesPlansQuery = salesPlansQuery.eq('owner_user_id', userId)
    pipelineUpdatesQuery = pipelineUpdatesQuery.eq('updated_by', userId)
    activitiesQuery = activitiesQuery.eq('owner_user_id', userId)
  }

  // Sales profiles for filtering and leaderboard
  const salesProfilesQuery = (adminClient as any)
    .from('profiles')
    .select('user_id, name, email, role')
    .in('role', ['salesperson', 'sales manager', 'sales support'])
    .eq('is_active', true)

  // Stage history for sales cycle
  const stageHistoryQuery = (adminClient as any)
    .from('opportunity_stage_history')
    .select('opportunity_id, old_stage, new_stage, changed_at')

  // Customer quotations for deal value and service analytics
  const quotationsQuery = (adminClient as any)
    .from('customer_quotations')
    .select('id, ticket_id, opportunity_id, status, total_selling_rate, currency, service_type, service_type_code, created_by, created_at')
    .in('status', ['accepted', 'sent', 'rejected'])

  // RFQ tickets for RFQ analytics
  const rfqTicketsQuery = (adminClient as any)
    .from('tickets')
    .select('ticket_id, rfq_data, ticket_type, created_at')
    .eq('ticket_type', 'RFQ')

  // Marketing profiles for marketing dashboard scoping
  const marketingProfilesQuery = (adminClient as any)
    .from('profiles')
    .select('user_id, name, email, role')
    .in('role', ['Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO'])
    .eq('is_active', true)

  // Execute all queries in parallel
  const [
    { data: leads },
    { data: opportunities },
    { data: accounts },
    { data: salesPlans },
    { data: pipelineUpdates },
    { data: activitiesData },
    { data: salesProfiles },
    { data: stageHistory },
    { data: quotations },
    { data: rfqTickets },
    { data: marketingProfiles },
  ] = await Promise.all([
    leadsQuery,
    opportunitiesQuery,
    accountsQuery,
    salesPlansQuery,
    pipelineUpdatesQuery,
    activitiesQuery,
    salesProfilesQuery,
    stageHistoryQuery,
    quotationsQuery,
    rfqTicketsQuery,
    marketingProfilesQuery,
  ])

  // =====================================================
  // Apply URL-based filters
  // =====================================================

  const filterByDate = <T extends { created_at?: string }>(data: T[]): T[] => {
    if (!startDate && !endDate) return data
    return data.filter((item) => {
      const itemDate = item.created_at ? new Date(item.created_at) : null
      if (!itemDate) return true
      if (startDate && itemDate < new Date(startDate)) return false
      if (endDate) {
        const endOfDay = new Date(endDate)
        endOfDay.setHours(23, 59, 59, 999)
        if (itemDate > endOfDay) return false
      }
      return true
    })
  }

  const filterBySalesperson = <T extends Record<string, any>>(
    data: T[],
    ownerField: string = 'owner_user_id'
  ): T[] => {
    if (!salespersonId) return data
    return data.filter((item) => item[ownerField] === salespersonId)
  }

  const filteredLeads = filterBySalesperson(filterByDate(leads || []), 'sales_owner_user_id')
  let filteredOpportunities = filterBySalesperson(filterByDate(opportunities || []))
  let filteredAccounts = filterBySalesperson(filterByDate(accounts || []))
  const filteredSalesPlans = filterBySalesperson(filterByDate(salesPlans || []))
  const filteredPipelineUpdates = filterByDate(pipelineUpdates || []).filter((u: any) =>
    !salespersonId || u.updated_by === salespersonId
  )
  const filteredActivities = filterBySalesperson(filterByDate(activitiesData || []))
  const filteredQuotations = filterBySalesperson(filterByDate(quotations || []), 'created_by')
  const filteredRfqTickets = filterByDate(rfqTickets || [])

  // =====================================================
  // Marketing role scoping for opportunities & accounts
  // Based on original_creator_id (the lead creator)
  // =====================================================
  const marketingDeptRoles = ['Marketing Manager', 'Marcomm', 'DGO', 'MACX', 'VDCO']
  const isMarketingDept = marketingDeptRoles.includes(role)

  if (isMarketingDept) {
    const mktUserIds = new Set((marketingProfiles || []).map((p: any) => p.user_id))

    if (role === 'Marketing Manager' || role === 'MACX') {
      // Manager/MACX: see opportunities & accounts from any marketing dept lead creator
      filteredOpportunities = filteredOpportunities.filter((o: any) =>
        o.original_creator_id && mktUserIds.has(o.original_creator_id)
      )
      filteredAccounts = filteredAccounts.filter((a: any) =>
        a.original_creator_id && mktUserIds.has(a.original_creator_id)
      )
    } else {
      // DGO/Marcomm/VDCO: see only opportunities & accounts from leads they created
      filteredOpportunities = filteredOpportunities.filter((o: any) =>
        o.original_creator_id === userId
      )
      filteredAccounts = filteredAccounts.filter((a: any) =>
        a.original_creator_id === userId
      )
    }
  }

  // =====================================================
  // Serialize data for client component
  // =====================================================

  const dashboardData = {
    userId,
    userName,
    role,
    opportunities: filteredOpportunities.map((o: any) => ({
      opportunity_id: o.opportunity_id,
      name: o.name,
      account_id: o.account_id,
      stage: o.stage,
      estimated_value: o.estimated_value || 0,
      owner_user_id: o.owner_user_id,
      original_creator_id: o.original_creator_id || null,
      created_at: o.created_at,
      closed_at: o.closed_at,
      lost_reason: o.lost_reason,
    })),
    accounts: filteredAccounts.map((a: any) => ({
      account_id: a.account_id,
      company_name: a.company_name,
      account_status: a.account_status,
      industry: a.industry || null,
      owner_user_id: a.owner_user_id,
      original_creator_id: a.original_creator_id || null,
      created_at: a.created_at,
      first_transaction_date: a.first_transaction_date,
      last_transaction_date: a.last_transaction_date,
    })),
    activities: filteredActivities.map((a: any) => ({
      activity_id: a.activity_id,
      activity_type: a.activity_type,
      status: a.status,
      owner_user_id: a.owner_user_id,
      created_at: a.created_at,
      completed_at: a.completed_at,
      related_opportunity_id: a.related_opportunity_id || null,
    })),
    leads: filteredLeads.map((l: any) => ({
      lead_id: l.lead_id,
      company_name: l.company_name,
      source: l.source,
      triage_status: l.triage_status,
      sales_owner_user_id: l.sales_owner_user_id,
      marketing_owner_user_id: l.marketing_owner_user_id,
      created_by: l.created_by,
      opportunity_id: l.opportunity_id,
      account_id: l.account_id || null,
      created_at: l.created_at,
      handed_over_at: l.handed_over_at || null,
      claimed_at: l.claimed_at || null,
    })),
    salesPlans: filteredSalesPlans.map((p: any) => ({
      plan_id: p.plan_id,
      plan_type: p.plan_type,
      status: p.status,
      potential_status: p.potential_status,
      owner_user_id: p.owner_user_id,
      created_at: p.created_at,
    })),
    pipelineUpdates: filteredPipelineUpdates.map((u: any) => ({
      update_id: u.update_id,
      opportunity_id: u.opportunity_id,
      approach_method: u.approach_method,
      updated_by: u.updated_by,
      created_at: u.created_at,
      updated_at: u.updated_at || u.created_at,
    })),
    stageHistory: (stageHistory || []).map((h: any) => ({
      opportunity_id: h.opportunity_id,
      old_stage: h.old_stage,
      new_stage: h.new_stage,
      changed_at: h.changed_at,
    })),
    salesProfiles: (salesProfiles || []).map((p: any) => ({
      user_id: p.user_id,
      name: p.name,
      email: p.email,
      role: p.role,
    })),
    customerQuotations: filteredQuotations.map((q: any) => ({
      id: q.id,
      opportunity_id: q.opportunity_id,
      status: q.status,
      total_selling_rate: q.total_selling_rate || 0,
      service_type: q.service_type || null,
      service_type_code: q.service_type_code || null,
      created_by: q.created_by,
      created_at: q.created_at,
    })),
    // Unfiltered data for leaderboard/ranking calculations (needs all salespeople data)
    allOpportunities: (opportunities || []).map((o: any) => ({
      opportunity_id: o.opportunity_id,
      name: o.name,
      account_id: o.account_id,
      stage: o.stage,
      estimated_value: o.estimated_value || 0,
      owner_user_id: o.owner_user_id,
      original_creator_id: o.original_creator_id || null,
      created_at: o.created_at,
      closed_at: o.closed_at,
      lost_reason: o.lost_reason,
    })),
    allAccounts: (accounts || []).map((a: any) => ({
      account_id: a.account_id,
      company_name: a.company_name,
      account_status: a.account_status,
      industry: a.industry || null,
      owner_user_id: a.owner_user_id,
      original_creator_id: a.original_creator_id || null,
      created_at: a.created_at,
      first_transaction_date: a.first_transaction_date,
      last_transaction_date: a.last_transaction_date,
    })),
    allActivities: (activitiesData || []).map((a: any) => ({
      activity_id: a.activity_id,
      activity_type: a.activity_type,
      status: a.status,
      owner_user_id: a.owner_user_id,
      created_at: a.created_at,
      completed_at: a.completed_at,
      related_opportunity_id: a.related_opportunity_id || null,
    })),
    // Unfiltered pipeline_updates and sales_plans for unified activity count
    allPipelineUpdates: (pipelineUpdates || []).map((u: any) => ({
      update_id: u.update_id,
      opportunity_id: u.opportunity_id,
      approach_method: u.approach_method,
      updated_by: u.updated_by,
      created_at: u.created_at,
      updated_at: u.updated_at || u.created_at,
    })),
    allSalesPlans: (salesPlans || []).map((p: any) => ({
      plan_id: p.plan_id,
      plan_type: p.plan_type,
      status: p.status,
      potential_status: p.potential_status,
      owner_user_id: p.owner_user_id,
      created_at: p.created_at,
    })),
    rfqTickets: filteredRfqTickets.map((t: any) => ({
      ticket_id: t.ticket_id,
      service_type: t.rfq_data?.service_type || null,
      cargo_category: t.rfq_data?.cargo_category || null,
      origin_city: t.rfq_data?.origin_city || null,
      destination_city: t.rfq_data?.destination_city || null,
      created_at: t.created_at,
    })),
    marketingProfiles: (marketingProfiles || []).map((p: any) => ({
      user_id: p.user_id,
      name: p.name,
      email: p.email,
      role: p.role,
    })),
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">{greeting}, {userName}</h1>
        <p className="text-sm text-muted-foreground">
          {role === 'salesperson' ? 'Your sales performance overview' :
           isSales(role) ? 'Sales team performance overview' :
           isMarketing(role) ? 'Marketing performance overview' :
           'Business overview dashboard'}
        </p>
      </div>

      {/* Main Dashboard Content */}
      <Suspense fallback={
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      }>
        <CRMDashboardContent data={dashboardData} />
      </Suspense>

      {/* AI Insights Section */}
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <DashboardInsightsSection />
      </Suspense>
    </div>
  )
}
