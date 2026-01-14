// =====================================================
// Sales Inbox Page - Handover Pool
// SOURCE: PDF Section 5, Page 16
// "leads handed over but not yet claimed"
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { SalesInboxTable } from '@/components/crm/sales-inbox-table'

export default async function SalesInboxPage() {
  const supabase = await createClient()

  const { data: leads, error } = await supabase
    .from('v_sales_inbox')
    .select('*')
    .order('priority', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sales Inbox</h1>
        <p className="text-muted-foreground">
          Handover pool - Unclaimed leads ready for sales follow-up
        </p>
      </div>

      <SalesInboxTable leads={leads || []} />
    </div>
  )
}
