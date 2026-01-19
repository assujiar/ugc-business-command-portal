// =====================================================
// Sales Plan Page
// Schedule and manage sales activities
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canAccessSalesPlan, canCreateSalesPlan, canDeleteSalesPlan, isAdmin } from '@/lib/permissions'
import { SalesPlanDashboard } from '@/components/crm/sales-plan-dashboard'
import type { UserRole } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function SalesPlanPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  if (!canAccessSalesPlan(profile.role)) {
    redirect('/dashboard')
  }

  // Fetch sales plans
  let query = adminClient
    .from('sales_plans')
    .select(`
      *,
      profiles:owner_user_id(name, email),
      accounts(company_name),
      opportunities(name)
    `)
    .order('scheduled_date', { ascending: true })

  // Filter based on role
  if (profile.role === 'salesperson') {
    query = query.eq('owner_user_id', profile.user_id)
  }

  const { data: plans, error } = await query

  if (error) {
    console.error('Error fetching sales plans:', error)
  }

  // Transform data
  const transformedPlans = (plans || []).map((plan: any) => ({
    plan_id: plan.plan_id,
    activity_type: plan.activity_type,
    subject: plan.subject,
    description: plan.description,
    scheduled_date: plan.scheduled_date,
    scheduled_time: plan.scheduled_time,
    status: plan.status,
    completed_at: plan.completed_at,
    account_id: plan.account_id,
    opportunity_id: plan.opportunity_id,
    owner_user_id: plan.owner_user_id,
    created_at: plan.created_at,
    owner_name: plan.profiles?.name || null,
    account_name: plan.accounts?.company_name || null,
    opportunity_name: plan.opportunities?.name || null,
    evidence_url: plan.evidence_url,
    location_address: plan.location_address,
  }))

  // Fetch accounts for dropdown
  const { data: accounts } = await adminClient
    .from('accounts')
    .select('account_id, company_name')
    .order('company_name')

  // Determine permissions
  const userCanCreate = canCreateSalesPlan(profile.role)
  const userCanDelete = canDeleteSalesPlan(profile.role)

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Sales Plan</h1>
        <p className="text-sm text-muted-foreground">
          Schedule and manage your sales activities
        </p>
      </div>

      <SalesPlanDashboard
        plans={transformedPlans}
        accounts={accounts || []}
        currentUserId={profile.user_id}
        userRole={profile.role}
        canCreate={userCanCreate}
        canDelete={userCanDelete}
      />
    </div>
  )
}
