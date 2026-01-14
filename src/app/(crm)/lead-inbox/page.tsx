// =====================================================
// Lead Inbox Page - Marketing Lead Queue
// SOURCE: PDF Section 5, Page 16
// "triage_status IN ('New','In Review')"
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { LeadInboxTable } from '@/components/crm/lead-inbox-table'
import { AddLeadDialog } from '@/components/crm/add-lead-dialog'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet } from 'lucide-react'
import Link from 'next/link'

export default async function LeadInboxPage() {
  const supabase = await createClient()

  const { data: leads, error } = await supabase
    .from('v_lead_inbox')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lead Inbox</h1>
          <p className="text-muted-foreground">
            Marketing lead queue - New and In Review leads for triage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/imports">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import CSV
            </Link>
          </Button>
          <AddLeadDialog />
        </div>
      </div>

      <LeadInboxTable leads={leads || []} />
    </div>
  )
}
