// =====================================================
// Sales Inbox Page - Assigned to Sales Pool
// SOURCE: PDF Section 5, Page 16
// Shows leads assigned to sales but not yet claimed
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { SalesInboxTable } from '@/components/crm/sales-inbox-table'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function SalesInboxPage() {
  const supabase = await createClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  const { data: leads, error } = await supabase
    .from('v_sales_inbox')
    .select('*')
    .order('priority', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sales Inbox</h1>
        <p className="text-muted-foreground">
          Unclaimed leads assigned to sales, ready for follow-up
        </p>
      </div>

      <SalesInboxTable
        leads={leads || []}
        currentUserId={profile.user_id}
        userRole={profile.role}
      />
    </div>
  )
}
