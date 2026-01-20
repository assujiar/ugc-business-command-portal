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
import { Suspense } from 'react'
import { AnalyticsFilter } from '@/components/crm/analytics-filter'
import { Skeleton } from '@/components/ui/skeleton'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function LeadInboxPage({ searchParams }: PageProps) {
  const supabase = await createClient()

  // Get filter params
  const params = await searchParams
  const startDate = typeof params.startDate === 'string' ? params.startDate : null
  const endDate = typeof params.endDate === 'string' ? params.endDate : null

  const { data: leads, error } = await supabase
    .from('v_lead_inbox')
    .select('*')
    .order('created_at', { ascending: false })

  // Apply date filter
  let filteredLeads = leads || []
  if (startDate || endDate) {
    filteredLeads = filteredLeads.filter((lead: any) => {
      const leadDate = lead.created_at ? new Date(lead.created_at) : null
      if (!leadDate) return true
      if (startDate && leadDate < new Date(startDate)) return false
      if (endDate) {
        const endOfDay = new Date(endDate)
        endOfDay.setHours(23, 59, 59, 999)
        if (leadDate > endOfDay) return false
      }
      return true
    })
  }

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

      {/* Date Filter */}
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <AnalyticsFilter
          salesProfiles={[]}
          showSalespersonFilter={false}
        />
      </Suspense>

      <LeadInboxTable leads={filteredLeads} />
    </div>
  )
}
