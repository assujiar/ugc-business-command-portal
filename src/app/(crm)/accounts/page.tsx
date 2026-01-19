// =====================================================
// Accounts Page
// SOURCE: PDF Section 5, Page 18
// Mobile-responsive design with filtering and actions
// =====================================================

import { createClient } from '@/lib/supabase/server'
import AccountsClient from './accounts-client'
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
  // Revenue from opportunities
  lost_rev_opp: number
  won_rev_opp: number
  on_progress_rev_opp: number
  total_rev_opp: number
}

export default async function AccountsPage() {
  const supabase = await createClient()

  // Get user role
  const { data: { user } } = await supabase.auth.getUser()
  let userRole: UserRole | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()
    userRole = profile?.role as UserRole | null
  }

  const { data: accounts } = await supabase
    .from('v_accounts_enriched')
    .select('*')
    .order('company_name', { ascending: true }) as { data: AccountEnriched[] | null }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Manage customer accounts and relationships
        </p>
      </div>

      <AccountsClient accounts={accounts || []} userRole={userRole} />
    </div>
  )
}
