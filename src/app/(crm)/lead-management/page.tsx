// =====================================================
// Lead Management Page - Consolidated Marketing Lead View
// Combines: Lead Inbox, Nurture Leads, Disqualified
// =====================================================

import { createClient } from '@/lib/supabase/server'
import { LeadManagementDashboard } from '@/components/crm/lead-management-dashboard'
import { AddLeadDialog } from '@/components/crm/add-lead-dialog'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet } from 'lucide-react'
import Link from 'next/link'
import { getSessionAndProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { canAccessLeadInbox, isMACX } from '@/lib/permissions'

export default async function LeadManagementPage() {
  const supabase = await createClient()
  const { profile } = await getSessionAndProfile()

  if (!profile) {
    redirect('/login')
  }

  // Check if user has access to lead inbox
  if (!canAccessLeadInbox(profile.role)) {
    redirect('/dashboard')
  }

  // Determine if user is manager level (can see department leads)
  const isManager = ['Director', 'super admin', 'Marketing Manager'].includes(profile.role)

  // MACX can see all leads from marketing department (handled by RLS)
  const isMACXUser = isMACX(profile.role)

  // Fetch leads using v_lead_management view to get creator info
  // RLS will automatically filter based on user role
  let query = (supabase as any).from('v_lead_management').select('*')

  if (isManager || isMACXUser) {
    // Manager and MACX can see leads based on RLS (all marketing dept leads)
    query = query.or(`marketing_owner_user_id.is.null,marketing_owner_user_id.not.is.null`)
  } else {
    // Staff can only see leads they created
    query = query.eq('created_by', profile.user_id)
  }

  const { data: leads } = await query.order('created_at', { ascending: false }) as { data: any[] | null }

  // Get status counts
  const statusCounts = {
    total: leads?.length || 0,
    new: leads?.filter((l: any) => l.triage_status === 'New').length || 0,
    in_review: leads?.filter((l: any) => l.triage_status === 'In Review').length || 0,
    qualified: leads?.filter((l: any) => l.triage_status === 'Qualified').length || 0,
    assigned_to_sales: leads?.filter((l: any) => l.triage_status === 'Assigned to Sales').length || 0,
    nurture: leads?.filter((l: any) => l.triage_status === 'Nurture').length || 0,
    disqualified: leads?.filter((l: any) => l.triage_status === 'Disqualified').length || 0,
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold">Lead Management</h1>
          <p className="text-sm text-muted-foreground truncate">
            {isManager || isMACXUser
              ? 'Manage all leads from marketing department'
              : 'Manage leads you have created'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" asChild className="hidden sm:flex">
            <Link href="/imports">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import CSV
            </Link>
          </Button>
          <Button variant="outline" size="icon" asChild className="sm:hidden">
            <Link href="/imports">
              <FileSpreadsheet className="h-4 w-4" />
            </Link>
          </Button>
          <AddLeadDialog />
        </div>
      </div>

      <LeadManagementDashboard
        leads={leads || []}
        statusCounts={statusCounts}
        isManager={isManager || isMACXUser}
        currentUserId={profile.user_id}
        userRole={profile.role}
      />
    </div>
  )
}
