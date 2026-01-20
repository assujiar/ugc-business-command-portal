// =====================================================
// Sales Plan Page
// Target planning for maintenance, hunting, winback
// =====================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { canAccessSalesPlan, canCreateSalesPlan, canDeleteSalesPlan, isAdmin } from '@/lib/permissions'
import { SalesPlanDashboard } from '@/components/crm/sales-plan-dashboard'
import { AnalyticsFilter } from '@/components/crm/analytics-filter'
import { Skeleton } from '@/components/ui/skeleton'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function SalesPlanPage({ searchParams }: PageProps) {
  const adminClient = createAdminClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  if (!canAccessSalesPlan(profile.role)) {
    redirect('/dashboard')
  }

  // Get filter params
  const params = await searchParams
  const startDate = typeof params.startDate === 'string' ? params.startDate : null
  const endDate = typeof params.endDate === 'string' ? params.endDate : null
  const salespersonId = typeof params.salespersonId === 'string' ? params.salespersonId : null

  // Fetch sales profiles for filter dropdown
  const { data: salesProfiles } = await (adminClient as any)
    .from('profiles')
    .select('user_id, name, email, role')
    .in('role', ['salesperson', 'sales manager', 'sales support'])

  // Fetch sales plans with new structure
  let query = (adminClient as any)
    .from('sales_plans')
    .select(`
      *,
      profiles:owner_user_id(name, email),
      source_account:source_account_id(company_name)
    `)
    .order('planned_date', { ascending: true })

  // Filter based on role
  if (profile.role === 'salesperson') {
    query = query.eq('owner_user_id', profile.user_id)
  }

  const { data: plans, error } = await query

  if (error) {
    console.error('Error fetching sales plans:', error)
  }

  // Transform data to match dashboard interface
  const transformedPlans = (plans || []).map((plan: any) => ({
    plan_id: plan.plan_id,
    plan_type: plan.plan_type,
    company_name: plan.company_name,
    pic_name: plan.pic_name,
    pic_phone: plan.pic_phone,
    pic_email: plan.pic_email,
    source_account_id: plan.source_account_id,
    planned_date: plan.planned_date,
    planned_activity_method: plan.planned_activity_method,
    plan_notes: plan.plan_notes,
    status: plan.status,
    realized_at: plan.realized_at,
    actual_activity_method: plan.actual_activity_method,
    method_change_reason: plan.method_change_reason,
    realization_notes: plan.realization_notes,
    evidence_url: plan.evidence_url,
    evidence_file_name: plan.evidence_file_name,
    location_lat: plan.location_lat,
    location_lng: plan.location_lng,
    location_address: plan.location_address,
    potential_status: plan.potential_status || 'pending',
    not_potential_reason: plan.not_potential_reason,
    created_lead_id: plan.created_lead_id,
    created_account_id: plan.created_account_id,
    created_opportunity_id: plan.created_opportunity_id,
    owner_user_id: plan.owner_user_id,
    created_at: plan.created_at,
    owner_name: plan.profiles?.name || null,
    account_name: plan.source_account?.company_name || plan.company_name || null,
  }))

  // Apply date and salesperson filters
  let filteredPlans = transformedPlans
  if (startDate || endDate || salespersonId) {
    filteredPlans = transformedPlans.filter((plan: any) => {
      // Date filter - use planned_date
      if (startDate || endDate) {
        const planDate = plan.planned_date ? new Date(plan.planned_date) : null
        if (planDate) {
          if (startDate && planDate < new Date(startDate)) return false
          if (endDate) {
            const endOfDay = new Date(endDate)
            endOfDay.setHours(23, 59, 59, 999)
            if (planDate > endOfDay) return false
          }
        }
      }
      // Salesperson filter
      if (salespersonId && plan.owner_user_id !== salespersonId) {
        return false
      }
      return true
    })
  }

  // Fetch accounts with status for dropdown (need status to filter existing/lost)
  const { data: accounts } = await (adminClient as any)
    .from('accounts')
    .select('account_id, company_name, pic_name, pic_phone, pic_email, account_status')
    .order('company_name')

  // Determine permissions
  const userCanCreate = canCreateSalesPlan(profile.role)
  const userCanDelete = canDeleteSalesPlan(profile.role)

  // Determine if user can see salesperson filter (management roles only)
  const showSalespersonFilter = isAdmin(profile.role) || profile.role === 'sales manager' ||
    profile.role === 'Marketing Manager' || profile.role === 'MACX'

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Sales Plan</h1>
        <p className="text-sm text-muted-foreground">
          Create target lists for maintenance, hunting, and winback activities
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

      <SalesPlanDashboard
        plans={filteredPlans}
        accounts={accounts || []}
        currentUserId={profile.user_id}
        userRole={profile.role}
        canCreate={userCanCreate}
        canDelete={userCanDelete}
      />
    </div>
  )
}
