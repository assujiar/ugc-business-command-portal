// =====================================================
// Accounts Page
// SOURCE: PDF Section 5, Page 18
// Mobile-responsive design with filtering and actions
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Suspense } from 'react'
import AccountsClient from './accounts-client'
import { AnalyticsFilter } from '@/components/crm/analytics-filter'
import { Skeleton } from '@/components/ui/skeleton'
import { isAdmin } from '@/lib/permissions'
import type { UserRole } from '@/types/database'

interface AccountEnriched {
  account_id: string
  company_name: string
  owner_name: string | null
  owner_user_id: string | null
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  industry: string | null
  address: string | null
  city: string | null
  province: string | null
  country: string | null
  postal_code: string | null
  phone: string | null
  domain: string | null
  npwp: string | null
  notes: string | null
  activity_status: string | null
  account_status: string | null
  open_opportunities: number
  planned_activities: number
  overdue_activities: number
  revenue_total: number
  retry_count: number
  lead_id: string | null
  // Revenue from DSO/AR module (placeholder for future development)
  actual_revenue: number
  total_payment: number
  total_outstanding: number
  created_at?: string
}

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function AccountsPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Get filter params
  const params = await searchParams
  const startDate = typeof params.startDate === 'string' ? params.startDate : null
  const endDate = typeof params.endDate === 'string' ? params.endDate : null
  const salespersonId = typeof params.salespersonId === 'string' ? params.salespersonId : null

  // Get user role
  const { data: { user } } = await supabase.auth.getUser()
  let userRole: UserRole | null = null
  let userId: string | null = null

  if (user) {
    userId = user.id
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single() as { data: { role: UserRole } | null }
    userRole = profile?.role ?? null
  }

  // Fetch sales profiles for filter dropdown (only salesperson role)
  const { data: salesProfiles } = await (adminClient as any)
    .from('profiles')
    .select('user_id, name, email, role')
    .eq('role', 'salesperson')

  const { data: accounts } = await supabase
    .from('v_accounts_enriched')
    .select('*')
    .order('company_name', { ascending: true }) as { data: AccountEnriched[] | null }

  // Apply filters
  let filteredAccounts = accounts || []
  if (salespersonId) {
    filteredAccounts = filteredAccounts.filter((account) => account.owner_user_id === salespersonId)
  }
  // Note: Date filter not applied to accounts as they don't have a relevant date field in the view
  // If needed in future, can filter by created_at once added to the view

  // Determine if user can see salesperson filter (management roles only)
  const showSalespersonFilter = userRole ? (
    isAdmin(userRole) || userRole === 'sales manager' ||
    userRole === 'Marketing Manager' || userRole === 'MACX'
  ) : false

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Manage customer accounts and relationships
        </p>
      </div>

      {/* Filter Section */}
      {showSalespersonFilter && (
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
      )}

      <AccountsClient accounts={filteredAccounts} userRole={userRole} />
    </div>
  )
}
