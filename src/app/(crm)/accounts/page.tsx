// =====================================================
// Accounts Page
// SOURCE: PDF Section 5, Page 18
// Mobile-responsive design with filtering and actions
// =====================================================

import { createClient } from '@/lib/supabase/server'
import AccountsClient from './accounts-client'

interface AccountEnriched {
  account_id: string
  company_name: string
  owner_name: string | null
  pic_name: string | null
  pic_email: string | null
  pic_phone: string | null
  industry: string | null
  address: string | null
  city: string | null
  province: string | null
  notes: string | null
  activity_status: string | null
  account_status: string | null
  open_opportunities: number
  planned_activities: number
  overdue_activities: number
  revenue_total: number
  retry_count: number
  lead_id: string | null
}

export default async function AccountsPage() {
  const supabase = await createClient()

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

      <AccountsClient accounts={accounts || []} />
    </div>
  )
}
