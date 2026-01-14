// =====================================================
// Lead Inbox Page - Marketing Lead Queue
// SOURCE: PDF Section 5, Page 16
// "triage_status IN ('New','In Review')"
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { LeadInboxTable } from '@/components/crm/lead-inbox-table'

export default async function LeadInboxPage() {
  const supabase = await createClient()

  const { data: leads, error } = await supabase
    .from('v_lead_inbox')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lead Inbox</h1>
        <p className="text-muted-foreground">
          Marketing lead queue - New and In Review leads for triage
        </p>
      </div>

      <LeadInboxTable leads={leads || []} />
    </div>
  )
}
